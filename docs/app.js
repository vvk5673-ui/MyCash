(function() {
'use strict';

// === TELEGRAM WEB APP ===
const tg = window.Telegram && window.Telegram.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
}

// Имя пользователя из Telegram
const userName = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user)
    ? tg.initDataUnsafe.user.first_name
    : '';
if (userName) {
    document.getElementById('headerGreeting').textContent = 'Здравствуйте, ' + userName + '! 👋';
}

// Текущая дата
const now = new Date();
const dateOpts = { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' };
const dateStr = now.toLocaleDateString('ru-RU', dateOpts);
document.getElementById('headerDate').textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

// Вибрация (HapticFeedback) — с try/catch для работы вне Telegram
function haptic(type) {
    try {
        if (tg && tg.HapticFeedback) {
            if (type === 'light') tg.HapticFeedback.impactOccurred('light');
            else if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
            else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
            else tg.HapticFeedback.impactOccurred('medium');
        }
    } catch(e) {}
}

// === ХРАНИЛИЩЕ (localStorage основное, CloudStorage бэкап) ===
const Storage = {
    save(key, data) {
        const json = JSON.stringify(data);
        localStorage.setItem(key, json);
        try {
            if (tg && tg.CloudStorage && typeof tg.CloudStorage.setItem === 'function') {
                tg.CloudStorage.setItem(key, json);
            }
        } catch(e) {}
    },
    load(key) {
        try {
            const local = localStorage.getItem(key);
            return local ? JSON.parse(local) : null;
        } catch(e) {
            console.warn('Ошибка загрузки данных:', key, e);
            return null;
        }
    }
};

// === ДАННЫЕ ===
const EXPENSE_CATS = [
    { name: 'Продукты', icon: 'shopping-cart', color: '#FF3B30' },
    { name: 'Кафе', icon: 'coffee', color: '#FF9500' },
    { name: 'Транспорт', icon: 'bus', color: '#FFCC00' },
    { name: 'ЖКХ', icon: 'home', color: '#34C759' },
    { name: 'Связь', icon: 'smartphone', color: '#007AFF' },
    { name: 'Одежда', icon: 'shirt', color: '#5856D6' },
    { name: 'Здоровье', icon: 'heart-pulse', color: '#AF52DE' },
    { name: 'Развлечения', icon: 'clapperboard', color: '#FF2D55' },
    { name: 'Подписки', icon: 'tv', color: '#00C7BE' },
    { name: 'Прочее', icon: 'package', color: '#8E8E93' }
];
const INCOME_CATS = [
    { name: 'Зарплата', icon: 'banknote', color: '#34C759' },
    { name: 'Подработка', icon: 'wrench', color: '#007AFF' },
    { name: 'Кэшбек', icon: 'credit-card', color: '#FF9500' },
    { name: 'Подарок', icon: 'gift', color: '#FF2D55' },
    { name: 'Возврат', icon: 'undo-2', color: '#5856D6' },
    { name: 'Прочее', icon: 'package', color: '#8E8E93' }
];

// Функция создания Lucide-иконки как HTML
function lucideIcon(name, size, color) {
    size = size || 20;
    color = color || '#007AFF';
    return '<i data-lucide="' + name + '" style="width:' + size + 'px;height:' + size + 'px;color:' + color + '"></i>';
}

// Обновить все Lucide-иконки на странице.
// Отказоустойчиво: один кривой вызов не должен гасить весь набор, и любой значок,
// который Lucide не преобразовал в svg, получает запасную букву — значки НИКОГДА не пропадают.
function refreshIcons() {
    try {
        if (window.lucide && typeof lucide.createIcons === 'function') {
            lucide.createIcons();
        }
    } catch (e) { /* не мешаем рендеру: ниже всё равно поставим фоллбек */ }
    // Любой <i data-lucide> без отрисованного svg — запасная буква в цвете значка
    document.querySelectorAll('i[data-lucide]').forEach(el => {
        if (!el.querySelector('svg')) {
            const name = el.getAttribute('data-lucide') || '';
            el.textContent = name.charAt(0).toUpperCase();
            el.style.fontStyle = 'normal';
            el.style.fontWeight = '600';
        }
    });
}

// Повторно переотрисовать значки после асинхронной загрузки/перерисовки —
// страховка от гонки загрузки Lucide-CDN в webview Telegram (значки появлялись и пропадали)
function refreshIconsSoon() {
    refreshIcons();
    setTimeout(refreshIcons, 60);
    setTimeout(refreshIcons, 600);
}
const chartColors = ['#FF3B30','#FF9500','#FFCC00','#34C759','#007AFF','#5856D6','#AF52DE','#FF2D55','#00C7BE','#8E8E93'];

let operations = [];
let currentType = 'expense';
let selectedWallet = '';   // имя счёта; ставится из справочника счетов при рендере формы
let selectedCategory = '';
let currentPeriod = 'month';
let voiceParsedData = null;
let isDemo = false;
let serverIsDemo = false;   // is_demo с сервера (из ответа API.auth) — источник правды для демо-баннера
let transferFrom = '💳 Карта';
let transferTo = '💵 Наличка';

// === СПРАВОЧНИКИ С СЕРВЕРА (структура ДДС, грузятся при старте — loadReferences) ===
const Refs = {
    groups: [],          // [{id, code, name, sort_order}] — Поступление/Выбытие
    activityKinds: [],   // [{id, code, name, sort_order}] — Операционная/Инвестиционная/...
    articles: [],        // [{id, name, description, group_id, activity_kind_id, ...}]
    directions: [],      // [{id, name, icon, color, ...}]
    contragents: [],     // [{id, name, type, ...}]
    wallets: [],         // [{id, name, icon, color, initial_balance, balance}]
    loaded: false
};
window.Refs = Refs;

// Загрузить все справочники с сервера в память (Refs). Без интернета — тихо выходит.
async function loadReferences() {
    if (typeof API === 'undefined' || !API.isOnline()) return false;
    try {
        const [refs, articles, directions, contragents, walletsRes] = await Promise.all([
            API.getRefs(),
            API.getArticles(),
            API.getDirections(),
            API.getContragents(),
            API.getWallets()
        ]);
        if (refs) {
            Refs.groups = refs.groups || [];
            Refs.activityKinds = refs.activity_kinds || [];
        }
        if (articles) Refs.articles = articles.articles || [];
        if (directions) Refs.directions = directions.directions || [];
        if (contragents) Refs.contragents = contragents.contragents || [];
        if (walletsRes && walletsRes.wallets) {
            Refs.wallets = walletsRes.wallets;
            // Маппинг "чистое имя кошелька" → uuid (для отправки операций на сервер)
            // и обратный uuid → полное имя (для загрузки операций с сервера)
            window.walletNameById = {};
            Refs.wallets.forEach(function(w) {
                window.walletIdMap[window.cleanWalletName(w.name)] = w.id;
                window.walletNameById[w.id] = w.name;
            });
        }
        if (walletsRes) setAccountingStartFromServer(walletsRes.accounting_start);
        Refs.loaded = true;
        console.log('Справочники загружены:', {
            группы: Refs.groups.length,
            виды: Refs.activityKinds.length,
            статьи: Refs.articles.length,
            направления: Refs.directions.length,
            контрагенты: Refs.contragents.length,
            кошельки: Refs.wallets.length
        });
        // Перерисовываем UI — теперь кошельки берутся с сервера
        if (typeof renderAll === 'function') renderAll();
        refreshIconsSoon();   // страховка от гонки загрузки Lucide в webview Telegram
        return true;
    } catch (e) {
        console.warn('Не удалось загрузить справочники:', e);
        return false;
    }
}
window.loadReferences = loadReferences;

// Хелперы для статей: id статьи по имени, имя по id, фильтр по типу (расход/доход)
function getArticleById(id) {
    return Refs.articles.find(function(a) { return a.id === id; }) || null;
}
function getDirectionById(id) {
    return Refs.directions.find(function(d) { return d.id === id; }) || null;
}
function getContragentById(id) {
    return Refs.contragents.find(function(c) { return c.id === id; }) || null;
}

// === ВНЕШНИЙ ВИД СТАТЕЙ ДДС (иконка + цвет) ===
// Справочник по точному имени 31 стандартной статьи. Цвет закреплён за смыслом —
// статья выглядит одинаково и в аналитике, и в Отчёте ДДС. Цвета разнесены по оттенкам,
// чтобы соседние полоски в аналитике не сливались.
const ARTICLE_VISUALS = {
    // Операционная — поступления
    'Выручка от продаж товаров':              { icon: 'shopping-cart',   color: '#007AFF' },
    'Выручка от услуг':                       { icon: 'handshake',       color: '#5AC8FA' },
    'Возвраты от поставщиков':                { icon: 'undo-2',          color: '#34C759' },
    'Прочие операционные поступления':        { icon: 'circle-plus',     color: '#30B0C7' },
    // Операционная — выбытия
    'Закупка товаров для перепродажи':        { icon: 'package',         color: '#FF9500' },
    'Закупка сырья и материалов':             { icon: 'boxes',           color: '#FF6B22' },
    'Аренда помещения':                       { icon: 'building-2',      color: '#FF3B30' },
    'Коммунальные услуги':                    { icon: 'plug-zap',        color: '#FFCC00' },
    'Связь и интернет':                       { icon: 'wifi',            color: '#00C7BE' },
    'Зарплата сотрудникам':                   { icon: 'users',           color: '#5856D6' },
    'Налоги и взносы':                        { icon: 'landmark',        color: '#8E8E93' },
    'Реклама и маркетинг':                    { icon: 'megaphone',       color: '#FF2D55' },
    'Транспортные расходы':                   { icon: 'truck',           color: '#A2845E' },
    'Командировки':                           { icon: 'plane',           color: '#AF52DE' },
    'Профессиональные услуги':                { icon: 'briefcase',       color: '#634C9F' },
    'Канцелярия и расходники':                { icon: 'pen-tool',        color: '#C7B299' },
    'Банковские комиссии':                    { icon: 'percent',         color: '#64748B' },
    'Обучение и развитие':                    { icon: 'graduation-cap',  color: '#0EA5E9' },
    'Прочие операционные расходы':            { icon: 'ellipsis',        color: '#98989D' },
    // Инвестиционная
    'Продажа ОС':                             { icon: 'archive',         color: '#16A34A' },
    'Возврат кредитов и займов':              { icon: 'hand-coins',      color: '#22C55E' },
    'Прочие поступления от инвест. операций': { icon: 'trending-up',     color: '#14B8A6' },
    'Покупка ОС':                             { icon: 'monitor',         color: '#6366F1' },
    'Ремонт ОС':                              { icon: 'wrench',          color: '#F97316' },
    'Выдача кредитов и займов':               { icon: 'send',            color: '#EF4444' },
    // Финансовая
    'Получение кредитов и займов':            { icon: 'banknote',        color: '#10B981' },
    'Вклады от собственников':                { icon: 'piggy-bank',      color: '#0D9488' },
    'Оплаты по кредитам и займам':            { icon: 'credit-card',     color: '#DC2626' },
    'Дивиденды':                              { icon: 'coins',           color: '#D97706' },
    // Техническая (переводы между счетами)
    'Доход — Перевод между счетами':          { icon: 'arrow-left-right', color: '#007AFF' },
    'Расход — Перевод между счетами':         { icon: 'arrow-left-right', color: '#007AFF' }
};

// Палитра для запасного подбора цвета пользовательских статей (разнесённые оттенки)
const ARTICLE_FALLBACK_COLORS = ['#007AFF', '#FF9500', '#34C759', '#5856D6', '#FF2D55',
    '#00C7BE', '#AF52DE', '#FF3B30', '#FFCC00', '#5AC8FA', '#A2845E', '#64748B'];

// Подбор иконки по ключевым словам — для статей, которых нет в справочнике (создал пользователь)
const ARTICLE_KEYWORD_ICONS = [
    [/перевод|между\s*счет/i,                'arrow-left-right'],
    [/налог|взнос|сбор|пошлин/i,             'landmark'],
    [/зарплат|сотрудник|оклад|преми|кадр/i,  'users'],
    [/аренд/i,                               'building-2'],
    [/реклам|маркет|продвижен|smm/i,         'megaphone'],
    [/транспорт|бензин|топлив|такси|достав|логист/i, 'truck'],
    [/связ|интернет|телефон|моб/i,           'wifi'],
    [/обучен|курс|семинар|книг|трен/i,       'graduation-cap'],
    [/команд|перел[её]т|гостиниц|отел|поездк/i, 'plane'],
    [/комисс/i,                              'percent'],
    [/кредит|займ|долг|ссуд/i,               'hand-coins'],
    [/ремонт|почин/i,                        'wrench'],
    [/дивиденд/i,                            'coins'],
    [/вклад|собственник|инвест/i,            'piggy-bank'],
    [/юрист|бухгалт|консульт/i,              'briefcase'],
    [/коммунал|электр|вода|отоплен|свет/i,   'plug-zap'],
    [/возврат/i,                             'undo-2'],
    [/прода|выручк/i,                        'shopping-cart'],
    [/закуп|товар|сырь|материал|расходник/i, 'package'],
    [/услуг/i,                               'handshake']
];

// Простой хеш строки (для стабильного выбора цвета по имени статьи)
function articleHash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
    return Math.abs(h);
}

// Возвращает {icon, color} для статьи.
// Приоритет: иконка/цвет, заданные на сервере → точный справочник → подбор по слову → нейтральная иконка + цвет по хешу
function articleVisual(article) {
    const name = (article && article.name) ? article.name : '';
    const srvIcon = (article && article.icon && article.icon !== 'tag') ? article.icon : null;
    const srvColor = (article && article.color) ? article.color : null;
    const exact = ARTICLE_VISUALS[name];
    if (exact) {
        return { icon: srvIcon || exact.icon, color: srvColor || exact.color };
    }
    // пользовательская статья — подбираем иконку по ключевому слову
    let icon = srvIcon || 'tag';
    if (icon === 'tag') {
        for (let i = 0; i < ARTICLE_KEYWORD_ICONS.length; i++) {
            if (ARTICLE_KEYWORD_ICONS[i][0].test(name)) { icon = ARTICLE_KEYWORD_ICONS[i][1]; break; }
        }
    }
    const color = srvColor || ARTICLE_FALLBACK_COLORS[articleHash(name) % ARTICLE_FALLBACK_COLORS.length];
    return { icon: icon, color: color };
}

// Статьи, подходящие под тип операции: expense → группа "Выбытие" (outflow), income → "Поступление" (inflow)
function articlesForType(type) {
    const wantCode = type === 'income' ? 'inflow' : 'outflow';
    const grp = Refs.groups.find(function(g) { return g.code === wantCode; });
    if (!grp) return Refs.articles.filter(function(a) { return !a.is_archived; });
    return Refs.articles.filter(function(a) { return a.group_id === grp.id && !a.is_archived; });
}

// Стандартный набор кошельков (как на сервере) — фоллбек, если справочники не загрузились
const SERVER_DEFAULT_WALLETS = [
    { name: 'Счёт №1', icon: 'credit-card',  color: '#007AFF', initial_balance: 0 },
    { name: 'Счёт №2', icon: 'credit-card',  color: '#5856D6', initial_balance: 0 },
    { name: 'Наличка', icon: 'wallet',       color: '#34C759', initial_balance: 0 },
    { name: 'Касса',   icon: 'shopping-bag', color: '#FF9500', initial_balance: 0 },
];

// Активный список кошельков: с сервера (если загружены) либо стандартный набор
function getActiveWallets() {
    if (Refs.loaded && Refs.wallets.length) return Refs.wallets;
    return SERVER_DEFAULT_WALLETS;
}

// Баланс по каждому кошельку: начальный остаток + операции (ключ — имя кошелька)
function computeWalletBalances() {
    const wallets = getActiveWallets();
    const bal = {};
    wallets.forEach(function(w) { bal[w.name] = Number(w.initial_balance) || 0; });
    operations.forEach(function(op) {
        if (op.type === 'income' && bal[op.wallet] != null) {
            bal[op.wallet] += op.amount;
        } else if (op.type === 'expense' && bal[op.wallet] != null) {
            bal[op.wallet] -= op.amount;
        } else if (op.type === 'transfer') {
            if (bal[op.walletTo] != null) bal[op.walletTo] += op.amount;
            if (bal[op.walletFrom] != null) bal[op.walletFrom] -= op.amount;
        }
    });
    return bal;
}

// Рендер кошельков на главном экране — компактным списком (по строке на кошелёк)
function renderWalletsRow() {
    const wallets = getActiveWallets();
    const bal = computeWalletBalances();
    const row = document.getElementById('walletsRow');
    if (!row) return;
    row.innerHTML = wallets.map(function(w) {
        // Кошелёк кликабелен только если он реальный (с сервера, есть id) — тап открывает настройки
        const click = w.id ? ' onclick="openWalletEdit(\'' + w.id + '\')" style="cursor:pointer"' : '';
        return '<div class="wallet-line"' + click + '>' +
            '<span style="flex-shrink:0">' + lucideIcon(w.icon || 'wallet', 18, w.color || '#007AFF') + '</span>' +
            '<span class="wallet-line-name">' + esc(w.name) + '</span>' +
            '<span class="wallet-line-amount">' + fmt(bal[w.name] || 0) + ' ₽</span>' +
            '</div>';
    }).join('') +
    // Строка добавления нового счёта (только онлайн — счета хранятся на сервере)
    '<div class="wallet-line wallet-line-add" onclick="openNewWallet()" style="cursor:pointer;color:var(--accent)">' +
        '<span style="flex-shrink:0">' + lucideIcon('plus', 18, '#007AFF') + '</span>' +
        '<span class="wallet-line-name">Добавить счёт</span>' +
        '</div>';
    refreshIcons();
}

// Рендер списка кошельков в профиле
function renderProfileWallets() {
    const wallets = getActiveWallets();
    const bal = computeWalletBalances();
    const box = document.getElementById('profileWalletsList');
    if (!box) return;
    box.innerHTML = wallets.map(function(w) {
        return '<div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border)">' +
            '<span>' + lucideIcon(w.icon || 'wallet', 20, w.color || '#007AFF') + '</span>' +
            '<span style="flex:1;font-size:14px">' + esc(w.name) + '</span>' +
            '<span style="font-size:13px;color:var(--text2)">' + fmt(bal[w.name] || 0) + ' ₽</span>' +
            '</div>';
    }).join('');
    refreshIcons();
}

// === СПРАВОЧНИКИ: УПРАВЛЕНИЕ (статьи / направления / контрагенты) ===

// Метаданные по типам справочников
const REF_META = {
    articles:    { title: 'Статьи ДДС',  addLabel: 'статью' },
    directions:  { title: 'Направления', addLabel: 'направление' },
    contragents: { title: 'Контрагенты', addLabel: 'контрагента' }
};
let currentRefKind = null;   // 'articles' | 'directions' | 'contragents'
let editingRefId = null;     // null = создаём новый
let refArticleType = 'expense';
let refBusy = false;         // защита от двойного нажатия «Сохранить»/«Скрыть»

// Понятный текст ошибки по сообщению из API
function refErrorText(e) {
    const m = (e && e.message) || '';
    if (m === 'offline') return 'Нет связи с сервером. Проверьте интернет и попробуйте снова.';
    if (m === 'unauthorized') return 'Сессия истекла. Закройте и откройте приложение заново.';
    return m || 'Неизвестная ошибка';
}

// Обновить счётчики справочников в Профиле (только не скрытые)
function updateRefCounts() {
    const set = function(id, n) { const el = document.getElementById(id); if (el) el.textContent = n; };
    set('refCountArticles', Refs.articles.filter(function(a) { return !a.is_archived; }).length);
    set('refCountDirections', Refs.directions.filter(function(d) { return !d.is_archived; }).length);
    set('refCountContragents', Refs.contragents.filter(function(c) { return !c.is_archived; }).length);
}

// Открыть окно списка справочника
function openRefList(kind) {
    currentRefKind = kind;
    haptic('light');
    document.getElementById('refListTitle').textContent = REF_META[kind].title;
    renderRefList();
    document.getElementById('refListOverlay').classList.add('active');
}

function closeRefList(e) {
    if (e && e.target && e.target !== e.currentTarget) return;
    document.getElementById('refListOverlay').classList.remove('active');
}

// HTML одной строки списка (тап = редактировать, корзина = скрыть)
function refRowHtml(item) {
    return '<div class="ref-row" onclick="openRefForm(\'' + item.id + '\')">' +
        '<span class="ref-row-name">' + esc(item.name) + '</span>' +
        '<button class="ref-row-del" onclick="event.stopPropagation();archiveRefItem(\'' + item.id + '\')">' +
            lucideIcon('trash-2', 18, '#FF3B30') + '</button>' +
        '<span style="color:var(--text2)">›</span></div>';
}

function refEmptyHtml() {
    return '<div style="padding:12px;text-align:center;color:var(--text2);font-size:13px">Пока пусто</div>';
}

function refSubheader(text) {
    return '<div style="font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;margin:14px 4px 6px">' + text + '</div>';
}

// Рендер тела окна списка
function renderRefList() {
    const kind = currentRefKind;
    const body = document.getElementById('refListBody');
    if (!body) return;

    if (typeof API === 'undefined' || !API.isOnline()) {
        body.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text2);font-size:13px">Нужен интернет, чтобы управлять справочниками.</div>';
        return;
    }

    if (kind === 'articles') {
        const inGrp = Refs.groups.find(function(g) { return g.code === 'inflow'; });
        const outGrp = Refs.groups.find(function(g) { return g.code === 'outflow'; });
        const income = Refs.articles.filter(function(a) { return !a.is_archived && inGrp && a.group_id === inGrp.id; });
        const expense = Refs.articles.filter(function(a) { return !a.is_archived && outGrp && a.group_id === outGrp.id; });
        let html = '';
        html += refSubheader('Доходные');
        html += '<div class="ref-list-card">' + (income.length ? income.map(refRowHtml).join('') : refEmptyHtml()) + '</div>';
        html += refSubheader('Расходные');
        html += '<div class="ref-list-card">' + (expense.length ? expense.map(refRowHtml).join('') : refEmptyHtml()) + '</div>';
        body.innerHTML = html;
    } else {
        const list = (kind === 'directions' ? Refs.directions : Refs.contragents).filter(function(x) { return !x.is_archived; });
        body.innerHTML = '<div class="ref-list-card">' + (list.length ? list.map(refRowHtml).join('') : refEmptyHtml()) + '</div>';
    }
    refreshIcons();
}

// Открыть форму добавления/редактирования
function openRefForm(id) {
    editingRefId = (id && id !== 'null') ? id : null;
    const kind = currentRefKind;
    haptic('light');

    document.getElementById('refFormName').value = '';
    const artFields = document.getElementById('refFormArticleFields');
    artFields.style.display = (kind === 'articles') ? 'block' : 'none';

    // Список видов деятельности (для статей)
    if (kind === 'articles') {
        const sel = document.getElementById('refFormActivityKind');
        sel.innerHTML = Refs.activityKinds.map(function(k) {
            return '<option value="' + k.id + '">' + esc(k.name) + '</option>';
        }).join('');
    }

    // Текущий элемент (при редактировании)
    let item = null;
    if (editingRefId) {
        const list = kind === 'articles' ? Refs.articles : (kind === 'directions' ? Refs.directions : Refs.contragents);
        item = list.find(function(x) { return x.id === editingRefId; });
    }

    if (item) {
        document.getElementById('refFormTitle').textContent = 'Изменить';
        document.getElementById('refFormName').value = item.name || '';
        document.getElementById('refFormDeleteBtn').style.display = '';
        if (kind === 'articles') {
            const inGrp = Refs.groups.find(function(g) { return g.code === 'inflow'; });
            setRefArticleType(inGrp && item.group_id === inGrp.id ? 'income' : 'expense');
            if (item.activity_kind_id) document.getElementById('refFormActivityKind').value = item.activity_kind_id;
        }
    } else {
        document.getElementById('refFormTitle').textContent = 'Добавить ' + REF_META[kind].addLabel;
        document.getElementById('refFormDeleteBtn').style.display = 'none';
        if (kind === 'articles') {
            setRefArticleType('expense');
            // По умолчанию — вид деятельности «Операционная» (или первый в списке)
            const op = Refs.activityKinds.find(function(k) { return /операц/i.test(k.name); }) || Refs.activityKinds[0];
            if (op) document.getElementById('refFormActivityKind').value = op.id;
        }
    }

    document.getElementById('refFormOverlay').classList.add('active');
    setTimeout(function() { document.getElementById('refFormName').focus(); }, 300);
}

function closeRefForm(e) {
    if (e && e.target && e.target !== e.currentTarget) return;
    document.getElementById('refFormOverlay').classList.remove('active');
    editingRefId = null;
}

// Переключатель Доход/Расход в форме статьи
function setRefArticleType(type) {
    refArticleType = type;
    document.getElementById('refTypeExpenseBtn').classList.toggle('active', type === 'expense');
    document.getElementById('refTypeIncomeBtn').classList.toggle('active', type === 'income');
    haptic('light');
}

// Сохранить (создать или обновить) элемент справочника
async function saveRefForm() {
    if (refBusy) return;                       // не даём двойной запрос
    const kind = currentRefKind;
    const name = document.getElementById('refFormName').value.trim();
    if (!name) { haptic('error'); document.getElementById('refFormName').focus(); return; }

    refBusy = true;
    try {
        if (kind === 'articles') {
            const inGrp = Refs.groups.find(function(g) { return g.code === 'inflow'; });
            const outGrp = Refs.groups.find(function(g) { return g.code === 'outflow'; });
            const group_id = refArticleType === 'income' ? (inGrp && inGrp.id) : (outGrp && outGrp.id);
            const activity_kind_id = document.getElementById('refFormActivityKind').value;
            const data = { name: name, group_id: group_id, activity_kind_id: activity_kind_id };
            if (editingRefId) await API.updateArticle(editingRefId, data);
            else await API.createArticle(data);
        } else if (kind === 'directions') {
            if (editingRefId) await API.updateDirection(editingRefId, { name: name });
            else await API.createDirection({ name: name });
        } else {
            if (editingRefId) await API.updateContragent(editingRefId, { name: name });
            else await API.createContragent({ name: name });
        }
        haptic('success');
        await loadReferences();   // перезагрузить справочники с сервера
        closeRefForm();
        renderRefList();
        updateRefCounts();
    } catch (e) {
        haptic('error');
        alert('Не удалось сохранить: ' + refErrorText(e));
    } finally {
        refBusy = false;
    }
}

// Скрыть элемент (is_archived=true) — старые операции остаются целыми
async function archiveRefItem(id) {
    if (refBusy) return;
    const kind = currentRefKind;
    const targetId = id || editingRefId;
    if (!targetId) return;
    if (!confirm('Скрыть из списков выбора? Старые операции с этим элементом останутся целыми.')) return;

    refBusy = true;
    try {
        if (kind === 'articles') await API.updateArticle(targetId, { is_archived: true });
        else if (kind === 'directions') await API.updateDirection(targetId, { is_archived: true });
        else await API.updateContragent(targetId, { is_archived: true });
        haptic('success');
        await loadReferences();
        if (document.getElementById('refFormOverlay').classList.contains('active')) closeRefForm();
        renderRefList();
        updateRefCounts();
    } catch (e) {
        haptic('error');
        alert('Не удалось скрыть: ' + refErrorText(e));
    } finally {
        refBusy = false;
    }
}

// === ДЕМО-ДАННЫЕ ===
function generateDemoData() {
    const now = new Date();
    const today = now.getDate();
    // Если сегодня 3-е число или позже — распределяем демо по дням 1..(сегодня-1)
    // текущего месяца. Так демо видны в фильтре "месяц", а реальные операции
    // с датой "сегодня" всегда оказываются в самом верху списка.
    // Если сегодня 1-2 число — уходим в прошлый месяц целиком.
    let y, m, useCurrent;
    if (today >= 3) {
        y = now.getFullYear();
        m = now.getMonth();
        useCurrent = true;
    } else {
        y = now.getFullYear();
        m = now.getMonth() - 1;
        useCurrent = false;
    }
    const maxDay = useCurrent ? (today - 1) : 28;
    const demo = [
        { type: 'income', amount: 80000, category: 'Зарплата', wallet: '💳 Карта', comment: '', day: 1 },
        { type: 'expense', amount: 25000, category: 'ЖКХ', wallet: '💳 Карта', comment: 'Аренда квартиры', day: 2 },
        { type: 'expense', amount: 5600, category: 'ЖКХ', wallet: '💳 Карта', comment: 'Коммуналка', day: 3 },
        { type: 'expense', amount: 1200, category: 'Связь', wallet: '💳 Карта', comment: 'Телефон + интернет', day: 3 },
        { type: 'expense', amount: 8500, category: 'Продукты', wallet: '💳 Карта', comment: 'Пятёрочка', day: 4 },
        { type: 'expense', amount: 3200, category: 'Продукты', wallet: '💵 Наличка', comment: 'Рынок', day: 5 },
        { type: 'expense', amount: 2500, category: 'Транспорт', wallet: '💳 Карта', comment: 'Метро', day: 5 },
        { type: 'expense', amount: 3500, category: 'Транспорт', wallet: '💳 Карта', comment: 'Бензин', day: 7 },
        { type: 'expense', amount: 1800, category: 'Кафе', wallet: '💵 Наличка', comment: 'Обед с другом', day: 8 },
        { type: 'expense', amount: 4500, category: 'Одежда', wallet: '💳 Карта', comment: 'Кроссовки', day: 10 },
        { type: 'expense', amount: 950, category: 'Здоровье', wallet: '💵 Наличка', comment: 'Аптека', day: 12 },
        { type: 'expense', amount: 799, category: 'Подписки', wallet: '💳 Карта', comment: 'Кинопоиск', day: 15 },
        { type: 'expense', amount: 2000, category: 'Развлечения', wallet: '💵 Наличка', comment: 'Кино', day: 18 },
        { type: 'expense', amount: 1500, category: 'Продукты', wallet: '💳 Карта', comment: 'Магнит', day: 20 },
        { type: 'income', amount: 1200, category: 'Кэшбек', wallet: '💳 Карта', comment: 'Кэшбек за месяц', day: 22 },
        { type: 'expense', amount: 2000, category: 'Прочее', wallet: '💵 Наличка', comment: 'Подарок маме', day: 25 },
        { type: 'income', amount: 15000, category: 'Подработка', wallet: '💵 Наличка', comment: 'Фриланс', day: 28 }
    ];
    return demo.map((d, i) => {
        // Если демо в текущем месяце — ограничиваем день сверху maxDay,
        // чтобы не попасть в будущее. Несколько операций могут оказаться
        // в один день, но время (час) будет разным — порядок сохранится.
        const day = Math.min(d.day, maxDay);
        return {
            id: Date.now() - (demo.length - i) * 100000,
            type: d.type,
            amount: d.amount,
            category: d.category,
            // Сопоставляем демо со стандартными кошельками сервера
            wallet: (d.wallet === '💳 Карта' ? 'Счёт №1' : 'Наличка'),
            comment: d.comment,
            date: new Date(y, m, day, 10 + i % 12, i * 7 % 60).toISOString(),
            _demo: true
        };
    });
}

// === СИНХРОНИЗАЦИЯ С СЕРВЕРОМ (сервер — единый источник правды) ===

// Преобразовать операцию из формата сервера во фронтовый.
// Сервер хранит кошелёк как wallet_id (uuid) → переводим в имя кошелька.
function mapServerOp(s) {
    const byId = window.walletNameById || {};
    return {
        id: s.id,                 // uuid (строка) — он же серверный id
        _server_id: s.id,
        type: s.type,
        amount: Number(s.amount) || 0,
        category: s.category || '',
        wallet: s.wallet_id ? (byId[s.wallet_id] || '') : '',
        walletFrom: s.wallet_from_id ? (byId[s.wallet_from_id] || '') : '',
        walletTo: s.wallet_to_id ? (byId[s.wallet_to_id] || '') : '',
        comment: s.comment || '',
        purpose: s.purpose || '',
        date: s.date,
        article_id: s.article_id || null,
        direction_id: s.direction_id || null,
        contragent_id: s.contragent_id || null,
        created_at: s.created_at || s.date,   // время создания — для сортировки внутри одного дня
        _demo: !!s.is_demo
    };
}

// Загрузить операции с сервера и сделать их текущим списком.
// Вызывается при старте в онлайне — десктоп и телефон видят одно и то же.
async function loadServerOperations() {
    if (typeof API === 'undefined' || !API.isOnline()) return false;
    try {
        const res = await API.getServerOperations();
        if (!res || !Array.isArray(res.operations)) return false;
        // Операции до даты начала учёта не показываем нигде (баланс/список/аналитика/отчёт)
        operations = res.operations.map(mapServerOp).filter(isWithinAccounting);
        isDemo = serverIsDemo;
        Storage.save('mycash_ops', operations);
        Storage.save('mycash_is_demo', isDemo);
        // Демо-баннер — по серверному флагу is_demo (из API.auth), а не по localStorage
        const b1 = document.getElementById('demoBanner');
        const b2 = document.getElementById('demoBannerProfile');
        if (b1) b1.classList.toggle('active', isDemo);
        if (b2) b2.classList.toggle('active', isDemo);
        renderAll();
        refreshIconsSoon();   // страховка от гонки загрузки Lucide в webview Telegram
        console.log('Операции загружены с сервера:', operations.length);
        return true;
    } catch (e) {
        console.warn('Не удалось загрузить операции с сервера:', e);
        return false;
    }
}
window.loadServerOperations = loadServerOperations;

// === ИНИЦИАЛИЗАЦИЯ ===
function init() {
    const data = Storage.load('mycash_ops');
    const demoFlag = Storage.load('mycash_is_demo');

    if (!data || data.length === 0) {
        // Первый запуск — демо-данные
        operations = generateDemoData();
        isDemo = true;
        Storage.save('mycash_ops', operations);
        Storage.save('mycash_is_demo', true);
    } else if (demoFlag === true) {
        // Демо-пользователь: перегенерируем демо (чтобы даты всегда были
        // актуальны), но сохраняем все реальные операции пользователя
        // (те что без флага _demo — добавленные вручную).
        const userOps = data.filter(function(op) { return !op._demo; });
        const freshDemo = generateDemoData();
        operations = userOps.concat(freshDemo);
        isDemo = true;
        Storage.save('mycash_ops', operations);
    } else {
        operations = data;
        isDemo = false;
    }

    if (isDemo) {
        document.getElementById('demoBanner').classList.add('active');
        document.getElementById('demoBannerProfile').classList.add('active');
    }

    renderAll();
}

function renderAll() {
    updateBalance();
    updateSummary();
    renderOperations();
    updateDashboard();
    updateRefCounts();
    refreshIcons();
}

// === БАЛАНС ПО КОШЕЛЬКАМ ===
function updateBalance() {
    const bal = computeWalletBalances();
    let total = 0;
    Object.keys(bal).forEach(function(name) { total += bal[name]; });
    document.getElementById('balanceTotal').textContent = fmt(total) + ' ₽';
    // Плашки кошельков рендерятся динамически
    renderWalletsRow();
}

// === ИТОГИ ЗА ПЕРИОД ===
function updateSummary() {
    const filtered = filterByPeriod(operations);
    let income = 0, expense = 0;
    filtered.forEach(op => {
        if (op.type === 'income') income += op.amount;
        else if (op.type === 'expense') expense += op.amount;
    });
    document.getElementById('totalIncome').textContent = '+' + fmt(income) + ' ₽';
    document.getElementById('totalExpense').textContent = '-' + fmt(expense) + ' ₽';
}

let customFrom = null;
let customTo = null;
let dashTab = 'expense'; // 'expense' или 'income'
let dashGroupBy = 'article'; // 'article' (по статьям) или 'direction' (по направлениям)

// Ключ/имя/иконка группы для операции в аналитике (зависит от dashGroupBy)
function dashGroupOf(op) {
    if (dashGroupBy === 'direction') {
        const d = op.direction_id ? getDirectionById(op.direction_id) : null;
        return {
            key: op.direction_id || 'none',
            name: d ? d.name : 'Без направления',
            icon: (d && d.icon) ? d.icon : 'compass',
            color: (d && d.color) ? d.color : '#8E8E93'
        };
    }
    // по статьям ДДС (fallback на старую категорию для операций без article_id)
    const a = op.article_id ? getArticleById(op.article_id) : null;
    const name = a ? a.name : (op.category || 'Без статьи');
    const vis = articleVisual(a || { name: name });
    return {
        key: op.article_id || ('cat:' + (op.category || '')),
        name: name,
        icon: vis.icon,
        color: vis.color
    };
}

// Переключатель «По статьям / По направлениям»
function setDashGroup(mode) {
    dashGroupBy = mode;
    haptic('light');
    const ba = document.getElementById('dashGroupArticle');
    const bd = document.getElementById('dashGroupDirection');
    if (ba) ba.classList.toggle('active', mode === 'article');
    if (bd) bd.classList.toggle('active', mode === 'direction');
    updateDashboard();
}

// === ОТЧЁТ ДДС (виды деятельности × месяц) ===
let dashMode = 'charts';      // 'charts' (графики) | 'report' (отчёт ДДС)
let reportMonth = null;       // Date — 1-е число выбранного месяца отчёта
let ddsCollapsed = {};        // id вида деятельности → true, если раздел свёрнут
let accountingStart = null;     // Date — начало учёта (1-е число месяца) или null
let accountingStartStr = null;  // 'YYYY-MM-DD' — исходная строка с сервера
const RU_MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                   'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

function startOfThisMonth() {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
}

function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

// Установить дату начала учёта из ответа сервера ('YYYY-MM-DD' или null)
function setAccountingStartFromServer(str) {
    accountingStartStr = str || null;
    accountingStart = str ? new Date(str + 'T00:00:00') : null;
}

// Попадает ли операция в учётный период (>= даты начала учёта)
function isWithinAccounting(op) {
    if (!accountingStart) return true;
    return new Date(op.date) >= accountingStart;
}

// Переключатель режима: Графики / Отчёт ДДС
function setDashMode(mode) {
    dashMode = mode;
    haptic('light');
    const bc = document.getElementById('dashModeCharts');
    const br = document.getElementById('dashModeReport');
    if (bc) bc.classList.toggle('active', mode === 'charts');
    if (br) br.classList.toggle('active', mode === 'report');
    updateDashboard();
}

// Листание месяцев отчёта
function navReportMonth(delta) {
    if (!reportMonth) reportMonth = startOfThisMonth();
    const next = new Date(reportMonth.getFullYear(), reportMonth.getMonth() + delta, 1);
    // Не листаем раньше месяца начала учёта — там данных нет
    if (accountingStart && next < startOfMonth(accountingStart)) return;
    reportMonth = next;
    haptic('light');
    renderDdsReport();
}

function toggleDdsSection(id) {
    ddsCollapsed[id] = !ddsCollapsed[id];
    haptic('light');
    renderDdsReport();
}

// Вид деятельности операции (через её статью). null — если статьи/вида нет
function activityKindOf(op) {
    const a = op.article_id ? getArticleById(op.article_id) : null;
    if (a && a.activity_kind_id) {
        const k = Refs.activityKinds.find(function(x) { return x.id === a.activity_kind_id; });
        if (k) return k;
    }
    return null;
}

// Сумма значений объекта вида {имя счёта: число}
function sumValues(obj) {
    return Object.keys(obj).reduce(function(s, k) { return s + obj[k]; }, 0);
}

// Остаток по каждому счёту на дату (операции строго ДО dateExcl)
function walletBalancesBefore(dateExcl) {
    const bal = {};
    getActiveWallets().forEach(function(w) { bal[w.name] = Number(w.initial_balance) || 0; });
    operations.forEach(function(op) {
        if (new Date(op.date) >= dateExcl) return;
        if (op.type === 'income' && bal[op.wallet] != null) bal[op.wallet] += op.amount;
        else if (op.type === 'expense' && bal[op.wallet] != null) bal[op.wallet] -= op.amount;
        else if (op.type === 'transfer') {
            if (bal[op.walletTo] != null) bal[op.walletTo] += op.amount;
            if (bal[op.walletFrom] != null) bal[op.walletFrom] -= op.amount;
        }
    });
    return bal;
}

// Построение отчёта ДДС за выбранный месяц
function renderDdsReport() {
    const body = document.getElementById('ddsReportBody');
    if (!body) return;
    if (!reportMonth) reportMonth = startOfThisMonth();
    const start = new Date(reportMonth.getFullYear(), reportMonth.getMonth(), 1);
    const end = new Date(reportMonth.getFullYear(), reportMonth.getMonth() + 1, 1);

    const monthLabel = document.getElementById('ddsReportMonth');
    if (monthLabel) monthLabel.textContent = RU_MONTHS[start.getMonth()] + ' ' + start.getFullYear();

    // Остатки на начало месяца (итог = сумма по счетам — согласованно с главным экраном)
    const startByWallet = walletBalancesBefore(start);
    const startTotal = sumValues(startByWallet);

    // Множество имён счетов: операции по «чужому» счёту (старое демо) в деньги не входят —
    // так же, как на главном экране, иначе итог не сойдётся с разбивкой по счетам
    const walletNames = {};
    getActiveWallets().forEach(function(w) { walletNames[w.name] = true; });

    // Разделы по видам деятельности (без технической — переводы в потоки не входят)
    const kinds = (Refs.activityKinds || []).slice()
        .filter(function(k) { return k.code !== 'technical'; })
        .sort(function(a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });

    const sections = {};   // id вида → { name, order, flow, arts: {ключ: {name, amount}} }
    kinds.forEach(function(k) { sections[k.id] = { name: k.name, order: k.sort_order || 0, flow: 0, arts: {} }; });
    const NOKEY = '__none__';
    sections[NOKEY] = { name: 'Без статьи', order: 999, flow: 0, arts: {} };

    // Операции месяца, сгруппированные по виду деятельности → статье
    operations.forEach(function(op) {
        const d = new Date(op.date);
        if (d < start || d >= end) return;
        if (op.type === 'transfer') return;   // переводы — техническая операция, в потоки не входят
        if (!walletNames[op.wallet]) return;  // счёт не из списка — игнорируем (согласованность с остатками)
        const signed = op.type === 'income' ? op.amount : -op.amount;
        const k = activityKindOf(op);
        const secId = (k && sections[k.id]) ? k.id : NOKEY;
        const sec = sections[secId];
        const art = op.article_id ? getArticleById(op.article_id) : null;
        const artKey = op.article_id || ('cat:' + (op.category || ''));
        const artName = art ? art.name : (op.category || 'Без статьи');
        if (!sec.arts[artKey]) sec.arts[artKey] = { name: artName, amount: 0, vis: articleVisual(art || { name: artName }) };
        sec.arts[artKey].amount += signed;
        sec.flow += signed;
    });

    const change = Object.keys(sections).reduce(function(s, id) { return s + sections[id].flow; }, 0);
    const endByWallet = walletBalancesBefore(end);
    const endTotal = sumValues(endByWallet);   // = startTotal + change (сходится с разбивкой по счетам)

    const fmtSigned = function(v) { return (v >= 0 ? '+' : '−') + fmt(Math.abs(v)) + ' ₽'; };
    const wallets = getActiveWallets();
    let html = '';

    // Денег на начало + разбивка по счетам
    html += '<div class="dds-row dds-row-total"><span>Денег на начало</span><span>' + fmt(startTotal) + ' ₽</span></div>';
    wallets.forEach(function(w) {
        html += '<div class="dds-row dds-row-sub"><span>' + esc(w.name) + '</span><span>' + fmt(startByWallet[w.name] || 0) + ' ₽</span></div>';
    });

    // Разделы по видам деятельности
    const orderedIds = Object.keys(sections).sort(function(a, b) { return sections[a].order - sections[b].order; });
    orderedIds.forEach(function(id) {
        const sec = sections[id];
        const arts = Object.keys(sec.arts).map(function(k) { return sec.arts[k]; });
        if (arts.length === 0) return;   // пустой раздел не показываем
        const collapsed = !!ddsCollapsed[id];
        const flowColor = sec.flow >= 0 ? 'var(--green)' : 'var(--red)';
        html += '<div class="dds-row dds-row-section" onclick="toggleDdsSection(\'' + id + '\')">' +
            '<span><span class="dds-arrow" style="' + (collapsed ? '' : 'transform:rotate(90deg)') + '">›</span>' + esc(sec.name) + '</span>' +
            '<span style="color:' + flowColor + '">' + fmtSigned(sec.flow) + '</span></div>';
        if (!collapsed) {
            arts.sort(function(a, b) { return Math.abs(b.amount) - Math.abs(a.amount); });
            arts.forEach(function(a) {
                const c = a.amount >= 0 ? 'var(--green)' : 'var(--red)';
                const ic = lucideIcon(a.vis.icon, 15, a.vis.color);
                html += '<div class="dds-row dds-row-art"><span><span class="dds-art-ic">' + ic + '</span>' + esc(a.name) + '</span><span style="color:' + c + '">' + fmtSigned(a.amount) + '</span></div>';
            });
        }
    });

    // Изменение за месяц + денег на конец + разбивка по счетам
    html += '<div class="dds-row dds-row-total"><span>Изменение за месяц</span><span style="color:' + (change >= 0 ? 'var(--green)' : 'var(--red)') + '">' + fmtSigned(change) + '</span></div>';
    html += '<div class="dds-row dds-row-total"><span>Денег на конец</span><span>' + fmt(endTotal) + ' ₽</span></div>';
    wallets.forEach(function(w) {
        html += '<div class="dds-row dds-row-sub"><span>' + esc(w.name) + '</span><span>' + fmt(endByWallet[w.name] || 0) + ' ₽</span></div>';
    });

    body.innerHTML = html;
    refreshIcons();
}

function setPeriod(period, btn) {
    currentPeriod = period;
    customFrom = null;
    customTo = null;
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('customPeriodRow').style.display = 'none';
    haptic('light');
    updateSummary();
    renderOperations();
    updateDashboard();
}

// Произвольный период
function openCustomPeriod() {
    haptic('light');
    const row = document.getElementById('customPeriodRow');
    const isOpen = row.style.display !== 'none';
    row.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
        // Установить текущий месяц по умолчанию
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        document.getElementById('periodFrom').value = `${y}-${m}-01`;
        document.getElementById('periodTo').value = now.toISOString().split('T')[0];
    }
}

function applyCustomPeriod() {
    const from = document.getElementById('periodFrom').value;
    const to = document.getElementById('periodTo').value;
    if (!from || !to) return;
    customFrom = new Date(from + 'T00:00:00');
    customTo = new Date(to + 'T23:59:59');
    currentPeriod = 'custom';
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    haptic('success');
    updateSummary();
    renderOperations();
    updateDashboard();
}

// Переключатель расходы/доходы
function setDashTab(tab) {
    dashTab = tab;
    haptic('light');
    document.getElementById('dashTabExpense').style.background = tab === 'expense' ? 'var(--red)' : 'transparent';
    document.getElementById('dashTabExpense').style.color = tab === 'expense' ? 'white' : 'var(--text2)';
    document.getElementById('dashTabIncome').style.background = tab === 'income' ? 'var(--green)' : 'transparent';
    document.getElementById('dashTabIncome').style.color = tab === 'income' ? 'white' : 'var(--text2)';
    updateDashboard();
}

function filterByPeriod(ops) {
    const now = new Date();
    return ops.filter(op => {
        const d = new Date(op.date);
        if (currentPeriod === 'custom' && customFrom && customTo) {
            return d >= customFrom && d <= customTo;
        }
        if (currentPeriod === 'today') return d.toDateString() === now.toDateString();
        if (currentPeriod === 'week') {
            const week = new Date(now); week.setDate(week.getDate() - 7);
            return d >= week;
        }
        if (currentPeriod === 'month') {
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }
        if (currentPeriod === 'year') {
            return d.getFullYear() === now.getFullYear();
        }
        return true;
    });
}

// === ОПЕРАЦИИ — ОТОБРАЖЕНИЕ ===
// Метка «когда операция добавлена» (мс): created_at с сервера, иначе числовой id (Date.now())
function opAddedTs(op) {
    if (op.created_at) {
        const t = new Date(op.created_at).getTime();
        if (!isNaN(t)) return t;
    }
    return typeof op.id === 'number' ? op.id : 0;
}

// Сортировка списка: сначала по дате операции (новые сверху),
// при одинаковой дате — последняя добавленная сверху
function sortOpsForList(a, b) {
    const d = new Date(b.date) - new Date(a.date);
    if (d !== 0) return d;
    return opAddedTs(b) - opAddedTs(a);
}

function renderOperations() {
    const container = document.getElementById('operationsList');
    const filtered = filterByPeriod(operations).slice().sort(sortOpsForList);

    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="icon">📝</div><p>Пока нет операций.<br>Нажмите + чтобы добавить первую</p></div>';
        return;
    }

    container.innerHTML = filtered.map(op => {
        const catObj = [...EXPENSE_CATS, ...INCOME_CATS].find(c => c.name === op.category);
        let iconName = catObj ? catObj.icon : 'package';
        let iconColor = catObj ? catObj.color : '#8E8E93';
        let iconClass = op.type;
        let sign = op.type === 'income' ? '+' : '-';
        let walletText = op.wallet || '💳 Карта';
        let iconHtml = lucideIcon(iconName, 20, iconColor);

        if (op.type === 'transfer') {
            iconHtml = lucideIcon('arrow-left-right', 20, '#007AFF');
            sign = '';
            walletText = (op.walletFrom || '💳 Карта') + ' → ' + (op.walletTo || '💵 Наличка');
        }

        const dateStr = formatDate(op.date);
        // Подпись: назначение платежа · комментарий · дата · кошелёк
        const parts = [];
        if (op.purpose) parts.push(esc(op.purpose));
        if (op.comment) parts.push(esc(op.comment));
        parts.push(dateStr);
        parts.push(esc(walletText));
        const subtitle = parts.join(' · ');

        return `
            <div class="op-item" data-id="${op.id}"
                 onclick="openEdit('${op.id}')"
                 ontouchstart="swipeStart(event)" ontouchmove="swipeMove(event)" ontouchend="swipeEnd(event)">
                <div class="op-swipe-actions">
                    <button class="op-swipe-btn edit" onclick="event.stopPropagation(); openEdit('${op.id}')"><i data-lucide="pencil" style="width:16px;height:16px;color:white"></i><br>Изменить</button>
                    <button class="op-swipe-btn delete" onclick="event.stopPropagation(); deleteOperation('${op.id}')"><i data-lucide="trash-2" style="width:16px;height:16px;color:white"></i><br>Удалить</button>
                </div>
                <div class="op-icon ${iconClass}">${iconHtml}</div>
                <div class="op-info">
                    <div class="op-category">${op.type === 'transfer' ? 'Перевод' : esc(op.category)}</div>
                    <div class="op-comment">${subtitle}</div>
                </div>
                <div class="op-right">
                    <div class="op-amount ${iconClass}">${sign}${fmt(op.amount)} ₽</div>
                </div>
            </div>`;
    }).join('');
}

// === СВАЙП ДЛЯ УДАЛЕНИЯ ===
let swipeStartX = 0;
let swipeCurrentItem = null;
let swiped = false;

function swipeStart(e) {
    swipeStartX = e.touches[0].clientX;
    swipeCurrentItem = e.currentTarget;
    swiped = false;
}

function swipeMove(e) {
    if (!swipeCurrentItem) return;
    const dx = e.touches[0].clientX - swipeStartX;
    if (dx < -20) {
        swiped = true;
        const offset = Math.min(160, Math.abs(dx));
        swipeCurrentItem.style.transform = `translateX(-${offset}px)`;
        swipeCurrentItem.querySelector('.op-swipe-actions').style.transform = `translateX(${160 - offset}px)`;
        e.preventDefault();
    }
}

function swipeEnd(e) {
    if (!swipeCurrentItem) return;
    const dx = e.changedTouches[0].clientX - swipeStartX;
    if (dx < -80) {
        // Показать кнопки редактирования и удаления
        swipeCurrentItem.style.transform = 'translateX(-160px)';
        swipeCurrentItem.querySelector('.op-swipe-actions').style.transform = 'translateX(0)';
    } else {
        swipeCurrentItem.style.transform = '';
        swipeCurrentItem.querySelector('.op-swipe-actions').style.transform = 'translateX(160px)';
    }
    swipeCurrentItem = null;
}

// Закрыть свайп при тапе в другое место
document.addEventListener('touchstart', function(e) {
    document.querySelectorAll('.op-item').forEach(item => {
        if (!item.contains(e.target)) {
            item.style.transform = '';
            const actions = item.querySelector('.op-swipe-actions');
            if (actions) actions.style.transform = 'translateX(160px)';
        }
    });
});

function deleteOperation(id) {
    const doDelete = () => {
        // Запоминаем _server_id перед удалением (для отправки на сервер)
        const op = operations.find(function(o) { return String(o.id) === String(id); });
        const serverId = op && op._server_id;

        operations = operations.filter(op => String(op.id) !== String(id));
        Storage.save('mycash_ops', operations);
        haptic('success');
        renderAll();

        // Удаление на сервере, если операция была синхронизирована
        if (serverId && typeof API !== 'undefined') {
            API.deleteOperation(serverId).then(function() {
                console.log('Операция удалена на сервере:', serverId);
            }).catch(function(e) {
                console.warn('Не удалось удалить операцию на сервере:', e.message);
            });
        }
    };
    if (confirm('Удалить эту операцию?')) doDelete();
}

// === МОДАЛЬНОЕ ОКНО: БЫСТРЫЙ ВВОД ===
function openModal() {
    haptic('light');
    document.getElementById('modalOverlay').classList.add('active');
    document.getElementById('amountInput').value = '';
    document.getElementById('amountDisplay').innerHTML = '0 <span class="amount-currency">₽</span>';
    document.getElementById('amountDisplay').classList.add('placeholder');
    document.getElementById('extendedForm').classList.remove('active');
    // Сброс необязательных полей
    document.getElementById('purposeInput').value = '';
    document.getElementById('commentInput').value = '';
    document.getElementById('dateInput').value = new Date().toISOString().split('T')[0];
    // Дефолтный кошелёк: последний использованный (если ещё существует) иначе первый активный
    const walletNames = getActiveWallets().map(function(w) { return w.name; });
    const lastWallet = Storage.load('mycash_last_wallet');
    selectedWallet = (lastWallet && walletNames.indexOf(lastWallet) >= 0) ? lastWallet : (walletNames[0] || '');
    // Дефолтные кошельки для перевода
    transferFrom = walletNames[0] || '';
    transferTo = walletNames[1] || walletNames[0] || '';
    renderWalletSwitch();
    populateFormSelects();
    setType('expense');
    setTimeout(() => document.getElementById('amountInput').focus(), 300);
}

// Заполнить выпадающие списки направлений и контрагентов в форме
function populateFormSelects() {
    const dirSel = document.getElementById('directionSelect');
    if (dirSel) {
        dirSel.innerHTML = '<option value="">— не указано —</option>' +
            Refs.directions.filter(function(d) { return !d.is_archived; }).map(function(d) {
                return '<option value="' + d.id + '">' + esc(d.name) + '</option>';
            }).join('');
    }
    const cgSel = document.getElementById('contragentSelect');
    if (cgSel) {
        cgSel.innerHTML = '<option value="">— не указано —</option>' +
            Refs.contragents.filter(function(c) { return !c.is_archived; }).map(function(c) {
                return '<option value="' + c.id + '">' + esc(c.name) + '</option>';
            }).join('');
    }
}

function closeModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('modalOverlay').classList.remove('active');
}

function focusAmount() {
    document.getElementById('amountInput').focus();
}

function updateAmountDisplay() {
    const val = document.getElementById('amountInput').value;
    const display = document.getElementById('amountDisplay');
    if (val && parseInt(val) > 0) {
        display.innerHTML = fmt(parseInt(val)) + ' <span class="amount-currency">₽</span>';
        display.classList.remove('placeholder');
    } else {
        display.innerHTML = '0 <span class="amount-currency">₽</span>';
        display.classList.add('placeholder');
    }
}

function renderWalletSwitch() {
    const container = document.getElementById('walletSwitch');
    const wallets = getActiveWallets();
    container.innerHTML = wallets.map(function(w) {
        const active = w.name === selectedWallet ? 'active' : '';
        return '<button class="wallet-btn ' + active + '" onclick="selectWallet(\'' + w.name.replace(/'/g, "\\'") + '\')">' + esc(w.name) + '</button>';
    }).join('');
}

function selectWallet(w) {
    selectedWallet = w;
    haptic('light');
    renderWalletSwitch();
}

// === БЫСТРЫЕ КАТЕГОРИИ (2 тапа!) ===
function renderQuickCats() {
    const cats = currentType === 'expense' ? EXPENSE_CATS : INCOME_CATS;
    document.getElementById('quickCats').innerHTML = cats.map(c =>
        `<button class="quick-cat" onclick="quickSave('${c.name}')">
            <div class="quick-cat-icon">${lucideIcon(c.icon, 22, c.color)}</div>
            <div class="quick-cat-name">${c.name}</div>
        </button>`
    ).join('');
    refreshIcons();
}

// Быстрое сохранение: тап на категорию = сохранено!
function quickSave(category) {
    const v = validateAmount(document.getElementById('amountInput').value);
    if (!v.ok) {
        haptic('error');
        document.getElementById('amountDisplay').style.color = 'var(--red)';
        setTimeout(() => { document.getElementById('amountDisplay').style.color = ''; }, 500);
        return;
    }
    const amount = v.amount;

    const op = {
        id: Date.now(),
        type: 'expense',
        amount: amount,
        category: category,
        wallet: selectedWallet,
        comment: '',
        date: new Date().toISOString()
    };
    operations.unshift(op);
    Storage.save('mycash_ops', operations);
    Storage.save('mycash_last_wallet', selectedWallet);

    haptic('success');
    document.getElementById('modalOverlay').classList.remove('active');
    renderAll();

    // Отправка на сервер (фоном, не блокирует UI)
    sendOperationToServer(op);
}

// Отправка операции на сервер. Обновляет op._server_id если успех.
async function sendOperationToServer(op) {
    if (typeof API === 'undefined') return;
    try {
        const walletId = window.getWalletId ? window.getWalletId(op.wallet) : null;
        const walletFromId = window.getWalletId && op.walletFrom ? window.getWalletId(op.walletFrom) : null;
        const walletToId = window.getWalletId && op.walletTo ? window.getWalletId(op.walletTo) : null;

        const payload = {
            type: op.type,
            amount: op.amount,
            category: op.category || null,
            wallet_id: walletId,
            wallet_from_id: walletFromId,
            wallet_to_id: walletToId,
            comment: op.comment || '',
            date: op.date,
            // Новые поля структуры ДДС
            article_id: op.article_id || null,
            direction_id: op.direction_id || null,
            contragent_id: op.contragent_id || null,
            purpose: op.purpose || ''
        };

        const result = await API.createOperation(payload);
        if (result && result.id) {
            op._server_id = result.id;
            Storage.save('mycash_ops', operations);
            console.log('Операция отправлена на сервер:', result.id);
        }
    } catch (e) {
        console.warn('Не удалось отправить операцию на сервер:', e.message);
    }
}

// === РАСШИРЕННАЯ ФОРМА ===
function toggleExtended() {
    document.getElementById('extendedForm').classList.toggle('active');
}

function setType(type) {
    currentType = type;
    haptic('light');
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector('.' + type + '-btn');
    if (btn) btn.classList.add('active');
    const articlesArea = document.getElementById('articlesArea');
    const transferArea = document.getElementById('transferArea');
    if (type === 'transfer') {
        articlesArea.style.display = 'none';
        transferArea.style.display = 'block';
        document.getElementById('transferFrom').textContent = transferFrom;
        document.getElementById('transferTo').textContent = transferTo;
    } else {
        articlesArea.style.display = 'block';
        transferArea.style.display = 'none';
        renderQuickArticles();
    }
}

// Рендер статей ДДС (отфильтрованных по типу) — тап = сохранение
function renderQuickArticles() {
    const arts = articlesForType(currentType);
    const box = document.getElementById('quickArticles');
    if (!box) return;
    if (!arts.length) {
        // Статьи ещё не загрузились — пробуем дозагрузить с сервера и перерисовать
        const online = (typeof API !== 'undefined' && API.isOnline());
        if (online && !Refs._reloading) {
            Refs._reloading = true;
            box.innerHTML = '<div style="padding:12px;color:var(--text2);font-size:13px;text-align:center;grid-column:1/-1">Загружаю статьи…</div>';
            loadReferences().then(function() {
                Refs._reloading = false;
                const overlay = document.getElementById('modalOverlay');
                if (overlay && overlay.classList.contains('active')) renderQuickArticles();
            });
            return;
        }
        box.innerHTML = '<div style="padding:12px;color:var(--text2);font-size:13px;text-align:center;grid-column:1/-1">Статьи не загружены.<br>Откройте приложение при наличии интернета.</div>';
        return;
    }
    // Единый стиль со страницей редактирования — текстовые пилюли (cat-chip) в 2 ряда
    box.innerHTML = arts.map(function(a) {
        return '<button class="cat-chip" onclick="quickSaveArticle(\'' + a.id + '\')">' + esc(a.name) + '</button>';
    }).join('');
}

// Сохранение операции по тапу на статью (с учётом полей из «Подробнее»)
function quickSaveArticle(articleId) {
    const v = validateAmount(document.getElementById('amountInput').value);
    if (!v.ok) {
        haptic('error');
        const disp = document.getElementById('amountDisplay');
        disp.style.color = 'var(--red)';
        setTimeout(function() { disp.style.color = ''; }, 500);
        return;
    }
    const article = getArticleById(articleId);
    if (!article) { haptic('error'); return; }
    // Тип операции определяется группой статьи (Поступление=доход / Выбытие=расход)
    const grp = Refs.groups.find(function(g) { return g.id === article.group_id; });
    const type = (grp && grp.code === 'inflow') ? 'income' : 'expense';
    const dateVal = document.getElementById('dateInput').value;

    const op = {
        id: Date.now(),
        type: type,
        amount: v.amount,
        category: article.name,               // для совместимости со старым отображением
        article_id: article.id,
        direction_id: document.getElementById('directionSelect').value || null,
        contragent_id: document.getElementById('contragentSelect').value || null,
        purpose: document.getElementById('purposeInput').value || '',
        wallet: selectedWallet,
        comment: document.getElementById('commentInput').value || '',
        date: dateVal ? (dateVal + 'T12:00:00') : new Date().toISOString()
    };
    operations.unshift(op);
    Storage.save('mycash_ops', operations);
    Storage.save('mycash_last_wallet', selectedWallet);
    haptic('success');
    document.getElementById('modalOverlay').classList.remove('active');
    renderAll();
    sendOperationToServer(op);
}

// Сохранение перевода между кошельками
function saveTransfer() {
    const v = validateAmount(document.getElementById('amountInput').value);
    if (!v.ok) { haptic('error'); return; }
    if (transferFrom === transferTo) { haptic('error'); alert('Выберите разные кошельки для перевода'); return; }
    const dateVal = document.getElementById('dateInput').value;
    const op = {
        id: Date.now(),
        type: 'transfer',
        amount: v.amount,
        category: 'Перевод',
        wallet: transferFrom,
        walletFrom: transferFrom,
        walletTo: transferTo,
        purpose: document.getElementById('purposeInput').value || '',
        comment: document.getElementById('commentInput').value || '',
        date: (dateVal || new Date().toISOString().split('T')[0]) + 'T12:00:00'
    };
    operations.unshift(op);
    Storage.save('mycash_ops', operations);
    haptic('success');
    document.getElementById('modalOverlay').classList.remove('active');
    renderAll();
    sendOperationToServer(op);
}

// Общая функция рендера категорий (для ввода и редактирования)
function renderCatGrid(containerId, type, selected, onClickTemplate) {
    const cats = type === 'expense' ? EXPENSE_CATS : INCOME_CATS;
    document.getElementById(containerId).innerHTML = cats.map(c =>
        `<button class="cat-chip ${c.name === selected ? 'active' : ''}" onclick="${onClickTemplate(c.name)}">${lucideIcon(c.icon, 16, c.color)} ${c.name}</button>`
    ).join('');
    refreshIcons();
}

function renderExtCats() {
    renderCatGrid('extCatGrid', currentType, selectedCategory, (name) => `selectExtCat('${name}')`);
}

function selectExtCat(cat) {
    selectedCategory = cat;
    haptic('light');
    renderExtCats();
}

function swapTransfer() {
    [transferFrom, transferTo] = [transferTo, transferFrom];
    document.getElementById('transferFrom').textContent = transferFrom;
    document.getElementById('transferTo').textContent = transferTo;
    haptic('light');
}

// Перебор кошельков для перевода (тап по кошельку → следующий)
function cycleTransfer(which) {
    const names = getActiveWallets().map(function(w) { return w.name; });
    if (!names.length) return;
    if (which === 'from') {
        const i = names.indexOf(transferFrom);
        transferFrom = names[(i + 1) % names.length];
    } else {
        const i = names.indexOf(transferTo);
        transferTo = names[(i + 1) % names.length];
    }
    document.getElementById('transferFrom').textContent = transferFrom;
    document.getElementById('transferTo').textContent = transferTo;
    haptic('light');
}

function saveExtended() {
    const v = validateAmount(document.getElementById('amountInput').value);
    if (!v.ok) { haptic('error'); return; }
    const amount = v.amount;

    let newOp;
    if (currentType === 'transfer') {
        newOp = {
            id: Date.now(),
            type: 'transfer',
            amount: amount,
            category: 'Перевод',
            wallet: transferFrom,
            walletFrom: transferFrom,
            walletTo: transferTo,
            comment: document.getElementById('commentInput').value || '',
            date: (document.getElementById('dateInput').value || new Date().toISOString().split('T')[0]) + 'T12:00:00'
        };
        operations.unshift(newOp);
    } else {
        if (!selectedCategory) {
            haptic('error');
            return;
        }
        const dateVal = document.getElementById('dateInput').value;
        newOp = {
            id: Date.now(),
            type: currentType,
            amount: amount,
            category: selectedCategory,
            wallet: selectedWallet,
            comment: document.getElementById('commentInput').value || '',
            date: (dateVal || new Date().toISOString().split('T')[0]) + 'T12:00:00'
        };
        operations.unshift(newOp);
    }

    Storage.save('mycash_ops', operations);
    Storage.save('mycash_last_wallet', selectedWallet);
    haptic('success');
    document.getElementById('modalOverlay').classList.remove('active');
    renderAll();

    // Отправка на сервер в фоне
    sendOperationToServer(newOp);
}

// === ДАШБОРД ===
let dashExpenses = []; // сохраняем для раскрытия категорий

function updateDashboard() {
    // Режим отчёта ДДС — рисуем отчёт, графики прячем
    if (dashMode === 'report') {
        const inline = document.getElementById('dashboardInline');
        if (inline) inline.style.display = 'none';
        const rw = document.getElementById('ddsReportWrap');
        if (rw) rw.style.display = 'block';
        renderDdsReport();
        return;
    }
    const rw0 = document.getElementById('ddsReportWrap');
    if (rw0) rw0.style.display = 'none';

    const filtered = filterByPeriod(operations);
    const isExpense = dashTab === 'expense';
    dashExpenses = filtered.filter(op => op.type === (isExpense ? 'expense' : 'income'));

    if (dashExpenses.length === 0) {
        document.getElementById('dashboardInline').style.display = 'none';
        return;
    }
    document.getElementById('dashboardInline').style.display = 'block';

    // Группировка операций по выбранному измерению (статьи / направления)
    const groups = {};   // key → { name, icon, amount, ops: [] }
    dashExpenses.forEach(op => {
        const g = dashGroupOf(op);
        if (!groups[g.key]) groups[g.key] = { name: g.name, icon: g.icon, color: g.color, amount: 0, ops: [] };
        groups[g.key].amount += op.amount;
        groups[g.key].ops.push(op);
    });
    const sorted = Object.values(groups).sort((a, b) => b.amount - a.amount);
    const total = sorted.reduce((s, g) => s + g.amount, 0);

    // Обновить итого справа от табов
    const totalLabel = document.getElementById('dashTotalLabel');
    totalLabel.textContent = fmt(total) + ' ₽';
    totalLabel.style.color = isExpense ? 'var(--red)' : 'var(--green)';

    // Вариант 4 — Горизонтальные полоски
    const canvas = document.getElementById('pieChart');
    canvas.style.display = 'none'; // скрываем canvas
    window._chartData = null;

    // Создаём или обновляем контейнер полосок
    let barsContainer = document.getElementById('dashBars');
    if (!barsContainer) {
        barsContainer = document.createElement('div');
        barsContainer.id = 'dashBars';
        canvas.parentNode.insertBefore(barsContainer, canvas);
    }
    barsContainer.style.width = '100%';

    const maxAmount = sorted[0] ? sorted[0].amount : 1;

    barsContainer.innerHTML = sorted.map((g, i) => {
        const amount = g.amount;
        const pct = Math.round(amount / total * 100);
        const barWidth = Math.round((amount / maxAmount) * 100);
        // Цвет полоски и значка — закреплён за статьёй/направлением (одинаков на всех экранах)
        const color = g.color || chartColors[i % chartColors.length];
        const icon = lucideIcon(g.icon, 18, color);

        return `<div style="margin-bottom:12px;cursor:pointer" onclick="toggleCatOps(${i})">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
                <div style="display:flex;align-items:center;gap:6px">
                    <span style="font-size:16px">${icon}</span>
                    <span style="font-size:13px;font-weight:500">${esc(g.name)}</span>
                    <span class="dash-legend-arrow" id="dashArrow${i}" style="font-size:12px;color:var(--text2);transition:transform 0.2s">›</span>
                </div>
                <div style="display:flex;align-items:baseline;gap:4px">
                    <span style="font-size:14px;font-weight:600">${fmt(amount)} ₽</span>
                    <span style="font-size:11px;color:var(--text2)">${pct}%</span>
                </div>
            </div>
            <div style="height:8px;background:var(--bg);border-radius:4px;overflow:hidden">
                <div style="height:100%;width:${barWidth}%;background:${color};border-radius:4px;transition:width 0.4s ease"></div>
            </div>
        </div>
        <div class="dash-cat-ops" id="dashCatOps${i}">${
            g.ops.map(op => {
                const dateStr = formatDate(op.date);
                const comment = op.comment ? esc(op.comment) + ' · ' : '';
                const wallet = op.wallet || '💳 Карта';
                return `<div class="dash-cat-op" onclick="event.stopPropagation(); openEdit('${op.id}')" style="cursor:pointer">
                    <span class="dash-cat-op-left">${comment}${dateStr} · ${esc(wallet)}</span>
                    <div style="display:flex;align-items:center;gap:8px">
                        <span class="dash-cat-op-amount" style="color:${isExpense ? 'var(--red)' : 'var(--green)'}">${isExpense ? '-' : '+'}${fmt(op.amount)} ₽</span>
                        <i data-lucide="pencil" style="width:14px;height:14px;color:var(--text2);flex-shrink:0"></i>
                    </div>
                </div>`;
            }).join('')
        }</div>`;
    }).join('');

    // Легенда скрыта — всё уже в полосках выше
    document.getElementById('dashLegend').innerHTML = '';
    refreshIcons();
}

function toggleCatOps(index) {
    haptic('light');
    const ops = document.getElementById('dashCatOps' + index);
    const arrow = document.getElementById('dashArrow' + index);
    ops.classList.toggle('open');
    arrow.classList.toggle('open');
}

// Рисуем диаграмму (selectedIdx = -1 — ничего не выделено)
let selectedChartIdx = -1;

function drawChart(sorted, total, cx, cy, outerR, innerR, size, ctx, selectedIdx) {
    ctx.clearRect(0, 0, size, size);
    let startAngle = -Math.PI / 2;

    // Тень
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.10)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR + 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200,200,200,0.01)';
    ctx.fill();
    ctx.restore();

    sorted.forEach(([cat, amount], i) => {
        const slice = (amount / total) * Math.PI * 2;
        const color = chartColors[i % chartColors.length];
        const isSelected = (i === selectedIdx);
        const isOther = (selectedIdx >= 0 && i !== selectedIdx);

        // Выделенный сегмент "вылетает" наружу
        const offset = isSelected ? 10 : 0;
        const midAngle = startAngle + slice / 2;
        const offX = offset * Math.cos(midAngle);
        const offY = offset * Math.sin(midAngle);
        const drawR = isSelected ? outerR + 4 : outerR;

        ctx.globalAlpha = isOther ? 0.35 : 1;

        ctx.beginPath();
        ctx.arc(cx + offX, cy + offY, drawR, startAngle, startAngle + slice);
        ctx.arc(cx + offX, cy + offY, innerR, startAngle + slice, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();

        ctx.globalAlpha = 1;
        startAngle += slice;
    });

    // Белый центр
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    // Текст в центре
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (selectedIdx >= 0) {
        const selCat = sorted[selectedIdx];
        const selPct = Math.round(selCat[1] / total * 100);
        ctx.fillStyle = chartColors[selectedIdx % chartColors.length];
        ctx.font = 'bold 22px -apple-system, sans-serif';
        ctx.fillText(fmt(selCat[1]) + ' ₽', cx, cy - 8);
        ctx.fillStyle = '#8E8E93';
        ctx.font = '11px -apple-system, sans-serif';
        ctx.fillText(selCat[0] + ' · ' + selPct + '%', cx, cy + 12);
    } else {
        ctx.fillStyle = '#1C1C1E';
        ctx.font = 'bold 18px -apple-system, sans-serif';
        ctx.fillText(fmt(total) + ' ₽', cx, cy - 6);
        ctx.fillStyle = '#8E8E93';
        ctx.font = '11px -apple-system, sans-serif';
        ctx.fillText('расходы', cx, cy + 14);
    }
}

// Тап по диаграмме — определяем сегмент
document.getElementById('pieChart').addEventListener('click', function(e) {
    const d = window._chartData;
    if (!d) return;

    const rect = this.getBoundingClientRect();
    const x = e.clientX - rect.left - d.cx;
    const y = e.clientY - rect.top - d.cy;
    const dist = Math.sqrt(x * x + y * y);

    // Клик внутри кольца?
    if (dist < d.innerR || dist > d.outerR + 10) {
        // Сбросить выделение
        selectedChartIdx = -1;
        const canvas = document.getElementById('pieChart');
        const ctx = canvas.getContext('2d');
        const dprr = window.devicePixelRatio || 1;
        ctx.setTransform(dprr, 0, 0, dprr, 0, 0);
        drawChart(d.sorted, d.total, d.cx, d.cy, d.outerR, d.innerR, d.size, ctx, -1);
        haptic('light');
        return;
    }

    // Определяем угол
    let angle = Math.atan2(y, x);
    if (angle < -Math.PI / 2) angle += Math.PI * 2;
    let cumAngle = -Math.PI / 2;

    for (let i = 0; i < d.sorted.length; i++) {
        const slice = (d.sorted[i][1] / d.total) * Math.PI * 2;
        if (angle >= cumAngle && angle < cumAngle + slice) {
            selectedChartIdx = (selectedChartIdx === i) ? -1 : i;
            const canvas = document.getElementById('pieChart');
            const ctx = canvas.getContext('2d');
            const dprr = window.devicePixelRatio || 1;
            ctx.setTransform(dprr, 0, 0, dprr, 0, 0);
            drawChart(d.sorted, d.total, d.cx, d.cy, d.outerR, d.innerR, d.size, ctx, selectedChartIdx);
            haptic('light');

            // Раскрыть/закрыть категорию в легенде
            toggleCatOps(i);
            return;
        }
        cumAngle += slice;
    }
});

// === ОЧИСТКА ДЕМО-ДАННЫХ ===
async function clearDemoData() {
    haptic();
    serverIsDemo = false;   // сервер снимет is_demo — баннер должен исчезнуть
    try {
        await API.clearDemo();           // ручка /v1/user/clear-demo
        await loadReferences();          // справочники/счета
        await loadServerOperations();    // демо-операций не останется + снимет баннер
        renderAll();
    } catch (e) {
        alert('Не удалось очистить демо. Нужен интернет, попробуйте снова.');
    }
    // Страховка на случай оффлайна — спрятать баннер
    document.getElementById('demoBanner').classList.remove('active');
    document.getElementById('demoBannerProfile').classList.remove('active');
}

// === ГОЛОСОВОЙ ВВОД ===
let recognition = null;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = function(event) {
        const text = event.results[0][0].transcript;
        stopVoice();
        const parsed = parseCommand(text);
        if (parsed) {
            voiceParsedData = parsed;
            showVoiceConfirm(parsed);
        }
    };
    recognition.onerror = function() { stopVoice(); };
    recognition.onend = function() {
        document.getElementById('recordingIndicator').classList.remove('active');
    };
}

function startVoice() {
    if (!recognition) return;
    haptic();
    document.getElementById('recordingIndicator').classList.add('active');
    recognition.start();
}

function stopVoice() {
    if (recognition) recognition.stop();
    document.getElementById('recordingIndicator').classList.remove('active');
}

function showVoiceConfirm(data) {
    const sign = data.type === 'income' ? 'Доход' : 'Расход';
    document.getElementById('voiceParsed').textContent = `${sign} ${fmt(data.amount)} ₽ — ${data.category}`;
    document.getElementById('voiceConfirm').classList.add('active');
}

function closeVoiceConfirm() {
    document.getElementById('voiceConfirm').classList.remove('active');
    if (voiceParsedData) {
        openModal();
        document.getElementById('amountInput').value = voiceParsedData.amount;
        updateAmountDisplay();
        currentType = voiceParsedData.type;
    }
}

function confirmVoice() {
    if (!voiceParsedData) return;
    const op = {
        id: Date.now(),
        type: voiceParsedData.type,
        amount: voiceParsedData.amount,
        category: voiceParsedData.category,
        wallet: selectedWallet,
        comment: 'Голосовой ввод',
        date: new Date().toISOString()
    };
    operations.unshift(op);
    Storage.save('mycash_ops', operations);
    document.getElementById('voiceConfirm').classList.remove('active');
    voiceParsedData = null;
    haptic('success');
    renderAll();
}

// === ПАРСЕР ГОЛОСОВЫХ КОМАНД ===
function parseCommand(text) {
    text = text.toLowerCase().trim();
    let type = null;
    if (text.includes('расход') || text.includes('потратил') || text.includes('заплатил')) type = 'expense';
    else if (text.includes('доход') || text.includes('получил') || text.includes('заработал')) type = 'income';

    let amount = null;
    const wordNumbers = {
        'тысяч': 1000, 'тысячу': 1000, 'тысячи': 1000,
        'сто': 100, 'двести': 200, 'триста': 300, 'четыреста': 400, 'пятьсот': 500,
        'шестьсот': 600, 'семьсот': 700, 'восемьсот': 800, 'девятьсот': 900,
        'один': 1, 'одну': 1, 'два': 2, 'две': 2, 'три': 3, 'четыре': 4, 'пять': 5,
        'шесть': 6, 'семь': 7, 'восемь': 8, 'девять': 9, 'десять': 10,
        'одиннадцать': 11, 'двенадцать': 12, 'тринадцать': 13, 'четырнадцать': 14,
        'пятнадцать': 15, 'двадцать': 20, 'тридцать': 30, 'сорок': 40,
        'пятьдесят': 50, 'шестьдесят': 60, 'семьдесят': 70, 'восемьдесят': 80,
        'девяносто': 90
    };

    const digitMatch = text.match(/(\d[\d\s]*\d|\d+)/);
    if (digitMatch) {
        amount = parseInt(digitMatch[0].replace(/\s/g, ''));
    } else {
        const words = text.split(/\s+/);
        let total = 0, current = 0, hasNumber = false;
        for (const word of words) {
            if (wordNumbers[word] !== undefined) {
                hasNumber = true;
                const val = wordNumbers[word];
                if (val === 1000) {
                    current = current === 0 ? val : current * val;
                    total += current; current = 0;
                } else if (val >= 100) { current += val; }
                else { current += val; }
            }
        }
        total += current;
        if (hasNumber) amount = total;
    }

    // Ищем категорию
    const allCats = [...EXPENSE_CATS, ...INCOME_CATS];
    const allCatNames = allCats.map(c => c.name.toLowerCase());
    const words = text.split(/\s+/);
    let category = null;
    for (const word of words) {
        const idx = allCatNames.indexOf(word);
        if (idx !== -1) { category = allCats[idx].name; break; }
    }
    if (!category) {
        const skipWords = ['расход','доход','потратил','получил','заплатил','заработал','рублей','рубль','руб','тысяч','тысячу','тысячи','на','сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот','один','одну','два','две','три','четыре','пять','шесть','семь','восемь','девять','десять','двадцать','тридцать','сорок','пятьдесят'];
        for (let i = words.length - 1; i >= 0; i--) {
            if (!skipWords.includes(words[i]) && isNaN(words[i]) && words[i].length > 2) {
                category = words[i].charAt(0).toUpperCase() + words[i].slice(1);
                break;
            }
        }
    }

    if (type && amount) return { type, amount, category: category || 'Прочее' };
    return null;
}

// === КАРУСЕЛЬ АНАЛИТИКИ ===
let anCarPage = 0;
let anCarStartX = 0;

function anCarStart(e) { anCarStartX = e.touches[0].clientX; }

function anCarMove(e) {
    const dx = e.touches[0].clientX - anCarStartX;
    if (Math.abs(dx) > 15) {
        const track = document.getElementById('analyticsTrack');
        const offset = -anCarPage * 100 + (dx / track.parentElement.offsetWidth) * 100;
        track.style.transition = 'none';
        track.style.transform = `translateX(${offset}%)`;
        e.preventDefault();
    }
}

function anCarEnd(e) {
    const dx = e.changedTouches[0].clientX - anCarStartX;
    if (dx < -50 && anCarPage < 1) { anCarPage = 1; updateExpenseTable(); }
    else if (dx > 50 && anCarPage > 0) anCarPage = 0;
    const track = document.getElementById('analyticsTrack');
    track.style.transition = 'transform 0.3s ease';
    track.style.transform = `translateX(-${anCarPage * 100}%)`;
    document.getElementById('anDot0').classList.toggle('active', anCarPage === 0);
    document.getElementById('anDot1').classList.toggle('active', anCarPage === 1);
    haptic('light');
}

// === ТАБЛИЦА РАСХОДОВ ===
let tableMode = 'months'; // 'days' или 'months'

function setTableMode(mode) {
    tableMode = mode;
    haptic('light');
    document.getElementById('tableByDays').classList.toggle('active', mode === 'days');
    document.getElementById('tableByMonths').classList.toggle('active', mode === 'months');
    updateExpenseTable();
}

function updateExpenseTable() {
    const container = document.getElementById('expenseTableContainer');
    const isExpense = dashTab === 'expense';

    // Берём ВСЕ операции (не только за период) для полной таблицы
    const ops = operations.filter(op => op.type === (isExpense ? 'expense' : 'income'));

    if (ops.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text2)">Нет данных</div>';
        return;
    }

    // Группировка: строки = категории, столбцы = периоды (месяцы или дни)
    const periods = {};  // { "Апр 2026": { "Продукты": 5000, ... } }
    const allCats = new Set();

    ops.forEach(op => {
        const d = new Date(op.date);
        let periodKey;
        if (tableMode === 'days') {
            periodKey = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        } else {
            const monthNames = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
            periodKey = monthNames[d.getMonth()] + ' ' + d.getFullYear();
        }
        if (!periods[periodKey]) periods[periodKey] = {};
        periods[periodKey][op.category] = (periods[periodKey][op.category] || 0) + op.amount;
        allCats.add(op.category);
    });

    const catList = [...allCats];
    const periodKeys = Object.keys(periods);
    const amountColor = isExpense ? 'var(--red)' : 'var(--green)';

    // Строки = категории, столбцы = периоды
    // Шапка: Категория | Период1 | Период2 | ... | Итого
    let html = '<table class="expense-table"><thead><tr>';
    html += '<th>Категория</th>';
    periodKeys.forEach(p => {
        html += `<th style="text-align:right;white-space:nowrap">${p}</th>`;
    });
    html += '<th style="text-align:right">Итого</th>';
    html += '</tr></thead><tbody>';

    // Строки — по категориям
    const periodTotals = {};
    periodKeys.forEach(p => periodTotals[p] = 0);
    let grandTotal = 0;

    catList.forEach(cat => {
        const catObj = [...EXPENSE_CATS, ...INCOME_CATS].find(c => c.name === cat);
        const icon = catObj ? lucideIcon(catObj.icon, 18, catObj.color) : lucideIcon('package', 18, '#8E8E93');
        let catTotal = 0;

        html += '<tr>';
        html += `<td style="white-space:nowrap;font-weight:500">${icon} ${cat}</td>`;
        periodKeys.forEach(p => {
            const val = periods[p][cat] || 0;
            catTotal += val;
            periodTotals[p] += val;
            html += `<td style="text-align:right;color:${val ? amountColor : 'var(--border)'}">${val ? fmt(val) : '—'}</td>`;
        });
        grandTotal += catTotal;
        html += `<td style="text-align:right;color:${amountColor};font-weight:600">${fmt(catTotal)}</td>`;
        html += '</tr>';
    });

    // Итого по столбцам
    html += '<tr class="total-row">';
    html += '<td>Итого</td>';
    periodKeys.forEach(p => {
        html += `<td style="text-align:right;color:${amountColor}">${fmt(periodTotals[p])}</td>`;
    });
    html += `<td style="text-align:right;color:${amountColor}">${fmt(grandTotal)}</td>`;
    html += '</tr>';

    html += '</tbody></table>';
    container.innerHTML = html;
}

// === РЕДАКТИРОВАНИЕ КОШЕЛЬКА ===
// Цвета значка счёта (яркие — в новой модели color = цвет иконки, не фон карточки)
const WALLET_COLORS = [
    { name: 'Синий', color: '#007AFF' },
    { name: 'Индиго', color: '#5856D6' },
    { name: 'Зелёный', color: '#34C759' },
    { name: 'Оранжевый', color: '#FF9500' },
    { name: 'Розовый', color: '#FF2D55' },
    { name: 'Фиолетовый', color: '#AF52DE' },
    { name: 'Бирюзовый', color: '#5AC8FA' },
    { name: 'Жёлтый', color: '#FFCC00' }
];

let editingWalletId = null;   // id редактируемого счёта (с сервера)
let editWalletColor = '#007AFF';
let walletSaveBusy = false;   // защита от двойного сохранения

// Отрисовать палитру цветов значка (data-color — надёжное сравнение)
function renderWalletColorGrid() {
    document.getElementById('walletColorGrid').innerHTML = WALLET_COLORS.map(function(c) {
        return '<div class="wallet-color-btn ' + (c.color === editWalletColor ? 'active' : '') + '"' +
               ' data-color="' + c.color + '" style="background:' + c.color + '"' +
               ' onclick="selectWalletColor(\'' + c.color + '\')"></div>';
    }).join('');
}

function openWalletEdit(walletId) {
    const w = (Refs.wallets || []).find(function(x) { return String(x.id) === String(walletId); });
    if (!w) { return; }
    editingWalletId = w.id;
    editWalletColor = w.color || '#007AFF';
    haptic('light');

    document.getElementById('walletEditTitle').textContent = 'Настройки счёта';
    document.getElementById('walletEditName').value = w.name || '';
    document.getElementById('walletEditBalance').value = Number(w.initial_balance) || 0;
    const accInput = document.getElementById('walletEditAccStart');
    if (accInput) accInput.value = accountingStartStr ? accountingStartStr.slice(0, 7) : '';
    // Режим редактирования: дата начала учёта видна, кнопка удаления активна
    document.getElementById('walletAccStartGroup').style.display = '';
    const delBtn = document.getElementById('walletDeleteBtn');
    delBtn.style.display = '';
    delBtn.style.opacity = '1';
    delBtn.onclick = function() { deleteWallet(); };

    renderWalletColorGrid();
    document.getElementById('walletEditOverlay').classList.add('active');
}

// Открыть окно создания нового счёта
function openNewWallet() {
    haptic('light');
    editingWalletId = null;                 // null → режим создания
    editWalletColor = WALLET_COLORS[0].color;

    document.getElementById('walletEditTitle').textContent = 'Новый счёт';
    document.getElementById('walletEditName').value = '';
    document.getElementById('walletEditBalance').value = 0;
    // При создании дату начала учёта (общую) и удаление не показываем
    document.getElementById('walletAccStartGroup').style.display = 'none';
    document.getElementById('walletDeleteBtn').style.display = 'none';

    renderWalletColorGrid();
    document.getElementById('walletEditOverlay').classList.add('active');
    setTimeout(function() {
        const nameInput = document.getElementById('walletEditName');
        if (nameInput) nameInput.focus();
    }, 200);
}

function closeWalletEdit(e) {
    if (e && e.target && e.target !== e.currentTarget) return;
    document.getElementById('walletEditOverlay').classList.remove('active');
    editingWalletId = null;
}

function selectWalletColor(color) {
    editWalletColor = color;
    haptic('light');
    document.querySelectorAll('.wallet-color-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-color') === color);
    });
}

async function saveWalletEdit() {
    if (walletSaveBusy) return;
    const id = editingWalletId;   // null → создаём новый счёт

    const newName = document.getElementById('walletEditName').value.trim();
    if (!newName) { haptic('error'); return; }
    const newBalance = parseFloat(document.getElementById('walletEditBalance').value) || 0;

    // Остаток и настройки счёта храним на сервере (единый источник) — без сети сохранить нельзя
    if (typeof API === 'undefined' || !API.isOnline()) {
        haptic('error');
        alert('Нет связи с сервером. Счета сохраняются только онлайн — попробуйте позже.');
        return;
    }

    walletSaveBusy = true;
    try {
        if (!id) {
            // Создание нового счёта
            await API.createWallet({
                name: newName,
                icon: 'wallet',
                color: editWalletColor,
                initial_balance: newBalance
            });
            await loadReferences();
            haptic('success');
            closeWalletEdit();
            return;
        }

        // Редактирование существующего счёта
        // Дата начала учёта (общая для всех счетов): месяц из поля → 'YYYY-MM-01'
        const accInput = document.getElementById('walletEditAccStart');
        const newAccStr = (accInput && accInput.value) ? accInput.value + '-01' : null;
        const accChanged = (newAccStr !== accountingStartStr);

        await API.updateWallet(id, {
            name: newName,
            color: editWalletColor,
            initial_balance: newBalance
        });
        if (accChanged) await API.setAccountingStart(newAccStr);
        await loadReferences();   // перечитать счета + дату начала учёта (внутри вызывает renderAll)
        if (accChanged) await loadServerOperations();   // перефильтровать операции под новую дату
        haptic('success');
        closeWalletEdit();
    } catch (e) {
        haptic('error');
        alert('Не удалось сохранить: ' + (e && e.message ? e.message : 'ошибка'));
    } finally {
        walletSaveBusy = false;
    }
}

async function deleteWallet() {
    if (walletSaveBusy) return;
    const id = editingWalletId;
    if (!id) return;

    if (typeof API === 'undefined' || !API.isOnline()) {
        haptic('error');
        alert('Нет связи с сервером. Удаление счёта работает только онлайн.');
        return;
    }

    if (!confirm('Удалить этот счёт? Действие нельзя отменить.')) return;

    walletSaveBusy = true;
    try {
        await API.deleteWallet(id);
        await loadReferences();
        haptic('success');
        closeWalletEdit();
    } catch (e) {
        haptic('error');
        // Сервер запрещает удаление счёта с операциями (409) — показываем понятный текст
        alert(e && e.message ? e.message : 'Не удалось удалить счёт.');
    } finally {
        walletSaveBusy = false;
    }
}

// === МОДАЛКА "ОБНОВИТЬ ТАРИФ" ===
function showUpgrade() {
    haptic();
    document.getElementById('upgradeOverlay').classList.add('active');
}

function closeUpgrade(e) {
    if (e && e.target && e.target !== e.currentTarget) return;
    document.getElementById('upgradeOverlay').classList.remove('active');
}

// === РЕДАКТИРОВАНИЕ ОПЕРАЦИИ ===
let editingOpId = null;
let editType = 'expense';
let editWallet = '';
let editCategory = '';
let editArticleId = null;

function openEdit(id) {
    // Не открывать если был свайп
    if (swiped) return;

    const op = operations.find(o => String(o.id) === String(id));
    if (!op) return;

    editingOpId = id;
    editType = op.type === 'transfer' ? 'expense' : op.type;
    const walletNames = getActiveWallets().map(function(w) { return w.name; });
    editWallet = (op.wallet && walletNames.indexOf(op.wallet) >= 0) ? op.wallet : (walletNames[0] || '');
    editArticleId = op.article_id || null;
    editCategory = op.category || '';

    haptic('light');

    // Заполняем форму
    document.getElementById('editAmount').value = op.amount;
    document.getElementById('editDate').value = op.date ? op.date.split('T')[0] : new Date().toISOString().split('T')[0];
    document.getElementById('editComment').value = op.comment || '';
    document.getElementById('editPurpose').value = op.purpose || '';

    // Списки направлений и контрагентов + текущие значения
    populateEditSelects();
    document.getElementById('editDirectionSelect').value = op.direction_id || '';
    document.getElementById('editContragentSelect').value = op.contragent_id || '';

    // Тип (рендерит статьи и кошельки)
    setEditType(editType);

    document.getElementById('editOverlay').classList.add('active');
}

// Заполнить выпадающие списки в окне редактирования
function populateEditSelects() {
    const dirSel = document.getElementById('editDirectionSelect');
    if (dirSel) {
        dirSel.innerHTML = '<option value="">— не указано —</option>' +
            Refs.directions.filter(function(d) { return !d.is_archived; }).map(function(d) {
                return '<option value="' + d.id + '">' + esc(d.name) + '</option>';
            }).join('');
    }
    const cgSel = document.getElementById('editContragentSelect');
    if (cgSel) {
        cgSel.innerHTML = '<option value="">— не указано —</option>' +
            Refs.contragents.filter(function(c) { return !c.is_archived; }).map(function(c) {
                return '<option value="' + c.id + '">' + esc(c.name) + '</option>';
            }).join('');
    }
}

function closeEdit(e) {
    if (e && e.target && e.target !== e.currentTarget) return;
    document.getElementById('editOverlay').classList.remove('active');
    editingOpId = null;
}

function setEditType(type) {
    editType = type;
    document.getElementById('editExpBtn').classList.toggle('active', type === 'expense');
    document.getElementById('editIncBtn').classList.toggle('active', type === 'income');
    renderEditArticles();
    renderEditWallets();
}

function renderEditWallets() {
    const wallets = getActiveWallets();
    document.getElementById('editWalletGrid').innerHTML = wallets.map(function(w) {
        const active = w.name === editWallet ? 'active' : '';
        return '<button class="cat-chip ' + active + '" onclick="selectEditWallet(\'' + w.name.replace(/'/g, "\\'") + '\')">' + esc(w.name) + '</button>';
    }).join('');
}
function selectEditWallet(name) {
    editWallet = name;
    renderEditWallets();
    haptic('light');
}

// Статьи в окне редактирования (отфильтрованы по типу)
function renderEditArticles() {
    const arts = articlesForType(editType);
    const box = document.getElementById('editArticleGrid');
    if (!box) return;
    if (!arts.length) {
        box.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:6px">Статьи не загружены</div>';
        return;
    }
    box.innerHTML = arts.map(function(a) {
        const active = a.id === editArticleId ? 'active' : '';
        return '<button class="cat-chip ' + active + '" onclick="selectEditArticle(\'' + a.id + '\')">' + esc(a.name) + '</button>';
    }).join('');
}
function selectEditArticle(id) {
    editArticleId = id;
    renderEditArticles();
    haptic('light');
}

function saveEdit() {
    const v = validateAmount(document.getElementById('editAmount').value);
    if (!v.ok) { haptic('error'); return; }
    const amount = v.amount;

    const op = operations.find(o => String(o.id) === String(editingOpId));
    if (!op) return;

    const art = editArticleId ? getArticleById(editArticleId) : null;

    op.type = editType;
    op.amount = amount;
    op.wallet = editWallet;
    op.article_id = editArticleId || null;
    op.category = art ? art.name : (op.category || '');   // для отображения
    op.direction_id = document.getElementById('editDirectionSelect').value || null;
    op.contragent_id = document.getElementById('editContragentSelect').value || null;
    op.purpose = document.getElementById('editPurpose').value || '';
    op.date = (document.getElementById('editDate').value || new Date().toISOString().split('T')[0]) + 'T12:00:00';
    op.comment = document.getElementById('editComment').value || '';

    Storage.save('mycash_ops', operations);
    haptic('success');
    document.getElementById('editOverlay').classList.remove('active');
    editingOpId = null;
    renderAll();

    // Обновление на сервере (если операция была синхронизирована)
    if (op._server_id && typeof API !== 'undefined') {
        const payload = {
            type: op.type,
            amount: op.amount,
            category: op.category,
            wallet_id: window.getWalletId ? window.getWalletId(op.wallet) : null,
            comment: op.comment,
            date: op.date,
            article_id: op.article_id,
            direction_id: op.direction_id,
            contragent_id: op.contragent_id,
            purpose: op.purpose
        };
        API.updateOperation(op._server_id, payload).then(function() {
            console.log('Операция обновлена на сервере:', op._server_id);
        }).catch(function(e) {
            console.warn('Не удалось обновить операцию на сервере:', e.message);
        });
    }
}

function deleteFromEdit() {
    if (!editingOpId) return;
    const id = editingOpId;
    const doDelete = () => {
        const op = operations.find(function(o) { return String(o.id) === String(id); });
        const serverId = op && op._server_id;

        operations = operations.filter(op => String(op.id) !== String(id));
        Storage.save('mycash_ops', operations);
        haptic('success');
        document.getElementById('editOverlay').classList.remove('active');
        editingOpId = null;
        renderAll();

        if (serverId && typeof API !== 'undefined') {
            API.deleteOperation(serverId).then(function() {
                console.log('Операция удалена на сервере:', serverId);
            }).catch(function(e) {
                console.warn('Не удалось удалить операцию на сервере:', e.message);
            });
        }
    };
    if (confirm('Удалить эту операцию?')) doDelete();
}

// === УТИЛИТЫ ===
function fmt(n) {
    return Math.round(n).toLocaleString('ru-RU');
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
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
    clearDemoData, closeEdit, closeModal, closeUpgrade, closeVoiceConfirm,
    closeWalletEdit, confirmVoice, deleteFromEdit, deleteOperation, deleteWallet,
    focusAmount, haptic, openCustomPeriod,
    openEdit, openModal, openWalletEdit, openNewWallet, quickSave, renderEditArticles,
    renderEditWallets, selectEditWallet, selectEditArticle,
    saveEdit, saveExtended, saveWalletEdit, selectExtCat,
    selectWallet, selectWalletColor, setDashTab, setDashGroup, setEditType, setPeriod,
    setTableMode, setType, shareApp, showUpgrade, stopVoice, swapTransfer,
    switchTab, toggleCatOps, toggleExtended, updateAmountDisplay, acceptOffer, skipOffer,
    swipeStart, swipeMove, swipeEnd,
    quickSaveArticle, saveTransfer, cycleTransfer,
    openRefList, closeRefList, openRefForm, closeRefForm,
    setRefArticleType, saveRefForm, archiveRefItem,
    setDashMode, navReportMonth, toggleDdsSection
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

})(); // закрытие главного IIFE

