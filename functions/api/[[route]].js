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
    // 1. جلب المباريات أو مباراة محددة
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

    // 2. جلب الأحداث
    if (action.includes("fetch-events") || action.includes("events")) {
      const fixtureId = url.searchParams.get("fixture") || url.searchParams.get("fixtureId");
      if (!fixtureId) return new Response(JSON.stringify({ error: "Missing fixture ID" }), { status: 400, headers: corsHeaders });
      return await getFromApiSports(`fixtures/events?fixture=${fixtureId}`, `api_events_${fixtureId}`, 60);
    }

    // 3. جلب الإحصائيات
    if (action.includes("fetch-stats") || action.includes("statistics")) {
      const fixtureId = url.searchParams.get("fixture") || url.searchParams.get("fixtureId");
      if (!fixtureId) return new Response(JSON.stringify({ error: "Missing fixture ID" }), { status: 400, headers: corsHeaders });
      return await getFromApiSports(`fixtures/statistics?fixture=${fixtureId}`, `api_stats_${fixtureId}`, 60);
    }

    // 4. التوقعات الذكية
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
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
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

      const prompt = `Act as an expert sports journalist and tactical analyst. Write a comprehensive, engaging match report for the Premier League match: ${matchStr}. Final Score: ${score}. Key Events: ${events}. Include: <h2>Title</h2>, <p>Introduction</p>, <p>Tactical Analysis</p>, <h3>Turning Point</h3> with <ul><li>...</li></ul>, and a strong conclusion.
      Write the ENTIRE article perfectly in ${targetLang}.
      Return ONLY clean HTML code without markdown wrappers.`;

      const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      const aiData = await aiRes.json();
      if (!aiRes.ok || !aiData.candidates) {
        return new Response(JSON.stringify({ error: `Gemini Error` }), { status: 500, headers: corsHeaders });
      }

      const articleText = aiData.candidates[0].content.parts[0].text;
     
      if (env.SPORTS_KV) {
        waitUntil(env.SPORTS_KV.put(kvKey, articleText));
        
        // 🚨 السر هنا: مسح الذاكرة المؤقتة لقائمة "أحدث التقارير" لكي تتحدث فوراً!
        waitUntil(env.SPORTS_KV.delete("cached_latest_reports"));
      }

      return new Response(JSON.stringify({ result: articleText, source: "LIVE_AI" }), { headers: corsHeaders });
    }

    // 6. أحدث التقارير
    if (action.includes("latest-reports")) {
      if (!env.SPORTS_KV) return new Response(JSON.stringify([]), { headers: corsHeaders });

      const cachedList = await env.SPORTS_KV.get("cached_latest_reports");
      if (cachedList) {
        return new Response(cachedList, { headers: corsHeaders });
      }

      const listed = await env.SPORTS_KV.list({ prefix: "recap_", limit: 30 });
      const fixtureIds = [];
      
      for (const key of listed.keys) {
        const match = key.name.match(/recap_(?:v2_)?(\d+)/);
        if (match && match[1] && !fixtureIds.includes(match[1])) {
          fixtureIds.push(match[1]);
        }
        if (fixtureIds.length >= 5) break;
      }

      if (fixtureIds.length === 0) {
        return new Response(JSON.stringify([]), { headers: corsHeaders });
      }

      const res = await fetch(`https://v3.football.api-sports.io/fixtures?ids=${fixtureIds.join('-')}`, {
        headers: { "x-apisports-key": env.API_SPORTS_KEY }
      });
      const data = await res.json();
      
      const reports = [];
      if (data.response) {
        data.response.forEach(m => {
          const home = m.teams.home.name;
          const away = m.teams.away.name;
          const slug = `${home.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-vs-${away.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`;
          reports.push({
            fixtureId: m.fixture.id,
            title: `${home} vs ${away}`,
            url: `/match/${m.fixture.id}/${slug}`,
            logoHome: m.teams.home.logo,
            logoAway: m.teams.away.logo
          });
        });
      }

      const responseText = JSON.stringify(reports);
      // جعلنا مدة الكاش 10 دقائق فقط لتحديث أسرع
      waitUntil(env.SPORTS_KV.put("cached_latest_reports", responseText, { expirationTtl: 600 }));

      return new Response(responseText, { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "Route or Action Not Found" }), { status: 404, headers: corsHeaders });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
}
