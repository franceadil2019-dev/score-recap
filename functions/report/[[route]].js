export async function onRequest(context) {
    const { request, env, waitUntil } = context;
    const url = new URL(request.url);
   
    const routeParams = context.params.route || [];
    const fixtureId = routeParams[0];

    const redirectToHome = () => Response.redirect(url.origin + "/", 302);

    if (!fixtureId) {
        return redirectToHome();
    }

    try {
        let articleHTML = "";
        if (env.SPORTS_KV) {
            articleHTML = await env.SPORTS_KV.get(`recap_v2_${fixtureId}_en`) ||
                          await env.SPORTS_KV.get(`recap_${fixtureId}_en`) ||
                          await env.SPORTS_KV.get(`recap_v2_${fixtureId}_ar`) ||
                          await env.SPORTS_KV.get(`recap_v2_${fixtureId}_fr`) ||
                          "";
        }

        let match = null;
        if (env.SPORTS_KV) {
            match = await env.SPORTS_KV.get(`api_fixture_id_${fixtureId}`, "json");
        }

        if (!match && env.API_SPORTS_KEY) {
            try {
                const matchRes = await fetch(`https://v3.football.api-sports.io/fixtures?id=${fixtureId}`, {
                    headers: { "x-apisports-key": env.API_SPORTS_KEY }
                });
                const matchData = await matchRes.json();
                if (matchData.response && matchData.response.length > 0) {
                    match = matchData.response[0];
                    if (env.SPORTS_KV) {
                        waitUntil(env.SPORTS_KV.put(`api_fixture_id_${fixtureId}`, JSON.stringify(match), { expirationTtl: 86400 }));
                    }
                }
            } catch (e) {}
        }

        if (!articleHTML && match) {
            if (String(match.league.id) !== "39") return redirectToHome();
            const status = match.fixture.status.short;
            if (status !== 'FT' && status !== 'AET' && status !== 'PEN') return redirectToHome();

            if (env.GEMINI_API_KEY) {
                let eventsStr = "Key match events";
                try {
                    const eventsRes = await fetch(`https://v3.football.api-sports.io/fixtures/events?fixture=${fixtureId}`, {
                        headers: { "x-apisports-key": env.API_SPORTS_KEY }
                    });
                    const eventsData = await eventsRes.json();
                    if (eventsData.response && eventsData.response.length > 0) {
                        eventsStr = eventsData.response.map(ev => `${ev.time.elapsed}' ${ev.type} ${ev.player.name}`).join(', ');
                    }
                } catch (e) {}

                const writingStyles = [
                    "Focus heavily on the tactical battle, formations, and the managers' strategic decisions.",
                    "Write with high passion and drama, focusing on the emotional rollercoaster and intensity of the match.",
                    "Focus on individual player performances, key mistakes, and moments of individual brilliance.",
                    "Take a narrative angle, discussing how this specific result impacts the teams' season and their fans.",
                    "Adopt a highly analytical and critical journalistic tone, questioning the losing team's performance."
                ];
                const randomStyle = writingStyles[Math.floor(Math.random() * writingStyles.length)];

                const prompt = `Act as an expert sports journalist. Write a comprehensive, engaging match report for: ${match.teams.home.name} vs ${match.teams.away.name}. Final score: ${match.goals.home} - ${match.goals.away}. Events: ${eventsStr}.
                
                CRITICAL INSTRUCTION: ${randomStyle}
                
                Include: <h2>Title</h2>, <p>Introduction</p>, <p>Tactical Analysis</p>, <h3>Turning Point</h3> with <ul><li>...</li></ul>, and a strong conclusion.
                Write in English. Return ONLY clean HTML.`;

                const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${env.GEMINI_API_KEY}`, {
                    method: "POST", 
                    headers: { "Content-Type": "application/json" }, 
                    body: JSON.stringify({ 
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.85, topP: 0.9 }
                    })
                });
                const aiData = await aiRes.json();
                if (aiRes.ok && aiData.candidates) {
                    articleHTML = aiData.candidates[0].content.parts[0].text;
                    if (env.SPORTS_KV) {
                        waitUntil(env.SPORTS_KV.put(`recap_v2_${fixtureId}_en`, articleHTML));
                        waitUntil((async () => {
                            try {
                                let recent = await env.SPORTS_KV.get("recent_generated_reports", "json");
                                if (!recent || !Array.isArray(recent)) recent = [];
                                if (!recent.includes(fixtureId)) {
                                    recent.unshift(fixtureId);
                                    recent = recent.slice(0, 10);
                                    await env.SPORTS_KV.put("recent_generated_reports", JSON.stringify(recent));
                                    await env.SPORTS_KV.delete("cached_latest_reports");
                                }
                            } catch (e) {}
                        })());
                    }
                }
            }
        }

        if (!articleHTML) {
            return redirectToHome();
        }

        let homeName = match ? match.teams.home.name : "Premier League Team";
        let awayName = match ? match.teams.away.name : "Premier League Team";
        let homeLogo = match ? match.teams.home.logo : "https://media.api-sports.io/football/leagues/39.png";
        let awayLogo = match ? match.teams.away.logo : "https://media.api-sports.io/football/leagues/39.png";
        let score = match && match.goals.home !== null ? `${match.goals.home} - ${match.goals.away}` : "FT";
        let matchStr = match ? `${homeName} vs ${awayName}` : "Match Report";

        const titleMatch = articleHTML.match(/<h2[^>]*>(.*?)<\/h2>/i);
        const articleHeadline = titleMatch && titleMatch[1] ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : matchStr;

        const title = `${articleHeadline} | ScoreRecap`;
        const description = `Read the full match report and tactical breakdown for ${matchStr}. Final Score: ${score}.`;
        const canonicalUrl = `${url.origin}${url.pathname}`;

        const html = `<!DOCTYPE html>
<html lang="en" dir="ltr" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <link rel="canonical" href="${canonicalUrl}">
   
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:type" content="article">
    <meta property="og:url" content="${canonicalUrl}">
    <meta property="og:image" content="https://images.unsplash.com/photo-1518605368461-1e1252220a77?q=80&w=1200&auto=format&fit=crop">

    <script src="https://cdn.tailwindcss.com"></script>
    <script> tailwind.config = { darkMode: 'class', } </script>
   
    <style>
        .ai-article-content h2 { font-size: 1.5rem; font-weight: 900; margin-top: 1.5rem; margin-bottom: 1rem; color: #60a5fa; }
        .ai-article-content h3 { font-size: 1.25rem; font-weight: 800; margin-top: 1.5rem; margin-bottom: 0.75rem; color: #cbd5e1; }
        .ai-article-content p { margin-bottom: 1.25rem; line-height: 1.8; font-size: 1.05rem; color: #e2e8f0; }
        .ai-article-content ul { list-style-type: disc; padding-left: 1.5rem; margin-bottom: 1.25rem; font-size: 1.05rem; color: #e2e8f0; }
        .ai-article-content li { margin-bottom: 0.5rem; }
        .ai-article-content strong { color: #10b981; }
    </style>
</head>
<body class="bg-slate-950 text-slate-100 font-sans min-h-screen flex flex-col">
   
    <header class="bg-slate-900 border-b border-slate-800 sticky top-0 z-50 shadow-sm">
        <div class="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
            <a href="/" class="text-2xl font-black text-emerald-500 tracking-tight">SCORE<span class="text-white">RECAP</span></a>
            <a href="/reports" class="text-sm font-bold text-slate-300 hover:text-white transition-colors flex items-center gap-2">
                &larr; Back to Reports
            </a>
        </div>
    </header>

    <main class="flex-grow max-w-4xl mx-auto w-full px-4 py-8">
        <article class="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div class="relative w-full h-56 sm:h-72 bg-slate-950 flex items-center justify-center overflow-hidden">
                <img src="https://images.unsplash.com/photo-1518605368461-1e1252220a77?q=80&w=1200&auto=format&fit=crop" class="absolute inset-0 w-full h-full object-cover opacity-30" alt="Stadium">
                <div class="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent"></div>
                <div class="relative z-10 flex items-center gap-8 sm:gap-16">
                    <div class="text-center">
                        <img src="${homeLogo}" class="w-16 h-16 sm:w-24 sm:h-24 object-contain drop-shadow-2xl mx-auto mb-2">
                        <span class="font-bold text-xs sm:text-sm text-slate-300">${homeName}</span>
                    </div>
                    <div class="text-center">
                        <div class="text-3xl sm:text-5xl font-black text-white drop-shadow-lg mb-1">${score}</div>
                        <span class="text-emerald-500 font-bold text-[10px] sm:text-xs uppercase tracking-widest">Full Time</span>
                    </div>
                    <div class="text-center">
                        <img src="${awayLogo}" class="w-16 h-16 sm:w-24 sm:h-24 object-contain drop-shadow-2xl mx-auto mb-2">
                        <span class="font-bold text-xs sm:text-sm text-slate-300">${awayName}</span>
                    </div>
                </div>
            </div>

            <div class="p-6 sm:p-10">
                <div class="flex items-center gap-3 mb-6 border-b border-slate-800 pb-4">
                    <div class="bg-slate-800 p-2.5 rounded-xl text-blue-400">
                        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path></svg>
                    </div>
                    <h1 class="text-base sm:text-lg font-black text-white uppercase tracking-widest">Match Report & Tactical Analysis</h1>
                </div>
               
                <div class="ai-article-content">
                    ${articleHTML}
                </div>
            </div>
        </article>
    </main>

    <footer class="bg-slate-900 border-t border-slate-800 text-center py-6 text-slate-500 text-sm mt-auto">
        <p>&copy; 2026 ScoreRecap. All rights reserved.</p>
    </footer>
</body>
</html>`;

        return new Response(html, {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "public, max-age=86400"
            }
        });

    } catch (error) {
        return redirectToHome();
    }
}
