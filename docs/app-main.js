'use strict';
// MyCash — запуск 6/6: утилиты, вкладки, старт, оффер, экспорт функций в window
// ВНИМАНИЕ: файлы app-*.js делят ОДНУ общую область видимости.
// Подключаются по порядку в index.html. Порядок менять нельзя.

// === УТИЛИТЫ ===
function fmt(n) {
    return Math.round(n).toLocaleString('ru-RU');
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Экранирование HTML — защита от XSS
function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Валидация суммы
function validateAmount(val) {
    const n = parseFloat(val);
    if (!n || isNaN(n) || n <= 0) return { ok: false, error: 'Введите сумму больше 0' };
    if (n > 10000000) return { ok: false, error: 'Сумма не может превышать 10 000 000' };
    return { ok: true, amount: n };
}

// Осветлить цвет на percent%
function lightenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (num >> 16) + Math.round(255 * percent / 100));
    const g = Math.min(255, ((num >> 8) & 0x00FF) + Math.round(255 * percent / 100));
    const b = Math.min(255, (num & 0x0000FF) + Math.round(255 * percent / 100));
    return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

// === ТАБ-БАР: ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ===
const tabPages = {
    home: 'pageHome',
    analytics: 'pageAnalytics',
    pro: 'pagePro',
    profile: 'pageProfile'
};

function switchTab(tab, btn) {
    haptic('light');
    // Скрыть все страницы
    document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
    // Показать нужную
    document.getElementById(tabPages[tab]).classList.add('active');
    // Обновить активную кнопку
    document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    // Сохранить в хэш URL
    history.replaceState(null, '', '#' + tab);
    // При переходе на аналитику — обновить
    if (tab === 'analytics') {
        updateDashboard();
    }
    // При переходе на профиль — обновить данные
    if (tab === 'profile') {
        const name = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user)
            ? tg.initDataUnsafe.user.first_name : 'Пользователь';
        document.getElementById('profileName').textContent = name;
        document.getElementById('profileAvatar').textContent = name.charAt(0).toUpperCase();
        // Обновить кошельки в профиле (динамически из справочника)
        renderProfileWallets();
        updateRefCounts();
    }
    // Прокрутить вверх и обновить иконки
    window.scrollTo(0, 0);
    refreshIcons();
}

// Поделиться приложением
function shareApp() {
    haptic();
    const botUsername = 'mycash1233333_bot';
    const shareUrl = 'https://t.me/' + botUsername + '/app';
    if (tg && tg.openTelegramLink) {
        tg.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(shareUrl) + '&text=' + encodeURIComponent('Попробуй MyCash — удобный учёт финансов прямо в Telegram!'));
    } else {
        window.open('https://t.me/share/url?url=' + encodeURIComponent(shareUrl), '_blank');
    }
}

// Очистить все данные
function clearAllData() {
    if (!confirm('Удалить все данные? Это действие нельзя отменить.')) return;
    (async () => {
        haptic('success');
        try {
            await API.clearAll();            // сервер: удалить все операции + обнулить остатки счетов + снять is_demo
            serverIsDemo = false;
            await loadReferences();          // счета обнулятся
            await loadServerOperations();    // операций не останется
            renderAll();
            switchTab('home', document.querySelector('.tab-item'));
        } catch (e) {
            alert('Не удалось удалить данные. Нужен интернет, попробуйте снова.');
        }
    })();
}

// === СТАРТ ===

// Маппинг "чистое имя кошелька" → uuid на сервере (для отправки wallet_id)
window.walletIdMap = {};

// Очищает имя кошелька от эмодзи и пробелов в начале.
// "💳 Карта" → "Карта", "Наличка" → "Наличка"
window.cleanWalletName = function(name) {
    if (!name) return '';
    return String(name).replace(/^[^а-яА-ЯёЁa-zA-Z]+/, '').trim();
};

// Возвращает uuid кошелька по имени (с эмодзи или без).
window.getWalletId = function(name) {
    if (!name || !window.walletIdMap) return null;
    const clean = window.cleanWalletName(name);
    return window.walletIdMap[clean] || null;
};

// Скрыть заставку загрузки (после первой синхронизации с сервером или по таймауту)
function hideSplash() {
    const s = document.getElementById('splash');
    if (!s || s.classList.contains('hidden')) return;
    s.classList.add('hidden');
    setTimeout(function() { s.style.display = 'none'; }, 350);
}

// Попытка авторизации через API + загрузка кошельков
(async function() {
    // Предохранитель: если сервер не ответил за 8 сек — всё равно показать приложение
    const splashGuard = setTimeout(hideSplash, 8000);
    try {
        if (tg && tg.initData) {
            const user = await API.auth(tg.initData);
            if (user) {
                serverIsDemo = !!user.is_demo;   // демо-флаг с сервера → демо-баннер
                console.log('API: онлайн-режим, пользователь:', user.first_name);
                // Загружаем все справочники с сервера (кошельки, статьи, направления, контрагенты)
                await loadReferences();
                // Досылаем на сервер операции, добавленные ранее в оффлайне (если были)
                try { await API.syncOfflineData(); } catch (e) {}
                // Затем операции с сервера — единый источник правды (синхрон между устройствами)
                await loadServerOperations();
            } else {
                console.log('API: оффлайн-режим (localStorage)');
            }
        }
    } catch (e) {
        console.warn('Ошибка первичной загрузки:', e);
    } finally {
        clearTimeout(splashGuard);
        hideSplash();   // показываем готовый экран с актуальными данными
    }
})();

init();
refreshIcons();
showOfferIfNeeded();

// === ЭКРАН-ОФФЕР (показать один раз при первом открытии) ===
function showOfferIfNeeded() {
    // Показываем только если ещё не видели
    if (Storage.load('mycash_offer_shown')) return;
    // Показываем с задержкой чтобы приложение успело загрузиться
    setTimeout(function() {
        document.getElementById('offerOverlay').classList.add('active');
        refreshIcons();
    }, 1500);
}

function acceptOffer() {
    haptic('success');
    Storage.save('mycash_offer_shown', true);
    document.getElementById('offerOverlay').classList.remove('active');
    // Открыть бота — пользователь нажмёт Start и подпишется
    const botUrl = 'https://t.me/mycash1233333_bot?start=from_app';
    if (tg && tg.openTelegramLink) {
        tg.openTelegramLink(botUrl);
    } else {
        window.open(botUrl, '_blank');
    }
}

function skipOffer() {
    haptic('light');
    Storage.save('mycash_offer_shown', true);
    document.getElementById('offerOverlay').classList.remove('active');
}

// === ЭКСПОРТ ФУНКЦИЙ В WINDOW (для onclick в HTML) ===
Object.assign(window, {
    anCarEnd, anCarMove, anCarStart, applyCustomPeriod, clearAllData,
    clearDemoData, closeEdit, closeModal, closeUpgrade,
    closeWalletEdit, deleteFromEdit, deleteOperation, deleteWallet,
    focusAmount, haptic, openCustomPeriod,
    openEdit, openModal, openWalletEdit, openNewWallet, walletDragStart, quickSave, renderEditArticles,
    renderEditWallets, selectEditWallet, selectEditArticle,
    saveEdit, saveExtended, saveWalletEdit, selectExtCat,
    selectWallet, selectWalletColor, setDashTab, setDashGroup, setEditType, setPeriod,
    setTableMode, setType, shareApp, showUpgrade, swapTransfer,
    switchTab, toggleCatOps, toggleExtended, updateAmountDisplay, acceptOffer, skipOffer,
    swipeStart, swipeMove, swipeEnd,
    quickSaveArticle, saveTransfer, cycleTransfer,
    toggleArticleEditMode, openNewArticleFromOp, openArticleEditFromOp,
    openRefList, closeRefList, openRefForm, closeRefForm,
    setRefArticleType, saveRefForm, archiveRefItem,
    setDashMode, navReportMonth, toggleDdsSection,
    openBankPicker, closeBankPicker, selectBank, renderBankList, selectCashWallet,
    toggleContragentAdd, quickAddContragent
});

// Восстановить вкладку из хэша URL
(function() {
    const hash = location.hash.replace('#', '');
    if (hash && tabPages[hash]) {
        const tabKeys = ['home', 'analytics', 'pro', 'profile'];
        const btns = document.querySelectorAll('.tab-item');
        const idx = tabKeys.indexOf(hash);
        if (idx >= 0 && btns[idx]) switchTab(hash, btns[idx]);
    }
})();

