/* Un passo: nucleo. Stato, salvataggio, navigazione, fogli, suoni.
   Vedi CONTRATTO.md per l'interfaccia verso i moduli. */
(function () {
  'use strict';
  const KEY = 'un-passo-v1';
  const P = (window.P = { screens: {}, actions: {}, inputs: {} });

  const DEF = () => ({
    v: 1, tasks: [], parked: [], wins: [], thoughts: [], checkins: [], slips: [], samples: [],
    settings: { span: 25, pause: 5, meds: false, medsPerWeek: 7, sound: true, theme: 'auto', timerStyle: 'tide' },
    session: null, lastReview: null
  });

  /* ---------- helper ---------- */
  P.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  P.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const z2 = (n) => String(n).padStart(2, '0');
  P.ymd = (d) => { d = d || new Date(); return d.getFullYear() + '-' + z2(d.getMonth() + 1) + '-' + z2(d.getDate()); };
  P.addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return P.ymd(new Date(y, m - 1, d + n)); };
  P.fmtDate = (s) => {
    const [y, m, d] = (s || P.ymd()).split('-').map(Number);
    return new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d));
  };
  P.fmtTime = (ms) => { const d = new Date(ms); return z2(d.getHours()) + ':' + z2(d.getMinutes()); };
  P.$ = (sel, root) => (root || document).querySelector(sel);

  /* ---------- stato ---------- */
  function load() {
    const base = DEF();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const o = JSON.parse(raw);
        Object.keys(o).forEach((k) => { base[k] = o[k]; });
        base.settings = Object.assign(DEF().settings, o.settings || {});
        ['tasks', 'parked', 'wins', 'thoughts', 'checkins', 'slips', 'samples'].forEach((k) => {
          if (!Array.isArray(base[k])) base[k] = [];
        });
      }
    } catch (e) { /* stato corrotto o storage non disponibile: si riparte puliti */ }
    return base;
  }
  P.S = load();
  P.ui = { tab: 'oggi', view: null, params: {} };
  let saveFailed = false;
  P.save = function () {
    try { localStorage.setItem(KEY, JSON.stringify(P.S)); }
    catch (e) {
      if (!saveFailed) { saveFailed = true; P.toast('Salvataggio non disponibile in questa modalità del browser'); }
    }
  };
  P.reset = function (obj) { // usato dal ripristino del backup
    const fresh = DEF();
    Object.keys(P.S).forEach((k) => delete P.S[k]);
    Object.assign(P.S, fresh, obj || {});
    P.S.settings = Object.assign(DEF().settings, (obj && obj.settings) || {});
    P.save();
  };

  /* ---------- tema ---------- */
  P.applyTheme = function () {
    const t = P.S.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  };

  /* ---------- navigazione e render ---------- */
  const TABS = [
    { id: 'oggi', label: 'Oggi', svg: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>' },
    { id: 'inizia', label: 'Inizia', svg: '<path d="M7 5l12 7-12 7z"/>' },
    { id: 'aiuto', label: 'Bloccata', svg: '<path d="M12 3v11"/><circle cx="12" cy="19" r="1.4"/><path d="M5 8l-1.5-1.5M19 8l1.5-1.5"/>' },
    { id: 'altro', label: 'Altro', svg: '<circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/>' }
  ];
  function drawTabs() {
    const nav = document.getElementById('tabs');
    if (!nav) return;
    nav.innerHTML = '<div class="in">' + TABS.map((t) =>
      '<button data-a="core_tab" data-v="' + t.id + '"' + (P.ui.tab === t.id ? ' aria-current="page"' : '') + '>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true">' + t.svg + '</svg><span>' + t.label + '</span></button>').join('') + '</div>';
  }
  P.render = function () {
    const main = document.getElementById('main');
    if (!main) return;
    const key = P.ui.tab + (P.ui.view ? '/' + P.ui.view : '');
    const scr = P.screens[key] || P.screens[P.ui.tab];
    const y = window.scrollY;
    let html;
    try { html = scr ? scr.render() : '<p class="muted">Questa schermata non è ancora disponibile.</p>'; }
    catch (e) { console.error(e); html = '<p class="banner">Qualcosa non ha funzionato in questa schermata. Torna indietro e riprova.</p>'; }
    main.innerHTML = html;
    drawTabs();
    if (scr && scr.after) { try { scr.after(); } catch (e) { console.error(e); } }
    window.scrollTo(0, y);
  };
  P.go = function (tab, view, params) {
    P.closeSheet();
    P.ui.tab = tab; P.ui.view = view || null; P.ui.params = params || {};
    P.render();
    window.scrollTo(0, 0);
  };

  /* ---------- foglio dal basso e avvisi ---------- */
  P.sheet = function (html) {
    let scrim = document.getElementById('scrim');
    if (!scrim) {
      scrim = document.createElement('div');
      scrim.id = 'scrim'; scrim.className = 'scrim';
      document.body.appendChild(scrim);
    }
    scrim.innerHTML = '<div class="sheet" id="sheet" role="dialog" aria-modal="true"><div class="grip"></div>' + html + '</div>';
    const first = scrim.querySelector('input,textarea,select');
    // Il cursore va solo nei campi vuoti (moduli di creazione): in un modulo già compilato aprirebbe la tastiera a ogni ridisegno.
    if (first && first.type !== 'range' && !first.value) { try { first.focus({ preventScroll: true }); } catch (e) { /* ignora */ } }
  };
  P.closeSheet = function () {
    const s = document.getElementById('scrim');
    if (s) s.remove();
  };
  let toastTimer = null;
  P.toast = function (msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2500);
  };
  P.win = function (text, kind) {
    P.S.wins.push({ id: P.uid(), text: String(text || ''), ts: Date.now(), kind: kind || 'task' });
    P.save();
    P.toast('Fatto! ' + (text ? String(text).slice(0, 60) : ''));
  };

  /* ---------- suono ---------- */
  let ctx = null;
  P.audioUnlock = function () {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!ctx) ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { /* senza audio si va avanti */ }
  };
  P.chime = function () {
    try {
      if (!ctx) return;
      const t0 = ctx.currentTime;
      [659.25, 783.99, 987.77].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + i * 0.28);
        g.gain.exponentialRampToValueAtTime(0.35, t0 + i * 0.28 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.28 + 0.9);
        o.connect(g); g.connect(ctx.destination);
        o.start(t0 + i * 0.28); o.stop(t0 + i * 0.28 + 1);
      });
    } catch (e) { /* ignora */ }
  };

  /* ---------- eventi ---------- */
  P.actions.core_tab = (el) => P.go(el.dataset.v);
  P.actions.core_close = () => P.closeSheet();

  document.addEventListener('click', (e) => {
    if (e.target.id === 'scrim') { P.closeSheet(); return; }
    const el = e.target.closest('[data-a]');
    if (!el) return;
    const fn = P.actions[el.dataset.a];
    if (!fn) { console.warn('Azione sconosciuta:', el.dataset.a); return; }
    try { fn(el, e); } catch (err) { console.error(err); P.toast('Qualcosa non ha funzionato. Riprova.'); }
  });
  function onInput(e) {
    const el = e.target.closest ? e.target.closest('[data-i]') : null;
    if (!el) return;
    const fn = P.inputs[el.dataset.i];
    if (fn) { try { fn(el, e); } catch (err) { console.error(err); } }
  }
  document.addEventListener('input', onInput);
  document.addEventListener('change', onInput);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') P.closeSheet();
    if (e.key === 'Enter' && e.target && e.target.dataset && e.target.dataset.enter) {
      const btn = document.querySelector('[data-a="' + e.target.dataset.enter + '"]');
      if (btn) { e.preventDefault(); btn.click(); }
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !(P.S.session && P.S.session.state === 'running')) P.render();
  });

  /* ---------- avvio ---------- */
  P.boot = function () {
    P.applyTheme();
    P.render();
    try { if (P.timer && P.timer.resume) P.timer.resume(); } catch (e) { console.error(e); }
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignora */ }
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* senza offline si va avanti */ });
    }
  };
  window.addEventListener('load', P.boot);
})();
