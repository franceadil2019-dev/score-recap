export async function onRequest(context) {
const { requete, environnement, attendre jusqu'à } = contexte;
const url = new URL(request.url);

const corsHeaders = {
"Access-Control-Allow-Origin": "*",
"Access-Control-Allow-Headers": "Content-Type",
"Content-Type": "application/json"
};

si (request.method === "OPTIONS") {
renvoie une nouvelle réponse (null, { headers: corsHeaders });
}

si (!env.API_SPORTS_KEY) {
return new Response(JSON.stringify({ error: "API_SPORTS_KEY is missing" }), { status: 500, headers: corsHeaders });
}

essayer {
const leagueId = url.searchParams.get("league");
const season = url.searchParams.get("season") || new Date().getFullYear();

si (!leagueId) {
return new Response(JSON.stringify({ error: "L'identifiant de la ligue est requis" }), { status: 400, headers: corsHeaders });
}

const kvKey = `standings_${leagueId}_${season}`;

// 1. التحقق من وجود الترتيب في الخزانة (KV)
si (env.SPORTS_KV) {
const cachedStandings = await env.SPORTS_KV.get(kvKey);
si (classement en cache) {
// إرجاع الترتيب من الكاش (صلاحية 24 ساعة)
renvoie une nouvelle réponse(cachedStandings, {
en-têtes : { ...corsHeaders, "Cache-Control": "public, max-age=86400" }
});
}
}

// 2. إذا لم يكن في الخزانة، نجلبه من API-Sports (يستهلك 1 طلب فقط)
const res = await fetch(` https://v3.football.api-sports.io/standings?league=${leagueId}&season=${season}` , {
en-têtes : { "x-apisports-key": env.API_SPORTS_KEY }
});
const dataText = await res.text();
const dataObj = JSON.parse(dataText);

// 3. حفظ الترتيب في الخزانة لمدة 24 ساعة (86400 ثانية)
si (env.SPORTS_KV && res.ok && (!dataObj.errors || Object.keys(dataObj.errors).length === 0)) {
attendre jusqu'à(env.SPORTS_KV.put(kvKey, dataText, { expirationTtl: 86400 }));
}

retourner une nouvelle réponse(dataText, {
en-têtes : { ...corsHeaders, "Cache-Control": "public, max-age=86400" }
});

} attraper (erreur) {
return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
}
}
