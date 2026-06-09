'use strict';
// MyCash — данные 2/6: демо, синхронизация, инициализация, баланс, итоги, ДДС
// ВНИМАНИЕ: файлы app-*.js делят ОДНУ общую область видимости.
// Подключаются по порядку в index.html. Порядок менять нельзя.

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
            wallet: (d.wallet === '💳 Карта' ? 'Кошелёк №1' : 'Наличка'),
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

