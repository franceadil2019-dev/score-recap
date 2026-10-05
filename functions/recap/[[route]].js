export async function onRequest(context) {
    const { request, env, waitUntil } = context;
    const url = new URL(request.url);
   
    const routeParams = context.params.route || [];
    const fixtureId = routeParams[0];

    const redirectToHome = () => Response.redirect(url.origin + "/", 302);

    if (!fixtureId) {
        return redirectToHome();
    }

    const ALLOWED_LEAGUES = ["39"];

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
                        waitUntil(env.SPORTS_KV.put(`api_fixture_id_${fixtureId}`, JSON.stringify(match)));
                    }
                }
            } catch (e) {}
        }

        if (!articleHTML && match) {
            if (!ALLOWED_LEAGUES.includes(String(match.league.id))) return redirectToHome();
           
            const status = match.fixture.status.short;
            if (status !== 'FT' && status !== 'AET' && status !== 'PEN') return redirectToHome();
           
            if (new Date(match.fixture.date) > new Date()) return redirectToHome();

            if (env.GEMINI_API_KEY) {
                let eventsStr = "No specific events";
                let lineupsStr = "Lineups unavailable";

                try {
                    const eventsRes = await fetch(`https://v3.football.api-sports.io/fixtures/events?fixture=${fixtureId}`, {
                        headers: { "x-apisports-key": env.API_SPORTS_KEY }
                    });
                    const eventsData = await eventsRes.json();
                    if (eventsData.response && eventsData.response.length > 0) {
                        eventsStr = eventsData.response.map(ev => `${ev.time.elapsed}' ${ev.type} (${ev.detail || ''}) ${ev.player?.name || ''}`).join(', ');
                    }
                } catch (e) {}

                try {
                    const lineupsRes = await fetch(`https://v3.football.api-sports.io/fixtures/lineups?fixture=${fixtureId}`, {
                        headers: { "x-apisports-key": env.API_SPORTS_KEY }
                    });
                    const lineupsData = await lineupsRes.json();
                    if (lineupsData.response && lineupsData.response.length >= 2) {
                        const homeXI = lineupsData.response[0].startXI?.map(p => p.player.name).join(', ') || '';
                        const awayXI = lineupsData.response[1].startXI?.map(p => p.player.name).join(', ') || '';
                        lineupsStr = `${match.teams.home.name} XI: [${homeXI}] | ${match.teams.away.name} XI: [${awayXI}]`;
                    }
                } catch (e) {}

                const writingStyles = [
                    "Style 1: Focus heavily on the tactical chess match between the managers, formations, defensive blocks, and pressing traps.",
                    "Style 2: Write with high emotional drama and storytelling, focusing on the fans' perspective, tension, and the psychological impact of the goals.",
                    "Style 3: Focus deeply on individual brilliance, key errors, and standout performances without inventing names.",
                    "Style 4: Take a historical and macro perspective, analyzing what this specific result means for the clubs' ambitions, top-four race, or relegation battle.",
                    "Style 5: Adopt a fast-paced, action-oriented match recap style, breaking down the flow of momentum based on the scoreline.",
                    "Style 6: Focus on the physical duel, intensity, defensive resilience, and how grit won or lost the match.",
                    "Style 7: Write from a technical and data-driven perspective, analyzing efficiency in front of goal and possession value.",
                    "Style 8: Focus on the midfield battle, possession control, and how the game was won or lost in the center of the park.",
                    "Style 9: Highlight the impact of substitutions, tactical tweaks in the second half, and late match drama.",
                    "Style 10: Focus on goalkeeping heroics, defensive clearances, and the struggle to break down a resolute backline.",
                    "Style 11: Write a poetic, romanticized view of the beautiful game, focusing on the artistry of the goals and the passion on the pitch.",
                    "Style 12: Focus heavily on wing-play, crosses, full-back overlaps, and the exploitation of wide areas.",
                    "Style 13: Frame the narrative around the underdog fighting against the odds, or the heavy favorite dealing with immense pressure.",
                    "Style 14: Adopt a highly analytical, scout-like report focusing on player positioning, off-the-ball movement, and spatial awareness.",
                    "Style 15: Focus on the stadium atmosphere, how the crowd influenced the referee or the players, and the raw emotion of the fixture."
                ];
                const randomStyle = writingStyles[Math.floor(Math.random() * writingStyles.length)];

                const prompt = `Act as an elite sports journalist and senior tactical analyst. Write a comprehensive match recap for the fixture: ${match.teams.home.name} vs ${match.teams.away.name}. Final score: ${match.goals.home} - ${match.goals.away}.
               
                Official Match Events: ${eventsStr}
                Official Starting Lineups: ${lineupsStr}
               
                CRITICAL ANTI-HALLUCINATION RULES (YOU MUST OBEY THESE):
                1. ONLY mention players explicitly listed in the match events or lineups above. Do NOT invent or guess any other players.
                2. If you need to describe the gameplay but don't have specific player names, use general terms like "the home side's defense", "the midfield pivot", "the visiting goalkeeper", or "the attacking line".
               
                CRITICAL REQUIREMENT - LENGTH & EXPANSION (FOR ADSENSE):
                - The article MUST be at least 600 words long.
                - To reach this length WITHOUT inventing facts or names, you MUST expand deeply on:
                  * Tactical theories (e.g., pressing traps, low blocks, transition play).
                  * Managerial philosophies and how the starting lineups reflect them.
                  * The psychological impact of the scoreline on the teams.
                  * What this specific result means for the clubs' broader season objectives (title race, European spots, or relegation battle).
                - Break the text into short, readable paragraphs.
                - ${randomStyle}
               
                STRUCTURE THE ARTICLE EXACTLY IN THIS HTML FORMAT (Do not use markdown wrappers like \`\`\`html):
               
                <h2>[Generate a Catchy, Journalistic Main Title]</h2>
                <p>[Punchy introduction summarizing the atmosphere and the final result.]</p>
               
                <h3>Tactical Setup & Starting Lineups</h3>
                <p>[Deep dive into the expected tactical battle, formations, and philosophies based on the lineups. Expand on this to increase word count.]</p>
               
                <h3>Match Flow & Key Moments</h3>
                <p>[Analyze the goals and key events explicitly mentioned in the timeline. If events are sparse, focus on the physical battle and defensive resilience.]</p>
               
                <h3>Broader Implications & Season Objectives</h3>
                <p>[Discuss deeply what this result means for both clubs moving forward in the league. Expand on this to increase word count.]</p>
               
                <h3>Final Thoughts</h3>
                <p>[A strong concluding paragraph summarizing the tactical chess match.]</p>
               
                Write the ENTIRE article perfectly in English. Ensure professional sports journalism phrasing. Return ONLY valid clean HTML code.`;

                const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${env.GEMINI_API_KEY}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.35, topP: 0.9 }
                    })
                });
               
                const aiData = await aiRes.json();
                if (aiRes.ok && aiData.candidates) {
                    let rawHTML = aiData.candidates[0].content.parts[0].text;
                    articleHTML = rawHTML.replace(/^```html\s*/i, '').replace(/\s*```$/i, '').trim();
                   
                    if (env.SPORTS_KV) {
                        waitUntil(env.SPORTS_KV.put(`recap_v2_${fixtureId}_en`, articleHTML));
                        waitUntil((async () => {
                            try {
                                let recent = await env.SPORTS_KV.get("recent_generated_reports", "json");
                                if (!recent || !Array.isArray(recent)) recent = [];
                                if (!recent.includes(fixtureId)) {
                                    recent.unshift(fixtureId);
                                    recent = recent.slice(0, 100);
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

        let homeName = match ? match.teams.home.name : "Football Team";
        let awayName = match ? match.teams.away.name : "Football Team";
        let homeLogo = match ? match.teams.home.logo : "https://media.api-sports.io/football/leagues/39.png";
        let awayLogo = match ? match.teams.away.logo : "https://media.api-sports.io/football/leagues/39.png";
        let score = match && match.goals.home !== null ? `${match.goals.home} - ${match.goals.away}` : "FT";
        let matchStr = match ? `${homeName} vs ${awayName}` : "Match Recap";
       
        let matchDateStr = "";
        if (match && match.fixture && match.fixture.date) {
            const dateObj = new Date(match.fixture.date);
            const options = { year: 'numeric', month: 'long', day: 'numeric' };
            matchDateStr = dateObj.toLocaleDateString('en-US', options);
        }

        const titleMatch = articleHTML.match(/<h2[^>]*>(.*?)<\/h2>/i);
        const articleHeadline = titleMatch && titleMatch[1] ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : matchStr;

        const title = `${articleHeadline} | ScoreRecap`;
        const description = `Read the full match recap and tactical breakdown for ${matchStr}. Final Score: ${score}.`;
        const canonicalUrl = `${url.origin}${url.pathname}`;

        const stadiumImages = [
            "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1556056504-5c7696c4c28d?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1574629810360-7efbbcb27a4e?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1589487391730-58f20eb2c308?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1518091043644-c1d44570a2c9?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1600250395378-9622269c9b0e?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1504450758481-7338eba7524a?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1518605368461-1e1252220a77?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1511886929837-3e6d64c12519?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1543351017-ce54d012461f?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1508344928928-71e1b53a2eb0?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1459865264687-595d652de67e?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1563299796-b25e0a9e24fb?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1524015368236-fb8dc40bce31?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1431324155629-1a6bbe23b9d1?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1519068737630-e5bf200009d8?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1509564324749-472b15bf2830?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1552318414-a95781a9657b?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1518602164598-40235b43f05c?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1587325150937-21013770335e?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1569325983-20a23dc84976?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1551280857-2b9bbe5240f5?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1560272564-c83b66b1ad12?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1520627702-832f05eb7d94?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1540755910-18e388cb2809?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1580929285093-45543c72e4b3?auto=format&fit=crop&w=1200&q=80"
        ];
       
        const randomImageIndex = parseInt(fixtureId) % stadiumImages.length;
        const stadiumImage = stadiumImages[randomImageIndex];
        const fallbackImage = "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1200&q=80";

        const schemaMarkup = {
            "@context": "https://schema.org",
            "@type": "SportsArticle",
            "mainEntityOfPage": {
                "@type": "WebPage",
                "@id": canonicalUrl
            },
            "headline": title,
            "description": description,
            "image": [stadiumImage],
            "datePublished": match.fixture.date,
            "dateModified": match.fixture.date,
            "author": {
                "@type": "Organization",
                "name": "ScoreRecap",
                "url": url.origin
            },
            "publisher": {
                "@type": "Organization",
                "name": "ScoreRecap",
                "logo": {
                    "@type": "ImageObject",
                    "url": "https://media.api-sports.io/football/leagues/39.png"
                }
            }
        };
        const schemaJson = JSON.stringify(schemaMarkup);

        const html = `<!DOCTYPE html>
<html lang="en" dir="ltr" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <link rel="canonical" href="${canonicalUrl}">
   
    <!-- Open Graph SEO -->
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:type" content="article">
    <meta property="og:url" content="${canonicalUrl}">
    <meta property="og:image" content="${stadiumImage}">

    <!-- Schema Markup for Google SEO -->
    <script type="application/ld+json">
        ${schemaJson}
    </script>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@800;900&display=swap" rel="stylesheet">

    <script src="https://cdn.tailwindcss.com"></script>
    <script> 
        tailwind.config = { 
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        primary: '#013D72',
                        primaryHover: '#012b52'
                    },
                    fontFamily: {
                        heading: ['Montserrat', 'sans-serif'],
                        body: ['Inter', 'sans-serif']
                    }
                }
            }
        } 
    </script>
   
    <style>
        .custom-dropdown { position: relative; display: inline-block; }
        .drop-btn { background-color: #ffffff; border: 1px solid #cbd5e1; color: #1e293b; border-radius: 0.75rem; padding: 0.6rem 1.2rem; font-size: 0.8rem; display: flex; align-items: center; gap: 0.6rem; cursor: pointer; transition: all 0.2s; font-weight: 600; width: 100%; justify-content: space-between; }
        .dark .drop-btn { background-color: #0f172a; border: 1px solid #334155; color: white; }
        .drop-btn:hover, .drop-btn[aria-expanded="true"] { border-color: #013D72; }
        .drop-options { display: none; position: absolute; left: 0; top: 110%; background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 0.75rem; overflow: hidden; z-index: 9999; min-width: 100%; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); max-height: 350px; overflow-y: auto; }
        .dark .drop-options { background-color: #0f172a; border: 1px solid #334155; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.7); }
        .drop-options.show { display: block !important; }
        .drop-opt { width: 100%; padding: 0.6rem 1.2rem; text-align: left; display: flex; align-items: center; gap: 0.6rem; color: #334155; font-size: 0.8rem; transition: background 0.2s; font-weight: 500; border: none; background: none; cursor: pointer; }
        .dark .drop-opt { color: #cbd5e1; }
        .drop-opt:hover { background-color: #f1f5f9; color: #0f172a; }
        .dark .drop-opt:hover { background-color: #1e293b; color: white; }
        html[dir="rtl"] .drop-options { left: auto; right: 0; }
        html[dir="rtl"] .drop-opt { text-align: right; }
        #lang-options-menu { left: auto !important; right: 0 !important; }
        html[dir="rtl"] #lang-options-menu { right: auto !important; left: 0 !important; }

        .ai-article-content h2 { font-family: 'Montserrat', sans-serif; text-transform: uppercase; font-size: 1.5rem; font-weight: 900; margin-top: 1.5rem; margin-bottom: 1rem; color: #013D72; }
        .dark .ai-article-content h2 { color: #60a5fa; }
        .ai-article-content h3 { font-family: 'Montserrat', sans-serif; text-transform: uppercase; font-size: 1.25rem; font-weight: 800; margin-top: 1.5rem; margin-bottom: 0.75rem; color: #334155; }
        .dark .ai-article-content h3 { color: #cbd5e1; }
        .ai-article-content p { margin-bottom: 1.25rem; line-height: 1.8; font-size: 1.05rem; color: #475569; }
        .dark .ai-article-content p { color: #e2e8f0; }
        .ai-article-content ul { list-style-type: disc; padding-left: 1.5rem; margin-bottom: 1.25rem; font-size: 1.05rem; color: #475569; }
        .dark .ai-article-content ul { color: #e2e8f0; }
        .ai-article-content li { margin-bottom: 0.5rem; }
        .ai-article-content strong { color: #013D72; }
        .dark .ai-article-content strong { color: #10b981; }
    </style>
</head>
<body class="bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 font-body flex flex-col min-h-screen transition-colors duration-200 pt-16">
   
    <header class="bg-primary border-b-0 fixed w-full top-0 z-50 shadow-lg">
        <div class="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
            <div class="flex items-center gap-3">
                <a href="/" class="text-xl md:text-2xl font-heading font-black text-white tracking-tight uppercase">SCORE<span class="text-blue-200">RECAP</span></a>
            </div>
           
            <div class="flex items-center gap-2 md:gap-3">
                <div class="hidden md:flex items-center gap-3 mr-2">
                    <a href="/recaps" class="flex items-center gap-1.5 text-sm font-bold text-blue-100 hover:text-white transition-colors">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path></svg>
                        <span class="font-heading uppercase tracking-wide text-xs">Recaps</span>
                    </a>
                    <a href="/standings" class="flex items-center gap-1.5 text-sm font-bold text-blue-100 hover:text-white transition-colors">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                        <span class="font-heading uppercase tracking-wide text-xs">Standings</span>
                    </a>
                    <a href="/topscorers" class="flex items-center gap-1.5 text-sm font-bold text-blue-100 hover:text-white transition-colors">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"></path></svg>
                        <span class="font-heading uppercase tracking-wide text-xs">Top Scorers</span>
                    </a>
                </div>

                <button id="btn-theme-toggle" class="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-all text-white" aria-label="Toggle dark mode">
                    <svg id="theme-icon-sun" class="h-5 w-5 hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M16.243 17.657l.707.707M6.343 6.343l.707-.707M14.25 12a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>
                    <svg id="theme-icon-moon" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                </button>
                
                <div class="custom-dropdown w-[100px] md:w-40">
                    <button id="btn-lang-dropdown" class="drop-btn px-2 md:px-4" aria-haspopup="true" aria-expanded="false" aria-controls="lang-options-menu">
                        <div class="flex items-center gap-2">
                            <img id="current-lang-flag" src="https://flagcdn.com/16x12/us.png" class="w-4 h-3 object-cover rounded-sm shadow-sm" alt="">
                            <span id="current-lang-text" class="truncate hidden md:inline">English</span>
                            <span id="current-lang-code" class="truncate md:hidden text-xs font-bold uppercase">EN</span>
                        </div>
                        <svg class="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </button>
                    <div id="lang-options-menu" class="drop-options w-40">
                        <button class="drop-opt lang-opt" data-lang="en" data-flag="https://flagcdn.com/16x12/us.png" data-name="English" data-code="EN"><img src="https://flagcdn.com/16x12/us.png" class="w-4 h-3 object-cover rounded-sm" alt=""> English</button>
                        <button class="drop-opt lang-opt" data-lang="ar" data-flag="https://flagcdn.com/16x12/ma.png" data-name="العربية" data-code="AR"><img src="https://flagcdn.com/16x12/ma.png" class="w-4 h-3 object-cover rounded-sm" alt=""> العربية</button>
                        <button class="drop-opt lang-opt" data-lang="fr" data-flag="https://flagcdn.com/16x12/fr.png" data-name="Français" data-code="FR"><img src="https://flagcdn.com/16x12/fr.png" class="w-4 h-3 object-cover rounded-sm" alt=""> Français</button>
                        <button class="drop-opt lang-opt" data-lang="es" data-flag="https://flagcdn.com/16x12/es.png" data-name="Español" data-code="ES"><img src="https://flagcdn.com/16x12/es.png" class="w-4 h-3 object-cover rounded-sm" alt=""> Español</button>
                        <button class="drop-opt lang-opt" data-lang="pt" data-flag="https://flagcdn.com/16x12/pt.png" data-name="Português" data-code="PT"><img src="https://flagcdn.com/16x12/pt.png" class="w-4 h-3 object-cover rounded-sm" alt=""> Português</button>
                        <button class="drop-opt lang-opt" data-lang="sv" data-flag="https://flagcdn.com/16x12/se.png" data-name="Svenska" data-code="SV"><img src="https://flagcdn.com/16x12/se.png" class="w-4 h-3 object-cover rounded-sm" alt=""> Svenska</button>
                        <button class="drop-opt lang-opt" data-lang="no" data-flag="https://flagcdn.com/16x12/no.png" data-name="Norsk" data-code="NO"><img src="https://flagcdn.com/16x12/no.png" class="w-4 h-3 object-cover rounded-sm" alt=""> Norsk</button>
                        <button class="drop-opt lang-opt" data-lang="da" data-flag="https://flagcdn.com/16x12/dk.png" data-name="Dansk" data-code="DA"><img src="https://flagcdn.com/16x12/dk.png" class="w-4 h-3 object-cover rounded-sm" alt=""> Dansk</button>
                    </div>
                </div>

                <button id="btn-mobile-menu" class="md:hidden p-2 text-white hover:bg-white/10 rounded-lg transition-colors focus:outline-none">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                </button>
            </div>
        </div>

        <div id="mobile-nav-menu" class="hidden md:hidden bg-primary border-t border-white/10 absolute w-full left-0 top-16 shadow-2xl z-40">
            <div class="flex flex-col p-4 gap-2">
                <a href="/recaps" class="flex items-center gap-3 text-sm font-bold text-white bg-white/5 hover:bg-white/10 p-3 rounded-xl transition-colors">
                    <svg class="w-5 h-5 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path></svg>
                    <span class="font-heading uppercase tracking-wide">Recaps</span>
                </a>
                <a href="/standings" class="flex items-center gap-3 text-sm font-bold text-white bg-white/5 hover:bg-white/10 p-3 rounded-xl transition-colors">
                    <svg class="w-5 h-5 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                    <span class="font-heading uppercase tracking-wide">Standings</span>
                </a>
                <a href="/topscorers" class="flex items-center gap-3 text-sm font-bold text-white bg-white/5 hover:bg-white/10 p-3 rounded-xl transition-colors">
                    <svg class="w-5 h-5 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"></path></svg>
                    <span class="font-heading uppercase tracking-wide">Top Scorers</span>
                </a>
            </div>
        </div>
    </header>

    <main class="flex-grow max-w-4xl mx-auto w-full px-4 py-8">
        <article class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div class="relative w-full h-64 sm:h-72 bg-slate-900 flex items-center justify-center overflow-hidden">
               
                <img src="${stadiumImage}" onerror="this.onerror=null;this.src='${fallbackImage}';" class="absolute inset-0 w-full h-full object-cover opacity-60" alt="Stadium atmosphere for ${homeName} vs ${awayName} match">
               
                <div class="absolute inset-0 bg-black/40"></div>
                <div class="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent"></div>
               
                <div class="relative z-10 flex items-center gap-4 sm:gap-16 w-full px-2 sm:px-4 justify-center">
                    <div class="text-center w-[40%] sm:w-1/3 flex flex-col items-center">
                        <img src="${homeLogo}" class="w-20 h-20 sm:w-28 sm:h-28 object-contain drop-shadow-2xl mb-3" alt="${homeName} official logo">
                        <span class="font-bold text-xs sm:text-sm text-white drop-shadow-md leading-tight px-1">${homeName}</span>
                    </div>
                    <div class="text-center w-[20%] sm:w-1/3 flex flex-col items-center justify-center">
                        <div class="text-4xl sm:text-5xl font-black text-white drop-shadow-2xl mb-2 tracking-wider">${score}</div>
                        <span class="bg-slate-900/80 text-emerald-400 font-bold text-[10px] sm:text-xs uppercase tracking-widest px-3 py-1 rounded-full border border-emerald-500/50 backdrop-blur-sm whitespace-nowrap">Full Time</span>
                    </div>
                    <div class="text-center w-[40%] sm:w-1/3 flex flex-col items-center">
                        <img src="${awayLogo}" class="w-20 h-20 sm:w-28 sm:h-28 object-contain drop-shadow-2xl mb-3" alt="${awayName} official logo">
                        <span class="font-bold text-xs sm:text-sm text-white drop-shadow-md leading-tight px-1">${awayName}</span>
                    </div>
                </div>
            </div>

            <div class="p-6 sm:p-10">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-200 dark:border-slate-800 pb-4">
                    <div class="flex items-center gap-3">
                        <div class="bg-slate-100 dark:bg-slate-800 p-2.5 rounded-xl text-primary dark:text-emerald-400 shadow-inner">
                            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path></svg>
                        </div>
                        <h1 class="text-base sm:text-lg font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">Tactical Analysis</h1>
                    </div>
                    <div class="flex items-center gap-2 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700/50">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                        <span class="text-xs font-bold tracking-wide">${matchDateStr}</span>
                    </div>
                </div>
               
                <div class="ai-article-content">
                    ${articleHTML}
                </div>
            </div>
        </article>
    </main>

    <!-- الفوتر الكامل تم إضافته هنا -->
    <footer class="bg-primary text-white py-6 mt-auto">
        <div class="max-w-5xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-blue-100">
            <p>© <span id="current-year">2026</span> ScoreRecap. All rights reserved.</p>
            <div class="flex flex-wrap justify-center gap-4 font-bold">
                <a href="/game" class="hover:text-white transition-colors">Game Zone 🎮</a>
                <span class="hidden md:inline text-blue-300">|</span>
                <a href="/about" class="hover:text-white transition-colors">About Us</a>
                <a href="/contact" class="hover:text-white transition-colors">Contact Us</a>
                <a href="/privacy" class="hover:text-white transition-colors">Privacy Policy</a>
                <a href="/terms" class="hover:text-white transition-colors">Terms of Service</a>
            </div>
        </div>
    </footer>

    <script>
        document.addEventListener("DOMContentLoaded", () => {
            document.getElementById('btn-mobile-menu')?.addEventListener('click', (e) => {
                e.stopPropagation();
                document.getElementById('mobile-nav-menu')?.classList.toggle('hidden');
            });

            document.getElementById('btn-lang-dropdown')?.addEventListener('click', (e) => { 
                e.preventDefault(); 
                e.stopPropagation(); 
                document.getElementById('lang-options-menu')?.classList.toggle('show');
            });

            document.addEventListener('click', (e) => {
                if (!e.target.closest('.custom-dropdown')) {
                    document.getElementById('lang-options-menu')?.classList.remove('show');
                }
                if (!e.target.closest('#mobile-nav-menu') && !e.target.closest('#btn-mobile-menu')) {
                    document.getElementById('mobile-nav-menu')?.classList.add('hidden');
                }
            });

            document.querySelectorAll('.lang-opt').forEach(btn => {
                btn.addEventListener('click', () => {
                    localStorage.setItem('site_lang', btn.getAttribute('data-lang'));
                    window.location.href = '/';
                });
            });

            const htmlTag = document.documentElement;
            const sunIcon = document.getElementById('theme-icon-sun');
            const moonIcon = document.getElementById('theme-icon-moon');

            function applyTheme(isDark) {
                if(isDark) {
                    htmlTag.classList.add('dark');
                    sunIcon?.classList.remove('hidden');
                    moonIcon?.classList.add('hidden');
                } else {
                    htmlTag.classList.remove('dark');
                    sunIcon?.classList.add('hidden');
                    moonIcon?.classList.remove('hidden');
                }
            }

            const savedTheme = localStorage.getItem('app_theme');
            if (savedTheme === 'dark' || (!savedTheme && htmlTag.classList.contains('dark'))) {
                applyTheme(true);
            } else {
                applyTheme(false);
            }

            document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
                const isDark = !htmlTag.classList.contains('dark');
                localStorage.setItem('app_theme', isDark ? 'dark' : 'light');
                applyTheme(isDark);
            });

            const savedLang = localStorage.getItem('site_lang') || 'en';
            const langBtn = document.querySelector('.lang-opt[data-lang="' + savedLang + '"]');
            if(langBtn) {
                const flagEl = document.getElementById('current-lang-flag');
                const textEl = document.getElementById('current-lang-text');
                const codeEl = document.getElementById('current-lang-code');
                if(flagEl) flagEl.src = langBtn.getAttribute('data-flag');
                if(textEl) textEl.innerText = langBtn.getAttribute('data-name');
                if(codeEl) codeEl.innerText = langBtn.getAttribute('data-code');
                if(savedLang === 'ar') htmlTag.dir = 'rtl';
            }
        });
    </script>
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
