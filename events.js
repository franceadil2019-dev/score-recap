// events.js - ملف مستقل لإدارة ورسم أحداث المباراة بشكل احترافي (Timeline)

async function fetchMatchEvents(fixtureId, container) {
    if(!container) return;
   
    let matchStatus = '';
    let homeTeamId = null;

    // جلب معلومات المباراة لمعرفة من هو الفريق المضيف (Home) لتنسيق اليمين واليسار
    const matchObj = allMatchesCached.find(m => String(m.fixture.id) === String(fixtureId));
    if (matchObj) {
        matchStatus = matchObj.fixture.status.short;
        homeTeamId = matchObj.teams.home.id;
        const matchDate = new Date(matchObj.fixture.date);
        if (['NS', 'TBD', 'PST'].includes(matchStatus) || matchDate > new Date()) {
            container.innerHTML = `<p class="text-center text-xs text-slate-500 py-4 font-medium italic">${(translations[currentLang] || translations['en']).noEvents}</p>`;
            return;
        }
    }

    const cachedEvents = getFromCache(`events_${fixtureId}`);
    if (cachedEvents && cachedEvents.length > 0) { 
        renderEvents(cachedEvents, container, homeTeamId); 
        return; 
    }
    
    container.innerHTML = `<div class="flex justify-center py-6"><div class="mini-spinner"></div></div>`;
    
    try {
        const res = await fetchWithTimeout(`${APP_CONFIG.workerUrl}/events?fixture=${fixtureId}&status=${matchStatus}`, { headers: { "x-action": "fetch-events" }, timeout: 8000 });
        const data = await res.json();
        if (data.response && data.response.length > 0) {
            saveToCache(`events_${fixtureId}`, data.response);
        }
        renderEvents(data.response || [], container, homeTeamId);
    } catch (err) { 
        container.innerHTML = `<p class="text-center text-red-500 text-xs py-4 font-bold">Error fetching events</p>`; 
    }
}

function renderEvents(events, container, homeTeamId) {
    if (!events || events.length === 0) { 
        container.innerHTML = `<p class="text-center text-xs text-slate-500 py-4 font-medium italic">${(translations[currentLang] || translations['en']).noEvents}</p>`; 
        return; 
    }

    let html = `<div class="flex flex-col w-full text-xs sm:text-sm mt-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1 relative">`;
    
    // خط طولي وهمي في المنتصف
    html += `<div class="absolute left-1/2 top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-700/50 -translate-x-1/2 z-0"></div>`;

    events.forEach(ev => {
        const isHome = ev.team.id === homeTeamId;
        const timeStr = ev.time.extra ? `${ev.time.elapsed}+${ev.time.extra}'` : `${ev.time.elapsed}'`;
        
        let iconHtml = '';
        let detailsHtml = '';

        // تحديد الأيقونات والتفاصيل بناءً على نوع الحدث
        if (ev.type === 'Goal') {
            iconHtml = `<span class="text-base drop-shadow-sm">⚽</span>`;
            detailsHtml = `<span class="font-bold text-slate-800 dark:text-slate-100">${ev.player.name}</span>`;
            if (ev.assist.name) detailsHtml += `<br><span class="text-[10px] text-slate-500 dark:text-slate-400">Assist: ${ev.assist.name}</span>`;
        } 
        else if (ev.type === 'Card') {
            const isRed = ev.detail && ev.detail.includes('Red');
            const cardColor = isRed ? 'bg-red-500' : 'bg-yellow-400';
            iconHtml = `<div class="w-3 h-4 rounded-sm shadow-sm ${cardColor} border border-black/10"></div>`;
            detailsHtml = `<span class="font-bold text-slate-800 dark:text-slate-100">${ev.player.name}</span>`;
        } 
        else if (ev.type === 'subst') {
            iconHtml = `<div class="flex flex-col items-center justify-center leading-none"><span class="text-emerald-500 text-[10px] font-black">▲</span><span class="text-red-500 text-[10px] font-black -mt-1">▼</span></div>`;
            detailsHtml = `<span class="font-bold text-slate-800 dark:text-slate-100">${ev.player.name}</span><br><span class="text-[10px] text-slate-500 dark:text-slate-400">${ev.assist.name}</span>`;
        }
        else if (ev.type === 'Var') {
            iconHtml = `<span class="text-xs font-black bg-slate-800 text-white px-1 rounded">VAR</span>`;
            detailsHtml = `<span class="font-bold text-slate-800 dark:text-slate-100">${ev.detail}</span>`;
        }

        // رسم الحدث (يمين أو يسار بناءً على الفريق)
        if (isHome) {
            html += `
            <div class="flex items-center w-full py-2.5 z-10 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors rounded-lg px-1">
                <div class="w-[45%] text-right pr-3 flex flex-col justify-center">
                    ${detailsHtml}
                </div>
                <div class="w-[10%] flex justify-center items-center relative">
                    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full w-7 h-7 flex items-center justify-center text-[10px] font-black text-primary shadow-sm z-10">
                        ${timeStr}
                    </div>
                </div>
                <div class="w-[45%] pl-3 flex items-center justify-start">
                    ${iconHtml}
                </div>
            </div>`;
        } else {
            html += `
            <div class="flex items-center w-full py-2.5 z-10 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors rounded-lg px-1">
                <div class="w-[45%] pr-3 flex items-center justify-end">
                    ${iconHtml}
                </div>
                <div class="w-[10%] flex justify-center items-center relative">
                    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full w-7 h-7 flex items-center justify-center text-[10px] font-black text-primary shadow-sm z-10">
                        ${timeStr}
                    </div>
                </div>
                <div class="w-[45%] text-left pl-3 flex flex-col justify-center">
                    ${detailsHtml}
                </div>
            </div>`;
        }
    });

    html += `</div>`;
    container.innerHTML = html;
}
