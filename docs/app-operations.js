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

// Сортировка списка: сначала по календарному дню операции (новые дни сверху),
// внутри одного дня — последняя ДОБАВЛЕННАЯ сверху (а не по времени в поле date,
// т.к. оно хранится по-разному: быстрый ввод пишет реальное время, форма — полдень).
function sortOpsForList(a, b) {
    const dayA = String(a.date).slice(0, 10);   // 'YYYY-MM-DD' без времени
    const dayB = String(b.date).slice(0, 10);
    if (dayA !== dayB) return dayA < dayB ? 1 : -1;   // более новый день — выше
    return opAddedTs(b) - opAddedTs(a);               // внутри дня — последняя добавленная выше
}

// Иконка и цвет счёта (кассы) по его названию — для бейджа в строке операции
function walletVisual(name) {
    const w = getActiveWallets().find(function(x) { return x.name === name; });
    return { icon: (w && w.icon) || 'wallet', color: (w && w.color) || '#8E8E93' };
}

function renderOperations() {
    const container = document.getElementById('operationsList');
    const filtered = filterByPeriod(operations).slice().sort(sortOpsForList);

    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="icon">📝</div><p>Пока нет операций.<br>Нажмите + чтобы добавить первую</p></div>';
        return;
    }

    container.innerHTML = filtered.map(op => {
        let iconClass = op.type;
        let sign = op.type === 'income' ? '+' : '-';
        let walletText = op.wallet || '💳 Карта';
        // Иконка операции = логотип банка / значок счёта, по которому прошла операция.
        // Размер 40 — заполняет плитку .op-icon целиком → все иконки выглядят одного размера.
        let iconHtml = walletIconHtml(op.wallet, 40);

        if (op.type === 'transfer') {
            iconHtml = lucideIcon('arrow-left-right', 24, '#007AFF');
            sign = '';
            walletText = (op.walletFrom || '💳 Карта') + ' → ' + (op.walletTo || '💵 Наличка');
        }

        const dateStr = formatDate(op.date);
        const titleText = op.type === 'transfer' ? 'Перевод' : esc(op.category);
        // Назначение платежа — отдельной строкой под статьёй (без точки-разделителя), серым
        const purposeHtml = op.purpose ? '<div class="op-purpose">' + esc(op.purpose) + '</div>' : '';
        // Вторая строка: счёт (касса) первым, затем контрагент (если указан)
        const cg = (op.contragent_id && Refs.contragents)
            ? Refs.contragents.find(function(c) { return String(c.id) === String(op.contragent_id); })
            : null;
        const isTransfer = op.type === 'transfer';
        // Под иконкой — название кошелька (для перевода не пишем: маршрут «А → Б» оставляем в середине)
        const walletUnder = isTransfer ? '' : esc(op.wallet || '');
        // Середина (вторая строка): для перевода — маршрут, иначе — только контрагент (кошелёк ушёл под иконку)
        const subtitle = isTransfer ? esc(walletText) : (cg ? esc(cg.name) : '');

        return `
            <div class="op-item" data-id="${op.id}"
                 onclick="openEdit('${op.id}')"
                 ontouchstart="swipeStart(event)" ontouchmove="swipeMove(event)" ontouchend="swipeEnd(event)">
                <div class="op-swipe-actions">
                    <button class="op-swipe-btn edit" onclick="event.stopPropagation(); openEdit('${op.id}')"><i data-lucide="pencil" style="width:19px;height:19px;color:white"></i><span>Изменить</span></button>
                    <button class="op-swipe-btn delete" onclick="event.stopPropagation(); deleteOperation('${op.id}')"><i data-lucide="trash-2" style="width:19px;height:19px;color:white"></i><span>Удалить</span></button>
                </div>
                <div class="op-content">
                    <div class="op-iconwrap">
                        <div class="op-icon ${iconClass}">${iconHtml}</div>
                        ${walletUnder ? `<div class="op-wallet-label">${walletUnder}</div>` : ''}
                    </div>
                    <div class="op-info">
                        <div class="op-category">${titleText}</div>
                        ${purposeHtml}
                        ${subtitle ? `<div class="op-comment">${subtitle}</div>` : ''}
                    </div>
                    <div class="op-right">
                        <div class="op-amount ${iconClass}">${sign}${fmt(op.amount)} ₽</div>
                        <div class="op-date">${dateStr}</div>
                    </div>
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

// Двигаем только содержимое строки (.op-content) влево — кнопки прибиты к правому краю
function swipeContent(item) {
    return item.querySelector('.op-content');
}

function swipeMove(e) {
    if (!swipeCurrentItem) return;
    const dx = e.touches[0].clientX - swipeStartX;
    if (dx < -20) {
        swiped = true;
        const offset = Math.min(160, Math.abs(dx));
        swipeContent(swipeCurrentItem).style.transform = `translateX(-${offset}px)`;
        e.preventDefault();
    }
}

function swipeEnd(e) {
    if (!swipeCurrentItem) return;
    const dx = e.changedTouches[0].clientX - swipeStartX;
    if (dx < -80) {
        // Показать кнопки редактирования и удаления
        swipeContent(swipeCurrentItem).style.transform = 'translateX(-160px)';
    } else {
        swipeContent(swipeCurrentItem).style.transform = '';
    }
    swipeCurrentItem = null;
}

// Закрыть свайп при тапе в другое место
document.addEventListener('touchstart', function(e) {
    document.querySelectorAll('.op-item').forEach(item => {
        if (!item.contains(e.target)) {
            const content = item.querySelector('.op-content');
            if (content) content.style.transform = '';
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
    // Сбрасываем режим «Изменить» статьи и выбор статьи при каждом открытии
    articleEditMode = false;
    selectedArticleId = null;
    const aToggle = document.getElementById('articleEditToggle');
    const aLabel = document.getElementById('quickArticlesLabel');
    if (aToggle) aToggle.textContent = '✏️ Изменить';
    if (aLabel) aLabel.textContent = 'Статья — выберите';
    document.getElementById('modalOverlay').classList.add('active');
    // Пока окно ввода открыто — Telegram спросит подтверждение при попытке закрыть приложение
    if (typeof setClosingGuard === 'function') setClosingGuard(true);
    document.getElementById('amountInput').value = '';
    document.getElementById('amountDisplay').innerHTML = '0 <span class="amount-currency">₽</span>';
    document.getElementById('amountDisplay').classList.add('placeholder');
    document.getElementById('extendedForm').classList.remove('active');
    // Сброс необязательных полей
    document.getElementById('purposeInput').value = '';
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
    if (typeof stepReset === 'function') stepReset();   // степпер: открыть с 1-го шага
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

// === БЫСТРОЕ ДОБАВЛЕНИЕ КОНТРАГЕНТА ИЗ ФОРМЫ ОПЕРАЦИИ ===
// Заполнить указанный select контрагентами (с сохранением выбранного)
function fillContragentSelect(selectId, selectedId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">— не указано —</option>' +
        (Refs.contragents || []).filter(function(c) { return !c.is_archived; }).map(function(c) {
            return '<option value="' + c.id + '">' + esc(c.name) + '</option>';
        }).join('');
    if (selectedId) sel.value = selectedId;
}

// Показать/скрыть строку ввода нового контрагента
function toggleContragentAdd(rowId, inputId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    const show = !row.style.display || row.style.display === 'none';
    row.style.display = show ? 'flex' : 'none';
    if (show) setTimeout(function() { const i = document.getElementById(inputId); if (i) i.focus(); }, 50);
}

// Создать контрагента и сразу выбрать его в указанном списке
async function quickAddContragent(selectId, inputId, rowId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const name = (input.value || '').trim();
    if (!name) { haptic('error'); input.focus(); return; }
    try {
        const created = await API.createContragent({ name: name });
        haptic('success');
        await loadReferences();   // обновить Refs.contragents с сервера
        // перезаполнить оба списка (форма добавления и редактирования), сохранив выбор
        const addSel = document.getElementById('contragentSelect');
        const editSel = document.getElementById('editContragentSelect');
        if (addSel) fillContragentSelect('contragentSelect', addSel.value);
        if (editSel) fillContragentSelect('editContragentSelect', editSel.value);
        // выбрать только что созданного в текущем списке
        const newId = (created && created.id)
            ? created.id
            : ((Refs.contragents || []).find(function(c) { return c.name === name; }) || {}).id;
        const sel = document.getElementById(selectId);
        if (sel && newId) sel.value = newId;
        input.value = '';
        const row = document.getElementById(rowId);
        if (row) row.style.display = 'none';
        if (typeof updateRefCounts === 'function') updateRefCounts();
    } catch (e) {
        haptic('error');
        alert('Не удалось добавить контрагента: ' + (typeof refErrorText === 'function' ? refErrorText(e) : (e && e.message || e)));
    }
}

function closeModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('modalOverlay').classList.remove('active');
    // Окно закрыто — снимаем подтверждение выхода
    if (typeof setClosingGuard === 'function') setClosingGuard(false);
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
        return '<button class="wallet-btn ' + active + '" onclick="selectWallet(\'' + w.name.replace(/'/g, "\\'") + '\')">' +
            '<span class="wallet-btn-ico">' + walletIconHtml(w.name, 18, w) + '</span>' + esc(w.name) + '</button>';
    }).join('');
}

function selectWallet(w) {
    selectedWallet = w;
    haptic('light');
    renderWalletSwitch();
    // степпер: показать кошелёк в пилюле и перейти к статье
    var qv = document.getElementById('qvalWallet');
    if (qv) qv.innerHTML = '<span class="qpill">' + walletIconHtml(w, 14) + esc(w) + '</span>';
    if (typeof stepMarkDone === 'function') { stepMarkDone('wallet'); if (currentType !== 'transfer') stepOpen('article'); }
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
    if (typeof setClosingGuard === 'function') setClosingGuard(false);
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
    selectedArticleId = null;   // при смене типа статьи другие — выбор сбрасываем
    haptic('light');
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector('.' + type + '-btn');
    if (btn) btn.classList.add('active');
    const articlesArea = document.getElementById('articlesArea');
    const transferArea = document.getElementById('transferArea');
    const saveBtn = document.getElementById('quickSaveBtn');
    if (type === 'transfer') {
        articlesArea.style.display = 'none';
        transferArea.style.display = 'block';
        if (saveBtn) saveBtn.style.display = 'none';   // у перевода своя кнопка «Сохранить перевод»
        document.getElementById('transferFrom').textContent = transferFrom;
        document.getElementById('transferTo').textContent = transferTo;
    } else {
        articlesArea.style.display = 'block';
        transferArea.style.display = 'none';
        if (saveBtn) saveBtn.style.display = '';
        renderQuickArticles();
    }
    // степпер: подпись 4-го шага — «Перевод» для перевода, иначе «Статья»
    var artLabel = document.getElementById('qsecArticleLabel');
    if (artLabel) artLabel.textContent = (type === 'transfer') ? 'Перевод' : 'Статья';
}

// Рендер статей ДДС (отфильтрованных по типу) — тап = выбор статьи (сохранение кнопкой внизу)
let articleEditMode = false;     // режим «Изменить» в окне операции (тап = редактировать статью)
let selectedArticleId = null;    // выбранная статья (подсвечена); сохранение — кнопкой «Сохранить»

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
        const sel = (a.id === selectedArticleId) ? ' active' : '';
        return '<button class="cat-chip' + sel + '" onclick="selectArticle(\'' + a.id + '\')">' + esc(a.name) + '</button>';
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
        : 'Статья — выберите';
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

// Тап по статье — выбрать её (подсветить). Сохранение — кнопкой «Сохранить» внизу окна.
function selectArticle(articleId) {
    selectedArticleId = articleId;
    haptic('light');
    renderQuickArticles();   // перерисовать с подсветкой выбранной
    // степпер: показать статью в пилюле и перейти к доп. параметрам
    var art = getArticleById(articleId);
    var qv = document.getElementById('qvalArticle');
    if (qv && art) qv.innerHTML = '<span class="qpill">' + esc(art.name) + '</span>';
    if (typeof stepMarkDone === 'function') { stepMarkDone('article'); stepOpen('extra'); }
}

// Сохранение операции (расход/доход) по кнопке «Сохранить» — с выбранной статьёй и полями «Подробнее»
function saveQuickOp() {
    const v = validateAmount(document.getElementById('amountInput').value);
    if (!v.ok) {
        haptic('error');
        const disp = document.getElementById('amountDisplay');
        disp.style.color = 'var(--red)';
        setTimeout(function() { disp.style.color = ''; }, 500);
        return;
    }
    // Статья обязательна — без неё подсказываем выбрать
    if (!selectedArticleId) {
        haptic('error');
        const lbl = document.getElementById('quickArticlesLabel');
        if (lbl) {
            const prev = lbl.textContent;
            lbl.textContent = 'Сначала выберите статью ↑';
            lbl.style.color = 'var(--red)';
            setTimeout(function() { lbl.style.color = ''; lbl.textContent = 'Статья — выберите'; }, 1600);
        }
        return;
    }
    const article = getArticleById(selectedArticleId);
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
        comment: '',
        date: dateVal ? (dateVal + 'T12:00:00') : new Date().toISOString()
    };
    operations.unshift(op);
    Storage.save('mycash_ops', operations);
    Storage.save('mycash_last_wallet', selectedWallet);
    haptic('success');
    document.getElementById('modalOverlay').classList.remove('active');
    if (typeof setClosingGuard === 'function') setClosingGuard(false);
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
        comment: '',
        date: (dateVal || new Date().toISOString().split('T')[0]) + 'T12:00:00'
    };
    operations.unshift(op);
    Storage.save('mycash_ops', operations);
    haptic('success');
    document.getElementById('modalOverlay').classList.remove('active');
    if (typeof setClosingGuard === 'function') setClosingGuard(false);
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
            comment: '',
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
            comment: '',
            date: (dateVal || new Date().toISOString().split('T')[0]) + 'T12:00:00'
        };
        operations.unshift(newOp);
    }

    Storage.save('mycash_ops', operations);
    Storage.save('mycash_last_wallet', selectedWallet);
    haptic('success');
    document.getElementById('modalOverlay').classList.remove('active');
    if (typeof setClosingGuard === 'function') setClosingGuard(false);
    renderAll();

    // Отправка на сервер в фоне
    sendOperationToServer(newOp);
}

// === СТЕППЕР ОКНА ОПЕРАЦИИ (пошаговый ввод) ===
// Открыть конкретный шаг (остальные свернуть)
function stepOpen(k) {
    document.querySelectorAll('#modalOverlay .qsec').forEach(function(s) {
        s.classList.toggle('act', s.dataset.step === k);
    });
}
// Отметить шаг выполненным (зелёная галочка)
function stepMarkDone(k) {
    const s = document.querySelector('#modalOverlay .qsec[data-step="' + k + '"]');
    if (s) s.classList.add('done');
}
// Сброс степпера при открытии окна: всё не выполнено, открыт 1-й шаг (сумма)
function stepReset() {
    document.querySelectorAll('#modalOverlay .qsec').forEach(function(s) { s.classList.remove('done'); });
    ['qvalAmount', 'qvalType', 'qvalWallet', 'qvalArticle'].forEach(function(id) {
        const e = document.getElementById(id); if (e) e.innerHTML = '';
    });
    stepOpen('amount');
}
// Кнопка «Далее» на шаге суммы → переход к типу
function amountStepNext() {
    const v = validateAmount(document.getElementById('amountInput').value);
    if (!v.ok) {
        haptic('error');
        const d = document.getElementById('amountDisplay');
        d.style.color = 'var(--red)';
        setTimeout(function() { d.style.color = ''; }, 500);
        return;
    }
    const qv = document.getElementById('qvalAmount');
    if (qv) qv.innerHTML = '<span class="qpill">' + fmt(v.amount) + ' ₽</span>';
    stepMarkDone('amount');
    stepOpen('type');
}
// Выбор типа (расход/доход/перевод) → пилюля цветом + переход дальше
function chooseType(type) {
    setType(type);
    const label = { expense: 'Расход', income: 'Доход', transfer: 'Перевод' }[type];
    const cls = { expense: 'red', income: 'green', transfer: 'blue' }[type];
    const qv = document.getElementById('qvalType');
    if (qv) qv.innerHTML = '<span class="qpill ' + cls + '">' + label + '</span>';
    stepMarkDone('type');
    stepOpen(type === 'transfer' ? 'article' : 'wallet');
}
// Экспорт для onclick в разметке
window.stepOpen = stepOpen;
window.amountStepNext = amountStepNext;
window.chooseType = chooseType;

