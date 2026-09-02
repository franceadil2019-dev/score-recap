export async function onRequest(context) {
    const { request, env, waitUntil } = context;
    const url = new URL(request.url);
    const action = request.headers.get("x-action") || url.pathname.replace('/api', '');

    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, x-action"
    };

    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    if (!env.API_SPORTS_KEY) {
        return new Response(JSON.stringify({ error: "API_SPORTS_KEY is missing" }), { status: 500, headers: corsHeaders });
    }

    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);

    try {
        if (action === "fetch-matches" || action === "/fixtures") {
            let response = await cache.match(cacheKey);
            if (!response) {
                const date = url.searchParams.get("date");
                const res = await fetch(`https://v3.football.api-sports.io/fixtures?date=${date}`, {
                    headers: { "x-apisports-key": env.API_SPORTS_KEY }
                });
                const data = await res.json();
                
                response = new Response(JSON.stringify(data), {
                    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } 
                });
                waitUntil(cache.put(cacheKey, response.clone()));
            }
            return response;
        }

        if (action === "fetch-events" || action === "/events") {
            let response = await cache.match(cacheKey);
            if (!response) {
                const fixtureId = url.searchParams.get("fixture");
                const res = await fetch(`https://v3.football.api-sports.io/fixtures/events?fixture=${fixtureId}`, {
                    headers: { "x-apisports-key": env.API_SPORTS_KEY }
                });
                const data = await res.json();
                
                response = new Response(JSON.stringify(data), {
                    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=180" } 
                });
                waitUntil(cache.put(cacheKey, response.clone()));
            }
            return response;
        }

        if (action === "fetch-stats" || action === "/statistics") {
            let response = await cache.match(cacheKey);
            if (!response) {
                const fixtureId = url.searchParams.get("fixture");
                const res = await fetch(`https://v3.football.api-sports.io/fixtures/statistics?fixture=${fixtureId}`, {
                    headers: { "x-apisports-key": env.API_SPORTS_KEY }
                });
                const data = await res.json();
                
                response = new Response(JSON.stringify(data), {
                    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=180" }
                });
                waitUntil(cache.put(cacheKey, response.clone()));
            }
            return response;
        }

        if (action === "generate-article" || action === "/generate-article") {
            const body = await request.json();
            const { fixtureId, matchStr, score, events, language } = body;
            const kvKey = `recap_${fixtureId}_${language}`;

            if (env.SPORTS_KV) {
                const cachedArticle = await env.SPORTS_KV.get(kvKey);
                if (cachedArticle) {
                    return new Response(JSON.stringify({ result: cachedArticle, source: "KV_CACHE" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
                }
            }

            if (!env.GEMINI_API_KEY) {
                 return new Response(JSON.stringify({ error: "GEMINI_API_KEY is missing" }), { status: 500, headers: corsHeaders });
            }

            const prompt = `Write a short, engaging sports journalism recap (3-4 sentences) for the football match: ${matchStr}. The final score was ${score}. Key events: ${events}. Write the article entirely in the ${language} language. Return only the text without any introduction.`;
            
            const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            
            const aiData = await aiRes.json();
            const articleText = aiData.candidates[0].content.parts[0].text;

            if (env.SPORTS_KV) {
                await env.SPORTS_KV.put(kvKey, articleText);
            }

            return new Response(JSON.stringify({ result: articleText, source: "LIVE_AI" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
}
