export async function onRequest(context) {
    const { request, env, waitUntil } = context;
    const url = new URL(request.url);

    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    if (!env.API_SPORTS_KEY) {
        return new Response(JSON.stringify({ error: "API_SPORTS_KEY is missing" }), { status: 500, headers: corsHeaders });
    }

    try {
        const leagueId = url.searchParams.get("league");
        const season = url.searchParams.get("season") || new Date().getFullYear();

        if (!leagueId) {
            return new Response(JSON.stringify({ error: "League ID is required" }), { status: 400, headers: corsHeaders });
        }

        const kvKey = `standings_${leagueId}_${season}`;

        // 1. التحقق من وجود الترتيب في الخزانة (KV)
        if (env.SPORTS_KV) {
            const cachedStandings = await env.SPORTS_KV.get(kvKey);
            if (cachedStandings) {
                // إرجاع الترتيب من الكاش (صلاحية 24 ساعة)
                return new Response(cachedStandings, { 
                    headers: { ...corsHeaders, "Cache-Control": "public, max-age=86400" } 
                });
            }
        }

        // 2. إذا لم يكن في الخزانة، نجلبه من API-Sports (يستهلك 1 طلب فقط)
        const res = await fetch(`https://v3.football.api-sports.io/standings?league=${leagueId}&season=${season}`, {
            headers: { "x-apisports-key": env.API_SPORTS_KEY }
        });
        
        const dataText = await res.text();
        const dataObj = JSON.parse(dataText);

        // 3. حفظ الترتيب في الخزانة لمدة 24 ساعة (86400 ثانية)
        if (env.SPORTS_KV && res.ok && (!dataObj.errors || Object.keys(dataObj.errors).length === 0)) {
            waitUntil(env.SPORTS_KV.put(kvKey, dataText, { expirationTtl: 86400 }));
        }

        return new Response(dataText, { 
            headers: { ...corsHeaders, "Cache-Control": "public, max-age=86400" } 
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }
}
