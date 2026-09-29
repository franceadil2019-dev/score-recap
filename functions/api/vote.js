// functions/api/vote.js - ملف سيرفر مستقل لإدارة نظام التصويت فقط

export async function onRequest(context) {
  const { request, env, waitUntil } = context;
  const url = new URL(request.url);

  // إعدادات الأمان (CORS)
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, x-action",
    "Content-Type": "application/json"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // دالة حماية: التأكد من أن رقم المباراة أرقام فقط
  const isValidId = (id) => {
    return id && /^\d{1,10}$/.test(id);
  };

  try {
    // 1. جلب الأصوات الحالية (GET Request)
    if (request.method === "GET") {
      const fixtureId = url.searchParams.get("fixtureId");
      if (!isValidId(fixtureId)) return new Response(JSON.stringify({ error: "Invalid ID" }), { status: 400, headers: corsHeaders });

      const kvKey = `votes_${fixtureId}`;
      let votes = { home: 0, draw: 0, away: 0 };

      if (env.SPORTS_KV) {
          const cachedVotes = await env.SPORTS_KV.get(kvKey, "json");
          if (cachedVotes) votes = cachedVotes;
      }
      return new Response(JSON.stringify({ votes }), { headers: corsHeaders });
    }

    // 2. تسجيل تصويت جديد (POST Request)
    if (request.method === "POST") {
      const body = await request.json();
      const fixtureId = body.fixtureId;
      const choice = body.choice; // 'home', 'draw', or 'away'

      if (!isValidId(fixtureId)) return new Response(JSON.stringify({ error: "Invalid ID" }), { status: 400, headers: corsHeaders });

      const kvKey = `votes_${fixtureId}`;
      let votes = { home: 0, draw: 0, away: 0 };

      if (env.SPORTS_KV) {
          const cachedVotes = await env.SPORTS_KV.get(kvKey, "json");
          if (cachedVotes) votes = cachedVotes;
      }

      // إضافة الصوت الجديد
      if (['home', 'draw', 'away'].includes(choice)) {
          votes[choice] += 1;
          if (env.SPORTS_KV) {
              // حفظ التصويت في الكاش لمدة 7 أيام (604800 ثانية)
              waitUntil(env.SPORTS_KV.put(kvKey, JSON.stringify(votes), { expirationTtl: 604800 }));
          }
      }
      return new Response(JSON.stringify({ success: true, votes }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
}
