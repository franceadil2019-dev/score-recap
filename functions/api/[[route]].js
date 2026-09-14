export async function onRequest(context) {
  const { request, env, waitUntil } = context;
  const url = new URL(request.url);

  const actionHeader = request.headers.get("x-action");
  const pathname = url.pathname.replace('/api', '').toLowerCase();
  const action = (actionHeader || pathname).toLowerCase();

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-action",
    "Content-Type": "application/json"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!env.API_SPORTS_KEY) {
    return new Response(JSON.stringify({ error: "API_SPORTS_KEY is missing" }), { status: 500, headers: corsHeaders });
  }

  async function getFromApiSports(endpoint, kvKey, ttlSeconds) {
    if (env.SPORTS_KV) {
      try {
        const cachedData = await env.SPORTS_KV.get(kvKey);
        if (cachedData) {
          return new Response(cachedData, { headers: corsHeaders });
        }
      } catch (e) {}
    }

    const res = await fetch(`https://v3.football.api-sports.io/${endpoint}`, {
      headers: { "x-apisports-key": env.API_SPORTS_KEY }
    });
    const dataText = await res.text();

    try {
      const dataObj = JSON.parse(dataText);
      if (env.SPORTS_KV && res.ok && (!dataObj.errors || Object.keys(dataObj.errors).length === 0)) {
        const safeTtl = Math.max(ttlSeconds, 60);
        waitUntil(env.SPORTS_KV.put(kvKey, dataText, { expirationTtl: safeTtl }));
      }
    } catch (e) {}

    return new Response(dataText, { headers: corsHeaders });
  }

  const langMap = {
    en: "English", ar: "Arabic", fr: "French", es: "Spanish", pt: "Portuguese", de: "German",
    it: "Italian", sv: "Swedish", no: "Norwegian", da: "Danish"
  };

  try {
    if (action.includes("fetch-matches") || action.includes("fixtures")) {
      const id = url.searchParams.get("id");
      if (id) {
        return await getFromApiSports(`fixtures?id=${id}`, `api_fixture_id_${id}`, 60);
      }
      const date = url.searchParams.get("date") || new Date().toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];
      const ttl = (date === today) ? 60 : 86400;
      return await getFromApiSports(`fixtures?date=${date}`, `api_fixtures_${date}`, ttl);
    }

    if (action.includes("fetch-events") || action.includes("events")) {
      const fixtureId = url.searchParams.get("fixture") || url.searchParams.get("fixtureId");
      if (!fixtureId) return new Response(JSON.stringify({ error: "Missing fixture ID" }), { status: 400, headers: corsHeaders });
      return await getFromApiSports(`fixtures/events?fixture=${fixtureId}`, `api_events_${fixtureId}`, 60);
    }

    if (action.includes("fetch-stats") || action.includes("statistics")) {
      const fixtureId = url.searchParams.get("fixture") || url.searchParams.get("fixtureId");
      if (!fixtureId) return new Response(JSON.stringify({ error: "Missing fixture ID" }), { status: 400, headers: corsHeaders });
      return await getFromApiSports(`fixtures/statistics?fixture=${fixtureId}`, `api_stats_${fixtureId}`, 60);
    }

    if (action.includes("predict-match") || action.includes("predict")) {
      const leagueId = url.searchParams.get("leagueId");
      if (leagueId && leagueId !== "39") {
        return new Response(JSON.stringify({ error: "Predictions available only for Premier League." }), { status: 403, headers: corsHeaders });
      }

      const fixtureId = url.searchParams.get("fixtureId");
      const homeTeam = url.searchParams.get("homeTeam");
      const awayTeam = url.searchParams.get("awayTeam");
      const languageCode = url.searchParams.get("language") || "en";
      const targetLang = langMap[languageCode] || "English";
     
      const kvKey = `predict_v2_${fixtureId}_${languageCode}`;

      if (env.SPORTS_KV) {
        const cachedPrediction = await env.SPORTS_KV.get(kvKey);
        if (cachedPrediction) {
          return new Response(JSON.stringify({ result: cachedPrediction, source: "KV_CACHE" }), { headers: corsHeaders });
        }
      }

      if (!env.GEMINI_API_KEY) {
        return new Response(JSON.stringify({ error: "GEMINI_API_KEY is missing" }), { status: 500, headers: corsHeaders });
      }

      const prompt = `Act as an expert football analyst. Write a short, engaging tactical preview for the upcoming Premier League match between ${homeTeam} and ${awayTeam}.
      Focus on team form, key tactical battles, and who has the upper hand.
      IMPORTANT: DO NOT predict an exact numerical score (like 2-1). Just analyze the expected flow of the game and the likely outcome (e.g., a tight draw, a comfortable home win, etc.).
      Write the ENTIRE response perfectly in ${targetLang}.
      Return ONLY valid HTML (use <p> and <strong> for emphasis). Do not wrap inside markdown code blocks.`;

      const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.8, topP: 0.9 }
        })
      });

      const aiData = await aiRes.json();
      if (!aiRes.ok || !aiData.candidates) {
        return new Response(JSON.stringify({ error: `Gemini Error` }), { status: 500, headers: corsHeaders });
      }

      const predictionText = aiData.candidates[0].content.parts[0].text;
      if (env.SPORTS_KV) {
        waitUntil(env.SPORTS_KV.put(kvKey, predictionText, { expirationTtl: 86400 }));
      }

      return new Response(JSON.stringify({ result: predictionText, source: "LIVE_AI" }), { headers: corsHeaders });
    }

    // 5. تقرير المباراة
    if (action.includes("generate-article") || action.includes("article")) {
      const leagueId = url.searchParams.get("leagueId");
      if (leagueId && leagueId !== "39") {
        return new Response(JSON.stringify({ error: "Match reports available only for Premier League." }), { status: 403, headers: corsHeaders });
      }

      const fixtureId = url.searchParams.get("fixtureId");
      const matchStr = url.searchParams.get("matchStr");
      const score = url.searchParams.get("score");
      const events = url.searchParams.get("events");
      const languageCode = url.searchParams.get("language") || "en";
      const targetLang = langMap[languageCode] || "English";
     
      const kvKey = `recap_v2_${fixtureId}_${languageCode}`;

      if (env.SPORTS_KV) {
        const cachedArticle = await env.SPORTS_KV.get(kvKey);
        if (cachedArticle) {
          return new Response(JSON.stringify({ result: cachedArticle, source: "KV_CACHE" }), { headers: corsHeaders });
        }
      }

      if (!env.GEMINI_API_KEY) {
        return new Response(JSON.stringify({ error: "GEMINI_API_KEY is missing" }), { status: 500, headers: corsHeaders });
      }

      const writingStyles = [
        "Focus heavily on the tactical battle, formations, and the managers' strategic decisions.",
        "Write with high passion and drama, focusing on the emotional rollercoaster and intensity of the match.",
        "Focus on individual player performances, key mistakes, and moments of individual brilliance.",
        "Take a narrative angle, discussing how this specific result impacts the teams' season and their fans.",
        "Adopt a highly analytical and critical journalistic tone, questioning the losing team's performance."
      ];
      const randomStyle = writingStyles[Math.floor(Math.random() * writingStyles.length)];

      const prompt = `Act as an expert sports journalist. Write a unique, comprehensive, and highly engaging match report for: ${matchStr}. Final Score: ${score}. Key Events: ${events}.
      
      CRITICAL INSTRUCTION: ${randomStyle}
      
      Avoid repetitive journalistic clichés. Use varied vocabulary and dynamic sentence structures. Ensure this article feels 100% human-written and distinct from other match reports on the internet.
      
      Structure the HTML exactly like this:
      <h2>[Generate a Catchy and Unique Title]</h2>
      <p>[Engaging Introduction]</p>
      <p>[Main Analysis based on the critical instruction]</p>
      <h3>Match Highlights & Turning Points</h3>
      <ul><li>[Event 1]</li><li>[Event 2]</li></ul>
      <p>[Strong Conclusion]</p>
      
      Write the ENTIRE article perfectly in ${targetLang}. Return ONLY clean HTML code without markdown wrappers.`;

      const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.85, topP: 0.9 }
        })
      });

      const aiData = await aiRes.json();
      if (!aiRes.ok || !aiData.candidates) {
        return new Response(JSON.stringify({ error: `Gemini Error` }), { status: 500, headers: corsHeaders });
      }

      const articleText = aiData.candidates[0].content.parts[0].text;
     
      if (env.SPORTS_KV) {
        waitUntil(env.SPORTS_KV.put(kvKey, articleText));
      }

      return new Response(JSON.stringify({ result: articleText, source: "LIVE_AI" }), { headers: corsHeaders });
    }

    // 🌟 6. أحدث التقارير (قراءة مباشرة من KV بدون استهلاك رصيد API-Sports نهائياً!)
    if (action.includes("latest-reports")) {
      if (!env.SPORTS_KV) return new Response(JSON.stringify([]), { headers: corsHeaders });

      // البحث المباشر في قاعدة بياناتك عن المقالات المخزنة
      const listed = await env.SPORTS_KV.list({ prefix: "recap_" });
      const reports = [];
      const addedIds = new Set();

      for (const key of listed.keys) {
        const match = key.name.match(/recap_(?:v2_)?(\d+)/);
        if (match && match[1] && !addedIds.has(match[1])) {
          const fixtureId = match[1];
          addedIds.add(fixtureId);

          // قراءة المقال من KV لاستخراج العنوان الصحفي الذكي
          const articleHtml = await env.SPORTS_KV.get(key.name);
          let title = "Premier League Match Report";
          if (articleHtml) {
            const titleMatch = articleHtml.match(/<h2[^>]*>(.*?)<\/h2>/i);
            if (titleMatch && titleMatch[1]) {
              title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
            }
          }

          reports.push({
            fixtureId: fixtureId,
            title: title,
            url: `/match/${fixtureId}/match-report`,
            logoHome: "https://media.api-sports.io/football/leagues/39.png",
            logoAway: "https://media.api-sports.io/football/leagues/39.png"
          });

          if (reports.length >= 10) break;
        }
      }

      return new Response(JSON.stringify(reports), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "Route or Action Not Found" }), { status: 404, headers: corsHeaders });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
}
