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
    document.getElementById('headerGreeting').textContent = 'Привет, ' + userName + '! 👋';
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
const WALLETS = ['💳 Карта', '💵 Наличка'];
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

// Обновить все Lucide-иконки на странице
function refreshIcons() {
    if (window.lucide) {
        lucide.createIcons();
    } else {
        // Фоллбек: если Lucide не загрузился — первая буква
        document.querySelectorAll('i[data-lucide]').forEach(el => {
            if (!el.querySelector('svg')) {
                const name = el.getAttribute('data-lucide') || '';
                el.textContent = name.charAt(0).toUpperCase();
                el.style.fontStyle = 'normal';
                el.style.fontWeight = '600';
            }
        });
    }
}
const chartColors = ['#FF3B30','#FF9500','#FFCC00','#34C759','#007AFF','#5856D6','#AF52DE','#FF2D55','#00C7BE','#8E8E93'];

let operations = [];
let currentType = 'expense';
let selectedWallet = WALLETS[0];
let selectedCategory = '';
let currentPeriod = 'month';
let voiceParsedData = null;
let isDemo = false;
let transferFrom = '💳 Карта';
let transferTo = '💵 Наличка';
let walletBalances = { '💳 Карта': 0, '💵 Наличка': 0 };

// === ДЕМО-ДАННЫЕ ===
function generateDemoData() {
    const now = new Date();
    // Прошлый месяц — чтобы демо-операции были до сегодняшней даты,
    // и новые реальные операции пользователя попадали в верх списка.
    // new Date(year, monthIndex) автоматически нормализует -1 в декабрь прошлого года.
    const y = now.getFullYear();
    const m = now.getMonth() - 1;
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
    return demo.map((d, i) => ({
        id: Date.now() - (demo.length - i) * 100000,
        type: d.type,
        amount: d.amount,
        category: d.category,
        wallet: d.wallet,
        comment: d.comment,
        date: new Date(y, m, d.day, 10 + i % 12, i * 7 % 60).toISOString()
    }));
}

// === ИНИЦИАЛИЗАЦИЯ ===
function init() {
    const data = Storage.load('mycash_ops');
    const demoFlag = Storage.load('mycash_is_demo');
    const balances = Storage.load('mycash_balances');

    if (balances) {
        walletBalances = balances;
    }

    if (!data || data.length === 0) {
        // Первый запуск — демо-данные
        operations = generateDemoData();
        isDemo = true;
        Storage.save('mycash_ops', operations);
        Storage.save('mycash_is_demo', true);
    } else {
        operations = data;
        isDemo = demoFlag === true;
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
    refreshIcons();
}

// === БАЛАНС ПО КОШЕЛЬКАМ ===
function updateBalance() {
    let cardBalance = walletBalances['💳 Карта'] || 0;
    let cashBalance = walletBalances['💵 Наличка'] || 0;

    // Считаем по операциям
    operations.forEach(op => {
        if (op.type === 'income') {
            if (op.wallet === '💳 Карта') cardBalance += op.amount;
            else cashBalance += op.amount;
        } else if (op.type === 'expense') {
            if (op.wallet === '💳 Карта') cardBalance -= op.amount;
            else cashBalance -= op.amount;
        } else if (op.type === 'transfer') {
            if (op.walletFrom === '💳 Карта') { cardBalance -= op.amount; cashBalance += op.amount; }
            else { cashBalance -= op.amount; cardBalance += op.amount; }
        }
    });

    const total = cardBalance + cashBalance;
    document.getElementById('balanceTotal').textContent = fmt(total) + ' ₽';
    document.getElementById('walletCard').textContent = fmt(cardBalance) + ' ₽';
    document.getElementById('walletCash').textContent = fmt(cashBalance) + ' ₽';
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
function renderOperations() {
    const container = document.getElementById('operationsList');
    const filtered = filterByPeriod(operations).sort((a, b) => new Date(b.date) - new Date(a.date));

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
        const subtitle = (op.comment ? esc(op.comment) + ' · ' : '') + dateStr + ' · ' + esc(walletText);

        return `
            <div class="op-item" data-id="${op.id}"
                 onclick="openEdit(${op.id})"
                 ontouchstart="swipeStart(event)" ontouchmove="swipeMove(event)" ontouchend="swipeEnd(event)">
                <div class="op-swipe-actions">
                    <button class="op-swipe-btn edit" onclick="event.stopPropagation(); openEdit(${op.id})"><i data-lucide="pencil" style="width:16px;height:16px;color:white"></i><br>Изменить</button>
                    <button class="op-swipe-btn delete" onclick="event.stopPropagation(); deleteOperation(${op.id})"><i data-lucide="trash-2" style="width:16px;height:16px;color:white"></i><br>Удалить</button>
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
        const op = operations.find(function(o) { return o.id === id; });
        const serverId = op && op._server_id;

        operations = operations.filter(op => op.id !== id);
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
    document.getElementById('amountDisplay').textContent = '0 ';
    document.getElementById('amountDisplay').innerHTML = '0 <span class="amount-currency">₽</span>';
    document.getElementById('amountDisplay').classList.add('placeholder');
    document.getElementById('extendedForm').classList.remove('active');
    currentType = 'expense';
    selectedCategory = '';
    selectedWallet = Storage.load('mycash_last_wallet') || WALLETS[0];
    renderWalletSwitch();
    renderQuickCats();
    setTimeout(() => document.getElementById('amountInput').focus(), 300);
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
    container.innerHTML = WALLETS.map(w =>
        `<button class="wallet-btn ${w === selectedWallet ? 'active' : ''}" onclick="selectWallet('${w}')">${w}</button>`
    ).join('');
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
            date: op.date
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
    const form = document.getElementById('extendedForm');
    form.classList.toggle('active');
    if (form.classList.contains('active')) {
        document.getElementById('dateInput').value = new Date().toISOString().split('T')[0];
        document.getElementById('commentInput').value = '';
        updateExtType();
    }
}

function setType(type) {
    currentType = type;
    haptic('light');
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.' + type + '-btn').classList.add('active');
    updateExtType();
}

function updateExtType() {
    const catGroup = document.getElementById('extCatGroup');
    const transferGroup = document.getElementById('transferGroup');
    if (currentType === 'transfer') {
        catGroup.style.display = 'none';
        transferGroup.style.display = 'block';
    } else {
        catGroup.style.display = 'block';
        transferGroup.style.display = 'none';
        renderExtCats();
    }
    renderQuickCats();
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
    const filtered = filterByPeriod(operations);
    const isExpense = dashTab === 'expense';
    dashExpenses = filtered.filter(op => op.type === (isExpense ? 'expense' : 'income'));

    if (dashExpenses.length === 0) {
        document.getElementById('dashboardInline').style.display = 'none';
        return;
    }
    document.getElementById('dashboardInline').style.display = 'block';

    const cats = {};
    dashExpenses.forEach(op => { cats[op.category] = (cats[op.category] || 0) + op.amount; });
    const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, [_, v]) => s + v, 0);

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

    const maxAmount = sorted[0] ? sorted[0][1] : 1;

    barsContainer.innerHTML = sorted.map(([cat, amount], i) => {
        const pct = Math.round(amount / total * 100);
        const barWidth = Math.round((amount / maxAmount) * 100);
        const color = chartColors[i % chartColors.length];
        const catObj = (isExpense ? EXPENSE_CATS : INCOME_CATS).find(c => c.name === cat);
        const icon = catObj ? lucideIcon(catObj.icon, 18, catObj.color) : lucideIcon('package', 18, '#8E8E93');

        return `<div style="margin-bottom:12px;cursor:pointer" onclick="toggleCatOps(${i})">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
                <div style="display:flex;align-items:center;gap:6px">
                    <span style="font-size:16px">${icon}</span>
                    <span style="font-size:13px;font-weight:500">${cat}</span>
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
            dashExpenses.filter(op => op.category === cat).map(op => {
                const dateStr = formatDate(op.date);
                const comment = op.comment ? esc(op.comment) + ' · ' : '';
                const wallet = op.wallet || '💳 Карта';
                return `<div class="dash-cat-op" onclick="event.stopPropagation(); openEdit(${op.id})" style="cursor:pointer">
                    <span class="dash-cat-op-left">${comment}${dateStr} · ${wallet}</span>
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

    document.getElementById('dashLegend').innerHTML = '';
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

// === ОНБОРДИНГ ===
let onboardingStep = 0;

function clearDemoData() {
    haptic();
    operations = [];
    isDemo = false;
    Storage.save('mycash_ops', operations);
    Storage.save('mycash_is_demo', false);
    document.getElementById('demoBanner').classList.remove('active');
    document.getElementById('demoBannerProfile').classList.remove('active');

    // Показываем запрос остатков
    onboardingStep = 0;
    showOnboardingStep();
    document.getElementById('onboardingOverlay').classList.add('active');
}

function showOnboardingStep() {
    if (onboardingStep === 0) {
        document.getElementById('onbEmoji').textContent = '💳';
        document.getElementById('onbTitle').textContent = 'Сколько на карте?';
        document.getElementById('onbText').textContent = 'Введите текущий остаток на банковской карте';
        document.getElementById('onbInput').value = '';
        document.getElementById('onbBtn').textContent = 'Далее';
    } else if (onboardingStep === 1) {
        document.getElementById('onbEmoji').textContent = '💵';
        document.getElementById('onbTitle').textContent = 'А наличных?';
        document.getElementById('onbText').textContent = 'Введите сколько наличных денег';
        document.getElementById('onbInput').value = '';
        document.getElementById('onbBtn').textContent = 'Готово';
    }
}

function onboardingNext() {
    const val = parseFloat(document.getElementById('onbInput').value) || 0;
    haptic('success');

    if (onboardingStep === 0) {
        walletBalances['💳 Карта'] = val;
        onboardingStep = 1;
        showOnboardingStep();
    } else {
        walletBalances['💵 Наличка'] = val;
        Storage.save('mycash_balances', walletBalances);
        document.getElementById('onboardingOverlay').classList.remove('active');
        renderAll();
    }
}

function onboardingSkip() {
    walletBalances = { '💳 Карта': 0, '💵 Наличка': 0 };
    Storage.save('mycash_balances', walletBalances);
    document.getElementById('onboardingOverlay').classList.remove('active');
    haptic('light');
    renderAll();
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
const WALLET_COLORS = [
    { name: 'Серый', color: '#F2F2F7' },
    { name: 'Синий', color: '#D6E4FF' },
    { name: 'Зелёный', color: '#D4EDDA' },
    { name: 'Оранжевый', color: '#FFE8CC' },
    { name: 'Розовый', color: '#FFD6E0' },
    { name: 'Фиолетовый', color: '#E8DAEF' },
    { name: 'Жёлтый', color: '#FFF9C4' },
    { name: 'Голубой', color: '#D1ECF1' }
];

// Настройки кошельков (сохраняются в localStorage)
let walletSettings = Storage.load('mycash_wallet_settings') || [
    { name: 'Карта', icon: '💳', color: '#F2F2F7' },
    { name: 'Наличка', icon: '💵', color: '#F2F2F7' }
];
let editingWalletIdx = -1;
let editWalletColor = '#F2F2F7';

// Маппинг кошельков на Lucide-иконки
const WALLET_ICON_MAP = {
    '💳': { lucide: 'credit-card', color: '#007AFF' },
    '💵': { lucide: 'banknote', color: '#34C759' }
};

function walletLucideIcon(emoji, size) {
    const mapped = WALLET_ICON_MAP[emoji];
    if (mapped) return lucideIcon(mapped.lucide, size || 22, mapped.color);
    return lucideIcon('wallet', size || 22, '#007AFF');
}

function applyWalletSettings() {
    walletSettings.forEach((ws, i) => {
        const nameEl = document.getElementById('walletName' + i);
        const iconEl = document.getElementById('walletIcon' + i);
        const badgeEl = document.getElementById('walletBadge' + i);
        if (nameEl) nameEl.textContent = ws.name;
        if (iconEl) iconEl.innerHTML = walletLucideIcon(ws.icon, 22);
        if (badgeEl) badgeEl.style.background = ws.color;
    });
    // Обновить WALLETS массив для совместимости
    WALLETS[0] = walletSettings[0].icon + ' ' + walletSettings[0].name;
    WALLETS[1] = walletSettings[1].icon + ' ' + walletSettings[1].name;
    refreshIcons();
}

function openWalletEdit(idx) {
    editingWalletIdx = idx;
    const ws = walletSettings[idx];
    editWalletColor = ws.color;
    haptic('light');

    document.getElementById('walletEditName').value = ws.name;
    document.getElementById('walletEditBalance').value = walletBalances[WALLETS[idx]] || 0;

    // Цвета
    document.getElementById('walletColorGrid').innerHTML = WALLET_COLORS.map(c =>
        `<div class="wallet-color-btn ${c.color === editWalletColor ? 'active' : ''}"
             style="background:${c.color}"
             onclick="selectWalletColor('${c.color}')"></div>`
    ).join('');

    // Кнопка удаления — заблокирована (Pro)
    document.getElementById('walletDeleteBtn').onclick = function() { showUpgrade(); };

    document.getElementById('walletEditOverlay').classList.add('active');
}

function closeWalletEdit(e) {
    if (e && e.target && e.target !== e.currentTarget) return;
    document.getElementById('walletEditOverlay').classList.remove('active');
    editingWalletIdx = -1;
}

function selectWalletColor(color) {
    editWalletColor = color;
    haptic('light');
    document.querySelectorAll('.wallet-color-btn').forEach(btn => {
        btn.classList.toggle('active', btn.style.background === color);
    });
}

function saveWalletEdit() {
    const idx = editingWalletIdx;
    if (idx < 0) return;

    const newName = document.getElementById('walletEditName').value.trim();
    if (!newName) { haptic('error'); return; }

    const newBalance = parseFloat(document.getElementById('walletEditBalance').value) || 0;
    const oldWalletKey = WALLETS[idx];

    // Обновляем настройки
    walletSettings[idx].name = newName;
    walletSettings[idx].color = editWalletColor;
    Storage.save('mycash_wallet_settings', walletSettings);

    // Обновляем WALLETS
    const newWalletKey = walletSettings[idx].icon + ' ' + newName;

    // Переименовываем кошелёк в операциях
    if (oldWalletKey !== newWalletKey) {
        operations.forEach(op => {
            if (op.wallet === oldWalletKey) op.wallet = newWalletKey;
            if (op.walletFrom === oldWalletKey) op.walletFrom = newWalletKey;
            if (op.walletTo === oldWalletKey) op.walletTo = newWalletKey;
        });
        Storage.save('mycash_ops', operations);

        // Переносим баланс
        walletBalances[newWalletKey] = newBalance;
        if (oldWalletKey !== newWalletKey) delete walletBalances[oldWalletKey];
    } else {
        walletBalances[oldWalletKey] = newBalance;
    }
    Storage.save('mycash_balances', walletBalances);

    WALLETS[idx] = newWalletKey;
    applyWalletSettings();
    haptic('success');
    closeWalletEdit();
    renderAll();
}

function deleteWallet() {
    showUpgrade();
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
let editWallet = '💳 Карта';
let editCategory = '';

function openEdit(id) {
    // Не открывать если был свайп
    if (swiped) return;

    const op = operations.find(o => o.id === id);
    if (!op) return;

    editingOpId = id;
    editType = op.type === 'transfer' ? 'expense' : op.type;
    editWallet = op.wallet || '💳 Карта';
    editCategory = op.category || '';

    haptic('light');

    // Заполняем форму
    document.getElementById('editAmount').value = op.amount;
    document.getElementById('editDate').value = op.date ? op.date.split('T')[0] : new Date().toISOString().split('T')[0];
    document.getElementById('editComment').value = op.comment || '';

    // Тип
    setEditType(editType);

    document.getElementById('editOverlay').classList.add('active');
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
    renderEditCats();
    renderEditWallets();
}

function renderEditWallets() {
    document.getElementById('editWalletGrid').innerHTML = WALLETS.map(w =>
        `<button class="cat-chip ${w === editWallet ? 'active' : ''}" onclick="editWallet='${w}'; renderEditWallets(); haptic('light')">${w}</button>`
    ).join('');
}

function renderEditCats() {
    renderCatGrid('editCatGrid', editType, editCategory, (name) => `editCategory='${name}'; renderEditCats(); haptic('light')`);
}

function saveEdit() {
    const v = validateAmount(document.getElementById('editAmount').value);
    if (!v.ok || !editCategory) { haptic('error'); return; }
    const amount = v.amount;

    const op = operations.find(o => o.id === editingOpId);
    if (!op) return;

    op.type = editType;
    op.amount = amount;
    op.category = editCategory;
    op.wallet = editWallet;
    op.date = (document.getElementById('editDate').value || new Date().toISOString().split('T')[0]) + 'T12:00:00';
    op.comment = document.getElementById('editComment').value || '';

    Storage.save('mycash_ops', operations);
    haptic('success');
    document.getElementById('editOverlay').classList.remove('active');
    editingOpId = null;
    renderAll();

    // Обновление на сервере (если операция была синхронизирована)
    if (op._server_id && typeof API !== 'undefined') {
        const walletId = window.getWalletId ? window.getWalletId(op.wallet) : null;
        const payload = {
            type: op.type,
            amount: op.amount,
            category: op.category,
            wallet_id: walletId,
            comment: op.comment,
            date: op.date
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
        const op = operations.find(function(o) { return o.id === id; });
        const serverId = op && op._server_id;

        operations = operations.filter(op => op.id !== id);
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
        // Обновить кошельки в профиле
        walletSettings.forEach((ws, i) => {
            const iconEl = document.getElementById('profileWalletIcon' + i);
            const nameEl = document.getElementById('profileWalletName' + i);
            const amountEl = document.getElementById('profileWalletAmount' + i);
            if (iconEl) iconEl.textContent = ws.icon;
            if (nameEl) nameEl.textContent = ws.name;
            if (amountEl) amountEl.textContent = document.getElementById(i === 0 ? 'walletCard' : 'walletCash').textContent;
        });
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
    const doIt = () => {
        localStorage.clear();
        operations = [];
        walletBalances = { '💳 Карта': 0, '💵 Наличка': 0 };
        Storage.save('mycash_ops', operations);
        Storage.save('mycash_balances', walletBalances);
        haptic('success');
        renderAll();
        switchTab('home', document.querySelector('.tab-item'));
        showOfferIfNeeded();
    };
    if (confirm('Удалить все данные? Это действие нельзя отменить.')) doIt();
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

// Попытка авторизации через API + загрузка кошельков
(async function() {
    if (tg && tg.initData) {
        const user = await API.auth(tg.initData);
        if (user) {
            console.log('API: онлайн-режим, пользователь:', user.first_name);
            // Подгружаем кошельки с сервера и строим маппинг имя → uuid
            try {
                const serverWallets = await API.getWallets();
                if (serverWallets && Array.isArray(serverWallets)) {
                    serverWallets.forEach(function(w) {
                        // Ключ — чистое имя без эмодзи ("Карта", "Наличка")
                        window.walletIdMap[window.cleanWalletName(w.name)] = w.id;
                    });
                    console.log('Загружены кошельки с сервера:', Object.keys(window.walletIdMap));
                }
            } catch (e) {
                console.warn('Не удалось загрузить кошельки с сервера:', e);
            }
        } else {
            console.log('API: оффлайн-режим (localStorage)');
        }
    }
})();

applyWalletSettings();
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
    focusAmount, haptic, onboardingNext, onboardingSkip, openCustomPeriod,
    openEdit, openModal, openWalletEdit, quickSave, renderEditCats,
    renderEditWallets, saveEdit, saveExtended, saveWalletEdit, selectExtCat,
    selectWallet, selectWalletColor, setDashTab, setEditType, setPeriod,
    setTableMode, setType, shareApp, showUpgrade, stopVoice, swapTransfer,
    switchTab, toggleCatOps, toggleExtended, updateAmountDisplay, acceptOffer, skipOffer,
    swipeStart, swipeMove, swipeEnd
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

