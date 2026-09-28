// topscorers.js - ملف جلب ورسم بيانات الهدافين فقط

// دالة ذكية لتحويل اسم البلد إلى كود العلم
function getCountryCode(countryName) {
    const map = {
        "England": "gb-eng", "Norway": "no", "Brazil": "br", "France": "fr", "Egypt": "eg",
        "Portugal": "pt", "Spain": "es", "Netherlands": "nl", "Argentina": "ar", "Germany": "de",
        "Belgium": "be", "Italy": "it", "Sweden": "se", "Senegal": "sn", "South Korea": "kr",
        "Uruguay": "uy", "Colombia": "co", "Ivory Coast": "ci", "Ghana": "gh", "Algeria": "dz",
        "Morocco": "ma", "Jamaica": "jm", "Japan": "jp", "Denmark": "dk", "Switzerland": "ch",
        "Serbia": "rs", "Croatia": "hr", "Nigeria": "ng", "Mali": "ml", "Cameroon": "cm",
        "USA": "us", "Wales": "gb-wls", "Scotland": "gb-sct", "Northern Ireland": "gb-nir", "Ireland": "ie",
        "Ecuador": "ec", "Paraguay": "py", "Chile": "cl", "Mexico": "mx", "Canada": "ca",
        "Australia": "au", "New Zealand": "nz", "South Africa": "za", "DR Congo": "cd", "Guinea": "gn"
    };
    return map[countryName] || null;
}

async function fetchAndRenderTopScorers() {
    const container = document.getElementById('topscorers-list-container');
    if (!container || container.innerHTML.includes('flex items-center')) return; 

    container.innerHTML = `<div class="flex justify-center py-20"><div class="spinner"></div></div>`;

    try {
        const res = await fetchWithTimeout(`${APP_CONFIG.workerUrl}/topscorers?league=39`, { headers: { "x-action": "topscorers" }, timeout: 10000 });
        const data = await res.json();

        if (data.response && data.response.length > 0) {
            // استخراج سنة الموسم وعرضها
            const seasonYear = data.response[0].statistics[0].league.season;
            const badge = document.getElementById('topscorers-season-badge');
            if(badge) {
                badge.innerText = `Season ${seasonYear}`;
                badge.classList.remove('hidden');
            }

            const topPlayers = data.response.slice(0, 15);
            
            let listHTML = `
            <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                <!-- Header -->
                <div class="flex items-center p-3 sm:p-4 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <div class="w-1/2 sm:w-2/5 flex gap-4 sm:gap-8">
                        <span class="w-4 text-center">#</span>
                        <span>Player</span>
                    </div>
                    <div class="hidden sm:block w-1/5 text-center">Team</div>
                    <div class="w-1/4 sm:w-1/5 text-center">NAT</div>
                    <div class="w-1/4 sm:w-1/5 text-right pr-2">Goals</div>
                </div>
                <!-- Players List -->
                <div class="divide-y divide-slate-100 dark:divide-slate-800/50">
            `;

            topPlayers.forEach((item, index) => {
                const player = item.player;
                const stats = item.statistics[0];
                
                let rankClass = "text-slate-400";
                if (index === 0) rankClass = "text-amber-500 text-lg";
                else if (index === 1) rankClass = "text-slate-300 text-base";
                else if (index === 2) rankClass = "text-amber-700 text-base";

                // تجهيز بيانات الجنسية
                const countryCode = getCountryCode(player.nationality);
                const natText = player.nationality ? player.nationality.substring(0, 3).toUpperCase() : "N/A";

                listHTML += `
                    <div class="flex items-center p-3 sm:p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                        
                        <!-- Player Info -->
                        <div class="flex items-center gap-3 sm:gap-5 w-1/2 sm:w-2/5">
                            <span class="font-black w-4 text-center ${rankClass}">${index + 1}</span>
                            <img src="${player.photo}" class="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover border-2 border-slate-100 dark:border-slate-700 shadow-sm group-hover:border-emerald-500 transition-colors bg-slate-100 dark:bg-slate-800" alt="${player.name}">
                            <div class="flex flex-col">
                                <span class="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 truncate max-w-[100px] sm:max-w-[180px]">${player.name}</span>
                                <span class="text-[10px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">${stats.games.position}</span>
                            </div>
                        </div>

                        <!-- Team -->
                        <div class="hidden sm:flex items-center justify-center gap-2 w-1/5" title="${stats.team.name}">
                            <img src="${stats.team.logo}" class="w-6 h-6 object-contain">
                            <span class="text-xs font-bold text-slate-600 dark:text-slate-300 truncate max-w-[80px]">${stats.team.name}</span>
                        </div>

                        <!-- Nationality -->
                        <div class="flex items-center justify-center gap-1.5 sm:gap-2 w-1/4 sm:w-1/5">
                            ${countryCode ? `<img src="https://flagcdn.com/20x15/${countryCode}.png" class="w-4 h-3 sm:w-5 sm:h-4 object-cover rounded-sm shadow-sm" alt="${player.nationality}">` : ''}
                            <span class="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400">${natText}</span>
                        </div>

                        <!-- Goals -->
                        <div class="flex items-center justify-end w-1/4 sm:w-1/5">
                            <div class="sm:hidden flex items-center mr-2" title="${stats.team.name}">
                                <img src="${stats.team.logo}" class="w-5 h-5 object-contain">
                            </div>
                            <span class="text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400 w-8 text-right pr-2">${stats.goals.total}</span>
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
