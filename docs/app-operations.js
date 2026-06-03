'use strict';
// MyCash — операции 3/6: список, свайп, окно ввода, быстрые категории, форма
// ВНИМАНИЕ: файлы app-*.js делят ОДНУ общую область видимости.
// Подключаются по порядку в index.html. Порядок менять нельзя.

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
                 ontouchstart="swipeStart(event)" ontouchmove="swipeMove(event)" ontouchend="swipeEnd(event)"
                 onmousedown="swipeMouseStart(event)">
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

// --- Общая логика свайпа (используется и пальцем, и мышью) ---
// Двигаем операцию влево на dx (отрицательное = влево), открывая кнопки.
function swipeApply(dx) {
    if (!swipeCurrentItem) return;
    if (dx < -20) {
        swiped = true;
        const offset = Math.min(160, Math.abs(dx));
        swipeCurrentItem.style.transform = `translateX(-${offset}px)`;
        swipeCurrentItem.querySelector('.op-swipe-actions').style.transform = `translateX(${160 - offset}px)`;
    }
}
// Завершение свайпа: дотянул дальше 80px → фиксируем открытым, иначе возвращаем
function swipeFinish(dx) {
    if (!swipeCurrentItem) return;
    if (dx < -80) {
        swipeCurrentItem.style.transform = 'translateX(-160px)';
        swipeCurrentItem.querySelector('.op-swipe-actions').style.transform = 'translateX(0)';
    } else {
        swipeCurrentItem.style.transform = '';
        swipeCurrentItem.querySelector('.op-swipe-actions').style.transform = 'translateX(160px)';
    }
    swipeCurrentItem = null;
}

// --- Пальцем (мобильный) ---
function swipeStart(e) {
    swipeStartX = e.touches[0].clientX;
    swipeCurrentItem = e.currentTarget;
    swiped = false;
}

function swipeMove(e) {
    if (!swipeCurrentItem) return;
    const dx = e.touches[0].clientX - swipeStartX;
    if (dx < -20) e.preventDefault();   // влево — наш жест, гасим скролл
    swipeApply(dx);
}

function swipeEnd(e) {
    if (!swipeCurrentItem) return;
    swipeFinish(e.changedTouches[0].clientX - swipeStartX);
}

// --- Мышью (десктоп) ---
function swipeMouseStart(e) {
    if (e.button !== 0) return;   // только левая кнопка
    swipeStartX = e.clientX;
    swipeCurrentItem = e.currentTarget;
    swiped = false;
    document.addEventListener('mousemove', swipeMouseMove);
    document.addEventListener('mouseup', swipeMouseUp);
}

function swipeMouseMove(e) {
    if (!swipeCurrentItem) return;
    swipeApply(e.clientX - swipeStartX);
}

function swipeMouseUp(e) {
    document.removeEventListener('mousemove', swipeMouseMove);
    document.removeEventListener('mouseup', swipeMouseUp);
    if (!swipeCurrentItem) return;
    const item = swipeCurrentItem;
    const wasSwiped = swiped;
    swipeFinish(e.clientX - swipeStartX);
    // Если был свайп — подавить click-открытие операции, который иначе сработает после mouseup
    if (wasSwiped) {
        const supp = function(ev) { ev.stopPropagation(); ev.preventDefault(); item.removeEventListener('click', supp, true); };
        item.addEventListener('click', supp, true);
        setTimeout(function() { item.removeEventListener('click', supp, true); }, 50);
    }
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
    // Сбрасываем режим «Изменить» статьи при каждом открытии
    articleEditMode = false;
    const aToggle = document.getElementById('articleEditToggle');
    const aLabel = document.getElementById('quickArticlesLabel');
    if (aToggle) aToggle.textContent = '✏️ Изменить';
    if (aLabel) aLabel.textContent = 'Статья — нажмите, чтобы сохранить';
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
let articleEditMode = false;   // режим «Изменить» в окне операции (тап = редактировать статью)

function renderQuickArticles() {
    const arts = articlesForType(currentType);
    const box = document.getElementById('quickArticles');
    if (!box) return;
    // Статьи ещё не загрузились — пробуем дозагрузить с сервера и перерисовать
    if (!arts.length) {
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
    }
    // Единый стиль со страницей редактирования — текстовые пилюли (cat-chip) в 2 ряда
    let html = arts.map(function(a) {
        if (articleEditMode) {
            return '<button class="cat-chip cat-chip-edit" onclick="openArticleEditFromOp(\'' + a.id + '\')">✏️ ' + esc(a.name) + '</button>';
        }
        return '<button class="cat-chip" onclick="quickSaveArticle(\'' + a.id + '\')">' + esc(a.name) + '</button>';
    }).join('');
    // Плитка «Новая статья» — всегда в конце сетки
    html += '<button class="cat-chip cat-chip-add" onclick="openNewArticleFromOp()">➕ Новая статья</button>';
    box.innerHTML = html;
}

// Переключатель режима «Изменить» в окне операции
function toggleArticleEditMode() {
    articleEditMode = !articleEditMode;
    haptic('light');
    const btn = document.getElementById('articleEditToggle');
    const lbl = document.getElementById('quickArticlesLabel');
    if (btn) btn.textContent = articleEditMode ? '✓ Готово' : '✏️ Изменить';
    if (lbl) lbl.textContent = articleEditMode
        ? 'Нажмите статью, чтобы изменить или удалить'
        : 'Статья — нажмите, чтобы сохранить';
    renderQuickArticles();
}

// Создать новую статью прямо из окна операции (тип = текущий: доход/расход)
function openNewArticleFromOp() {
    currentRefKind = 'articles';
    openRefForm(null);
    setRefArticleType(currentType === 'income' ? 'income' : 'expense');
}

// Открыть форму статьи (изменить/удалить) из окна операции
function openArticleEditFromOp(articleId) {
    currentRefKind = 'articles';
    openRefForm(articleId);
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

