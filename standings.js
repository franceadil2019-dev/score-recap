// standings.js - ملف مستقل لجدول الترتيب الاحترافي

document.addEventListener("DOMContentLoaded", () => {
    // 1. إضافة زر "الترتيب" في القائمة العلوية
    const navReportsBtn = document.querySelector('a[href="/recaps"]');
    if (navReportsBtn) {
        const standingsBtn = document.createElement('a');
        standingsBtn.href = "/standings";
        standingsBtn.className = "static-link flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-emerald-500 dark:text-slate-400 dark:hover:text-emerald-400 transition-colors mr-1 sm:mr-2";
        standingsBtn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
            <span class="hidden sm:inline">Standings</span>
        `;
        navReportsBtn.parentNode.insertBefore(standingsBtn, navReportsBtn.nextSibling);
    }

    // 2. إنشاء قسم الجدول
    const mainContainer = document.querySelector('main');
    if (mainContainer) {
        const standingsSection = document.createElement('section');
        standingsSection.id = "page-standings";
        standingsSection.className = "hidden space-y-6 lg:col-span-2";
        standingsSection.dir = "ltr";
        standingsSection.innerHTML = `
            <div id="standings-table-container" class="w-full max-w-4xl mx-auto"></div>
        `;
        const gameSection = document.getElementById('page-game');
        if (gameSection) {
            mainContainer.insertBefore(standingsSection, gameSection);
        } else {
            mainContainer.appendChild(standingsSection);
        }
    }

    // 3. نظام التوجيه
    const originalHandleRoute = window.handleRoute;
    window.handleRoute = function() {
        const standingsPage = document.getElementById('page-standings');
        if (standingsPage) standingsPage.classList.add('hidden');
        
        if (originalHandleRoute) originalHandleRoute();

        if (window.location.pathname === '/standings') {
            document.getElementById('home-section').classList.add('hidden');
            document.title = "Premier League Standings | ScoreRecap";
            if (standingsPage) standingsPage.classList.remove('hidden');
            fetchAndRenderStandings();
        }
    };
});

// دالة مساعدة لرسم مربعات حالة الفريق (Form)
function renderFormBoxes(formString) {
    if (!formString) return '<span class="text-slate-400">-</span>';
    return formString.split('').map(char => {
        if (char === 'W') return `<span class="inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 rounded bg-emerald-500 text-white text-[9px] sm:text-[10px] font-bold mx-[1px] shadow-sm">W</span>`;
        if (char === 'D') return `<span class="inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 rounded bg-slate-400 text-white text-[9px] sm:text-[10px] font-bold mx-[1px] shadow-sm">D</span>`;
        if (char === 'L') return `<span class="inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 rounded bg-red-500 text-white text-[9px] sm:text-[10px] font-bold mx-[1px] shadow-sm">L</span>`;
        return '';
    }).join('');
}

// 4. دالة جلب ورسم الجدول الاحترافي
async function fetchAndRenderStandings() {
    const container = document.getElementById('standings-table-container');
    if (!container || container.innerHTML.includes('<table')) return;

    container.innerHTML = `<div class="flex justify-center py-20"><div class="spinner"></div></div>`;

    try {
        const res = await fetchWithTimeout(`${APP_CONFIG.workerUrl}/standings?league=39`, { headers: { "x-action": "standings" }, timeout: 10000 });
        const data = await res.json();

        if (data.response && data.response.length > 0) {
            const leagueInfo = data.response[0].league;
            const standings = leagueInfo.standings[0];
            
            let tableHTML = `
            <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                
                <!-- Header -->
                <div class="bg-gradient-to-r from-cyan-500 to-blue-600 p-4 sm:p-5 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="bg-white p-1.5 rounded-full shadow-md">
                            <img src="${leagueInfo.logo}" class="w-8 h-8 sm:w-10 sm:h-10 object-contain" alt="League Logo">
                        </div>
                        <h1 class="text-white font-black text-lg sm:text-xl tracking-wide">${leagueInfo.name}</h1>
                    </div>
                    <div class="text-cyan-100 font-bold text-xs sm:text-sm bg-black/20 px-3 py-1 rounded-full backdrop-blur-sm">
                        Season ${leagueInfo.season}
                    </div>
                </div>

                <!-- Table -->
                <div class="overflow-x-auto">
                    <table class="w-full text-sm text-left whitespace-nowrap">
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
                // تحديد لون مربع المركز
                let rankBg = "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
                if (team.rank <= 4) rankBg = "bg-emerald-500 text-white shadow-md shadow-emerald-500/30"; // أبطال أوروبا
                else if (team.rank === 5) rankBg = "bg-blue-500 text-white shadow-md shadow-blue-500/30"; // الدوري الأوروبي
                else if (team.rank >= 18) rankBg = "bg-red-500 text-white shadow-md shadow-red-500/30"; // الهبوط

                const teamName = typeof getTeamName === 'function' ? getTeamName(team.team.name, currentLang) : team.team.name;

                tableHTML += `
                    <tr class="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                        <td class="px-3 py-2.5 text-center">
                            <div class="w-6 h-6 sm:w-7 sm:h-7 mx-auto rounded flex items-center justify-center text-[11px] sm:text-xs font-black ${rankBg}">
                                ${team.rank}
                            </div>
                        </td>
                        <td class="px-3 py-2.5 font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
                            <img src="${team.team.logo}" class="w-6 h-6 sm:w-7 sm:h-7 object-contain drop-shadow-sm group-hover:scale-110 transition-transform">
                            <span class="truncate max-w-[120px] sm:max-w-xs">${teamName}</span>
                        </td>
                        <td class="px-2 py-2.5 text-center font-medium text-slate-600 dark:text-slate-300">${team.all.played}</td>
                        <td class="px-2 py-2.5 text-center font-medium text-slate-600 dark:text-slate-300">${team.all.win}</td>
                        <td class="px-2 py-2.5 text-center font-medium text-slate-600 dark:text-slate-300">${team.all.draw}</td>
                        <td class="px-2 py-2.5 text-center font-medium text-slate-600 dark:text-slate-300">${team.all.lose}</td>
                        <td class="px-3 py-2.5 text-center">
                            <div class="flex items-center justify-center">
                                ${renderFormBoxes(team.form)}
                            </div>
                        </td>
                        <td class="px-3 py-2.5 text-center font-black text-sm sm:text-base text-slate-800 dark:text-white">
                            ${team.points}
                        </td>
                    </tr>
                `;
            });

            tableHTML += `
                        </tbody>
                    </table>
                </div>
                
                <!-- Legend (مفتاح الألوان) -->
                <div class="bg-slate-50 dark:bg-slate-950/50 p-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400">
                    <div class="flex items-center gap-1.5">
                        <span class="w-3 h-3 rounded bg-emerald-500"></span> Champions League
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="w-3 h-3 rounded bg-blue-500"></span> Europa League
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="w-3 h-3 rounded bg-red-500"></span> Relegation
                    </div>
                </div>

            </div>`;
            
            container.innerHTML = tableHTML;
        } else {
            container.innerHTML = `<div class="bg-white dark:bg-slate-900 rounded-2xl p-10 text-center border border-slate-200 dark:border-slate-800"><p class="text-slate-500 font-bold">Standings not available at the moment.</p></div>`;
        }
    } catch (error) {
        container.innerHTML = `<div class="bg-white dark:bg-slate-900 rounded-2xl p-10 text-center border border-slate-200 dark:border-slate-800"><p class="text-red-500 font-bold">Error loading standings.</p></div>`;
    }
}
