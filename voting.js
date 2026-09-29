// voting.js - إضافة شريط التصويت التفاعلي (Win Probability & Fan Vote)

document.addEventListener("DOMContentLoaded", () => {
    // نستخدم MutationObserver لمراقبة متى يتم رسم المباريات في الصفحة
    const targetNode = document.getElementById('api-scores-container');
    if (!targetNode) return;

    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                injectVotingWidget();
            }
        }
    });

    observer.observe(targetNode, { childList: true, subtree: true });
});

async function injectVotingWidget() {
    // البحث عن كل القوائم المنسدلة القديمة للتصويت
    const oldVoteContainers = document.querySelectorAll('.vote-select');
    
    oldVoteContainers.forEach(async (selectElement) => {
        const fixtureId = selectElement.getAttribute('data-fixture-id');
        // الحاوية الأب التي تضم أسماء الفرق والقائمة المنسدلة
        const parentDiv = selectElement.closest('.flex.flex-col.sm\\:flex-row'); 
        
        if (!parentDiv || parentDiv.hasAttribute('data-voting-injected')) return;
        parentDiv.setAttribute('data-voting-injected', 'true'); // لمنع التكرار

        // استخراج أسماء الفرق وشعاراتها من الـ HTML الحالي
        const homeTeamEl = parentDiv.querySelector('.order-2.sm\\:order-1 span');
        const awayTeamEl = parentDiv.querySelector('.order-3 span');
        const homeLogoEl = parentDiv.querySelector('.order-2.sm\\:order-1 img');
        const awayLogoEl = parentDiv.querySelector('.order-3 img');

        const homeName = homeTeamEl ? homeTeamEl.innerText : 'Home';
        const awayName = awayTeamEl ? awayTeamEl.innerText : 'Away';
        const homeLogo = homeLogoEl ? homeLogoEl.src : '';
        const awayLogo = awayLogoEl ? awayLogoEl.src : '';

        // التحقق مما إذا كان الزائر قد صوت مسبقاً في هذا المتصفح
        const savedVote = localStorage.getItem(`vote_${fixtureId}`);

        // جلب إحصائيات التصويت العالمية من السيرفر
        let votes = { home: 0, draw: 0, away: 0 };
        try {
            const res = await fetch(`${APP_CONFIG.workerUrl}/vote?fixtureId=${fixtureId}`, { headers: { "x-action": "get-votes" } });
            if (res.ok) {
                const data = await res.json();
                if (data.votes) votes = data.votes;
            }
        } catch (e) {}

        // حساب النسب المئوية
        const totalVotes = votes.home + votes.draw + votes.away || 1; // تجنب القسمة على صفر
        const homePct = Math.round((votes.home / totalVotes) * 100);
        const drawPct = Math.round((votes.draw / totalVotes) * 100);
        const awayPct = Math.round((votes.away / totalVotes) * 100);

        // بناء واجهة الشريط التفاعلي
        let widgetHTML = `
            <div class="w-full flex flex-col gap-3 py-2" onclick="event.stopPropagation()">
                <div class="flex justify-between items-center text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
                    <span>Fan Prediction</span>
                    <span>${totalVotes === 1 && votes.home === 0 ? 0 : totalVotes} Votes</span>
                </div>
                
                <!-- شريط التقدم (Progress Bar) -->
                <div class="w-full h-2.5 flex rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 shadow-inner">
                    <div class="bg-emerald-500 transition-all duration-1000" style="width: ${homePct}%" title="${homeName}: ${homePct}%"></div>
                    <div class="bg-slate-400 transition-all duration-1000" style="width: ${drawPct}%" title="Draw: ${drawPct}%"></div>
                    <div class="bg-red-500 transition-all duration-1000" style="width: ${awayPct}%" title="${awayName}: ${awayPct}%"></div>
                </div>
                
                <div class="flex justify-between text-[10px] font-black mt-1">
                    <span class="text-emerald-500">${homePct}%</span>
                    <span class="text-slate-400">${drawPct}%</span>
                    <span class="text-red-500">${awayPct}%</span>
                </div>
        `;

        // إذا لم يصوت الزائر، نعرض له أزرار التصويت
        if (!savedVote) {
            widgetHTML += `
                <div class="flex gap-2 mt-3" id="vote-buttons-${fixtureId}">
                    <button onclick="submitVote('${fixtureId}', 'home')" class="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-emerald-500 hover:text-emerald-500 transition-colors shadow-sm text-xs font-bold">
                        <img src="${homeLogo}" class="w-4 h-4 object-contain"> 1
                    </button>
                    <button onclick="submitVote('${fixtureId}', 'draw')" class="flex-1 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-slate-500 hover:text-slate-500 transition-colors shadow-sm text-xs font-bold text-slate-500">
                        X
                    </button>
                    <button onclick="submitVote('${fixtureId}', 'away')" class="flex-1 flex items-center justify-center gap-1.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-red-500 hover:text-red-500 transition-colors shadow-sm text-xs font-bold">
                        2 <img src="${awayLogo}" class="w-4 h-4 object-contain">
                    </button>
                </div>
            `;
        } else {
            // إذا صوت مسبقاً، نعرض له اختياره
            let choiceText = savedVote === 'home' ? homeName : (savedVote === 'away' ? awayName : 'Draw');
            let choiceColor = savedVote === 'home' ? 'text-emerald-500' : (savedVote === 'away' ? 'text-red-500' : 'text-slate-500');
            widgetHTML += `
                <div class="text-center mt-2 text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 py-2 rounded-lg border border-slate-100 dark:border-slate-800">
                    You voted: <span class="${choiceColor} uppercase tracking-wider">${choiceText}</span>
                </div>
            `;
        }

        widgetHTML += `</div>`;
        
        // استبدال التصميم القديم بالتصميم الجديد
        parentDiv.innerHTML = widgetHTML;
    });
}

// دالة إرسال التصويت
window.submitVote = async function(fixtureId, choice) {
    // حفظ في المتصفح لمنع التكرار
    localStorage.setItem(`vote_${fixtureId}`, choice);
    
    // إخفاء الأزرار وإظهار رسالة شكر مؤقتة
    const buttonsDiv = document.getElementById(`vote-buttons-${fixtureId}`);
    if (buttonsDiv) {
        buttonsDiv.innerHTML = `<div class="w-full text-center py-2 text-xs font-bold text-emerald-500">Vote recorded! Updating...</div>`;
    }

    // إرسال التصويت للسيرفر
    try {
        await fetch(`${APP_CONFIG.workerUrl}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-action': 'submit-vote' },
            body: JSON.stringify({ fixtureId, choice })
        });
    } catch (e) {}

    // إعادة رسم الويدجيت ليعكس النسب الجديدة
    const parentDiv = buttonsDiv.closest('.w-full.flex.flex-col');
    if(parentDiv) {
        parentDiv.removeAttribute('data-voting-injected');
        injectVotingWidget();
    }
};
