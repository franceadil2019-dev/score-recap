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

    // 🛡️ دالة سحرية لحفظ البيانات في KV
    async function getFromApiSports(endpoint, kvKey, ttlSeconds) {
        if (env.SPORTS_KV) {
            const cachedData = await env.SPORTS_KV.get(kvKey);
            if (cachedData) {
                return new Response(cachedData, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
        }

        const res = await fetch(`https://v3.football.api-sports.io/${endpoint}`, { 
            headers: { "x-apisports-key": env.API_SPORTS_KEY } 
        });
        const dataText = await res.text();

        try {
            const dataObj = JSON.parse(dataText);
            if (env.SPORTS_KV && res.ok && (!dataObj.errors || Object.keys(dataObj.errors).length === 0)) {
                // Cloudflare KV يفضل ألا يقل الـ TTL عن 60 ثانية لتنظيف الذاكرة بشكل مستقر
                const safeTtl = Math.max(ttlSeconds, 60);
                waitUntil(env.SPORTS_KV.put(kvKey, dataText, { expirationTtl: safeTtl }));
            }
        } catch(e) {}

        return new Response(dataText, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    try {
        // 1. جلب المباريات (الكاش الذكي: 60 ثانية لليوم، و24 ساعة للأمس والغد)
        if (action === "fetch-matches" || action === "fetch-fixtures" || action === "/fixtures") {
            const date = url.searchParams.get("date");
            const today = new Date().toISOString().split('T')[0];
            
            const ttl = (date === today) ? 60 : 86400;
            
            return await getFromApiSports(`fixtures?date=${date}`, `api_fixtures_${date}`, ttl);
        }

        // 2. جلب الأحداث (60 ثانية للمباريات الحية)
        if (action === "fetch-events" || action === "/events") {
            const fixtureId = url.searchParams.get("fixture");
            return await getFromApiSports(`fixtures/events?fixture=${fixtureId}`, `api_events_${fixtureId}`, 60);
        }

        // 3. جلب الإحصائيات (60 ثانية للمباريات الحية)
        if (action === "fetch-stats" || action === "/statistics") {
            const fixtureId = url.searchParams.get("fixture");
            return await getFromApiSports(`fixtures/statistics?fixture=${fixtureId}`, `api_stats_${fixtureId}`, 60);
        }

        // 4. توقع المباراة (الدوري الإنجليزي - بالإنجليزية)
        if (action === "predict-match") {
            let leagueId = url.searchParams.get("leagueId");
            if (leagueId !== "39") {
                return new Response(JSON.stringify({ error: "Predictions are only available for the Premier League." }), { status: 403, headers: corsHeaders });
            }

            let fixtureId = url.searchParams.get("fixtureId");
            let homeTeam = url.searchParams.get("homeTeam");
            let awayTeam = url.searchParams.get("awayTeam");
            
            const lang = "en";
            const kvKey = `predict_${fixtureId}_${lang}`;

            if (env.SPORTS_KV) {
                const cachedPrediction = await env.SPORTS_KV.get(kvKey);
                if (cachedPrediction) { 
                    return new Response(JSON.stringify({ result: cachedPrediction, source: "KV_CACHE" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } }); 
                }
            }

            if (!env.GEMINI_API_KEY) return new Response(JSON.stringify({ error: "GEMINI_API_KEY is missing" }), { status: 500, headers: corsHeaders });

            const prompt = `Act as an expert football analyst. Write a short, exciting prediction for the upcoming Premier League match between ${homeTeam} and ${awayTeam}. Give a brief reason analyzing their current form, and give a final predicted scoreline. Write it ENTIRELY in English. Return ONLY valid HTML code (use <p> and <strong> tags for the score). Do NOT wrap the response in markdown blocks.`;
            
            // ✅ التعديل هنا: استخدام النسخة المتوافقة مع حسابك gemini-3.1-pro-preview
            const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${env.GEMINI_API_KEY}`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            
            const aiData = await aiRes.json();
            
            if (!aiRes.ok || !aiData.candidates) {
                const googleError = aiData.error?.message || "Unknown Google Error";
                return new Response(JSON.stringify({ error: `Gemini Error: ${googleError}` }), { status: 500, headers: corsHeaders });
            }
            
            const predictionText = aiData.candidates[0].content.parts[0].text;

            if (env.SPORTS_KV) { waitUntil(env.SPORTS_KV.put(kvKey, predictionText)); }
            return new Response(JSON.stringify({ result: predictionText, source: "LIVE_AI" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // 5. تقرير المباراة (الدوري الإنجليزي - بالإنجليزية)
        if (action === "generate-article" || action === "/generate-article") {
            let leagueId = url.searchParams.get("leagueId");
            if (leagueId !== "39") {
                return new Response(JSON.stringify({ error: "Match reports are only available for the Premier League." }), { status: 403, headers: corsHeaders });
            }

            let fixtureId = url.searchParams.get("fixtureId");
            let matchStr = url.searchParams.get("matchStr");
            let score = url.searchParams.get("score");
            let events = url.searchParams.get("events");
            
            const lang = "en";
            const kvKey = `recap_${fixtureId}_${lang}`;

            if (env.SPORTS_KV) {
                const cachedArticle = await env.SPORTS_KV.get(kvKey);
                if (cachedArticle) { 
                    return new Response(JSON.stringify({ result: cachedArticle, source: "KV_CACHE" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } }); 
                }
            }

            if (!env.GEMINI_API_KEY) return new Response(JSON.stringify({ error: "GEMINI_API_KEY is missing" }), { status: 500, headers: corsHeaders });

            const prompt = `Act as an expert sports journalist and tactical analyst. Write a comprehensive, engaging, and detailed match report for the Premier League fixture: ${matchStr}. Final score: ${score}. Key events: ${events}. 
            The article MUST include: 
            1. A catchy headline wrapped in an <h2> HTML tag. 
            2. An exciting introduction wrapped in <p> tags. 
            3. A tactical analysis paragraph wrapped in <p> tags. 
            4. A "Turning Point" section using an <h3> tag, followed by a bulleted list <ul><li>...</li></ul>. 
            5. A strong conclusion paragraph. 
            Write the ENTIRE article perfectly in English. Return ONLY valid clean HTML code. Do NOT wrap the response in markdown blocks.`;
            
            // ✅ التعديل هنا: استخدام النسخة المتوافقة مع حسابك gemini-3.1-pro-preview
            const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${env.GEMINI_API_KEY}`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            
            const aiData = await aiRes.json();
            
            if (!aiRes.ok || !aiData.candidates) {
                const googleError = aiData.error?.message || "Unknown Google Error";
                return new Response(JSON.stringify({ error: `Gemini Error: ${googleError}` }), { status: 500, headers: corsHeaders });
            }
            
            const articleText = aiData.candidates[0].content.parts[0].text;

            if (env.SPORTS_KV) { waitUntil(env.SPORTS_KV.put(kvKey, articleText)); }
            return new Response(JSON.stringify({ result: articleText, source: "LIVE_AI" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: corsHeaders });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }
}
