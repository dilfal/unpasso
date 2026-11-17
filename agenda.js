/* Un passo: agenda (appuntamenti e compiti che si ripetono). Prefisso azioni e input: age_.
   Campi nuovi, tutti opzionali:
   - S.events = [{id, title, date:'YYYY-MM-DD', time:'HH:MM'|'', where, remind:null|0|15|30|60|120 (minuti prima), repeat:'none'|'day'|'week'|'month'}]
   - task.repeat ('none'|'day'|'week'|'month'), task.next (id del compito generato alla scadenza), task.rday (giorno del mese di partenza).
   Dalla guida di Safren: tutti gli appuntamenti vanno sul calendario, tutto il resto sulla lista dei compiti.
   Esporta P.agenda: todayHtml, upcomingHtml, tomorrowHtml, openNew, occurrences, repeatBlock, onTaskDone, onTaskReopen. */
(function () {
  'use strict';
  const esc = P.esc;
  const ea = (s) => esc(s).replace(/"/g, '&quot;');
  const DAY = 86400000;
  const HHMM = /^\d{1,2}:\d{2}$/;
  const YMD = /^\d{4}-\d{2}-\d{2}$/;
  const REPEAT = [['none', 'Non si ripete'], ['week', 'Ogni settimana'], ['month', 'Ogni mese'], ['day', 'Ogni giorno']];
  const REMIND = [['n', 'Nessun avviso'], ['0', 'All’ora'], ['15', '15 min prima'], ['30', '30 min prima'], ['60', '1 ora prima'], ['120', '2 ore prima']];

  function evs() { if (!Array.isArray(P.S.events)) P.S.events = []; return P.S.events; }
  function parse(d) { const a = d.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); }
  function dim(y, m0) { return new Date(y, m0 + 1, 0).getDate(); }
  function repLabel(r) { const f = REPEAT.find((x) => x[0] === r); return f ? f[1] : ''; }

  /* ---------- ricorrenze ---------- */
  function occursOn(ev, d) {
    if (!ev || !YMD.test(ev.date || '') || d < ev.date) return false;
    const r = ev.repeat || 'none';
    if (r === 'none') return d === ev.date;
    if (r === 'day') return true;
    const a = parse(ev.date), b = parse(d);
    if (r === 'week') return Math.round((b - a) / DAY) % 7 === 0;
    if (r === 'month') return b.getDate() === Math.min(a.getDate(), dim(b.getFullYear(), b.getMonth()));
    return false;
  }
  function occurrences(from, to) {
    const out = [];
    let d = from, guard = 0;
    while (d <= to && guard++ < 120) {
      evs().forEach((ev) => { if (occursOn(ev, d)) out.push({ ev: ev, date: d }); });
      d = P.addDays(d, 1);
    }
    out.sort((x, y) => {
      if (x.date !== y.date) return x.date < y.date ? -1 : 1;
      const a = x.ev.time || '', b = y.ev.time || '';
      return a < b ? -1 : a > b ? 1 : 0;
    });
    return out;
  }

  /* ---------- righe e sezioni ---------- */
  function row(o, withDate) {
    const ev = o.ev, bits = [];
    if (withDate) bits.push(P.fmtDate(o.date));
    bits.push(ev.time ? 'alle ' + ev.time : 'tutto il giorno');
    if (ev.where) bits.push(ev.where);
    if (ev.repeat && ev.repeat !== 'none') bits.push(repLabel(ev.repeat).toLowerCase());
    return '<li class="task"><button class="body" data-a="age_open" data-id="' + ea(ev.id) + '"><span class="ttl">' + esc(ev.title) +
      '</span><span class="meta">' + esc(bits.join(' · ')) + '</span></button></li>';
  }
  function todayHtml(t0) {
    const occ = occurrences(t0, t0);
    if (!occ.length) return '';
    return '<section class="group"><h2>Nel calendario</h2><ul class="list">' + occ.map((o) => row(o, false)).join('') + '</ul></section>';
  }
  function upcomingHtml(t0) {
    const occ = occurrences(P.addDays(t0, 1), P.addDays(t0, 14));
    let h = '<section class="group"><h2>Appuntamenti</h2>';
    h += occ.length ? '<p class="cap">I prossimi quindici giorni.</p><ul class="list">' + occ.map((o) => row(o, true)).join('') + '</ul>'
      : '<p class="empty">Nessun appuntamento nei prossimi giorni. Ciò che ha un giorno e un’ora va qui, il resto nella lista.</p>';
    h += '<button class="btn soft block" data-a="age_new">Nuovo appuntamento</button></section>';
    return h;
  }
  function tomorrowHtml() {
    const t = P.addDays(P.ymd(), 1);
    const occ = occurrences(t, t);
    if (!occ.length) return '';
    return '<div class="hint stack"><div><b>Domani nel calendario</b></div>' +
      occ.map((o) => '<div>' + esc((o.ev.time ? o.ev.time + ' ' : '') + o.ev.title) + '</div>').join('') + '</div>';
  }

  /* ---------- foglio appuntamento ---------- */
  let form = null;
  function chip(action, v, label, on) {
    return '<button class="chip" data-a="' + action + '" data-v="' + ea(v) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(label) + '</button>';
  }
  // P.sheet mette il cursore nel primo campo: serve solo quando si crea; altrimenti la tastiera coprirebbe i pulsanti
  // e si riaprirebbe a ogni tocco su un'opzione. Il foglio si ridisegna a ogni scelta: si conserva la posizione di
  // scorrimento e, quando compare la conferma di eliminazione, la si porta in vista.
  function show(focusTitle) {
    const old = document.getElementById('sheet');
    const keep = old ? old.scrollTop : 0;
    P.closeSheet();
    P.sheet(formHtml());
    const n = document.getElementById('sheet');
    if (n) n.scrollTop = form && form.confirm ? n.scrollHeight : keep;
    if (!focusTitle) { const a = document.activeElement; if (a && a.blur && a !== document.body) a.blur(); }
  }
  function openNew(o) {
    form = { id: null, title: (o && o.title) || '', date: (o && o.date) || P.ymd(), time: '', where: '', remind: 30, repeat: 'none', confirm: false };
    show(true);
  }
  function openEdit(id) {
    const ev = evs().find((e) => e.id === id);
    if (!ev) return;
    form = { id: ev.id, title: ev.title, date: ev.date, time: ev.time || '', where: ev.where || '',
      remind: ev.remind === undefined ? null : ev.remind, repeat: ev.repeat || 'none', confirm: false };
    show();
  }
  function formHtml() {
    const f = form;
    f.shownTime = !!f.time;  // com'è disegnato ora il blocco «Avviso»
    let h = '<div class="row2"><h2>' + (f.id ? 'Appuntamento' : 'Nuovo appuntamento') + '</h2><button class="btn ghost sm" data-a="core_close">Chiudi</button></div>';
    h += '<div><label class="f" for="age-title">Che cosa?</label><input type="text" id="age-title" data-i="age_title" value="' + ea(f.title) +
      '" placeholder="Per esempio: visita dal dentista" autocomplete="off" enterkeyhint="done"></div>';
    h += '<div class="row2"><div style="flex:1"><label class="f" for="age-date">Giorno</label><input type="date" id="age-date" data-i="age_date" value="' + ea(f.date) + '"></div>' +
      '<div style="flex:1"><label class="f" for="age-time">Ora <span class="muted small">(facoltativa)</span></label><input type="time" id="age-time" data-i="age_time" value="' + ea(f.time) + '"></div></div>';
    h += '<div><label class="f" for="age-where">Dove <span class="muted small">(facoltativo)</span></label><input type="text" id="age-where" data-i="age_where" value="' + ea(f.where) + '" autocomplete="off"></div>';
    h += '<div><label class="f">Avviso</label>';
    if (f.time) {
      h += '<div class="cluster" role="group" aria-label="Avviso">' + REMIND.map((r) =>
        chip('age_remind', r[0], r[1], (f.remind === null ? 'n' : String(f.remind)) === r[0])).join('') + '</div>';
    } else {
      h += '<p class="small muted" style="margin:0">Per avere un avviso serve un’ora. Senza ora, l’appuntamento compare nella lista di quel giorno.</p>';
    }
    h += '</div>';
    h += '<div><label class="f">Si ripete?</label><div class="cluster" role="group" aria-label="Ripetizione">' +
      REPEAT.map((r) => chip('age_repeat', r[0], r[1], f.repeat === r[0])).join('') + '</div></div>';
    if (f.confirm) {
      h += '<div class="hint stack"><div>Eliminare «' + esc(f.title) + '»?' + (f.repeat !== 'none' ? ' Spariscono tutte le ripetizioni.' : '') + ' Non si può annullare.</div>' +
        '<div class="cluster"><button class="btn sm danger" data-a="age_delyes">Sì, elimina</button><button class="btn sm soft" data-a="age_delno">No, lo tengo</button></div></div>';
    } else {
      h += '<div class="stack"><button class="btn block" data-a="age_save">Salva</button>' +
        (f.id ? '<button class="btn danger block" data-a="age_del">Elimina</button>' : '') + '</div>';
    }
    return h;
  }

  const A = P.actions, I = P.inputs;
  A.age_new = () => { P.closeSheet(); openNew({ date: P.ymd() }); };
  A.age_open = (el) => { openEdit(el.dataset.id); };
  A.age_remind = (el) => { if (!form) return; form.remind = el.dataset.v === 'n' ? null : +el.dataset.v; show(); };
  A.age_repeat = (el) => { if (!form) return; form.repeat = el.dataset.v; show(); };
  A.age_save = () => {
    if (!form) return;
    const title = form.title.trim();
    if (!title) { P.toast('Scrivi prima che cosa è.'); return; }
    if (!YMD.test(form.date || '')) { P.toast('Scegli il giorno.'); return; }
    const time = HHMM.test(form.time || '') ? form.time : '';
    const ev = { id: form.id || P.uid(), title: title, date: form.date, time: time, where: form.where.trim(),
      remind: time ? form.remind : null, repeat: form.repeat || 'none' };
    const list = evs();
    const i = list.findIndex((e) => e.id === ev.id);
    if (i >= 0) list[i] = ev; else list.push(ev);
    P.save();
    const noRem = ev.remind !== null && P.rem && P.rem.status && P.rem.status.known && !P.rem.status.subscribed;
    form = null;
    P.closeSheet();
    P.render();
    P.toast(noRem ? 'Salvato. Per l’avviso attiva i promemoria in Altro, Impostazioni.' : 'Salvato.');
  };
  A.age_del = () => { if (form) { form.confirm = true; show(); } };
  A.age_delno = () => { if (form) { form.confirm = false; show(); } };
  A.age_delyes = () => {
    if (!form || !form.id) return;
    P.S.events = evs().filter((e) => e.id !== form.id);
    P.save();
    form = null;
    P.closeSheet();
    P.render();
    P.toast('Eliminato.');
  };
  I.age_title = (el) => { if (form) form.title = el.value; };
  I.age_where = (el) => { if (form) form.where = el.value; };
  I.age_date = (el) => { if (form && YMD.test(el.value)) form.date = el.value; };
  I.age_time = (el, ev) => {
    if (!form) return;
    form.time = HHMM.test(el.value) ? el.value : '';
    // Il selettore invia prima «input» poi «change»: si ridisegna se il blocco «Avviso» è rimasto indietro.
    if (ev && ev.type === 'change' && !!form.time !== form.shownTime) show();
  };

  /* ---------- compiti che si ripetono ---------- */
  // anchor: giorno del mese di partenza, così un compito del 31 non slitta al 28 dopo febbraio.
  function stepDate(d, rep, anchor) {
    if (rep === 'day') return P.addDays(d, 1);
    if (rep === 'week') return P.addDays(d, 7);
    const a = parse(d), y = a.getFullYear(), m = a.getMonth() + 1;
    return P.ymd(new Date(y, m, Math.min(anchor || a.getDate(), dim(y, m))));
  }
  function repeatBlock(t) {
    const cur = t.repeat || 'none';
    return '<div><label class="f">Si ripete?</label><div class="cluster" role="group" aria-label="Ripetizione">' +
      REPEAT.map((r) => '<button class="chip" data-a="age_trep" data-id="' + ea(t.id) + '" data-v="' + r[0] + '" aria-pressed="' + (cur === r[0]) + '">' + esc(r[1]) + '</button>').join('') +
      '</div><p class="small muted" style="margin:8px 0 0">Quando la segni come fatta, la prossima compare da sola.</p></div>';
  }
  A.age_trep = (el) => {
    const t = P.S.tasks.find((x) => x.id === el.dataset.id);
    if (!t) return;
    t.repeat = el.dataset.v;
    P.save();
    const old = document.getElementById('sheet');
    const keep = old ? old.scrollTop : 0;
    if (P.oggi && P.oggi.openTask) P.oggi.openTask(t.id);
    const n = document.getElementById('sheet');
    if (n) n.scrollTop = keep;
  };
  function onTaskDone(t) {
    if (!t || !t.repeat || t.repeat === 'none') return;
    const today = P.ymd();
    const anchor = t.rday || parse(t.date || today).getDate();
    let next = stepDate(t.date || today, t.repeat, anchor), guard = 0;
    while (next <= today && guard++ < 500) next = stepDate(next, t.repeat, anchor);
    const n = {
      id: P.uid(), title: t.title, prio: t.prio, date: next, done: false, doneAt: null, created: Date.now(),
      steps: (t.steps || []).map((s) => ({ id: P.uid(), t: s.t, done: false })),
      plan: t.plan ? Object.assign({}, t.plan, { date: next, barriers: (t.plan.barriers || []).map((b) => Object.assign({}, b)) }) : null,
      repeat: t.repeat, rday: anchor
    };
    P.S.tasks.push(n);
    t.next = n.id;
  }
  function onTaskReopen(t) {
    if (!t || !t.next) return;
    const n = P.S.tasks.find((x) => x.id === t.next);
    if (n && !n.done) P.S.tasks = P.S.tasks.filter((x) => x.id !== n.id);
    t.next = null;
  }

  P.agenda = { todayHtml: todayHtml, upcomingHtml: upcomingHtml, tomorrowHtml: tomorrowHtml, openNew: openNew,
    occurrences: occurrences, repeatBlock: repeatBlock, onTaskDone: onTaskDone, onTaskReopen: onTaskReopen };
})();
