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

        // 🚨 التعديل الأول: تغيير اسم المفتاح (إضافة v2) لتجاوز الكاش القديم المعطوب فوراً
        const kvKey = `standings_v2_${leagueId}_${season}`;

        // 1. التحقق من وجود الترتيب في الخزانة (KV)
        if (env.SPORTS_KV) {
            const cachedStandings = await env.SPORTS_KV.get(kvKey);
            if (cachedStandings) {
                return new Response(cachedStandings, {
                    headers: { ...corsHeaders, "Cache-Control": "public, max-age=86400" }
                });
            }
        }

        // 2. إذا لم يكن في الخزانة، نجلبه من API-Sports
        const res = await fetch(`https://v3.football.api-sports.io/standings?league=${leagueId}&season=${season}`, {
            headers: { "x-apisports-key": env.API_SPORTS_KEY }
        });
       
        const dataText = await res.text();
        const dataObj = JSON.parse(dataText);

        // 🚨 التعديل الثاني الأهم: لا نحفظ في الكاش إلا إذا كان هناك ترتيب فعلي (response.length > 0)
        if (env.SPORTS_KV && res.ok && dataObj.response && dataObj.response.length > 0) {
            waitUntil(env.SPORTS_KV.put(kvKey, dataText, { expirationTtl: 86400 }));
        }

        return new Response(dataText, {
            headers: { ...corsHeaders, "Cache-Control": "public, max-age=86400" }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }
}
