// topscorers.js - ملف مستقل لجدول الهدافين

document.addEventListener("DOMContentLoaded", () => {
    // 1. إضافة زر "الهدافين" في القائمة العلوية بجانب زر الترتيب
    const navStandingsBtn = document.querySelector('a[href="/standings"]');
    if (navStandingsBtn) {
        const topScorersBtn = document.createElement('a');
        topScorersBtn.href = "/topscorers";
        topScorersBtn.className = "static-link flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-emerald-500 dark:text-slate-400 dark:hover:text-emerald-400 transition-colors mr-1 sm:mr-2";
        topScorersBtn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"></path></svg>
            <span class="hidden sm:inline">Top Scorers</span>
        `;
        navStandingsBtn.parentNode.insertBefore(topScorersBtn, navStandingsBtn.nextSibling);
    }

    // 2. إنشاء قسم الهدافين
    const mainContainer = document.querySelector('main');
    if (mainContainer) {
        const scorersSection = document.createElement('section');
        scorersSection.id = "page-topscorers";
        scorersSection.className = "hidden space-y-6 lg:col-span-2 w-full";
        scorersSection.dir = "ltr";
        scorersSection.innerHTML = `
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm">
                <h1 class="text-2xl font-black text-emerald-500 mb-2 uppercase tracking-wide flex items-center gap-2">
                    🔥 Premier League Top Scorers
                </h1>
                <!-- نص SEO قصير ومفيد لأدسنس -->
                <p class="text-sm text-slate-500 dark:text-slate-400 mb-6 font-medium">
                    Discover the current top scorers of the Premier League. Track your favorite players' goals and overall performance in the race for the Golden Boot.
                </p>
                <div id="topscorers-list-container" class="w-full max-w-3xl mx-auto"></div>
            </div>
        `;
        const gameSection = document.getElementById('page-game');
        if (gameSection) {
            mainContainer.insertBefore(scorersSection, gameSection);
        } else {
            mainContainer.appendChild(scorersSection);
        }
    }

    // 3. نظام التوجيه (Router)
    const previousHandleRoute = window.handleRoute;
    window.handleRoute = function() {
        const scorersPage = document.getElementById('page-topscorers');
        if (scorersPage) scorersPage.classList.add('hidden');
        
        if (previousHandleRoute) previousHandleRoute();

        if (window.location.pathname === '/topscorers') {
            document.getElementById('home-section').classList.add('hidden');
            document.title = "Top Scorers | ScoreRecap";
            if (scorersPage) scorersPage.classList.remove('hidden');
            fetchAndRenderTopScorers();
        }
    };
});

// 4. دالة جلب ورسم قائمة الهدافين
async function fetchAndRenderTopScorers() {
    const container = document.getElementById('topscorers-list-container');
    if (!container || container.innerHTML.includes('flex items-center')) return; // منع التحميل المكرر

    container.innerHTML = `<div class="flex justify-center py-20"><div class="spinner"></div></div>`;

    try {
        const res = await fetchWithTimeout(`${APP_CONFIG.workerUrl}/topscorers?league=39`, { headers: { "x-action": "topscorers" }, timeout: 10000 });
        const data = await res.json();

        if (data.response && data.response.length > 0) {
            // أخذ أول 15 هداف فقط ليكون التصميم أنيقاً
            const topPlayers = data.response.slice(0, 15);
            
            let listHTML = `
            <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                <!-- Header -->
                <div class="flex items-center justify-between p-3 sm:p-4 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <div class="w-2/3 flex gap-4 sm:gap-8">
                        <span class="w-4 text-center">#</span>
                        <span>Player</span>
                    </div>
                    <div class="w-1/3 flex justify-end gap-4 sm:gap-10">
                        <span class="hidden sm:block">Team</span>
                        <span>Goals</span>
                    </div>
                </div>
                <!-- Players List -->
                <div class="divide-y divide-slate-100 dark:divide-slate-800/50">
            `;

            topPlayers.forEach((item, index) => {
                const player = item.player;
                const stats = item.statistics[0];
                
                // تلوين المركز الأول بالذهبي
                let rankClass = "text-slate-400";
                if (index === 0) rankClass = "text-amber-500 text-lg";
                else if (index === 1) rankClass = "text-slate-300 text-base";
                else if (index === 2) rankClass = "text-amber-700 text-base";

                listHTML += `
                    <div class="flex items-center justify-between p-3 sm:p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                        
                        <!-- Player Info -->
                        <div class="flex items-center gap-3 sm:gap-5 w-2/3">
                            <span class="font-black w-4 text-center ${rankClass}">${index + 1}</span>
                            <img src="${player.photo}" class="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-slate-100 dark:border-slate-700 shadow-sm group-hover:border-emerald-500 transition-colors bg-slate-100 dark:bg-slate-800" alt="${player.name}">
                            <div class="flex flex-col">
                                <span class="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 truncate max-w-[120px] sm:max-w-[200px]">${player.name}</span>
                                <span class="text-[10px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">${stats.games.position}</span>
                            </div>
                        </div>

                        <!-- Team & Goals -->
                        <div class="flex items-center justify-end gap-4 sm:gap-8 w-1/3">
                            <div class="hidden sm:flex items-center gap-2" title="${stats.team.name}">
                                <img src="${stats.team.logo}" class="w-6 h-6 object-contain">
                                <span class="text-xs font-bold text-slate-600 dark:text-slate-300 truncate w-16">${stats.team.name}</span>
                            </div>
                            <div class="sm:hidden flex items-center" title="${stats.team.name}">
                                <img src="${stats.team.logo}" class="w-6 h-6 object-contain">
                            </div>
                            <span class="text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400 w-8 text-right">${stats.goals.total}</span>
                        </div>

                    </div>
                `;
            });

            listHTML += `</div></div>`;
            container.innerHTML = listHTML;
        } else {
            container.innerHTML = `<div class="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-10 text-center border border-slate-200 dark:border-slate-800"><p class="text-slate-500 font-bold">Top scorers data is not available at the moment.</p></div>`;
        }
    } catch (error) {
        container.innerHTML = `<div class="bg-red-50 dark:bg-red-900/20 rounded-2xl p-10 text-center border border-red-200 dark:border-red-800"><p class="text-red-500 font-bold">Error loading top scorers.</p></div>`;
    }
}
