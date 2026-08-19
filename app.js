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

  // Tipos de atividade do roteiro
  const PLAN_TYPES = [
    { id: 'atividade',  name: 'Atividade',  emoji: '🎫' },
    { id: 'comida',     name: 'Refeição',   emoji: '🍽️' },
    { id: 'transporte', name: 'Transporte', emoji: '🚗' },
    { id: 'voo',        name: 'Voo',        emoji: '✈️' },
    { id: 'alojamento', name: 'Alojamento', emoji: '🏨' },
    { id: 'passeio',    name: 'Passeio',    emoji: '🏞️' },
    { id: 'compras',    name: 'Compras',    emoji: '🛍️' },
    { id: 'outro',      name: 'Outro',      emoji: '📌' }
  ];
  const planType = (id) => PLAN_TYPES.find(t => t.id === id) || PLAN_TYPES[PLAN_TYPES.length - 1];

  // ---------- Estado ----------
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (!s.plans) s.plans = [];   // compatibilidade com dados antigos
        return s;
      }
    } catch (e) { /* ignora */ }
    // Estado inicial
    const tripId = uid();
    return {
      trips: [{
        id: tripId, name: 'As minhas férias',
        currency: 'EUR', start: '', end: '', people: []
      }],
      expenses: [],
      plans: [],
      activeTrip: tripId,
      theme: 'light'
    };
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { toast('Não foi possível guardar 😕'); }
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // ================================================================
  //  SINCRONIZAÇÃO NA NUVEM (Firebase Firestore) — opcional
  //  Se não estiver configurado ou estiver offline, a app continua
  //  a funcionar apenas com os dados locais (localStorage).
  // ================================================================
  const cloud = { on: false, db: null, seeded: false };

  function cloudConfigured() {
    const c = window.FERIAS_FIREBASE;
    return !!(c && typeof firebase !== 'undefined' && c.apiKey &&
              !String(c.apiKey).startsWith('COLA_'));
  }

  function setSyncBadge(mode) {
    const b = $('#syncBadge');
    if (!b) return;
    b.hidden = false;
    if (mode === 'sync') { b.textContent = '☁ sincronizado'; b.className = 'sync-badge on'; }
    else { b.textContent = '⌂ só neste dispositivo'; b.className = 'sync-badge'; }
  }

  function initCloud() {
    if (!cloudConfigured()) { setSyncBadge('local'); return; }
    try {
      firebase.initializeApp(window.FERIAS_FIREBASE);
      cloud.db = firebase.firestore();
      cloud.on = true;
      cloud.db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
      setSyncBadge('sync');
      subscribeCloud();
    } catch (e) {
      console.warn('Firebase indisponível:', e);
      cloud.on = false;
      setSyncBadge('local');
    }
  }

  function subscribeCloud() {
    cloud.db.collection('trips').onSnapshot(snap => {
      const trips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (trips.length === 0 && !cloud.seeded) {
        cloud.seeded = true;
        seedCloudFromLocal();   // primeira utilização: envia o que já existe localmente
        return;
      }
      cloud.seeded = true;
      if (trips.length) state.trips = trips;
      if (!state.trips.find(t => t.id === state.activeTrip)) {
        state.activeTrip = state.trips[0] ? state.trips[0].id : null;
      }
      save();
      refreshAll();
    }, err => console.warn('trips onSnapshot:', err));

    cloud.db.collection('expenses').onSnapshot(snap => {
      state.expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      save();
      refreshAll();
    }, err => console.warn('expenses onSnapshot:', err));

    cloud.db.collection('plans').onSnapshot(snap => {
      state.plans = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      save();
      refreshAll();
    }, err => console.warn('plans onSnapshot:', err));
  }

  function seedCloudFromLocal() {
    const batch = cloud.db.batch();
    (state.trips || []).forEach(t => {
      const { id, ...data } = t;
      batch.set(cloud.db.collection('trips').doc(id), data);
    });
    (state.expenses || []).forEach(e => {
      const { id, ...data } = e;
      batch.set(cloud.db.collection('expenses').doc(id), data);
    });
    (state.plans || []).forEach(p => {
      const { id, ...data } = p;
      batch.set(cloud.db.collection('plans').doc(id), data);
    });
    batch.commit().catch(err => console.warn('seed inicial:', err));
  }

  // Escritas na nuvem (sem efeito quando a sincronização está desligada)
  function pushTrip(trip) {
    if (!cloud.on) return;
    const { id, ...data } = trip;
    cloud.db.collection('trips').doc(id).set(data).catch(() => toast('Falha ao sincronizar 😕'));
  }
  function pushExpense(exp) {
    if (!cloud.on) return;
    const { id, ...data } = exp;
    cloud.db.collection('expenses').doc(id).set(data).catch(() => toast('Falha ao sincronizar 😕'));
  }
  function delTripCloud(id) {
    if (!cloud.on) return;
    cloud.db.collection('trips').doc(id).delete().catch(() => {});
    state.expenses.filter(e => e.tripId === id).forEach(e =>
      cloud.db.collection('expenses').doc(e.id).delete().catch(() => {}));
    (state.plans || []).filter(p => p.tripId === id).forEach(p =>
      cloud.db.collection('plans').doc(p.id).delete().catch(() => {}));
  }
  function delExpenseCloud(id) {
    if (cloud.on) cloud.db.collection('expenses').doc(id).delete().catch(() => {});
  }
  function pushPlan(plan) {
    if (!cloud.on) return;
    const { id, ...data } = plan;
    cloud.db.collection('plans').doc(id).set(data).catch(() => toast('Falha ao sincronizar 😕'));
  }
  function delPlanCloud(id) {
    if (cloud.on) cloud.db.collection('plans').doc(id).delete().catch(() => {});
  }
  function pushAllCloud() {
    if (cloud.on) seedCloudFromLocal();
  }

  const activeTrip = () => state.trips.find(t => t.id === state.activeTrip) || state.trips[0];
  const tripExpenses = () => state.expenses.filter(e => e.tripId === state.activeTrip);
  const tripPlans = () => (state.plans || []).filter(p => p.tripId === state.activeTrip);

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
    if (tab === 'mapa') renderMap();
    if (tab === 'roteiro') renderItinerary();
  }

  // ==================================================================
  //  MAPA DA VIAGEM
  // ==================================================================
  let tripMap = null, tripMarkers = null;

  function renderMap() {
    const exps = tripExpenses();
    const geo = exps.filter(e => e.location && e.location.lat != null && e.location.lng != null);
    const mapEl = $('#tripMap');

    // Lista "por local" (agrupa por nome, mesmo sem coordenadas)
    renderByPlace(exps);

    if (typeof L === 'undefined') { mapEl.innerHTML = '<p class="muted small" style="padding:16px">Mapa indisponível (sem ligação).</p>'; return; }

    $('#mapEmpty').hidden = geo.length > 0;

    setTimeout(() => {
      if (!tripMap) {
        tripMap = L.map('tripMap', { zoomControl: true });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, attribution: '© OpenStreetMap'
        }).addTo(tripMap);
        tripMarkers = L.layerGroup().addTo(tripMap);
      }
      tripMap.invalidateSize();
      tripMarkers.clearLayers();

      if (geo.length === 0) { tripMap.setView([39.5, -8.0], 5); return; }

      const bounds = [];
      geo.forEach(e => {
        const c = catById(e.category);
        const icon = L.divIcon({
          className: 'map-pin',
          html: `<div class="map-pin-in" style="background:${c.color}"><span>${c.emoji}</span></div>`,
          iconSize: [34, 34], iconAnchor: [17, 32], popupAnchor: [0, -30]
        });
        const m = L.marker([e.location.lat, e.location.lng], { icon });
        m.bindPopup(
          `<strong>${escapeHtml(e.description || c.name)}</strong><br>` +
          `${c.emoji} ${c.name} · ${fmt(e.amount)}<br>` +
          `<span style="color:#889">${prettyDate(e.date)}</span><br>` +
          `<a href="${mapUrl(e.location)}" target="_blank" rel="noopener">Abrir no Google Maps ↗</a>`
        );
        tripMarkers.addLayer(m);
        bounds.push([e.location.lat, e.location.lng]);
      });
      if (bounds.length === 1) tripMap.setView(bounds[0], 15);
      else tripMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }, 200);
  }

  function renderByPlace(exps) {
    const withName = exps.filter(e => e.location && e.location.name);
    const groups = {};
    withName.forEach(e => {
      const key = e.location.name;
      if (!groups[key]) groups[key] = { name: key, total: 0, count: 0, loc: e.location };
      groups[key].total += Number(e.amount);
      groups[key].count++;
    });
    const arr = Object.values(groups).sort((a, b) => b.total - a.total);
    const card = $('#byPlaceCard');
    const listEl = $('#placeList');
    if (arr.length === 0) { card.hidden = true; return; }
    card.hidden = false;
    $('#byPlaceCount').textContent = `${arr.length} ${arr.length > 1 ? 'locais' : 'local'}`;
    listEl.innerHTML = '';
    arr.forEach(g => {
      const li = document.createElement('li');
      li.className = 'place-row';
      li.innerHTML = `
        <span class="place-name">📍 ${escapeHtml(g.name)}</span>
        <span class="place-info">${g.count} · <strong>${fmt(g.total)}</strong></span>`;
      if (g.loc.lat != null) {
        li.style.cursor = 'pointer';
        li.addEventListener('click', () => {
          if (tripMap) { tripMap.setView([g.loc.lat, g.loc.lng], 16); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        });
      }
      listEl.appendChild(li);
    });
  }

  // ==================================================================
  //  ROTEIRO (itinerário)
  // ==================================================================
  const collapsedPlanDays = new Set();
  let selectedPlanType = 'atividade';

  function renderItinerary() {
    const plans = tripPlans();
    const list = $('#planList');
    const empty = $('#planEmpty');
    list.innerHTML = '';
    if (plans.length === 0) { empty.hidden = false; return; }
    empty.hidden = true;

    const byDay = {};
    plans.forEach(p => { (byDay[p.date] = byDay[p.date] || []).push(p); });
    const days = Object.keys(byDay).sort((a, b) => a.localeCompare(b)); // cronológico
    const orderKey = (p) => (p.order != null ? p.order : (p.createdAt || 0));

    days.forEach(day => {
      const items = byDay[day].sort((a, b) => {
        const ta = a.time || '', tb = b.time || '';
        if (ta && tb && ta !== tb) return ta.localeCompare(tb);
        if (ta && !tb) return -1;
        if (!ta && tb) return 1;
        return orderKey(a) - orderKey(b);
      });
      const doneCount = items.filter(p => p.done).length;
      const collapsed = collapsedPlanDays.has(day);

      const head = document.createElement('div');
      head.className = 'day-head' + (collapsed ? ' collapsed' : '');
      head.innerHTML = `
        <span class="day-title">${dayLabel(day)}</span>
        <span class="day-sum">${doneCount}/${items.length} feito
          <span class="chev" aria-hidden="true">▾</span></span>`;
      head.addEventListener('click', () => {
        if (collapsedPlanDays.has(day)) collapsedPlanDays.delete(day);
        else collapsedPlanDays.add(day);
        renderItinerary();
      });
      list.appendChild(head);
      if (collapsed) return;

      const group = document.createElement('div');
      group.className = 'day-group';
      group.dataset.day = day;
      items.forEach(p => group.appendChild(renderPlanItem(p)));
      list.appendChild(group);

      if (window.Sortable) {
        new Sortable(group, {
          handle: '.drag-handle', animation: 150,
          delayOnTouchOnly: true, delay: 120,
          ghostClass: 'exp-ghost', chosenClass: 'exp-chosen',
          onEnd: () => savePlanOrder(group)
        });
      }
    });
  }

  function renderPlanItem(p) {
    const t = planType(p.type);
    const item = document.createElement('div');
    item.className = 'plan-item' + (p.done ? ' done' : '');
    item.dataset.id = p.id;
    const locHtml = (p.location && (p.location.name || p.location.lat != null))
      ? `<a class="exp-loc" href="${mapUrl(p.location)}" target="_blank" rel="noopener">📍 ${escapeHtml(p.location.name || 'Ver no mapa')}</a>` : '';
    const safeLink = p.link && /^https?:\/\//i.test(p.link) ? p.link : '';
    const linkHtml = safeLink ? `<a class="plan-link" href="${escapeAttr(safeLink)}" target="_blank" rel="noopener">🔗 Link</a>` : '';
    const noteHtml = p.note ? `<div class="plan-note">${escapeHtml(p.note)}</div>` : '';
    item.innerHTML = `
      <div class="drag-handle" title="Arrastar">⠿</div>
      <button type="button" class="plan-check" aria-label="Marcar como feito">${p.done ? '✅' : '⬜'}</button>
      <div class="plan-body">
        <div class="plan-title">${p.time ? `<span class="plan-time">${escapeHtml(p.time)}</span> ` : ''}${t.emoji} ${escapeHtml(p.title)}</div>
        ${noteHtml}
        <div class="plan-meta">${[locHtml, linkHtml].filter(Boolean).join(' · ')}</div>
      </div>`;
    item.querySelector('.plan-check').addEventListener('click', (ev) => {
      ev.stopPropagation();
      p.done = !p.done; pushPlan(p); save(); renderItinerary();
    });
    item.querySelector('.drag-handle').addEventListener('click', (ev) => ev.stopPropagation());
    const locEl = item.querySelector('.exp-loc');
    if (locEl) locEl.addEventListener('click', (ev) => ev.stopPropagation());
    const lk = item.querySelector('.plan-link');
    if (lk) lk.addEventListener('click', (ev) => ev.stopPropagation());
    item.addEventListener('click', () => openPlanModal(p));
    return item;
  }

  function savePlanOrder(group) {
    const ids = Array.from(group.children).map(el => el.dataset.id);
    ids.forEach((id, i) => {
      const p = (state.plans || []).find(x => x.id === id);
      if (p) { p.order = i; pushPlan(p); }
    });
    save();
    toast('Ordem guardada ✅');
  }

  function buildPlanTypePicker() {
    const wrap = $('#planTypePicker');
    wrap.innerHTML = '';
    PLAN_TYPES.forEach(t => {
      const div = document.createElement('div');
      div.className = 'cat-opt' + (t.id === selectedPlanType ? ' selected' : '');
      div.innerHTML = `<span class="c-emoji">${t.emoji}</span><span class="c-name">${t.name}</span>`;
      div.addEventListener('click', () => {
        selectedPlanType = t.id;
        $$('#planTypePicker .cat-opt').forEach(o => o.classList.remove('selected'));
        div.classList.add('selected');
      });
      wrap.appendChild(div);
    });
  }

  function openPlanModal(plan) {
    const isEdit = !!plan;
    selectedPlanType = isEdit ? (plan.type || 'atividade') : 'atividade';
    buildPlanTypePicker();
    $('#planModalTitle').textContent = isEdit ? 'Editar atividade' : 'Nova atividade';
    $('#deletePlanBtn').hidden = !isEdit;
    $('#planId').value = isEdit ? plan.id : '';
    $('#planTitle').value = isEdit ? (plan.title || '') : '';
    $('#planDate').value = isEdit ? plan.date : (activeTrip().start || todayStr());
    $('#planTime').value = isEdit ? (plan.time || '') : '';
    $('#planNote').value = isEdit ? (plan.note || '') : '';
    $('#planLink').value = isEdit ? (plan.link || '') : '';
    planSelLoc = isEdit && plan.location ? { ...plan.location } : null;
    $('#planLoc').value = isEdit && plan.location ? (plan.location.name || '') : '';
    updatePlanLocLink();
    showModal('#planModal');
    setTimeout(() => $('#planTitle').focus(), 200);
  }

  function buildPlanLocation() {
    const name = $('#planLoc').value.trim();
    if (!name && !planSelLoc) return null;
    return {
      name: name || (planSelLoc && planSelLoc.name) || '',
      lat: planSelLoc && planSelLoc.lat != null ? planSelLoc.lat : null,
      lng: planSelLoc && planSelLoc.lng != null ? planSelLoc.lng : null
    };
  }

  $('#planForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const title = $('#planTitle').value.trim();
    if (!title) { toast('Escreve o que vais fazer'); return; }
    const id = $('#planId').value;
    const data = {
      tripId: activeTrip().id,
      title, type: selectedPlanType,
      date: $('#planDate').value || todayStr(),
      time: $('#planTime').value || '',
      note: $('#planNote').value.trim(),
      link: $('#planLink').value.trim(),
      location: buildPlanLocation()
    };
    if (id) {
      const p = state.plans.find(x => x.id === id);
      Object.assign(p, data); pushPlan(p);
      toast('Atividade atualizada ✅');
    } else {
      const p = { id: uid(), createdAt: Date.now(), done: false, ...data };
      state.plans.push(p); pushPlan(p);
      toast('Adicionado ao roteiro 🗺️');
    }
    save(); closeModal('#planModal'); refreshAll();
  });

  $('#deletePlanBtn').addEventListener('click', () => {
    const id = $('#planId').value;
    if (!id) return;
    if (!confirm('Eliminar esta atividade?')) return;
    delPlanCloud(id);
    state.plans = state.plans.filter(p => p.id !== id);
    save(); closeModal('#planModal'); refreshAll();
    toast('Atividade eliminada');
  });

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

    // Total gasto
    $('#totalSpent').textContent = exps.length ? fmt(total) : fmt(0);
    $('#totalSub').textContent = exps.length
      ? `${exps.length} despesa${exps.length > 1 ? 's' : ''} registada${exps.length > 1 ? 's' : ''}`
      : 'Sem despesas ainda';

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
  const collapsedDays = new Set();   // dias recolhidos (por data)

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

    // Arrastar para reordenar só faz sentido na vista completa (sem filtros)
    const canSort = !term && !catFilter;

    // Agrupar por dia (mais recente primeiro)
    const byDay = {};
    exps.forEach(e => { (byDay[e.date] = byDay[e.date] || []).push(e); });
    const days = Object.keys(byDay).sort((a, b) => b.localeCompare(a));
    const orderKey = (e) => (e.order != null ? e.order : (e.createdAt || 0));

    days.forEach(day => {
      const items = byDay[day].sort((a, b) => orderKey(a) - orderKey(b));
      const dayTotal = items.reduce((s, e) => s + Number(e.amount), 0);
      const collapsed = collapsedDays.has(day);

      const head = document.createElement('div');
      head.className = 'day-head' + (collapsed ? ' collapsed' : '');
      head.innerHTML = `
        <span class="day-title">${dayLabel(day)}</span>
        <span class="day-sum">${items.length} · <strong>${fmt(dayTotal)}</strong>
          <span class="chev" aria-hidden="true">▾</span></span>`;
      head.addEventListener('click', () => {
        if (collapsedDays.has(day)) collapsedDays.delete(day);
        else collapsedDays.add(day);
        renderExpenses();
      });
      list.appendChild(head);

      if (collapsed) return;

      const group = document.createElement('div');
      group.className = 'day-group';
      group.dataset.day = day;
      items.forEach(e => group.appendChild(renderExpenseItem(e, canSort)));
      list.appendChild(group);

      if (canSort && window.Sortable) {
        new Sortable(group, {
          handle: '.drag-handle',
          animation: 150,
          delayOnTouchOnly: true,
          delay: 120,
          ghostClass: 'exp-ghost',
          chosenClass: 'exp-chosen',
          onEnd: () => saveDayOrder(group)
        });
      }
    });
  }

  // Guarda a ordem manual das despesas de um dia (após arrastar)
  function saveDayOrder(group) {
    const ids = Array.from(group.children).map(el => el.dataset.id);
    ids.forEach((id, i) => {
      const e = state.expenses.find(x => x.id === id);
      if (e) { e.order = i; pushExpense(e); }
    });
    save();
    toast('Ordem guardada ✅');
  }

  function renderExpenseItem(e, canSort) {
    const c = catById(e.category);
    const item = document.createElement('div');
    item.className = 'exp-item';
    item.dataset.id = e.id;
    const locHtml = (e.location && (e.location.name || e.location.lat != null))
      ? `<a class="exp-loc" href="${mapUrl(e.location)}" target="_blank" rel="noopener">📍 ${escapeHtml(e.location.name || 'Ver no mapa')}</a>`
      : '';
    const handle = canSort ? `<div class="drag-handle" title="Arrastar">⠿</div>` : '';
    item.innerHTML = `
      ${handle}
      <div class="exp-emoji" style="background:${c.color}22">${c.emoji}</div>
      <div class="exp-body">
        <div class="exp-desc">${escapeHtml(e.description || c.name)}</div>
        <div class="exp-meta">${c.name}${e.paidBy ? ' · ' + escapeHtml(e.paidBy) : ''}</div>
        ${locHtml}
      </div>
      <div class="exp-amt">${fmt(e.amount)}</div>`;
    item.addEventListener('click', () => openExpenseModal(e));
    const locEl = item.querySelector('.exp-loc');
    if (locEl) locEl.addEventListener('click', (ev) => ev.stopPropagation());
    const h = item.querySelector('.drag-handle');
    if (h) h.addEventListener('click', (ev) => ev.stopPropagation());
    return item;
  }

  // Etiqueta amigável do dia (Hoje / Ontem / sex, 15 ago)
  function dayLabel(iso) {
    const today = todayStr();
    const yst = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (iso === today) return 'Hoje';
    if (iso === yst) return 'Ontem';
    const d = new Date(iso + 'T00:00:00');
    const s = d.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
    return s.charAt(0).toUpperCase() + s.slice(1);
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
  let selectedLoc = null;   // localização da despesa { name, lat, lng }
  let planSelLoc = null;    // localização da atividade do roteiro
  let mapPickTarget = 'expense';  // para onde o seletor de mapa escreve

  // ---------- Localização (GPS + Google Maps) ----------
  function mapUrl(loc) {
    if (!loc) return '';
    if (loc.lat != null && loc.lng != null)
      return `https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`;
    if (loc.name)
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.name)}`;
    return '';
  }

  function updateLocLink() {
    const link = $('#locLink');
    const name = $('#expenseLoc').value.trim();
    const loc = (name || selectedLoc) ? { name, lat: selectedLoc && selectedLoc.lat, lng: selectedLoc && selectedLoc.lng } : null;
    const url = mapUrl(loc);
    if (url) { link.href = url; link.hidden = false; }
    else { link.hidden = true; }
  }

  function updatePlanLocLink() {
    const link = $('#planLocLink');
    const name = $('#planLoc').value.trim();
    const loc = (name || planSelLoc) ? { name, lat: planSelLoc && planSelLoc.lat, lng: planSelLoc && planSelLoc.lng } : null;
    const url = mapUrl(loc);
    if (url) { link.href = url; link.hidden = false; }
    else { link.hidden = true; }
  }

  // Escolher local tocando no mapa (Leaflet + OpenStreetMap)
  let pickMap = null, pickMarker = null, pickLoc = null;

  function prettyName(d) {
    const a = (d && d.address) || {};
    const parts = [a.amenity || a.shop || a.tourism || a.building || a.road,
                   a.city || a.town || a.village || a.municipality];
    return parts.filter(Boolean).join(', ') || (d && d.display_name) || '';
  }

  function placePin(lat, lng) {
    const icon = L.divIcon({ className: 'pin-icon', html: '📍', iconSize: [32, 32], iconAnchor: [16, 30] });
    if (pickMarker) pickMarker.setLatLng([lat, lng]);
    else pickMarker = L.marker([lat, lng], { icon }).addTo(pickMap);
  }

  function setPick(lat, lng, name, doReverse) {
    lat = +(+lat).toFixed(6); lng = +(+lng).toFixed(6);
    pickLoc = { name: name || '', lat, lng };
    placePin(lat, lng);
    $('#mapHint').textContent = name || 'A obter o nome do local…';
    if (doReverse && !name) {
      fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&accept-language=pt`)
        .then(r => r.json())
        .then(d => { pickLoc.name = prettyName(d); $('#mapHint').textContent = pickLoc.name || 'Local marcado 📍'; })
        .catch(() => { $('#mapHint').textContent = 'Local marcado 📍'; });
    }
  }

  function openMapPicker(target) {
    if (typeof L === 'undefined') { toast('Mapa indisponível (sem ligação)'); return; }
    mapPickTarget = target || 'expense';
    showModal('#mapModal');
    const base = mapPickTarget === 'plan' ? planSelLoc : selectedLoc;
    pickLoc = base ? { ...base } : null;
    setTimeout(() => {
      if (!pickMap) {
        pickMap = L.map('mapPick', { zoomControl: true });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19, attribution: '© OpenStreetMap'
        }).addTo(pickMap);
        pickMap.on('click', (ev) => setPick(ev.latlng.lat, ev.latlng.lng, null, true));
      }
      pickMap.invalidateSize();
      if (pickLoc && pickLoc.lat != null) {
        pickMap.setView([pickLoc.lat, pickLoc.lng], 15);
        placePin(pickLoc.lat, pickLoc.lng);
        $('#mapHint').textContent = pickLoc.name || 'Local marcado 📍';
      } else {
        if (pickMarker) { pickMap.removeLayer(pickMarker); pickMarker = null; }
        pickMap.setView([39.5, -8.0], 6); // Portugal por defeito
        $('#mapHint').textContent = 'Toca no mapa para marcar o local.';
      }
    }, 250);
  }

  function searchMapPlace() {
    const q = $('#mapSearch').value.trim();
    if (!q || !pickMap) return;
    $('#mapHint').textContent = 'A procurar…';
    fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&accept-language=pt&limit=1`)
      .then(r => r.json())
      .then(list => {
        if (!list.length) { $('#mapHint').textContent = 'Não encontrei esse sítio 🤔'; return; }
        const it = list[0];
        const name = it.display_name.split(',').slice(0, 2).join(',').trim();
        pickMap.setView([+it.lat, +it.lon], 16);
        setPick(it.lat, it.lon, name, false);
      })
      .catch(() => { $('#mapHint').textContent = 'Falha na procura 😕'; });
  }

  function buildLocation() {
    const name = $('#expenseLoc').value.trim();
    if (!name && !selectedLoc) return null;
    return {
      name: name || (selectedLoc && selectedLoc.name) || '',
      lat: selectedLoc && selectedLoc.lat != null ? selectedLoc.lat : null,
      lng: selectedLoc && selectedLoc.lng != null ? selectedLoc.lng : null
    };
  }

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

    // localização
    selectedLoc = isEdit && exp.location ? { ...exp.location } : null;
    $('#expenseLoc').value = isEdit && exp.location ? (exp.location.name || '') : '';
    updateLocLink();

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
      splitAmong: (trip.people || []).length ? selectedSplit.slice() : [],
      location: buildLocation()
    };
    if (id) {
      const e = state.expenses.find(x => x.id === id);
      Object.assign(e, data);
      pushExpense(e);
      toast('Despesa atualizada ✅');
    } else {
      const exp = { id: uid(), tripId: trip.id, createdAt: Date.now(), ...data };
      state.expenses.push(exp);
      pushExpense(exp);
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
    delExpenseCloud(id);
    state.expenses = state.expenses.filter(e => e.id !== id);
    save();
    closeModal('#expenseModal');
    refreshAll();
    toast('Despesa eliminada');
  });

  $('#addExpenseBtn').addEventListener('click', () => {
    const active = document.querySelector('.tab-btn.active');
    if (active && active.dataset.tab === 'roteiro') openPlanModal(null);
    else openExpenseModal(null);
  });
  $('#expenseLoc').addEventListener('input', () => {
    if (selectedLoc) selectedLoc.name = $('#expenseLoc').value.trim();
    updateLocLink();
  });
  $('#mapPickBtn').addEventListener('click', () => openMapPicker('expense'));
  $('#planMapBtn').addEventListener('click', () => openMapPicker('plan'));
  $('#planLoc').addEventListener('input', () => {
    if (planSelLoc) planSelLoc.name = $('#planLoc').value.trim();
    updatePlanLocLink();
  });
  $('#mapSearchBtn').addEventListener('click', searchMapPlace);
  $('#mapSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); searchMapPlace(); }
  });
  $('#mapClearBtn').addEventListener('click', () => {
    pickLoc = null;
    if (pickMarker && pickMap) { pickMap.removeLayer(pickMarker); pickMarker = null; }
    $('#mapHint').textContent = 'Toca no mapa para marcar o local.';
  });
  $('#mapConfirmBtn').addEventListener('click', () => {
    if (mapPickTarget === 'plan') {
      planSelLoc = pickLoc ? { ...pickLoc } : null;
      $('#planLoc').value = planSelLoc ? (planSelLoc.name || '') : '';
      updatePlanLocLink();
    } else {
      selectedLoc = pickLoc ? { ...pickLoc } : null;
      $('#expenseLoc').value = selectedLoc ? (selectedLoc.name || '') : '';
      updateLocLink();
    }
    closeModal('#mapModal');
  });

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
          <div class="t-meta">${fmt(spent, t.currency)} gasto</div>
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
        pushTrip(trip);
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
    pushTrip(trip);
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
      currency: $('#tripCurrency').value
    };
    if (id) {
      const t = state.trips.find(x => x.id === id);
      Object.assign(t, data);
      pushTrip(t);
      toast('Viagem atualizada ✅');
    } else {
      const t = { id: uid(), people: [], ...data };
      state.trips.push(t);
      state.activeTrip = t.id;
      pushTrip(t);
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
    delTripCloud(id);
    state.trips = state.trips.filter(t => t.id !== id);
    state.expenses = state.expenses.filter(e => e.tripId !== id);
    state.plans = (state.plans || []).filter(p => p.tripId !== id);
    if (state.activeTrip === id) state.activeTrip = state.trips[0].id;
    save();
    closeModal('#tripModal');
    refreshAll();
    toast('Viagem eliminada');
  });

  // ==================================================================
  //  DADOS: exportar / importar
  // ==================================================================
  $('#exportCsvBtn').addEventListener('click', () => {
    const exps = tripExpenses();
    if (exps.length === 0) { toast('Sem despesas para exportar'); return; }
    const trip = activeTrip();
    const rows = [['Data', 'Categoria', 'Descrição', 'Valor', 'Moeda', 'Pago por', 'Dividido entre', 'Local', 'Mapa']];
    exps.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
      rows.push([
        e.date, catById(e.category).name, e.description || '',
        String(e.amount).replace('.', ','), trip.currency,
        e.paidBy || '', (e.splitAmong || []).join(' / '),
        (e.location && e.location.name) || '', mapUrl(e.location)
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
        pushAllCloud();
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
  function closeModal(sel) {
    $(sel).hidden = true;
    // só liberta o scroll do fundo se não houver outro pop-up aberto
    if (!document.querySelector('.modal-backdrop:not([hidden])')) document.body.style.overflow = '';
  }
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
    if (tab === 'mapa') renderMap();
    if (tab === 'roteiro') renderItinerary();
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
  initCloud();

  // Service worker (offline) + atualização automática
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || refreshing) return;  // não recarrega na 1ª instalação
      refreshing = true;
      location.reload();                         // versão nova pronta → aplica
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then(reg => reg.update())
        .catch(() => {});
    });
  }
})();
