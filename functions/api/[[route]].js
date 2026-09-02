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

            // هنا تم تعديل الأمر ليصبح مقالاً رياضياً طويلاً واحترافياً
            const prompt = `Act as an expert sports journalist and tactical analyst. Write a comprehensive, engaging, and detailed match report for the football match: ${matchStr}. The final score was ${score}. 
            Key events (goals, cards, substitutions): ${events}. 
            The article MUST include:
            1. A catchy headline wrapped in an <h2> HTML tag.
            2. An exciting introduction summarizing the match and the final outcome wrapped in <p> tags.
            3. A tactical analysis paragraph explaining how the match unfolded, focusing on the key events. Wrapped in <p> tags.
            4. A "Turning Point" or "Key Moments" section using an <h3> tag, followed by a bulleted list <ul><li>...</li></ul> explaining the most important events.
            5. A strong conclusion paragraph.
            Write the ENTIRE article perfectly in the ${language} language. Return ONLY valid HTML code. Do NOT wrap the response in markdown blocks like \`\`\`html.`;
            
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
