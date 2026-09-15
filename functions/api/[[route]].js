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
        
        let finalTtl = ttlSeconds;
        
        // منع تجميد المباريات المباشرة حتى لو كان تاريخها أمس
        if (dataObj.response && Array.isArray(dataObj.response)) {
          const hasLiveMatches = dataObj.response.some(match => {
            if (!match.fixture || !match.fixture.status) return false;
            const status = match.fixture.status.short;
            return ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE'].includes(status);
          });
          
          if (hasLiveMatches) {
            finalTtl = 60;
          }
        }

        const safeTtl = Math.max(finalTtl, 60);
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
          waitUntil((async () => {
              try {
                  let recent = await env.SPORTS_KV.get("recent_generated_reports", "json");
                  if (!recent || !Array.isArray(recent)) recent = [];
                  if (!recent.includes(fixtureId)) {
                      recent.unshift(fixtureId);
                      recent = recent.slice(0, 50); // تم التعديل إلى 50
                      await env.SPORTS_KV.put("recent_generated_reports", JSON.stringify(recent));
                      await env.SPORTS_KV.delete("cached_latest_reports"); 
                  }
              } catch (e) {}
          })());
          return new Response(JSON.stringify({ result: cachedArticle, source: "KV_CACHE" }), { headers: corsHeaders });
        }
      }

      if (!env.GEMINI_API_KEY) {
        return new Response(JSON.stringify({ error: "GEMINI_API_KEY is missing" }), { status: 500, headers: corsHeaders });
      }

      const writingStyles = [
        "Style 1: Focus heavily on the tactical chess match between the managers, formations, defensive blocks, and pressing traps.",
        "Style 2: Write with high emotional drama and storytelling, focusing on the fans' perspective, tension, and the psychological impact of the goals.",
        "Style 3: Focus deeply on individual brilliance, star players who decided the game, key errors, and standout performances.",
        "Style 4: Take a historical and macro perspective, analyzing what this specific result means for the clubs' ambitions, top-four race, or relegation battle.",
        "Style 5: Adopt a fast-paced, action-oriented match recap style, breaking down the flow of momentum minute-by-minute based on the events.",
        "Style 6: Focus on the physical duel, intensity, referee decisions, disciplinary actions, and how grit won or lost the match.",
        "Style 7: Write from a technical and data-driven perspective, analyzing efficiency in front of goal, possession value, and defensive resilience."
      ];
      const randomStyle = writingStyles[Math.floor(Math.random() * writingStyles.length)];

      const prompt = `Act as an elite sports journalist and senior tactical analyst. Write a comprehensive, highly detailed, and deep match report for the Premier League match: ${matchStr}. Final Score: ${score}. Key Events & Timeline: ${events}.
      
      CRITICAL REQUIREMENT - LENGTH & DEPTH:
      - The article MUST be at least 600 to 800 words long. Do not write a short summary. Expand on every tactical aspect.
      - ${randomStyle}
      
      STRUCTURE THE ARTICLE IN CLEAN HTML USING THESE SECTIONS:
      <h2>[Generate a Catchy, Journalistic, and Unique Title]</h2>
      
      <p>[Paragraph 1: Comprehensive Introduction (approx. 100 words) setting the stage, the stakes of the match, atmosphere, and the final outcome.]</p>
      
      <p>[Paragraph 2: Tactical Setup & First Half Analysis (approx. 150 words) detailing the starting formations, how both managers set up their teams, and key tactical battles on the pitch.]</p>
      
      <p>[Paragraph 3: Key Events & Turning Points (approx. 150 words) deeply analyzing the goals scored, major fouls, yellow/red cards, and how the momentum shifted based on the timeline: ${events}.]</p>
      
      <p>[Paragraph 4: Second Half Adjustments & Managerial Decisions (approx. 150 words) discussing substitutions, tactical changes made by the coaches during the break, and how they impacted the game.]</p>
      
      <h3>Key Match Highlights & Statistics Breakdown</h3>
      <ul>
        <li>[Detailed bullet point 1 about a key player or moment]</li>
        <li>[Detailed bullet point 2 about tactical dominance or failure]</li>
        <li>[Detailed bullet point 3 about the impact of the result on the league table]</li>
      </ul>
      
      <p>[Paragraph 5: Detailed Conclusion (approx. 100 words) summarizing the standout performers, what this result means for both clubs moving forward in the Premier League season.]</p>
      
      Write the ENTIRE article perfectly in ${targetLang}. Ensure rich vocabulary, professional sports journalism phrasing, and zero fluff. Return ONLY clean HTML code without markdown wrappers.`;

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
        waitUntil((async () => {
            try {
                let recent = await env.SPORTS_KV.get("recent_generated_reports", "json");
                if (!recent || !Array.isArray(recent)) recent = [];
                if (!recent.includes(fixtureId)) {
                    recent.unshift(fixtureId);
                    recent = recent.slice(0, 50); // تم التعديل إلى 50
                    await env.SPORTS_KV.put("recent_generated_reports", JSON.stringify(recent));
                }
                await env.SPORTS_KV.delete("cached_latest_reports");
            } catch (e) {}
        })());
      }

      return new Response(JSON.stringify({ result: articleText, source: "LIVE_AI" }), { headers: corsHeaders });
    }

    if (action.includes("latest-reports")) {
      if (!env.SPORTS_KV) return new Response(JSON.stringify([]), { headers: corsHeaders });

      const cachedList = await env.SPORTS_KV.get("cached_latest_reports");
      if (cachedList && cachedList !== "[]" && cachedList.length > 5) {
        return new Response(cachedList, { headers: corsHeaders });
      }

      let fixtureIds = await env.SPORTS_KV.get("recent_generated_reports", "json");
      
      if (!fixtureIds || !Array.isArray(fixtureIds) || fixtureIds.length === 0) {
        const listed = await env.SPORTS_KV.list({ prefix: "recap_" });
        fixtureIds = [];
        for (const key of listed.keys) {
          const match = key.name.match(/recap_(?:v2_)?(\d+)/);
          if (match && match[1] && !fixtureIds.includes(match[1])) {
            fixtureIds.push(match[1]);
          }
          if (fixtureIds.length >= 50) break; // تم التعديل إلى 50
        }
        if (fixtureIds.length > 0) {
           waitUntil(env.SPORTS_KV.put("recent_generated_reports", JSON.stringify(fixtureIds)));
        }
      }

      if (!fixtureIds || fixtureIds.length === 0) {
        return new Response(JSON.stringify({ error: "No reports found in database yet." }), { headers: corsHeaders });
      }

      const fetchIds = fixtureIds.slice(0, 50); // تم التعديل إلى 50

      const res = await fetch(`https://v3.football.api-sports.io/fixtures?ids=${fetchIds.join('-')}`, {
        headers: { "x-apisports-key": env.API_SPORTS_KEY }
      });
      const data = await res.json();
      
      if (data.errors && Object.keys(data.errors).length > 0) {
          return new Response(JSON.stringify({ error: "API limit reached or error fetching matches." }), { headers: corsHeaders });
      }
      
      const reports = [];
      if (data.response) {
        fetchIds.forEach(id => {
            const m = data.response.find(match => String(match.fixture.id) === String(id));
            if (m) {
                const home = m.teams.home.name;
                const away = m.teams.away.name;
                const slug = `${home.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-vs-${away.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`;
                reports.push({
                    fixtureId: m.fixture.id,
                    title: `${home} vs ${away}`,
                    url: `/report/${m.fixture.id}/${slug}`,
                    logoHome: m.teams.home.logo,
                    logoAway: m.teams.away.logo
                });
            }
        });
      }

      if (reports.length > 0) {
          const responseText = JSON.stringify(reports);
          waitUntil(env.SPORTS_KV.put("cached_latest_reports", responseText, { expirationTtl: 600 }));
          return new Response(responseText, { headers: corsHeaders });
      } else {
          return new Response(JSON.stringify({ error: "Could not format reports." }), { headers: corsHeaders });
      }
    }

    return new Response(JSON.stringify({ error: "Route or Action Not Found" }), { status: 404, headers: corsHeaders });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
}
