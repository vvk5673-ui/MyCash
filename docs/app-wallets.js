'use strict';
// MyCash — счета 5/6: редактирование счёта, перетаскивание, тариф, правка операции
// ВНИМАНИЕ: файлы app-*.js делят ОДНУ общую область видимости.
// Подключаются по порядку в index.html. Порядок менять нельзя.

// === РЕДАКТИРОВАНИЕ КОШЕЛЬКА ===
// Цвета значка счёта (яркие — в новой модели color = цвет иконки, не фон карточки)
const WALLET_COLORS = [
    { name: 'Синий', color: '#007AFF' },
    { name: 'Зелёный', color: '#34C759' },
    { name: 'Оранжевый', color: '#FF9500' },
    { name: 'Розовый', color: '#FF2D55' },
    { name: 'Фиолетовый', color: '#AF52DE' },
    { name: 'Жёлтый', color: '#FFCC00' }
];

let editingWalletId = null;   // id редактируемого счёта (с сервера)
let editWalletColor = '#007AFF';
let editWalletBank = null;    // выбранный банк (домен) или null = своё название
let walletSaveBusy = false;   // защита от двойного сохранения

// === ВЫБОР БАНКА ДЛЯ СЧЁТА ===
// Обновить кнопку «Банк» и видимость блока цвета (название не трогаем)
function setBankUI(domain) {
    editWalletBank = domain || null;
    const ico = document.getElementById('walletBankIco');
    const colorGroup = document.getElementById('walletColorGroup');
    if (editWalletBank) {
        // банк выбран — слева логотип, выбор цвета прячем
        if (ico) ico.innerHTML = bankFavicon(editWalletBank, 30);
        if (colorGroup) colorGroup.style.display = 'none';
    } else {
        // без банка — значок-кошелёк в выбранном цвете, выбор цвета доступен
        if (ico) ico.innerHTML = walletSquircle(editWalletColor || '#007AFF', 30);
        if (colorGroup) colorGroup.style.display = '';
    }
}

function openBankPicker() {
    haptic('light');
    const s = document.getElementById('bankSearch');
    if (s) s.value = '';
    renderBankList();
    document.getElementById('bankPickerOverlay').classList.add('active');
    // фокус на поиск — можно сразу печатать (фильтрует банки / предлагает своё название)
    setTimeout(function() { if (s) s.focus(); }, 100);
}

function closeBankPicker(e) {
    if (e && e.target && e.target !== e.currentTarget) return;
    document.getElementById('bankPickerOverlay').classList.remove('active');
}

function renderBankList() {
    const rawQ = (document.getElementById('bankSearch').value || '').trim();
    const q = rawQ.toLowerCase();
    const items = BANKS.filter(function(b) { return !q || b.name.toLowerCase().indexOf(q) !== -1; });
    let html = '';
    const showCash = !q || 'наличка'.indexOf(q) !== -1;
    // Если что-то набрали — первым предлагаем использовать это как своё название.
    // Если поле поиска пустое — обычный пункт «Без банка — своё название».
    if (rawQ) {
        html += '<div class="bank-row" onclick="selectCustomNameFromSearch()">' +
                '<span class="bank-row-ico">' + walletSquircle(editWalletColor || '#8E8E93', 32) + '</span>' +
                '<span class="bank-row-name">Использовать «' + esc(rawQ) + '» как название</span></div>';
    } else {
        html += '<div class="bank-row" onclick="startCustomName()">' +
                '<span class="bank-row-ico">' + walletSquircle(editWalletColor || '#8E8E93', 32) + '</span>' +
                '<span class="bank-row-name">Без банка — впишите своё название</span></div>';
    }
    // Быстрый выбор «Наличка» — счёт без банка с готовым названием и зелёным значком
    if (showCash) {
        html += '<div class="bank-row" onclick="selectCashWallet()">' +
                '<span class="bank-row-ico">' + walletSquircle('#34C759', 32) + '</span>' +
                '<span class="bank-row-name">Наличка</span></div>';
    }
    html += items.map(function(b) {
        return '<div class="bank-row" onclick="selectBank(\'' + b.domain + '\')">' +
               '<span class="bank-row-ico">' + bankFavicon(b.domain, 32) + '</span>' +
               '<span class="bank-row-name">' + esc(b.name) + '</span></div>';
    }).join('');
    document.getElementById('bankPickerList').innerHTML = html;
}

function selectBank(domain) {
    haptic('light');
    const nameInput = document.getElementById('walletEditName');
    setBankUI(domain);
    if (domain) {
        const b = bankByDomain(domain);
        const cur = (nameInput.value || '').trim();
        // Автозаполнить название банком, если поле пустое или там было имя другого банка
        if (b && (!cur || bankForName(cur))) nameInput.value = b.name;
    }
    closeBankPicker();
}

// «Без банка — впишите своё название»: курсор в поиск, чтобы набрать собственное имя счёта.
// После набора первым пунктом появится «Использовать «…» как название».
function startCustomName() {
    const s = document.getElementById('bankSearch');
    if (s) { s.focus(); }
}

// Использовать набранный в поиске текст как своё название счёта (без банка)
function selectCustomNameFromSearch() {
    const v = (document.getElementById('bankSearch').value || '').trim();
    if (!v) return;
    haptic('light');
    setBankUI(null);   // без банка → значок-кошелёк, выбор цвета доступен
    document.getElementById('walletEditName').value = v;
    closeBankPicker();
}

// Быстрый выбор «Наличка»: счёт без банка с готовым названием и зелёным значком-кошельком
function selectCashWallet() {
    haptic('light');
    setBankUI(null);                 // без банка → значок-кошелёк, выбор цвета доступен
    editWalletColor = '#34C759';     // зелёный по умолчанию для налички
    renderWalletColorGrid();
    document.getElementById('walletEditName').value = 'Наличка';
    closeBankPicker();
}

// Отрисовать палитру значков-кошельков (пользователь видит сам значок в каждом цвете)
function renderWalletColorGrid() {
    document.getElementById('walletColorGrid').innerHTML = WALLET_COLORS.map(function(c) {
        return '<div class="wallet-color-btn ' + (c.color === editWalletColor ? 'active' : '') + '"' +
               ' data-color="' + c.color + '"' +
               ' onclick="selectWalletColor(\'' + c.color + '\')">' + walletSquircle(c.color, 40) + '</div>';
    }).join('');
}

// Заполнить выпадающий список направлений в окне счёта (выбрать selectedId, если задан)
function populateWalletDirectionSelect(selectedId) {
    const sel = document.getElementById('walletEditDirection');
    if (!sel) return;
    const dirs = (Refs.directions || []).filter(function(d) { return !d.is_archived; });
    sel.innerHTML = dirs.map(function(d) {
        return '<option value="' + d.id + '">' + esc(d.name) + '</option>';
    }).join('');
    if (selectedId) sel.value = selectedId;
}

function openWalletEdit(walletId) {
    if (walletDragged) { walletDragged = false; return; }   // после перетаскивания не открывать настройки
    const w = (Refs.wallets || []).find(function(x) { return String(x.id) === String(walletId); });
    if (!w) { return; }
    editingWalletId = w.id;
    editWalletColor = w.color || '#007AFF';
    haptic('light');

    document.getElementById('walletEditTitle').textContent = 'Настройки счёта';
    document.getElementById('walletEditName').value = w.name || '';
    populateWalletDirectionSelect(w.direction_id);
    document.getElementById('walletEditBalance').value = Number(w.initial_balance) || 0;
    const accInput = document.getElementById('walletEditAccStart');
    if (accInput) accInput.value = accountingStartStr ? accountingStartStr.slice(0, 7) : '';
    // Режим редактирования: дата начала учёта видна, кнопка удаления активна
    document.getElementById('walletAccStartGroup').style.display = '';
    const delBtn = document.getElementById('walletDeleteBtn');
    delBtn.style.display = '';
    delBtn.style.opacity = '1';
    delBtn.onclick = function() { deleteWallet(); };

    // Банк: явно из icon ('bank:домен') или распознать по названию счёта
    const wBank = (w.icon && w.icon.indexOf('bank:') === 0)
        ? w.icon.slice(5)
        : (bankForName(w.name) ? bankForName(w.name).domain : null);
    setBankUI(wBank);

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
    populateWalletDirectionSelect();   // по умолчанию первое направление в списке
    document.getElementById('walletEditBalance').value = 0;
    // При создании дату начала учёта (общую) и удаление не показываем
    document.getElementById('walletAccStartGroup').style.display = 'none';
    document.getElementById('walletDeleteBtn').style.display = 'none';

    setBankUI(null);   // новый счёт — банк не выбран
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
    // обновить значок-кошелёк слева в строке названия (если банк не выбран)
    if (!editWalletBank) {
        const ico = document.getElementById('walletBankIco');
        if (ico) ico.innerHTML = walletSquircle(color, 30);
    }
}

async function saveWalletEdit() {
    if (walletSaveBusy) return;
    const id = editingWalletId;   // null → создаём новый счёт

    const newName = document.getElementById('walletEditName').value.trim();
    if (!newName) { haptic('error'); return; }
    const newBalance = parseFloat(document.getElementById('walletEditBalance').value) || 0;
    // Направление обязательно (для группировки в блоке «Мои финансы»)
    const dirSel = document.getElementById('walletEditDirection');
    const newDirectionId = dirSel ? dirSel.value : '';
    if (!newDirectionId) {
        haptic('error');
        alert('Выберите направление счёта. Добавить новое направление можно в Профиле.');
        return;
    }

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
                icon: editWalletBank ? 'bank:' + editWalletBank : 'wallet',
                color: editWalletColor,
                initial_balance: newBalance,
                direction_id: newDirectionId
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
            icon: editWalletBank ? 'bank:' + editWalletBank : 'wallet',
            color: editWalletColor,
            initial_balance: newBalance,
            direction_id: newDirectionId
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

// === ПЕРЕТАСКИВАНИЕ СЧЕТОВ (изменение порядка) ===
let walletDragged = false;     // было ли перемещение (чтобы не открыть настройки после drag)
let walletDragCtx = null;

function walletDragStart(e, walletId) {
    if (walletSaveBusy) return;
    e.preventDefault();
    e.stopPropagation();
    const row = e.target.closest('.wallet-line');
    const container = document.getElementById('walletsRow');
    if (!row || !container) return;
    walletDragged = false;
    walletDragCtx = { row: row, container: container };
    row.classList.add('wallet-dragging');
    try { row.setPointerCapture(e.pointerId); } catch (err) {}
    document.addEventListener('pointermove', walletDragMove);
    document.addEventListener('pointerup', walletDragEnd);
    document.addEventListener('pointercancel', walletDragEnd);
    haptic('light');
}

function walletDragMove(e) {
    if (!walletDragCtx) return;
    e.preventDefault();
    walletDragged = true;
    const ctx = walletDragCtx;
    const rows = Array.prototype.slice.call(ctx.container.querySelectorAll('.wallet-line[data-wid]'));
    const y = e.clientY;
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r === ctx.row) continue;
        const rect = r.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) {
            if (r.previousElementSibling !== ctx.row) ctx.container.insertBefore(ctx.row, r);
            return;
        }
    }
    // ниже всех счетов — перед строкой «Добавить счёт» (или в конец)
    const addRow = ctx.container.querySelector('.wallet-line-add');
    if (addRow) {
        if (addRow.previousElementSibling !== ctx.row) ctx.container.insertBefore(ctx.row, addRow);
    } else {
        ctx.container.appendChild(ctx.row);
    }
}

async function walletDragEnd() {
    if (!walletDragCtx) return;
    const ctx = walletDragCtx;
    walletDragCtx = null;
    ctx.row.classList.remove('wallet-dragging');
    document.removeEventListener('pointermove', walletDragMove);
    document.removeEventListener('pointerup', walletDragEnd);
    document.removeEventListener('pointercancel', walletDragEnd);

    if (!walletDragged) return;   // не было перемещения — ничего не делаем

    // Новый порядок id из DOM → sort_order = позиция
    const ids = Array.prototype.slice
        .call(ctx.container.querySelectorAll('.wallet-line[data-wid]'))
        .map(function(r) { return r.getAttribute('data-wid'); });

    if (typeof API === 'undefined' || !API.isOnline()) {
        haptic('error');
        alert('Перемещение счетов работает только онлайн.');
        await loadReferences();   // вернуть прежний порядок
        return;
    }

    walletSaveBusy = true;
    try {
        const updates = [];
        ids.forEach(function(id, i) {
            const w = (Refs.wallets || []).find(function(x) { return String(x.id) === String(id); });
            if (w && w.sort_order !== i) updates.push(API.updateWallet(id, { sort_order: i }));
        });
        await Promise.all(updates);
        await loadReferences();
        haptic('success');
    } catch (e) {
        haptic('error');
        alert('Не удалось сохранить порядок: ' + (e && e.message ? e.message : 'ошибка'));
        await loadReferences();
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

