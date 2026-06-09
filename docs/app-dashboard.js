'use strict';
// MyCash — дашборд 4/6: аналитика, очистка демо, карусель, таблица расходов
// ВНИМАНИЕ: файлы app-*.js делят ОДНУ общую область видимости.
// Подключаются по порядку в index.html. Порядок менять нельзя.

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

    // Блок аналитики всегда виден, чтобы кнопки периода (Сегодня/Неделя/…) оставались доступны
    document.getElementById('dashboardInline').style.display = 'block';

    if (dashExpenses.length === 0) {
        // Пустой период: показываем сообщение, но кнопки периода НЕ прячем
        const totalLabel = document.getElementById('dashTotalLabel');
        if (totalLabel) {
            totalLabel.textContent = '0 ₽';
            totalLabel.style.color = isExpense ? 'var(--red)' : 'var(--green)';
        }
        const canvas = document.getElementById('pieChart');
        if (canvas) canvas.style.display = 'none';
        const barsBox = document.getElementById('dashBars');
        if (barsBox) barsBox.innerHTML = '<div style="text-align:center;color:var(--text2);font-size:13px;padding:24px 0">Нет операций за выбранный период</div>';
        const legendBox = document.getElementById('dashLegend');
        if (legendBox) legendBox.innerHTML = '';
        return;
    }

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
                const wallet = op.wallet || '💳 Карта';
                return `<div class="dash-cat-op" onclick="event.stopPropagation(); openEdit('${op.id}')" style="cursor:pointer">
                    <span class="dash-cat-op-left">${dateStr} · ${esc(wallet)}</span>
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

