// standings.js - ملف جلب ورسم بيانات الترتيب مع الأسئلة الشائعة

function renderFormBoxes(formString) {
    if (!formString) return '<span class="text-slate-400">-</span>';
    return formString.split('').map(char => {
        if (char === 'W') return `<span class="inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 rounded bg-emerald-500 text-white text-[9px] sm:text-[10px] font-bold mx-[1px] shadow-sm flex-shrink-0">W</span>`;
        if (char === 'D') return `<span class="inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 rounded bg-slate-400 text-white text-[9px] sm:text-[10px] font-bold mx-[1px] shadow-sm flex-shrink-0">D</span>`;
        if (char === 'L') return `<span class="inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 rounded bg-red-500 text-white text-[9px] sm:text-[10px] font-bold mx-[1px] shadow-sm flex-shrink-0">L</span>`;
        return '';
    }).join('');
}

function generateFAQSection() {
    const faqs = [
        { q: "What happens if teams finish with the same points?", a: "At ScoreRecap, we get this question a lot! If two or more clubs finish level on points, the Premier League uses Goal Difference (GD) to separate them. If they are still tied, the total Goals Scored becomes the deciding factor." },
        { q: "How many Premier League teams qualify for Europe?", a: "Traditionally, the top four teams in the standings secure a spot in the prestigious UEFA Champions League group stages. The team finishing fifth usually earns a place in the UEFA Europa League." },
        { q: "How does relegation work in the Premier League?", a: "It's the harshest part of the season. The bottom three teams (positions 18, 19, and 20) at the end of the 38-game campaign are automatically relegated to the Championship, making way for three newly promoted clubs." },
        { q: "What do the abbreviations like MP, W, D, L, and GD mean?", a: "We keep it simple: <strong>MP</strong> stands for Matches Played. <strong>W</strong>, <strong>D</strong>, and <strong>L</strong> represent Wins, Draws, and Losses. <strong>GD</strong> is Goal Difference (goals scored minus goals conceded), and <strong>Pts</strong> stands for total Points." },
        { q: "What does the 'Form' column indicate?", a: "The 'Form' column shows a team's recent momentum over their last five matches. A green 'W' means a win, a grey 'D' is a draw, and a red 'L' indicates a loss. It’s a great way to spot winning streaks!" },
        { q: "How many matches are played in a full season?", a: "A complete Premier League season consists of 38 matches for each club. Since there are 20 teams, every club plays each other twice—once at their home stadium and once away." }
    ];

    let faqHTML = `<div class="mt-8 bg-slate-50 dark:bg-slate-800/40 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700/50 p-6 sm:p-8">
        <h2 class="text-xl font-black text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
            <span class="text-emerald-500"> </span> Frequently Asked Questions❓
        </h2>
        <div class="space-y-4">`;

    let schemaData = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": []
    };

    faqs.forEach(faq => {
        faqHTML += `
            <details class="group border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 [&_summary::-webkit-details-marker]:hidden">
                <summary class="flex cursor-pointer items-center justify-between gap-1.5 p-4 text-slate-900 dark:text-slate-100 font-bold">
                    <h3 class="text-sm sm:text-base">${faq.q}</h3>
                    <span class="shrink-0 rounded-full bg-slate-50 dark:bg-slate-800 p-1.5 text-slate-900 dark:text-white sm:p-3 group-open:-rotate-180 transition-transform duration-300 shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0 transition duration-300 group-open:-rotate-45" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
                    </span>
                </summary>
                <div class="px-4 pb-4 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    <p>${faq.a}</p>
                </div>
            </details>
        `;
       
        schemaData.mainEntity.push({
            "@type": "Question",
            "name": faq.q,
            "acceptedAnswer": { "@type": "Answer", "text": faq.a.replace(/<[^>]*>?/gm, '') }
        });
    });

    faqHTML += `</div></div>`;
    faqHTML += `<script type="application/ld+json">${JSON.stringify(schemaData)}<\/script>`;
   
    return faqHTML;
}

// دالة مساعدة لرسم واجهة الخطأ مع زر إعادة التحميل
function renderErrorState(container) {
    container.innerHTML = `
        <div class="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-8 sm:p-12 text-center border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center gap-4 shadow-sm transition-colors">
            <div class="bg-slate-200 dark:bg-slate-700 p-4 rounded-full text-slate-500 dark:text-slate-400 mb-2">
                <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <h3 class="text-lg sm:text-xl font-black text-slate-800 dark:text-white tracking-wide">Data Not Available</h3>
            <p class="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">We couldn't load the standings at this moment. This might be due to a temporary network issue. Please try again.</p>
            <button onclick="fetchAndRenderStandings()" class="mt-4 flex items-center gap-2 bg-primary hover:bg-primaryHover text-white px-6 py-3 rounded-xl font-bold transition-all active:scale-95 shadow-md uppercase tracking-wider text-sm">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                Reload Data
            </button>
        </div>
    `;
}

async function fetchAndRenderStandings() {
    const container = document.getElementById('standings-table-container');
    if (!container) return;

    container.innerHTML = `<div class="flex justify-center py-20"><div class="spinner"></div></div>`;

    try {
        const res = await fetchWithTimeout(`${APP_CONFIG.workerUrl}/standings?league=39`, { headers: { "x-action": "standings" }, timeout: 10000 });
        const data = await res.json();

        if (data.response && data.response.length > 0) {
            const leagueInfo = data.response[0].league;
            const standings = leagueInfo.standings[0];
            
            const mainTitle = document.querySelector('#page-standings h1');
            if(mainTitle) {
                mainTitle.classList.add('dark:text-white');
            }
           
            let tableHTML = `
            <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden w-full">
                <!-- Header -->
                <div class="bg-gradient-to-r from-cyan-500 to-blue-600 p-4 sm:p-5 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="bg-white p-1.5 rounded-full shadow-md flex-shrink-0">
                            <img src="${leagueInfo.logo}" class="w-8 h-8 sm:w-10 sm:h-10 object-contain" alt="League Logo">
                        </div>
                        <h2 class="text-white font-black text-lg sm:text-xl tracking-wide truncate">${leagueInfo.name}</h2>
                    </div>
                    <div class="text-cyan-100 font-bold text-[10px] sm:text-sm bg-black/20 px-2 sm:px-3 py-1 rounded-full backdrop-blur-sm whitespace-nowrap flex-shrink-0">
                        Season ${leagueInfo.season}
                    </div>
                </div>

                <!-- Table Container -->
                <div class="w-full overflow-x-auto custom-scrollbar">
                    <table class="w-full text-sm text-left min-w-[600px]">
                        <thead class="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800">
                            <tr>
                                <th class="px-3 py-3 text-center w-10">Pos</th>
                                <th class="px-3 py-3">Club</th>
                                <th class="px-2 py-3 text-center" title="Played">PL</th>
                                <th class="px-2 py-3 text-center" title="Won">W</th>
                                <th class="px-2 py-3 text-center" title="Drawn">D</th>
                                <th class="px-2 py-3 text-center" title="Lost">L</th>
                                <th class="px-3 py-3 text-center" title="Form">Form</th>
                                <th class="px-3 py-3 text-center font-black text-slate-800 dark:text-slate-200">PTS</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 dark:divide-slate-800/50">
            `;

            standings.forEach(team => {
                let rankBg = "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
                if (team.rank <= 4) rankBg = "bg-emerald-500 text-white shadow-md shadow-emerald-500/30";
                else if (team.rank === 5) rankBg = "bg-blue-500 text-white shadow-md shadow-blue-500/30";
                else if (team.rank >= 18) rankBg = "bg-red-500 text-white shadow-md shadow-red-500/30";

                const teamName = typeof getTeamName === 'function' ? getTeamName(team.team.name, currentLang) : team.team.name;

                tableHTML += `
                    <tr class="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                        <td class="px-3 py-2.5 text-center">
                            <div class="w-6 h-6 sm:w-7 sm:h-7 mx-auto rounded flex items-center justify-center text-[11px] sm:text-xs font-black ${rankBg}">
                                ${team.rank}
                            </div>
                        </td>
                        <td class="px-3 py-2.5 font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3 whitespace-nowrap">
                            <img src="${team.team.logo}" class="w-6 h-6 sm:w-7 sm:h-7 object-contain drop-shadow-sm group-hover:scale-110 transition-transform flex-shrink-0">
                            <span class="truncate max-w-[150px] sm:max-w-xs">${teamName}</span>
                        </td>
                        <td class="px-2 py-2.5 text-center font-medium text-slate-600 dark:text-slate-300">${team.all.played}</td>
                        <td class="px-2 py-2.5 text-center font-medium text-slate-600 dark:text-slate-300">${team.all.win}</td>
                        <td class="px-2 py-2.5 text-center font-medium text-slate-600 dark:text-slate-300">${team.all.draw}</td>
                        <td class="px-2 py-2.5 text-center font-medium text-slate-600 dark:text-slate-300">${team.all.lose}</td>
                        <td class="px-3 py-2.5 text-center">
                            <div class="flex items-center justify-center flex-nowrap">
                                ${renderFormBoxes(team.form)}
                            </div>
                        </td>
                        <td class="px-3 py-2.5 text-center font-black text-sm sm:text-base text-primary dark:text-white">
                            ${team.points}
                        </td>
                    </tr>
                `;
            });

            tableHTML += `
                        </tbody>
                    </table>
                </div>
               
                <!-- Legend -->
                <div class="bg-slate-50 dark:bg-slate-950/50 p-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400">
                    <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-emerald-500 flex-shrink-0"></span> Champions League</div>
                    <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-blue-500 flex-shrink-0"></span> Europa League</div>
                    <div class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-red-500 flex-shrink-0"></span> Relegation</div>
                </div>
            </div>`;
           
            tableHTML += generateFAQSection();
            container.innerHTML = tableHTML;
        } else {
            // استدعاء واجهة الخطأ مع زر إعادة التحميل
            renderErrorState(container);
        }
    } catch (error) {
        // استدعاء واجهة الخطأ مع زر إعادة التحميل
        renderErrorState(container);
    }
}
