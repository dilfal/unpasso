/* Un passo: modulo «Oggi» (schermata `oggi`).
   Esporta: P.oggi.openTask(id), P.oggi.addTask({title,prio,date}), P.oggi.toggleDone(id).
   Campi usati: nessun campo nuovo in P.S (usa tasks, wins, checkins, lastReview, settings).
   Dipendenze a runtime: P.startSession (timer.js), P.inizia.begin (inizia.js), P.go('altro','checkin') (altro.js).
   Ipotesi sul nucleo: P.sheet(html) riceve solo il contenuto del foglio; per ridisegnarlo qui si chiama
   P.closeSheet() e poi P.sheet(html) di nuovo. */
(function () {
  'use strict';

  const D = () => P.S;
  const esc = (s) => P.esc(s);
  const ea = (s) => P.esc(s).replace(/"/g, '&quot;');

  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const PLUS = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

  // Stili piccoli del modulo (iniettati una volta sola).
  if (!document.getElementById('oggi-css')) {
    const st = document.createElement('style');
    st.id = 'oggi-css';
    st.textContent =
      '.task .check{position:relative}' +
      '.task .check::before{content:"";position:absolute;inset:-6px}' +
      '.task .btn.sm{flex:none}' +
      '.opt[aria-pressed="true"]{border-color:var(--sea);background:var(--foam)}' +
      '.opt.sel{display:flex;justify-content:space-between;align-items:center;gap:10px}' +
      '.oggi-fold{display:flex;justify-content:space-between;align-items:center}' +
      '.oggi-fold .chev{transition:transform .15s}' +
      '.oggi-fold[aria-expanded="true"] .chev{transform:rotate(90deg)}';
    document.head.appendChild(st);
  }

  /* ---------- Stato locale (non persistente) ---------- */
  let doneOpen = false;      // gruppo «Fatte oggi» aperto
  let hideCheckin = false;   // card check-in nascosta per questa apertura
  let view = null;           // foglio aperto: {k:'new'|'detail'|'review', ...}

  /* ---------- Utilità ---------- */
  const todayStr = () => P.ymd();
  const tomorrowStr = () => P.addDays(P.ymd(), 1);
  const isoOf = (ms) => P.ymd(new Date(ms));
  const byId = (id) => D().tasks.find((t) => t.id === id) || null;
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const doneToday = (t) => !!(t.done && t.doneAt && isoOf(t.doneAt) === todayStr());
  const rank = { A: 0, B: 1, C: 2 };

  function cmp(a, b) {
    const ta = (a.plan && a.plan.time) || '99:99';
    const tb = (b.plan && b.plan.time) || '99:99';
    if (ta !== tb) return ta < tb ? -1 : 1;
    return (a.created || 0) - (b.created || 0);
  }
  function cmpPrio(a, b) {
    const d = (rank[a.prio] || 0) - (rank[b.prio] || 0);
    return d || cmp(a, b);
  }

  function countDoneWins() {
    const t0 = todayStr();
    const wins = (D().wins || []).filter((w) => isoOf(w.ts) === t0);
    const pool = wins.filter((w) => w.kind === 'task').map((w) => w.text);
    let extra = 0;
    D().tasks.filter(doneToday).forEach((t) => {
      const i = pool.indexOf(t.title);
      if (i >= 0) pool.splice(i, 1); else extra++;
    });
    return wins.length + extra;
  }

  // Quante cose importanti (A) ha quel giorno, escluso eventualmente un compito.
  function countA(date, exceptId) {
    if (!date) return 0;
    const isToday = date === todayStr();
    return D().tasks.filter((t) =>
      t.id !== exceptId && t.prio === 'A' && t.date === date && (!t.done || (isToday && doneToday(t)))
    ).length;
  }

  function planText(t) {
    const p = t.plan;
    if (!p) return '';
    const parts = [];
    if (p.time) parts.push('alle ' + p.time);
    if (p.where) parts.push(p.where);
    if (p.minutes) parts.push(p.minutes + ' min');
    return parts.join(', ');
  }

  function stepsInfo(t) {
    const n = (t.steps || []).length;
    if (!n) return '';
    return t.steps.filter((s) => s.done).length + '/' + n + ' passi';
  }

  function whenDate(w) {
    return w === 'oggi' ? todayStr() : w === 'domani' ? tomorrowStr() : null;
  }
  function whenOf(t) {
    if (t.date === todayStr()) return 'oggi';
    if (t.date === tomorrowStr()) return 'domani';
    if (!t.date) return 'lista';
    return 'altro';
  }

  /* ---------- Operazioni sui compiti ---------- */
  function addTask(o) {
    const t = {
      id: P.uid(),
      title: String((o && o.title) || '').trim(),
      prio: (o && o.prio) || 'B',
      date: (o && o.date) || null,
      done: false,
      doneAt: null,
      created: Date.now(),
      steps: [],
      plan: null
    };
    D().tasks.push(t);
    P.save();
    return t;
  }

  function toggleDone(id) {
    const t = byId(id);
    if (!t) return;
    if (!t.done) {
      t.done = true;
      t.doneAt = Date.now();
      if (P.agenda) P.agenda.onTaskDone(t);
      P.win(t.title, 'task');
    } else {
      t.done = false;
      t.doneAt = null;
      if (P.agenda) P.agenda.onTaskReopen(t);
      const w = D().wins || [];
      const t0 = todayStr();
      for (let i = w.length - 1; i >= 0; i--) {
        if (w[i].kind === 'task' && w[i].text === t.title && isoOf(w[i].ts) === t0) { w.splice(i, 1); break; }
      }
    }
    P.save();
    P.render();
  }

  function startTask(id) {
    const t = byId(id);
    if (!t) return;
    if (typeof P.startSession !== 'function') { P.toast('Il timer non è ancora disponibile.'); return; }
    if (P.audioUnlock) P.audioUnlock();
    const plan = t.plan;
    P.startSession({
      kind: 'work',
      taskId: t.id,
      title: t.title,
      minutes: (plan && plan.minutes) || D().settings.span,
      first: (plan && plan.first) || undefined,
      barriers: (plan && plan.barriers) || undefined,
      steps: (t.steps || []).map((s) => ({ id: s.id, t: s.t, done: !!s.done }))
    });
  }

  function planWith(id) {
    P.closeSheet();
    view = null;
    if (P.inizia && P.inizia.begin) P.inizia.begin({ taskId: id });
    else P.toast('Il percorso Inizia non è ancora disponibile.');
  }

  /* ---------- Righe ---------- */
  function metaHtml(t, withDate) {
    const bits = [];
    if (withDate && t.date) bits.push(P.fmtDate(t.date));
    const pt = planText(t);
    if (pt) bits.push(pt);
    const si = stepsInfo(t);
    if (si) bits.push(si);
    return '<span class="prio ' + ea(t.prio) + '">' + esc(t.prio) + '</span>' + esc(bits.join(' · '));
  }

  function row(t, mode) {
    const done = !!t.done;
    const chk =
      '<button class="check" data-a="oggi_toggle" data-id="' + ea(t.id) + '" aria-pressed="' + (done ? 'true' : 'false') +
      '" aria-label="' + (done ? 'Riapri: ' : 'Segna come fatta: ') + ea(t.title) + '">' + CHECK + '</button>';
    const body =
      '<button class="body" data-a="oggi_open" data-id="' + ea(t.id) + '"><span class="ttl">' + esc(t.title) +
      '</span><span class="meta">' + metaHtml(t, mode === 'lista') + '</span></button>';
    let act = '';
    if (mode === 'open') act = '<button class="btn sm soft" data-a="oggi_start" data-id="' + ea(t.id) + '">Inizia</button>';
    else if (mode === 'lista') act = '<button class="btn sm soft" data-a="oggi_totoday" data-id="' + ea(t.id) + '">Porta a oggi</button>';
    return '<li class="task' + (done ? ' done' : '') + '">' + chk + body + act + '</li>';
  }

  function listHtml(arr, mode) {
    return '<ul class="list">' + arr.map((t) => row(t, mode)).join('') + '</ul>';
  }

  /* ---------- Schermata ---------- */
  function checkinDue() {
    const cs = D().checkins || [];
    if (!cs.length) return true;
    const last = cs.reduce((m, c) => (c.date > m ? c.date : m), '');
    if (!last) return true;
    const days = Math.round((new Date(todayStr() + 'T00:00:00') - new Date(last + 'T00:00:00')) / 86400000);
    return days > 7;
  }

  function renderToday(t0) {
    const open = D().tasks.filter((t) => !t.done && t.date && t.date <= t0).sort(cmp);
    const conta = open.filter((t) => t.prio === 'A').slice(0, 3);
    const spazio = open.filter((t) => conta.indexOf(t) < 0).sort(cmpPrio);
    const fatte = D().tasks.filter(doneToday).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    let h = '';

    if (!hideCheckin && checkinDue()) {
      h += '<div class="hint stack"><div>Un minuto per il check-in della settimana. Ti aiuta a vedere cosa funziona.</div>' +
        '<div class="cluster"><button class="btn sm" data-a="oggi_checkin">Fai il check-in</button>' +
        '<button class="btn sm ghost" data-a="oggi_checkinlater">Più tardi</button></div></div>';
    }

    h += P.agenda ? P.agenda.todayHtml(t0) : '';

    h += '<section class="group"><h2>Quello che conta</h2>';
    if (conta.length) {
      h += '<p class="cap">Al massimo tre. Il resto può aspettare.</p>' + listHtml(conta, 'open');
    } else {
      h += '<p class="empty">Scegli fino a 3 cose che, fatte, ti fanno dire «oggi è andata». Anche una sola va bene.</p>';
    }
    h += '</section>';

    h += '<section class="group"><h2>Se c\'è spazio</h2>';
    if (spazio.length) {
      h += '<p class="cap">Cose utili, senza fretta. Se oggi non c\'è spazio, scorrono a domani.</p>' + listHtml(spazio, 'open');
    } else {
      h += '<p class="empty">Niente qui, e va bene così.</p>';
    }
    h += '</section>';

    if (fatte.length) {
      h += '<section class="group"><button class="opt oggi-fold" data-a="oggi_doneopen" aria-expanded="' + (doneOpen ? 'true' : 'false') + '">' +
        '<span>Fatte oggi <span class="muted">(' + fatte.length + ')</span></span><span class="chev" aria-hidden="true">›</span></button>';
      if (doneOpen) h += listHtml(fatte, 'done');
      h += '</section>';
    }

    const late = new Date().getHours() >= 18 && D().lastReview !== t0;
    h += '<section class="group"><button class="btn block' + (late ? '' : ' soft') + '" data-a="oggi_review">Revisione della sera</button>' +
      (late ? '<p class="cap" style="margin-top:8px">È sera: due minuti per chiudere la giornata e preparare domani.</p>' : '') +
      '</section>';
    h += P.sistemi ? P.sistemi.todayHtml() : '';
    return h;
  }

  function renderLista(t0) {
    const tm = tomorrowStr();
    const open = D().tasks.filter((t) => !t.done && (!t.date || t.date > t0)).sort(cmpPrio);
    const domani = open.filter((t) => t.date === tm);
    const senza = open.filter((t) => !t.date);
    const dopo = open.filter((t) => t.date && t.date > tm).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : cmpPrio(a, b)));
    const up = P.agenda ? P.agenda.upcomingHtml(t0) : '';
    if (!open.length) {
      return up + '<p class="empty">La lista è vuota. Quello che non serve oggi puoi metterlo qui, senza pensarci.</p>';
    }
    let h = up;
    if (domani.length) h += '<section class="group"><h2>Domani</h2>' + listHtml(domani, 'lista') + '</section>';
    if (senza.length) h += '<section class="group"><h2>Senza data</h2>' + listHtml(senza, 'lista') + '</section>';
    if (dopo.length) h += '<section class="group"><h2>Più avanti</h2>' + listHtml(dopo, 'lista') + '</section>';
    return h;
  }

  P.screens.oggi = {
    render() {
      const t0 = todayStr();
      const mode = P.ui.params && P.ui.params.mode === 'lista' ? 'lista' : 'oggi';
      let h = '<div class="head"><div><h1>' + esc(cap(P.fmtDate(t0))) + '</h1>' +
        '<div class="muted sub">Fatto oggi: <b>' + countDoneWins() + '</b></div></div></div>';
      h += '<div class="seg" role="group" aria-label="Vista">' +
        '<button data-a="oggi_mode" data-v="oggi" aria-pressed="' + (mode === 'oggi') + '">Oggi</button>' +
        '<button data-a="oggi_mode" data-v="lista" aria-pressed="' + (mode === 'lista') + '">Lista</button></div>';
      h += mode === 'oggi' ? renderToday(t0) : renderLista(t0);
      h += '<button class="fab" data-a="oggi_new">' + PLUS + 'Nuova cosa</button>';
      return h;
    }
  };

  /* ---------- Fogli: componenti comuni ---------- */
  function showSheet(html, keep) {
    const sel = () => document.querySelector('#sheet .sheet') || document.getElementById('sheet');
    let sc = 0;
    if (keep) { const n = sel(); if (n) sc = n.scrollTop; }
    P.closeSheet();
    P.sheet(html);
    if (keep) { const n = sel(); if (n) n.scrollTop = sc; }
  }

  function reshow(keep) {
    if (!view) return;
    if (view.k === 'new') showSheet(newHtml(), keep);
    else if (view.k === 'detail') {
      const t = byId(view.id);
      if (!t) { P.closeSheet(); view = null; return; }
      showSheet(detailHtml(t), keep);
    } else if (view.k === 'review') showSheet(reviewHtml(), keep);
  }

  function chip(action, v, label, on) {
    return '<button class="chip" data-a="' + action + '" data-v="' + ea(v) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(label) + '</button>';
  }

  const PRIO_TXT = {
    A: 'Importante: se la fai, la giornata è andata bene. Massimo 3 al giorno.',
    B: 'Utile: va fatta, ma senza fretta.',
    C: 'Se avanza: solo se ti resta energia.'
  };

  function prioBlock(action, cur) {
    return '<div><label class="f">Quanto conta?</label><div class="cluster" role="group" aria-label="Priorità">' +
      chip(action, 'A', 'A importante', cur === 'A') + chip(action, 'B', 'B utile', cur === 'B') + chip(action, 'C', 'C se avanza', cur === 'C') +
      '</div><p class="small muted" style="margin:8px 0 0">' + esc(PRIO_TXT[cur] || '') + '</p></div>';
  }

  /* ---------- Foglio: nuova cosa ---------- */
  function openNew() {
    const mode = P.ui.params && P.ui.params.mode === 'lista' ? 'lista' : 'oggi';
    view = { k: 'new', d: { title: '', prio: 'B', when: mode } };
    P.sheet(newHtml());
    focusSoon('#oggi-ntitle');
  }

  function newHtml() {
    const d = view.d;
    const date = whenDate(d.when);
    const warn = d.prio === 'A' && date && countA(date) >= 3;
    let h = '<div class="row2"><h2>Nuova cosa</h2><button class="btn ghost sm" data-a="core_close">Chiudi</button></div>';
    if (P.agenda) h += '<div class="row2"><span class="small muted">Ha un giorno e un’ora precisi?</span><button class="btn soft sm" data-a="age_new">È un appuntamento</button></div>';
    h += '<div><label class="f" for="oggi-ntitle">Che cosa?</label>' +
      '<input type="text" id="oggi-ntitle" data-i="oggi_ntitle" value="' + ea(d.title) + '" placeholder="Per esempio: chiamare la banca" autocomplete="off" enterkeyhint="done"></div>';
    h += prioBlock('oggi_nprio', d.prio);
    if (warn) {
      h += '<div class="hint stack"><div>Per ' + (d.when === 'oggi' ? 'oggi' : 'domani') + ' hai già 3 cose importanti. Se ne metti una quarta, nessuna conta più davvero. Ti propongo B.</div>' +
        '<div><button class="btn sm" data-a="oggi_nprio" data-v="B">Metti B</button></div></div>';
    }
    h += '<div><label class="f">Quando?</label><div class="cluster" role="group" aria-label="Quando">' +
      chip('oggi_nwhen', 'oggi', 'Oggi', d.when === 'oggi') + chip('oggi_nwhen', 'domani', 'Domani', d.when === 'domani') +
      chip('oggi_nwhen', 'lista', 'Lista', d.when === 'lista') + '</div></div>';
    h += '<div class="stack"><button class="btn block" data-a="oggi_nadd">Aggiungi</button>' +
      '<button class="btn soft block" data-a="oggi_nadd" data-v="plan">Aggiungi e pianifica</button></div>';
    return h;
  }

  function focusSoon(sel) {
    setTimeout(() => { const el = document.querySelector(sel); if (el) el.focus(); }, 60);
  }

  /* ---------- Foglio: dettaglio del compito ---------- */
  function openTask(id) {
    const t = byId(id);
    if (!t) return;
    view = { k: 'detail', id: id, confirm: false };
    P.sheet(detailHtml(t));
  }

  function detailHtml(t) {
    const w = whenOf(t);
    const warn = t.prio === 'A' && t.date && !t.done && countA(t.date, t.id) >= 3;
    let h = '<div class="row2"><h2>Dettaglio</h2><button class="btn ghost sm" data-a="core_close">Chiudi</button></div>';
    h += '<div><label class="f" for="oggi-dtitle">Che cosa</label>' +
      '<input type="text" id="oggi-dtitle" data-i="oggi_dtitle" value="' + ea(t.title) + '" autocomplete="off"></div>';
    h += prioBlock('oggi_dprio', t.prio);
    if (warn) {
      h += '<div class="hint">Quel giorno hai già altre 3 cose importanti. Puoi lasciarla così, oppure passarla a B.</div>';
    }
    h += '<div><label class="f">Quando</label><div class="cluster" role="group" aria-label="Quando">' +
      chip('oggi_dwhen', 'oggi', 'Oggi', w === 'oggi') + chip('oggi_dwhen', 'domani', 'Domani', w === 'domani') +
      chip('oggi_dwhen', 'lista', 'Senza data', w === 'lista') + '</div>' +
      '<label class="f" for="oggi-ddate" style="margin-top:12px">Oppure scegli un giorno</label>' +
      '<input type="date" id="oggi-ddate" data-i="oggi_ddate" value="' + ea(t.date || '') + '"></div>';
    if (P.agenda) h += P.agenda.repeatBlock(t);
    if (P.motivazione) h += P.motivazione.whyField(t);

    // Passi
    const steps = t.steps || [];
    h += '<div><label class="f">Passi</label>';
    if (steps.length) {
      h += '<ul class="list stepsl">' + steps.map((s) =>
        '<li class="task' + (s.done ? ' done' : '') + '">' +
        '<button class="check" data-a="oggi_stepdone" data-v="' + ea(s.id) + '" aria-pressed="' + (s.done ? 'true' : 'false') +
        '" aria-label="' + (s.done ? 'Riapri il passo: ' : 'Segna il passo come fatto: ') + ea(s.t) + '">' + CHECK + '</button>' +
        '<span class="body"><span class="ttl">' + esc(s.t) + '</span></span>' +
        '<button class="xbtn" data-a="oggi_stepdel" data-v="' + ea(s.id) + '" aria-label="Elimina il passo: ' + ea(s.t) + '">×</button></li>'
      ).join('') + '</ul>';
    } else {
      h += '<p class="small muted" style="margin:0 0 8px">Spezzarla in passi piccoli la rende più facile da iniziare.</p>';
    }
    h += '<div class="addrow"><input type="text" id="oggi-stepnew" data-i="oggi_stepnew" placeholder="Un passo piccolo" autocomplete="off" enterkeyhint="done" aria-label="Nuovo passo">' +
      '<button class="btn soft sm" data-a="oggi_stepadd">Aggiungi</button></div></div>';

    // Piano
    const p = t.plan;
    if (p) {
      const lines = [];
      if (p.first) lines.push('<b>Primo gesto:</b> ' + esc(p.first));
      const when = [];
      if (p.date) when.push(P.fmtDate(p.date));
      const pt = planText(t);
      if (pt) when.push(pt);
      if (when.length) lines.push('<b>Quando e dove:</b> ' + esc(when.join(', ')));
      (p.barriers || []).forEach((b) => {
        if (b && (b.if || b.then)) lines.push('<b>Se</b> ' + esc(b.if || '…') + ', <b>allora</b> ' + esc(b.then || '…'));
      });
      if (lines.length) h += '<div class="hint stack"><div><b>Il tuo piano</b></div>' + lines.map((l) => '<div>' + l + '</div>').join('') + '</div>';
    }

    // Azioni
    if (view && view.confirm) {
      h += '<div class="hint stack"><div>Eliminare «' + esc(t.title) + '»? Non si può annullare.</div>' +
        '<div class="cluster"><button class="btn sm danger" data-a="oggi_ddelyes">Sì, elimina</button>' +
        '<button class="btn sm soft" data-a="oggi_ddelno">No, la tengo</button></div></div>';
    } else {
      h += '<div class="stack">';
      if (!t.done) {
        h += '<button class="btn block" data-a="oggi_dstart">Inizia ora</button>' +
          '<button class="btn soft block" data-a="oggi_dplan">Pianifica con Inizia</button>';
      }
      h += '<button class="btn ghost block" data-a="oggi_ddone">' + (t.done ? 'Riapri' : 'Segna come fatta') + '</button>' +
        '<button class="btn danger block" data-a="oggi_ddel">Elimina</button></div>';
    }
    return h;
  }

  /* ---------- Foglio: revisione della sera ---------- */
  function openReview() {
    view = { k: 'review', orig: {} };
    P.sheet(reviewHtml());
  }

  function reviewHtml() {
    const t0 = todayStr();
    const tm = tomorrowStr();
    const open = D().tasks.filter((t) => !t.done && t.date && t.date <= t0).sort(cmpPrio);
    const n = countDoneWins();
    let h = '<div class="row2"><h2>Revisione della sera</h2><button class="btn ghost sm" data-a="core_close">Chiudi</button></div>';
    h += '<p class="muted">' + (n ? 'Oggi hai fatto ' + (n === 1 ? 'una cosa' : n + ' cose') + '. ' : '') +
      'Quello che non hai finito non è perso: scorre. Decidi solo dove metterlo.</p>';
    if (P.agenda) h += P.agenda.tomorrowHtml();

    h += '<div><h3>Le cose aperte di oggi</h3>';
    if (open.length) {
      h += '<ul class="list">' + open.map((t) =>
        '<li class="thought"><span class="ttl" style="font-weight:600;overflow-wrap:anywhere"><span class="prio ' + ea(t.prio) + '">' + esc(t.prio) + '</span>' + esc(t.title) + '</span>' +
        '<div class="cluster" style="margin-top:8px">' +
        '<button class="btn sm" data-a="oggi_rv" data-id="' + ea(t.id) + '" data-v="fatta">Fatta</button>' +
        '<button class="btn sm soft" data-a="oggi_rv" data-id="' + ea(t.id) + '" data-v="domani">Domani</button>' +
        '<button class="btn sm ghost" data-a="oggi_rv" data-id="' + ea(t.id) + '" data-v="lista">Lista</button></div></li>'
      ).join('') + '</ul>';
    } else {
      h += '<p class="empty">Non resta niente di aperto per oggi.</p>';
    }
    h += '</div>';

    // Domani: fino a 3 cose importanti
    const isSel = (t) => t.prio === 'A' && t.date === tm;
    const cand = D().tasks.filter((t) => !t.done && (t.date === tm || !t.date));
    const sel = cand.filter(isSel);
    const others = cand.filter((t) => !isSel(t));
    const shown = sel.concat(others.slice(0, Math.max(0, 12 - sel.length))).sort((a, b) => (a.created || 0) - (b.created || 0));
    const hidden = cand.length - shown.length;
    h += '<div><h3>Domani: scegli fino a 3 cose importanti</h3>' +
      '<p class="small muted" style="margin:6px 0 10px">Un tocco la segna come importante per domani (' + sel.length + ' di 3). Il resto può aspettare.</p>';
    if (shown.length) {
      h += '<div class="stack">' + shown.map((t) =>
        '<button class="opt sel" data-a="oggi_rvpick" data-id="' + ea(t.id) + '" aria-pressed="' + (isSel(t) ? 'true' : 'false') + '">' +
        '<span style="overflow-wrap:anywhere">' + esc(t.title) + '</span><span class="muted small">' + (isSel(t) ? 'importante' : t.date ? 'domani' : 'lista') + '</span></button>'
      ).join('') + '</div>';
      if (hidden > 0) h += '<p class="small muted" style="margin-top:8px">E altre ' + hidden + ' nella Lista.</p>';
    } else {
      h += '<p class="empty">Niente da scegliere per ora. Puoi aggiungere cose nuove quando vuoi.</p>';
    }
    h += '</div>';

    h += '<div class="stack"><button class="btn block" data-a="oggi_rvend">Fine della revisione</button>' +
      '<button class="btn ghost block" data-a="core_close">Chiudi senza finire</button></div>';
    return h;
  }

  /* ---------- Azioni ---------- */
  const A = P.actions;

  A.oggi_mode = (el) => {
    P.ui.params = P.ui.params || {};
    P.ui.params.mode = el.dataset.v === 'lista' ? 'lista' : 'oggi';
    P.render();
  };
  A.oggi_toggle = (el) => { toggleDone(el.dataset.id); };
  A.oggi_open = (el) => { openTask(el.dataset.id); };
  A.oggi_start = (el) => { startTask(el.dataset.id); };
  A.oggi_totoday = (el) => {
    const t = byId(el.dataset.id);
    if (!t) return;
    t.date = todayStr();
    P.save();
    P.render();
    P.toast('Portata a oggi.');
  };
  A.oggi_doneopen = () => { doneOpen = !doneOpen; P.render(); };
  A.oggi_checkin = () => { P.go('altro', 'checkin'); };
  A.oggi_checkinlater = () => { hideCheckin = true; P.render(); };
  A.oggi_new = () => { openNew(); };
  A.oggi_review = () => { openReview(); };

  // Nuova cosa
  A.oggi_nprio = (el) => { if (!view || view.k !== 'new') return; view.d.prio = el.dataset.v; reshow(true); };
  A.oggi_nwhen = (el) => { if (!view || view.k !== 'new') return; view.d.when = el.dataset.v; reshow(true); };
  A.oggi_nadd = (el) => {
    if (!view || view.k !== 'new') return;
    const inp = document.getElementById('oggi-ntitle');
    if (inp) view.d.title = inp.value;
    const title = view.d.title.trim();
    if (!title) { P.toast('Scrivi prima che cosa è.'); focusSoon('#oggi-ntitle'); return; }
    const t = addTask({ title: title, prio: view.d.prio, date: whenDate(view.d.when) });
    const plan = el && el.dataset && el.dataset.v === 'plan';
    P.closeSheet();
    view = null;
    if (plan) {
      if (P.inizia && P.inizia.begin) { P.inizia.begin({ taskId: t.id }); return; }
      P.toast('Aggiunta. Il percorso Inizia non è ancora disponibile.');
    } else {
      P.toast('Aggiunta.');
    }
    P.render();
  };

  // Dettaglio
  A.oggi_dprio = (el) => {
    const t = view && view.k === 'detail' ? byId(view.id) : null;
    if (!t) return;
    t.prio = el.dataset.v;
    P.save(); P.render(); reshow(true);
  };
  A.oggi_dwhen = (el) => {
    const t = view && view.k === 'detail' ? byId(view.id) : null;
    if (!t) return;
    t.date = whenDate(el.dataset.v);
    P.save(); P.render(); reshow(true);
  };
  A.oggi_stepdone = (el) => {
    const t = view && view.k === 'detail' ? byId(view.id) : null;
    if (!t) return;
    const s = (t.steps || []).find((x) => x.id === el.dataset.v);
    if (s) { s.done = !s.done; P.save(); P.render(); reshow(true); }
  };
  A.oggi_stepdel = (el) => {
    const t = view && view.k === 'detail' ? byId(view.id) : null;
    if (!t) return;
    t.steps = (t.steps || []).filter((x) => x.id !== el.dataset.v);
    P.save(); P.render(); reshow(true);
  };
  A.oggi_stepadd = () => {
    const t = view && view.k === 'detail' ? byId(view.id) : null;
    if (!t) return;
    const inp = document.getElementById('oggi-stepnew');
    const txt = inp ? inp.value.trim() : '';
    if (!txt) { focusSoon('#oggi-stepnew'); return; }
    t.steps = t.steps || [];
    t.steps.push({ id: P.uid(), t: txt, done: false });
    P.save(); P.render(); reshow(true);
    focusSoon('#oggi-stepnew');
  };
  A.oggi_dplan = () => { if (view && view.k === 'detail') planWith(view.id); };
  A.oggi_dstart = () => {
    if (!view || view.k !== 'detail') return;
    const id = view.id;
    P.closeSheet();
    view = null;
    startTask(id);
  };
  A.oggi_ddone = () => {
    if (!view || view.k !== 'detail') return;
    toggleDone(view.id);
    reshow(true);
  };
  A.oggi_ddel = () => { if (view && view.k === 'detail') { view.confirm = true; reshow(true); } };
  A.oggi_ddelno = () => { if (view && view.k === 'detail') { view.confirm = false; reshow(true); } };
  A.oggi_ddelyes = () => {
    if (!view || view.k !== 'detail') return;
    const id = view.id;
    D().tasks = D().tasks.filter((t) => t.id !== id);
    P.save();
    P.closeSheet();
    view = null;
    P.render();
    P.toast('Eliminata.');
  };

  // Revisione
  A.oggi_rv = (el) => {
    if (!view || view.k !== 'review') return;
    const t = byId(el.dataset.id);
    if (!t) return;
    const v = el.dataset.v;
    if (v === 'fatta') { if (!t.done) toggleDone(t.id); }
    else {
      t.date = v === 'domani' ? tomorrowStr() : null;
      P.save();
      P.render();
    }
    reshow(true);
  };
  A.oggi_rvpick = (el) => {
    if (!view || view.k !== 'review') return;
    const t = byId(el.dataset.id);
    if (!t) return;
    const tm = tomorrowStr();
    if (t.prio === 'A' && t.date === tm) {
      const o = view.orig[t.id];
      if (o) { t.prio = o.prio; t.date = o.date; } else { t.prio = 'B'; }
    } else {
      if (countA(tm) >= 3) { P.toast('Per domani tre bastano. Togline una per sceglierne un\'altra.'); return; }
      if (!view.orig[t.id]) view.orig[t.id] = { prio: t.prio, date: t.date };
      t.prio = 'A';
      t.date = tm;
    }
    P.save();
    P.render();
    reshow(true);
  };
  A.oggi_rvend = () => {
    D().lastReview = todayStr();
    P.save();
    P.closeSheet();
    view = null;
    P.render();
    P.toast('Revisione fatta. Buona serata.');
  };

  /* ---------- Input ---------- */
  const I = P.inputs;
  I.oggi_ntitle = (el) => { if (view && view.k === 'new') view.d.title = el.value; };
  I.oggi_dtitle = (el, ev) => {
    const t = view && view.k === 'detail' ? byId(view.id) : null;
    if (!t) return;
    const v = el.value.trim();
    if (v) { t.title = v; P.save(); }
    if (ev && ev.type === 'change') P.render();
  };
  I.oggi_ddate = (el, ev) => {
    const t = view && view.k === 'detail' ? byId(view.id) : null;
    if (!t) return;
    t.date = el.value || null;
    P.save();
    if (ev && ev.type === 'change') { P.render(); reshow(true); }
  };
  I.oggi_stepnew = () => { /* il valore si legge dal campo quando premi «Aggiungi» */ };

  // Invio sulla tastiera: aggiunge la cosa o il passo.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const el = e.target;
    if (!el || !el.dataset) return;
    if (el.dataset.i === 'oggi_ntitle') { e.preventDefault(); A.oggi_nadd(el, e); }
    else if (el.dataset.i === 'oggi_stepnew') { e.preventDefault(); A.oggi_stepadd(el, e); }
  });

  /* ---------- Esportazioni ---------- */
  P.oggi = { openTask: openTask, addTask: addTask, toggleDone: toggleDone };
})();
