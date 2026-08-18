/* Controlo de Gastos nas Férias
 * App 100% offline: os dados ficam guardados no próprio dispositivo (localStorage).
 */
(() => {
  'use strict';

  // ---------- Constantes ----------
  const STORAGE_KEY = 'ferias_gastos_v1';
  const CURRENCIES = {
    EUR: '€', USD: '$', GBP: '£', BRL: 'R$', CHF: 'CHF', JPY: '¥'
  };
  const CATEGORIES = [
    { id: 'comida',      name: 'Comida',     emoji: '🍽️', color: '#f97316' },
    { id: 'alojamento',  name: 'Alojamento', emoji: '🏨', color: '#8b5cf6' },
    { id: 'transporte',  name: 'Transporte', emoji: '🚗', color: '#0ea5e9' },
    { id: 'atividades',  name: 'Atividades', emoji: '🎟️', color: '#ec4899' },
    { id: 'compras',     name: 'Compras',    emoji: '🛍️', color: '#14b8a6' },
    { id: 'bebidas',     name: 'Bebidas',    emoji: '🍹', color: '#eab308' },
    { id: 'saude',       name: 'Saúde',      emoji: '💊', color: '#ef4444' },
    { id: 'outros',      name: 'Outros',     emoji: '✨', color: '#64748b' }
  ];
  const catById = (id) => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

  // ---------- Estado ----------
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignora */ }
    // Estado inicial
    const tripId = uid();
    return {
      trips: [{
        id: tripId, name: 'As minhas férias', budget: 0,
        currency: 'EUR', start: '', end: '', people: []
      }],
      expenses: [],
      activeTrip: tripId,
      theme: 'light'
    };
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { toast('Não foi possível guardar 😕'); }
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  const activeTrip = () => state.trips.find(t => t.id === state.activeTrip) || state.trips[0];
  const tripExpenses = () => state.expenses.filter(e => e.tripId === state.activeTrip);

  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function fmt(amount, currency) {
    const sym = CURRENCIES[currency || activeTrip().currency] || '';
    const n = Number(amount || 0);
    const formatted = n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${sym} ${formatted}`;
  }
  function fmtShort(amount) {
    const sym = CURRENCIES[activeTrip().currency] || '';
    const n = Math.round(Number(amount || 0));
    return `${sym}${n.toLocaleString('pt-PT')}`;
  }
  function daysBetween(a, b) {
    if (!a || !b) return 0;
    const d = (new Date(b) - new Date(a)) / 86400000;
    return d >= 0 ? Math.round(d) + 1 : 0;
  }
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function prettyDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  // ---------- Navegação por separadores ----------
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  function switchTab(tab) {
    $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
    if (tab === 'painel') renderDashboard();
    if (tab === 'despesas') renderExpenses();
    if (tab === 'viagens') renderTrips();
  }

  // ---------- Tema ----------
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', state.theme === 'dark' ? '#0d1220' : '#0ea5e9');
  }
  $('#themeBtn').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(); save();
    renderDashboard();
  });

  // ==================================================================
  //  PAINEL
  // ==================================================================
  function renderDashboard() {
    const trip = activeTrip();
    const exps = tripExpenses();
    const total = exps.reduce((s, e) => s + Number(e.amount), 0);

    $('#tripNameLabel').textContent = trip.name;
    $('#tripDatesLabel').textContent = (trip.start && trip.end)
      ? `${prettyDate(trip.start)} – ${prettyDate(trip.end)}`
      : `${exps.length} despesa(s)`;

    // Orçamento
    $('#spentLabel').textContent = fmt(total);
    $('#budgetLabel').textContent = trip.budget > 0 ? fmt(trip.budget) : 'definir';
    const remain = trip.budget - total;
    const remainEl = $('#remainLabel');
    remainEl.textContent = fmt(remain);
    remainEl.className = remain < 0 ? 'over' : (remain < trip.budget * 0.15 ? 'warn' : 'ok');

    const pct = trip.budget > 0 ? Math.min(total / trip.budget, 1.5) : 0;
    const ring = $('#budgetRing');
    const circ = 2 * Math.PI * 52;
    ring.style.strokeDasharray = circ;
    ring.style.strokeDashoffset = circ * (1 - Math.min(pct, 1));
    ring.style.stroke = total > trip.budget && trip.budget > 0
      ? 'var(--danger)' : (pct > 0.85 ? 'var(--warn)' : 'var(--primary)');
    $('#budgetPct').textContent = trip.budget > 0 ? Math.round((total / trip.budget) * 100) + '%' : '—';

    // Estatísticas
    $('#statCount').textContent = exps.length;
    const nDays = daysBetween(trip.start, trip.end) || uniqueDays(exps) || 1;
    $('#statDays').textContent = daysBetween(trip.start, trip.end) || uniqueDays(exps) || 0;
    $('#statDaily').textContent = fmtShort(total / nDays);

    // Categoria maior
    const byCat = groupByCategory(exps);
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    $('#statTopCat').textContent = top ? catById(top[0]).emoji + ' ' + catById(top[0]).name : '—';

    drawDonut(byCat, total);
    drawBars(exps);
    renderSettlement(trip, exps);
  }

  function uniqueDays(exps) {
    return new Set(exps.map(e => e.date)).size;
  }
  function groupByCategory(exps) {
    const g = {};
    exps.forEach(e => { g[e.category] = (g[e.category] || 0) + Number(e.amount); });
    return g;
  }

  // ---------- Donut (canvas) ----------
  function drawDonut(byCat, total) {
    const canvas = $('#donutChart');
    const ctx = canvas.getContext('2d');
    const size = 220, cx = size / 2, cy = size / 2, r = 88, lw = 30;
    ctx.clearRect(0, 0, size, size);

    const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const legend = $('#catLegend');
    legend.innerHTML = '';
    $('#catTotalLabel').textContent = total > 0 ? fmt(total) : '';

    if (total <= 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.lineWidth = lw;
      ctx.strokeStyle = getCss('--surface-2');
      ctx.stroke();
      legend.innerHTML = '<li class="muted small">Sem despesas ainda</li>';
      return;
    }

    let start = -Math.PI / 2;
    entries.forEach(([cat, val]) => {
      const frac = val / total;
      const end = start + frac * 2 * Math.PI;
      ctx.beginPath();
      ctx.arc(cx, cy, r, start, end);
      ctx.lineWidth = lw;
      ctx.strokeStyle = catById(cat).color;
      ctx.lineCap = 'butt';
      ctx.stroke();
      start = end;

      const c = catById(cat);
      const li = document.createElement('li');
      li.innerHTML = `<span class="dot" style="background:${c.color}"></span>
        <span class="lg-name">${c.emoji} ${c.name}</span>
        <span class="lg-val">${Math.round(frac * 100)}%</span>`;
      legend.appendChild(li);
    });

    // centro
    ctx.fillStyle = getCss('--text');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 18px -apple-system, sans-serif';
    ctx.fillText(fmtShort(total), cx, cy);
  }

  // ---------- Barras por dia ----------
  function drawBars(exps) {
    const canvas = $('#barChart');
    const wCss = canvas.parentElement.clientWidth - 36;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(wCss, 200), h = 200;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const byDay = {};
    exps.forEach(e => { byDay[e.date] = (byDay[e.date] || 0) + Number(e.amount); });
    let days = Object.keys(byDay).sort();
    if (days.length === 0) {
      ctx.fillStyle = getCss('--muted');
      ctx.textAlign = 'center';
      ctx.font = '13px -apple-system, sans-serif';
      ctx.fillText('Sem dados para mostrar', w / 2, h / 2);
      return;
    }
    days = days.slice(-14); // últimos 14 dias com gastos
    const max = Math.max(...days.map(d => byDay[d]));
    const pad = 28, bw = (w - pad) / days.length;
    const barW = Math.min(bw * 0.62, 40);

    days.forEach((d, i) => {
      const val = byDay[d];
      const bh = max > 0 ? (val / max) * (h - 48) : 0;
      const x = pad / 2 + i * bw + (bw - barW) / 2;
      const y = h - 26 - bh;
      const grad = ctx.createLinearGradient(0, y, 0, h - 26);
      grad.addColorStop(0, getCss('--primary'));
      grad.addColorStop(1, getCss('--primary-d'));
      ctx.fillStyle = grad;
      roundRect(ctx, x, y, barW, bh, 6);
      ctx.fill();

      ctx.fillStyle = getCss('--muted');
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      const label = new Date(d + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
      ctx.fillText(label, x + barW / 2, h - 10);
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (h < 1) return;
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function getCss(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#0ea5e9';
  }

  // ---------- Acerto de contas ----------
  function renderSettlement(trip, exps) {
    const card = $('#settleCard');
    const people = trip.people || [];
    const withSplit = exps.filter(e => e.paidBy && e.splitAmong && e.splitAmong.length > 0);
    if (people.length < 2 || withSplit.length === 0) { card.hidden = true; return; }
    card.hidden = false;

    // saldo por pessoa: pagou - devia
    const balance = {};
    people.forEach(p => balance[p] = 0);
    withSplit.forEach(e => {
      const amt = Number(e.amount);
      if (balance[e.paidBy] === undefined) balance[e.paidBy] = 0;
      balance[e.paidBy] += amt;
      const share = amt / e.splitAmong.length;
      e.splitAmong.forEach(p => {
        if (balance[p] === undefined) balance[p] = 0;
        balance[p] -= share;
      });
    });

    // algoritmo simples de acerto
    const creditors = [], debtors = [];
    Object.entries(balance).forEach(([p, v]) => {
      if (v > 0.01) creditors.push({ p, v });
      else if (v < -0.01) debtors.push({ p, v: -v });
    });
    creditors.sort((a, b) => b.v - a.v);
    debtors.sort((a, b) => b.v - a.v);

    const list = $('#settleList');
    list.innerHTML = '';
    let i = 0, j = 0;
    let any = false;
    while (i < debtors.length && j < creditors.length) {
      const pay = Math.min(debtors[i].v, creditors[j].v);
      if (pay > 0.01) {
        any = true;
        const li = document.createElement('li');
        li.innerHTML = `<span><strong>${debtors[i].p}</strong> → ${creditors[j].p}</span>
          <span class="amt">${fmt(pay)}</span>`;
        list.appendChild(li);
      }
      debtors[i].v -= pay; creditors[j].v -= pay;
      if (debtors[i].v < 0.01) i++;
      if (creditors[j].v < 0.01) j++;
    }
    if (!any) list.innerHTML = '<li class="muted small">Contas equilibradas ✅</li>';
  }

  // ==================================================================
  //  DESPESAS (lista)
  // ==================================================================
  function renderExpenses() {
    populateCatFilter();
    const term = ($('#searchInput').value || '').toLowerCase();
    const catFilter = $('#filterCat').value;
    let exps = tripExpenses().slice().sort((a, b) =>
      (b.date.localeCompare(a.date)) || (b.createdAt - a.createdAt));

    if (term) exps = exps.filter(e =>
      (e.description || '').toLowerCase().includes(term) ||
      catById(e.category).name.toLowerCase().includes(term));
    if (catFilter) exps = exps.filter(e => e.category === catFilter);

    const list = $('#expenseList');
    const empty = $('#expenseEmpty');
    list.innerHTML = '';
    if (exps.length === 0) { empty.hidden = false; return; }
    empty.hidden = true;

    exps.forEach(e => {
      const c = catById(e.category);
      const li = document.createElement('li');
      li.innerHTML = `
        <div class="exp-emoji" style="background:${c.color}22">${c.emoji}</div>
        <div class="exp-body">
          <div class="exp-desc">${escapeHtml(e.description || c.name)}</div>
          <div class="exp-meta">${prettyDate(e.date)} · ${c.name}${e.paidBy ? ' · ' + escapeHtml(e.paidBy) : ''}</div>
        </div>
        <div class="exp-amt">${fmt(e.amount)}</div>`;
      li.addEventListener('click', () => openExpenseModal(e));
      list.appendChild(li);
    });
  }

  function populateCatFilter() {
    const sel = $('#filterCat');
    if (sel.dataset.filled) return;
    CATEGORIES.forEach(c => {
      const o = document.createElement('option');
      o.value = c.id; o.textContent = `${c.emoji} ${c.name}`;
      sel.appendChild(o);
    });
    sel.dataset.filled = '1';
  }
  $('#searchInput').addEventListener('input', renderExpenses);
  $('#filterCat').addEventListener('change', renderExpenses);

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  // ==================================================================
  //  MODAL DESPESA
  // ==================================================================
  let selectedCat = 'comida';
  let selectedSplit = [];

  function buildCatPicker() {
    const wrap = $('#catPicker');
    wrap.innerHTML = '';
    CATEGORIES.forEach(c => {
      const div = document.createElement('div');
      div.className = 'cat-opt' + (c.id === selectedCat ? ' selected' : '');
      div.innerHTML = `<span class="c-emoji">${c.emoji}</span><span class="c-name">${c.name}</span>`;
      div.addEventListener('click', () => {
        selectedCat = c.id;
        $$('.cat-opt').forEach(o => o.classList.remove('selected'));
        div.classList.add('selected');
      });
      wrap.appendChild(div);
    });
  }

  function openExpenseModal(exp) {
    const trip = activeTrip();
    buildCatPicker();
    $('#curBadge').textContent = CURRENCIES[trip.currency];

    const isEdit = !!exp;
    $('#expenseModalTitle').textContent = isEdit ? 'Editar despesa' : 'Nova despesa';
    $('#deleteExpenseBtn').hidden = !isEdit;
    $('#expenseId').value = isEdit ? exp.id : '';
    $('#expenseAmount').value = isEdit ? exp.amount : '';
    $('#expenseDesc').value = isEdit ? (exp.description || '') : '';
    $('#expenseDate').value = isEdit ? exp.date : todayStr();
    selectedCat = isEdit ? exp.category : 'comida';
    buildCatPicker();

    // pessoas / divisão
    const people = trip.people || [];
    const paidWrap = $('#paidByWrap');
    const splitWrap = $('#splitWrap');
    if (people.length > 0) {
      paidWrap.hidden = false;
      splitWrap.hidden = false;
      const paidSel = $('#expensePaidBy');
      paidSel.innerHTML = '<option value="">—</option>' +
        people.map(p => `<option value="${escapeAttr(p)}">${escapeHtml(p)}</option>`).join('');
      paidSel.value = isEdit ? (exp.paidBy || '') : '';
      selectedSplit = isEdit && exp.splitAmong ? exp.splitAmong.slice() : people.slice();
      buildSplitPicker(people);
    } else {
      paidWrap.hidden = true;
      splitWrap.hidden = true;
      selectedSplit = [];
    }

    showModal('#expenseModal');
    setTimeout(() => $('#expenseAmount').focus(), 200);
  }

  function buildSplitPicker(people) {
    const wrap = $('#splitPeople');
    wrap.innerHTML = '';
    people.forEach(p => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'split-chip' + (selectedSplit.includes(p) ? ' on' : '');
      chip.textContent = p;
      chip.addEventListener('click', () => {
        if (selectedSplit.includes(p)) selectedSplit = selectedSplit.filter(x => x !== p);
        else selectedSplit.push(p);
        chip.classList.toggle('on');
      });
      wrap.appendChild(chip);
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

  $('#expenseForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const amount = parseFloat($('#expenseAmount').value);
    if (!(amount > 0)) { toast('Indica um valor válido'); return; }
    const id = $('#expenseId').value;
    const trip = activeTrip();
    const data = {
      amount: Math.round(amount * 100) / 100,
      description: $('#expenseDesc').value.trim(),
      category: selectedCat,
      date: $('#expenseDate').value || todayStr(),
      paidBy: (trip.people || []).length ? $('#expensePaidBy').value : '',
      splitAmong: (trip.people || []).length ? selectedSplit.slice() : []
    };
    if (id) {
      const e = state.expenses.find(x => x.id === id);
      Object.assign(e, data);
      toast('Despesa atualizada ✅');
    } else {
      state.expenses.push({ id: uid(), tripId: trip.id, createdAt: Date.now(), ...data });
      toast('Despesa adicionada 🎉');
    }
    save();
    closeModal('#expenseModal');
    refreshAll();
  });

  $('#deleteExpenseBtn').addEventListener('click', () => {
    const id = $('#expenseId').value;
    if (!id) return;
    if (!confirm('Eliminar esta despesa?')) return;
    state.expenses = state.expenses.filter(e => e.id !== id);
    save();
    closeModal('#expenseModal');
    refreshAll();
    toast('Despesa eliminada');
  });

  $('#addExpenseBtn').addEventListener('click', () => openExpenseModal(null));

  // ==================================================================
  //  VIAGENS
  // ==================================================================
  function renderTrips() {
    const list = $('#tripList');
    list.innerHTML = '';
    state.trips.forEach(t => {
      const spent = state.expenses.filter(e => e.tripId === t.id)
        .reduce((s, e) => s + Number(e.amount), 0);
      const li = document.createElement('li');
      if (t.id === state.activeTrip) li.classList.add('active-trip');
      li.innerHTML = `
        <div>
          <div class="t-name">${escapeHtml(t.name)} ${t.id === state.activeTrip ? '<span class="badge-active">ativa</span>' : ''}</div>
          <div class="t-meta">${fmt(spent, t.currency)} gasto${t.budget > 0 ? ' · orç. ' + fmt(t.budget, t.currency) : ''}</div>
        </div>
        <button class="icon-btn" data-edit title="Editar">✎</button>`;
      li.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-edit]')) { openTripModal(t); return; }
        state.activeTrip = t.id; save(); refreshAll();
        toast(`A ver: ${t.name}`);
        switchTab('painel');
      });
      list.appendChild(li);
    });
    renderPeople();
  }

  function renderPeople() {
    const trip = activeTrip();
    const list = $('#peopleList');
    list.innerHTML = '';
    (trip.people || []).forEach(p => {
      const chip = document.createElement('span');
      chip.className = 'person-chip';
      chip.innerHTML = `${escapeHtml(p)} <button data-p="${escapeAttr(p)}" aria-label="Remover">✕</button>`;
      chip.querySelector('button').addEventListener('click', () => {
        trip.people = trip.people.filter(x => x !== p);
        save(); renderPeople();
      });
      list.appendChild(chip);
    });
  }

  $('#addPersonBtn').addEventListener('click', addPerson);
  $('#personInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addPerson(); } });
  function addPerson() {
    const inp = $('#personInput');
    const name = inp.value.trim();
    if (!name) return;
    const trip = activeTrip();
    trip.people = trip.people || [];
    if (trip.people.includes(name)) { toast('Essa pessoa já existe'); return; }
    trip.people.push(name);
    inp.value = '';
    save(); renderPeople();
  }

  function openTripModal(trip) {
    const isEdit = !!trip;
    $('#tripModalTitle').textContent = isEdit ? 'Editar viagem' : 'Nova viagem';
    $('#deleteTripBtn').hidden = !isEdit || state.trips.length <= 1;
    $('#tripId').value = isEdit ? trip.id : '';
    $('#tripNameInput').value = isEdit ? trip.name : '';
    $('#tripStart').value = isEdit ? (trip.start || '') : '';
    $('#tripEnd').value = isEdit ? (trip.end || '') : '';
    $('#tripBudget').value = isEdit && trip.budget ? trip.budget : '';
    $('#tripCurrency').value = isEdit ? trip.currency : 'EUR';
    showModal('#tripModal');
  }

  $('#newTripBtn').addEventListener('click', () => openTripModal(null));
  $('#menuTripBtn').addEventListener('click', () => switchTab('viagens'));

  $('#tripForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const id = $('#tripId').value;
    const data = {
      name: $('#tripNameInput').value.trim() || 'Viagem',
      start: $('#tripStart').value,
      end: $('#tripEnd').value,
      budget: parseFloat($('#tripBudget').value) || 0,
      currency: $('#tripCurrency').value
    };
    if (id) {
      const t = state.trips.find(x => x.id === id);
      Object.assign(t, data);
      toast('Viagem atualizada ✅');
    } else {
      const t = { id: uid(), people: [], ...data };
      state.trips.push(t);
      state.activeTrip = t.id;
      toast('Viagem criada 🧳');
    }
    save();
    closeModal('#tripModal');
    refreshAll();
    switchTab('painel');
  });

  $('#deleteTripBtn').addEventListener('click', () => {
    const id = $('#tripId').value;
    if (!id || state.trips.length <= 1) return;
    if (!confirm('Eliminar esta viagem e todas as suas despesas?')) return;
    state.trips = state.trips.filter(t => t.id !== id);
    state.expenses = state.expenses.filter(e => e.tripId !== id);
    if (state.activeTrip === id) state.activeTrip = state.trips[0].id;
    save();
    closeModal('#tripModal');
    refreshAll();
    toast('Viagem eliminada');
  });

  // ---------- Orçamento rápido ----------
  $('#editBudgetBtn').addEventListener('click', () => {
    $('#budgetInput').value = activeTrip().budget || '';
    showModal('#budgetModal');
    setTimeout(() => $('#budgetInput').focus(), 200);
  });
  $('#budgetForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    activeTrip().budget = parseFloat($('#budgetInput').value) || 0;
    save();
    closeModal('#budgetModal');
    renderDashboard();
    toast('Orçamento guardado 💰');
  });

  // ==================================================================
  //  DADOS: exportar / importar
  // ==================================================================
  $('#exportCsvBtn').addEventListener('click', () => {
    const exps = tripExpenses();
    if (exps.length === 0) { toast('Sem despesas para exportar'); return; }
    const trip = activeTrip();
    const rows = [['Data', 'Categoria', 'Descrição', 'Valor', 'Moeda', 'Pago por', 'Dividido entre']];
    exps.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
      rows.push([
        e.date, catById(e.category).name, e.description || '',
        String(e.amount).replace('.', ','), trip.currency,
        e.paidBy || '', (e.splitAmong || []).join(' / ')
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    download('﻿' + csv, `ferias_${slug(trip.name)}.csv`, 'text/csv;charset=utf-8');
    toast('CSV exportado 📄');
  });

  $('#exportJsonBtn').addEventListener('click', () => {
    download(JSON.stringify(state, null, 2), 'ferias_backup.json', 'application/json');
    toast('Cópia de segurança criada 💾');
  });

  $('#importInput').addEventListener('change', (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.trips || !data.expenses) throw new Error('formato');
        if (!confirm('Isto substitui os dados atuais. Continuar?')) return;
        state = data;
        if (!state.theme) state.theme = 'light';
        save(); applyTheme(); refreshAll();
        toast('Dados importados ✅');
      } catch (e) { toast('Ficheiro inválido 😕'); }
    };
    reader.readAsText(file);
    ev.target.value = '';
  });

  function download(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'viagem'; }

  // ==================================================================
  //  MODAIS: abrir/fechar
  // ==================================================================
  function showModal(sel) { $(sel).hidden = false; document.body.style.overflow = 'hidden'; }
  function closeModal(sel) { $(sel).hidden = true; document.body.style.overflow = ''; }
  $$('.modal-backdrop').forEach(bd => {
    bd.addEventListener('click', (e) => {
      if (e.target === bd || e.target.closest('[data-close]')) closeModal('#' + bd.id);
    });
  });

  // ---------- Atualizar tudo ----------
  function refreshAll() {
    const active = document.querySelector('.tab-btn.active');
    const tab = active ? active.dataset.tab : 'painel';
    if (tab === 'painel') renderDashboard();
    if (tab === 'despesas') renderExpenses();
    if (tab === 'viagens') renderTrips();
    // manter o painel sempre coerente em background
    if (tab !== 'painel') renderDashboard();
  }

  window.addEventListener('resize', () => {
    if (document.querySelector('#tab-painel').classList.contains('active')) renderDashboard();
  });

  // ==================================================================
  //  Arranque
  // ==================================================================
  applyTheme();
  renderDashboard();

  // Service worker (offline)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
