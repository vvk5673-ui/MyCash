'use strict';
// MyCash — ядро 1/6: Telegram, хранилище, данные, справочники, статьи
// ВНИМАНИЕ: файлы app-*.js делят ОДНУ общую область видимости.
// Подключаются по порядку в index.html. Порядок менять нельзя.


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

// Фирменная картинка-логотип для известных счетов (определяем по названию).
// Возвращает HTML <img> или null, если бренд не распознан — тогда рисуем обычную иконку.
function brandLogo(name, size) {
    const n = (name || '').toLowerCase().replace(/[\s\-_.]/g, '');
    const logos = {
        'tbank.svg?v=59': ['тбанк', 'тинькоф', 'tbank', 'tinkoff'],
        'sber.svg?v=59': ['сбер', 'sber']
    };
    for (const src in logos) {
        if (logos[src].some(function(key) { return n.indexOf(key) !== -1; })) {
            return '<img src="' + src + '" alt="' + esc(name) + '" ' +
                   'style="width:' + (size || 20) + 'px;height:' + (size || 20) + 'px;border-radius:6px;display:block">';
        }
    }
    return null;
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
// HTML одной строки счёта (используется в группах блока «Мои финансы»)
function walletLineHtml(w, bal) {
    // Кошелёк кликабелен только если он реальный (с сервера, есть id) — тап открывает настройки
    const click = w.id ? ' onclick="openWalletEdit(\'' + w.id + '\')" style="cursor:pointer"' : '';
    const wid = w.id ? ' data-wid="' + w.id + '"' : '';
    // Хваталка для перетаскивания (изменение порядка) — только для серверных счетов
    const handle = w.id
        ? '<span class="wallet-drag" onpointerdown="walletDragStart(event,\'' + w.id + '\')" onclick="event.stopPropagation()">' + lucideIcon('grip-vertical', 18, '#C7C7CC') + '</span>'
        : '';
    return '<div class="wallet-line"' + wid + click + '>' +
        '<span style="flex-shrink:0">' + (brandLogo(w.name, 20) || lucideIcon(w.icon || 'wallet', 18, w.color || '#007AFF')) + '</span>' +
        '<span class="wallet-line-name">' + esc(w.name) + '</span>' +
        '<span class="wallet-line-amount">' + fmt(bal[w.name] || 0) + ' ₽</span>' +
        handle +
        '</div>';
}

// Рендер кошельков на главном экране — сгруппированы по направлениям (Бизнес/Личное/...)
function renderWalletsRow() {
    const wallets = getActiveWallets();
    const bal = computeWalletBalances();
    const row = document.getElementById('walletsRow');
    if (!row) return;

    // Активные направления в их порядке (sort_order приходит с сервера отсортированным)
    const directions = (Refs.directions || []).filter(function(d) { return !d.is_archived; });

    // Заголовок группы направления: название + подытог справа
    function groupHead(name, subtotal) {
        return '<div class="wallet-group-head">' +
            '<span class="wallet-group-name">' + esc(name) + '</span>' +
            '<span class="wallet-group-sum">' + fmt(subtotal) + ' ₽</span>' +
            '</div>';
    }

    let html = '';
    const usedIds = {};

    // Группы по направлениям (показываем только непустые)
    directions.forEach(function(d) {
        const group = wallets.filter(function(w) { return w.direction_id === d.id; });
        if (!group.length) return;
        let subtotal = 0;
        group.forEach(function(w) { subtotal += (bal[w.name] || 0); usedIds[w.id] = true; });
        html += groupHead(d.name, subtotal);
        html += group.map(function(w) { return walletLineHtml(w, bal); }).join('');
    });

    // Счета без направления (или с удалённым направлением) — отдельной группой внизу
    const orphans = wallets.filter(function(w) { return !usedIds[w.id]; });
    if (orphans.length) {
        // Если направлений вообще нет — не рисуем лишний заголовок, просто список
        if (directions.length) {
            let subtotal = 0;
            orphans.forEach(function(w) { subtotal += (bal[w.name] || 0); });
            html += groupHead('Без направления', subtotal);
        }
        html += orphans.map(function(w) { return walletLineHtml(w, bal); }).join('');
    }

    // Строка добавления нового счёта (только онлайн — счета хранятся на сервере)
    html += '<div class="wallet-line wallet-line-add" onclick="openNewWallet()" style="cursor:pointer;color:var(--accent)">' +
        '<span style="flex-shrink:0">' + lucideIcon('plus', 18, '#007AFF') + '</span>' +
        '<span class="wallet-line-name">Добавить счёт</span>' +
        '</div>';

    row.innerHTML = html;
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
        // Если открыто окно операции — обновить плитки статей
        const mo = document.getElementById('modalOverlay');
        if (mo && mo.classList.contains('active')) renderQuickArticles();
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
        // Если открыто окно операции — обновить плитки статей
        const mo = document.getElementById('modalOverlay');
        if (mo && mo.classList.contains('active')) renderQuickArticles();
    } catch (e) {
        haptic('error');
        alert('Не удалось скрыть: ' + refErrorText(e));
    } finally {
        refBusy = false;
    }
}

