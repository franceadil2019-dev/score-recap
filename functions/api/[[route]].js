export async function onRequest(context) {
  const { request, env, waitUntil } = context;
  const url = new URL(request.url);

  // استخراج الإجراء من الهيدر
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

  // 🛡️ دالة جلب البيانات مع الكاش المضمون (KV Cache)
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

  try {
    // 1. جلب قائمة المباريات (تم تصحيح الكلمة هنا ✅)
    if (action === "fetch-matches" || action.includes("fixtures")) {
      const date = url.searchParams.get("date") || new Date().toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];
      const ttl = (date === today) ? 60 : 86400; 
      return await getFromApiSports(`fixtures?date=${date}`, `api_fixtures_${date}`, ttl);
    }

    // 2. جلب الأحداث (تم تصحيح الكلمة هنا ✅)
    if (action === "fetch-events" || action.includes("events")) {
      const fixtureId = url.searchParams.get("fixture") || url.searchParams.get("fixtureId");
      if (!fixtureId) return new Response(JSON.stringify({ error: "Missing fixture ID" }), { status: 400, headers: corsHeaders });
      return await getFromApiSports(`fixtures/events?fixture=${fixtureId}`, `api_events_${fixtureId}`, 60);
    }

    // 3. جلب الإحصائيات (تم تصحيح الكلمة هنا ✅)
    if (action === "fetch-stats" || action.includes("statistics")) {
      const fixtureId = url.searchParams.get("fixture") || url.searchParams.get("fixtureId");
      if (!fixtureId) return new Response(JSON.stringify({ error: "Missing fixture ID" }), { status: 400, headers: corsHeaders });
      return await getFromApiSports(`fixtures/statistics?fixture=${fixtureId}`, `api_stats_${fixtureId}`, 60);
    }

    // 4. التوقعات الذكية
    if (action === "predict-match" || action.includes("predict")) {
      const leagueId = url.searchParams.get("leagueId");
      if (leagueId && leagueId !== "39") {
        return new Response(JSON.stringify({ error: "Predictions available only for Premier League." }), { status: 403, headers: corsHeaders });
      }

      const fixtureId = url.searchParams.get("fixtureId");
      const homeTeam = url.searchParams.get("homeTeam");
      const awayTeam = url.searchParams.get("awayTeam");
      const kvKey = `predict_${fixtureId}_en`;

      if (env.SPORTS_KV) {
        const cachedPrediction = await env.SPORTS_KV.get(kvKey);
        if (cachedPrediction) {
          return new Response(JSON.stringify({ result: cachedPrediction, source: "KV_CACHE" }), { headers: corsHeaders });
        }
      }

      if (!env.GEMINI_API_KEY) {
        return new Response(JSON.stringify({ error: "GEMINI_API_KEY is missing" }), { status: 500, headers: corsHeaders });
      }

      const prompt = `Act as an expert football analyst. Write a short, engaging prediction for the upcoming Premier League match between ${homeTeam} and ${awayTeam}. Provide a brief reason analyzing both teams' current form, and predict the final score. Return ONLY valid HTML (use <p> and <strong> for the result). Do not wrap inside markdown code blocks.`;

      const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      const aiData = await aiRes.json();
      if (!aiRes.ok || !aiData.candidates) {
        const googleError = aiData.error?.message || "Gemini API Error";
        return new Response(JSON.stringify({ error: `Gemini Error: ${googleError}` }), { status: 500, headers: corsHeaders });
      }

      const predictionText = aiData.candidates[0].content.parts[0].text;
      if (env.SPORTS_KV) {
        waitUntil(env.SPORTS_KV.put(kvKey, predictionText, { expirationTtl: 86400 }));
      }

      return new Response(JSON.stringify({ result: predictionText, source: "LIVE_AI" }), { headers: corsHeaders });
    }

    // 5. تقرير المباراة
    if (action === "generate-article" || action.includes("article")) {
      const leagueId = url.searchParams.get("leagueId");
      if (leagueId && leagueId !== "39") {
        return new Response(JSON.stringify({ error: "Match reports available only for Premier League." }), { status: 403, headers: corsHeaders });
      }

      const fixtureId = url.searchParams.get("fixtureId");
      const matchStr = url.searchParams.get("matchStr");
      const score = url.searchParams.get("score");
      const events = url.searchParams.get("events");
      const kvKey = `recap_${fixtureId}_en`;

      if (env.SPORTS_KV) {
        const cachedArticle = await env.SPORTS_KV.get(kvKey);
        if (cachedArticle) {
          return new Response(JSON.stringify({ result: cachedArticle, source: "KV_CACHE" }), { headers: corsHeaders });
        }
      }

      if (!env.GEMINI_API_KEY) {
        return new Response(JSON.stringify({ error: "GEMINI_API_KEY is missing" }), { status: 500, headers: corsHeaders });
      }

      const prompt = `Act as an expert sports journalist and tactical analyst. Write a comprehensive, engaging match report for the Premier League match: ${matchStr}. Final Score: ${score}. Key Events: ${events}. Include: <h2>Title</h2>, <p>Introduction</p>, <p>Tactical Analysis</p>, <h3>Turning Point</h3> with <ul><li>...</li></ul>, and a strong conclusion. Return ONLY clean HTML code without markdown wrappers.`;

      const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      const aiData = await aiRes.json();
      if (!aiRes.ok || !aiData.candidates) {
        const googleError = aiData.error?.message || "Gemini API Error";
        return new Response(JSON.stringify({ error: `Gemini Error: ${googleError}` }), { status: 500, headers: corsHeaders });
      }

      const articleText = aiData.candidates[0].content.parts[0].text;
      if (env.SPORTS_KV) {
        waitUntil(env.SPORTS_KV.put(kvKey, articleText, { expirationTtl: 604800 })); 
      }

      return new Response(JSON.stringify({ result: articleText, source: "LIVE_AI" }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "Route or Action Not Found" }), { status: 404, headers: corsHeaders });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
}
