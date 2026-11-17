/* timer.js: overlay timer a schermo intero («la marea che scende») + P.startSession.
   Campi opzionali aggiunti a S.session (tutti facoltativi):
     endedTs  (ms)  quando il blocco è finito davvero
     doneMs   (ms)  tempo già lavorato prima di un «Continuo per altri 10 minuti»
     howDone  bool  «Com'è andata?» già risposta
     moreDone bool  domanda «Continuo?» (kind quick) già risposta
     measured n     minuti segnati (kind measure)
*/
(function () {
  'use strict';
  const { S, esc } = P;

  const KINDS = ['work', 'break', 'measure', 'quick'];
  const DURS = [5, 10, 15, 25, 40, 60];
  const MIN = 60000;

  let root = null, tide = null, layer = null, dial = null, disc = null;
  let ui = { step: null, parkOpen: false, draft: '', confirmExit: false, spanSet: false, parkMsg: '', drag: null };
  let tickId = null, wl = null;

  /* ---------- utilità ---------- */
  function ensure() {
    if (root) return root;
    if (!document.body) return null;
    root = document.createElement('div');
    root.id = 'timer';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Timer');
    tide = document.createElement('div');
    tide.id = 'tide';
    dial = document.createElement('div');
    dial.id = 'dial';
    layer = document.createElement('div');
    layer.className = 'layer';
    root.appendChild(tide);
    root.appendChild(dial);
    root.appendChild(layer);
    document.body.appendChild(root);

    // Gestisco io i tocchi dentro l'overlay (e fermo la propagazione per non farli gestire due volte)
    root.addEventListener('click', function (e) {
      const el = e.target.closest && e.target.closest('[data-a]');
      if (!el || !root.contains(el)) return;
      const name = el.getAttribute('data-a');
      if (!name || name.indexOf('tm_') !== 0) return;
      e.stopPropagation();
      const fn = P.actions[name];
      if (fn) fn(el, e);
    });
    const onInput = function (e) {
      const el = e.target;
      const name = el && el.getAttribute && el.getAttribute('data-i');
      if (!name || name.indexOf('tm_') !== 0) return;
      e.stopPropagation();
      const fn = P.inputs[name];
      if (fn) fn(el, e);
    };
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target && e.target.getAttribute && e.target.getAttribute('data-i') === 'tm_park') {
        e.preventDefault();
        e.stopPropagation();
        P.actions.tm_parkadd(e.target, e);
      }
    });
    root.addEventListener('animationend', function (e) {
      if (e.animationName === 'flash') root.classList.remove('flash');
    });
    return root;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtClock(ms, up) {
    if (ms < 0) ms = 0;
    const t = up ? Math.floor(ms / 1000) : Math.ceil(ms / 1000);
    return pad2(Math.floor(t / 60)) + ':' + pad2(t % 60);
  }
  function setText(sel, txt) {
    const n = root && root.querySelector(sel);
    if (n && n.textContent !== txt) n.textContent = txt;
  }
  function setTide(f) {
    if (!tide) return;
    f = Math.max(0, Math.min(1, f));
    const v = 'scaleY(' + f.toFixed(4) + ')';
    if (tide.style.transform !== v) tide.style.transform = v;
  }
  /* ---------- stile «Disco» (settings.timerStyle: 'tide' = marea, 'disc' = disco) ---------- */
  function discOn(s) {
    return !!(s && (S.settings || {}).timerStyle === 'disc' && P.disco && s.state === 'running' && s.kind !== 'measure' && s.endTs);
  }
  function scaleOf(s) {
    if (!P.disco) return 5;
    if (P.disco.SCALES.indexOf(s.scale) < 0) s.scale = P.disco.scaleFor(s.minutes > 0 ? s.minutes : 25);
    return s.scale;
  }
  function setDisc(s, remMin) {
    if (!dial || !P.disco) return;
    if (!disc) disc = P.disco.create(dial, { active: discActive, drag: discDrag, end: discEnd, key: discKey });
    disc.set(scaleOf(s), remMin);
  }
  function discActive() { return discOn(sess()); }
  function discDrag(m) {
    const s = sess();
    if (!discOn(s)) return;
    ui.drag = m;
    setText('[data-n="clock"]', m + ' min');
    setText('[data-n="info"]', 'Finisce alle ' + P.fmtTime(Date.now() + m * MIN));
    setDisc(s, m);
  }
  // la scala sale soltanto (mai scende): se il rimanente la supera, passa alla scala più piccola che lo contiene
  function bumpScale(s) {
    if (!P.disco) return;
    const m = Math.ceil((s.endTs - Date.now()) / MIN - 1e-9);
    s.scale = Math.max(scaleOf(s), P.disco.scaleFor(m));
  }
  // rilascio: m = nuovi minuti rimanenti (null = annullato). Sposto la fine della fase come tm_plus
  // (s.endTs + P.save): avvisi.js se ne accorge (firma del timer cambiata) e rifà il piano.
  function discEnd(m) {
    const s = sess();
    ui.drag = null;
    if (m != null && discOn(s)) {
      s.endTs = Date.now() + m * MIN;   // la scala non cambia con il trascinamento
      P.save();
    }
    tick();
  }
  function discKey(d) {
    const s = sess();
    if (!discOn(s)) return;
    const rem = s.endTs - Date.now();
    if (d < 0 && rem <= MIN) return;   // freccia giù non aumenta mai il rimanente
    let n = rem + d * MIN;
    n = Math.max(MIN, Math.min(Math.max(120 * MIN, rem), n));   // fino a 120 minuti; la scala sale se serve
    if (Math.abs(n - rem) < 1) return;
    s.endTs = Date.now() + n;
    bumpScale(s);
    saveKeyLater();
    tick();
  }
  // le frecce spostano subito s.endTs, ma il salvataggio (e il piano degli avvisi) parte dopo 300 ms dall'ultima pressione
  let keySave = null;
  function saveKeyLater() {
    if (keySave) clearTimeout(keySave);
    keySave = setTimeout(flushKeySave, 300);
  }
  function flushKeySave() {
    if (!keySave) return;
    clearTimeout(keySave);
    keySave = null;
    P.save();
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushKeySave(); });
  function sess() { return S.session || null; }
  function taskOf(s) { return s && s.taskId ? S.tasks.find(function (t) { return t.id === s.taskId; }) || null : null; }
  function parkedOf(s) {
    const ids = (s && s.parkedIds) || [];
    return S.parked.filter(function (p) { return ids.indexOf(p.id) >= 0 && !p.resolved; });
  }
  function workedMin(s) {
    const end = s.endedTs || s.endTs || Date.now();
    return Math.max(1, Math.round((end - s.startTs + (s.doneMs || 0)) / MIN));
  }
  function addTask(o) {
    if (P.oggi && P.oggi.addTask) return P.oggi.addTask(o);
    const t = { id: P.uid(), title: o.title, prio: o.prio || 'B', date: o.date || null, done: false, doneAt: null,
      created: Date.now(), steps: [], plan: null };
    S.tasks.push(t);
    return t;
  }

  /* ---------- schermo sempre acceso ---------- */
  function lock() {
    try {
      if (!navigator.wakeLock || wl) return;
      navigator.wakeLock.request('screen').then(function (l) {
        const s = sess();
        if (!s || s.state !== 'running') { try { l.release(); } catch (e) {} return; }
        wl = l;
        if (l.addEventListener) l.addEventListener('release', function () { if (wl === l) wl = null; });
      }, function () { wl = null; });
    } catch (e) { wl = null; }
  }
  function unlock() {
    try { if (wl) wl.release(); } catch (e) {}
    wl = null;
  }
  document.addEventListener('visibilitychange', function () {
    const s = sess();
    if (document.visibilityState === 'visible' && s && s.state === 'running') {
      lock();
      tick();
    }
  });

  /* ---------- tick ---------- */
  function startTick() {
    if (tickId) return;
    tickId = setInterval(tick, 250);
  }
  function stopTick() {
    if (tickId) { clearInterval(tickId); tickId = null; }
  }
  function tick() {
    const s = sess();
    if (!s || s.state !== 'running' || !root || root.hidden) { if (!s || s.state !== 'running') stopTick(); return; }
    const now = Date.now();
    if (s.kind === 'measure') {
      setText('[data-n="clock"]', fmtClock(now - s.startTs, true));
      setTide((now - s.startTs) / (60 * MIN));
      return;
    }
    const rem = s.endTs - now;
    if (rem <= 0) { finish(true, now); return; }
    if (ui.drag != null) return;   // sto girando il disco: il testo mostra i minuti scelti
    setText('[data-n="clock"]', fmtClock(rem, false));
    setText('[data-n="info"]', 'Finisce alle ' + P.fmtTime(s.endTs));
    setTide(rem / Math.max(1, s.endTs - s.startTs));
    if (root.classList.contains('disc')) setDisc(s, rem / MIN);
  }

  /* ---------- ciclo di vita ---------- */
  function show() {
    if (!ensure()) return;
    root.hidden = false;
    render();
    const s = sess();
    if (s && s.state === 'running') { startTick(); lock(); }
  }
  function close() {
    flushKeySave();
    stopTick();
    unlock();
    S.session = null;
    ui = { step: null, parkOpen: false, draft: '', confirmExit: false, spanSet: false, parkMsg: '', drag: null };
    P.save();
    if (root) { root.hidden = true; root.classList.remove('flash', 'break', 'disc'); }
    P.render();
  }
  function begin(s) {
    s.state = 'running';
    s.startTs = Date.now();
    s.endTs = s.kind === 'measure' ? null : s.startTs + s.minutes * MIN;
    s.extra = 0;
    delete s.scale;   // la scala del disco si fissa all'avvio (da s.minutes)
    P.save();
    ui.confirmExit = false;
    show();
  }
  function stepFor(s) {
    if (s.kind === 'break') return 'brk';
    if (s.kind === 'measure') return 'measured';
    if (s.kind === 'quick' && !s.moreDone) return 'more';
    if (parkedOf(s).length) return 'parked';
    if (s.kind === 'work' && !s.howDone) return 'how';
    return 'next';
  }
  function finish(auto, now) {
    const s = sess();
    if (!s || s.state !== 'running') return;
    now = now || Date.now();
    s.state = 'ended';
    s.endedTs = auto && s.endTs ? Math.min(now, s.endTs) : now;
    P.save();
    stopTick();
    unlock();
    ui.step = stepFor(s);
    ui.confirmExit = false;
    ui.parkOpen = false;
    render();
    if (auto && s.endTs && now - s.endTs < 30000) {
      try { if (S.settings.sound) P.chime(); } catch (e) {}
      try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
      root.classList.remove('flash');
      void root.offsetWidth;
      root.classList.add('flash');
      setTimeout(function () { if (root) root.classList.remove('flash'); }, 2900);
    }
  }

  function startSession(o) {
    o = o || {};
    if (!ensure()) return;
    stopTick();
    unlock();
    const kind = KINDS.indexOf(o.kind) >= 0 ? o.kind : 'work';
    const task = o.taskId ? S.tasks.find(function (t) { return t.id === o.taskId; }) : null;
    const plan = task && task.plan;
    const isWork = kind === 'work' || kind === 'quick';
    let minutes = Math.round(Number(o.minutes));
    if (!(minutes >= 1)) minutes = kind === 'break' ? (S.settings.pause || 5) : kind === 'quick' ? 2 : kind === 'measure' ? 0 : (S.settings.span || 25);
    const srcSteps = isWork ? (o.steps || (task && task.steps) || []) : [];
    const s = {
      id: P.uid(), kind: kind, state: 'ready',
      taskId: task ? task.id : null,
      title: o.title || (task && task.title) || '',
      minutes: minutes,
      first: isWork ? (o.first != null ? o.first : (plan && plan.first) || '') : '',
      barriers: isWork ? (o.barriers || (plan && plan.barriers) || []).filter(function (b) { return b && (b.if || b.then); }) : [],
      steps: srcSteps.map(function (st) { return { id: st.id || P.uid(), t: st.t, done: !!st.done }; }),
      startTs: null, endTs: null, parkedIds: [], extra: 0
    };
    S.session = s;
    ui = { step: null, parkOpen: false, draft: '', confirmExit: false, spanSet: false, parkMsg: '', drag: null };
    if (!isWork || o.skipReady) { begin(s); return; }
    P.save();
    show();
  }

  function resume() {
    if (!ensure()) {
      document.addEventListener('DOMContentLoaded', resume, { once: true });
      return;
    }
    const s = sess();
    if (!s) { root.hidden = true; return; }
    if (s.state === 'running' && s.kind !== 'measure' && s.endTs && Date.now() >= s.endTs) {
      s.state = 'ended';
      s.endedTs = s.endTs;
      P.save();
    }
    if (s.state === 'ended') ui.step = stepFor(s);
    show();
  }

  /* ---------- viste ---------- */
  function render() {
    const s = sess();
    if (!root || !s) return;
    root.classList.toggle('break', s.kind === 'break');
    root.classList.toggle('disc', discOn(s));
    ui.drag = null;
    let html = '';
    let f = 0;
    if (s.state === 'ready') html = viewReady(s);
    else if (s.state === 'running') { html = viewRunning(s); f = 1; }
    else { if (!ui.step) ui.step = stepFor(s); html = viewEnded(s); }
    layer.innerHTML = html;
    if (s.state === 'running') {
      const now = Date.now();
      f = s.kind === 'measure' ? Math.min((now - s.startTs) / (60 * MIN), 1) : Math.max(0, (s.endTs - now) / Math.max(1, s.endTs - s.startTs));
    }
    setTide(f);
    if (s.state === 'running') {
      tick();
      if (ui.parkOpen) {
        const inp = layer.querySelector('[data-i="tm_park"]');
        if (inp) { try { inp.focus(); } catch (e) {} }
      }
    }
  }

  function btn(a, label, cls, extra) {
    return '<button class="btn ' + (cls || '') + '" data-a="' + a + '"' + (extra || '') + '>' + label + '</button>';
  }

  function durations(s) {
    const list = DURS.slice();
    if (list.indexOf(s.minutes) < 0) { list.push(s.minutes); list.sort(function (a, b) { return a - b; }); }
    return list;
  }

  function viewReady(s) {
    const title = s.title || (s.kind === 'quick' ? 'Solo qualche minuto' : 'Un blocco di lavoro');
    let h = '<div class="ttitle">' + esc(title) + '</div>';
    if (s.first) h += '<div class="tpanel"><b>Primo gesto:</b> ' + esc(s.first) + '</div>';
    if (s.barriers.length) {
      h += '<div class="tpanel"><b>Se capita qualcosa:</b><ul class="list">';
      s.barriers.forEach(function (b) {
        h += '<li class="task"><span class="ttl">' + (b.if ? 'Se ' + esc(b.if) : '') + (b.then ? (b.if ? ', allora ' : 'Allora ') + esc(b.then) : '') + '</span></li>';
      });
      h += '</ul></div>';
    }
    if (P.motivazione) h += P.motivazione.readyHtml(taskOf(s), s);
    h += '<div class="tpanel"><b>Quanto tempo?</b><div class="cluster" style="margin-top:10px">';
    durations(s).forEach(function (m) {
      h += '<button class="chip" data-a="tm_dur" data-v="' + m + '" aria-pressed="' + (m === s.minutes) + '"' +
        (m === S.settings.span ? ' style="border-color:var(--sea)"' : '') + '>' + m + ' min</button>';
    });
    h += '</div>';
    if (DURS.indexOf(S.settings.span) >= 0 || S.settings.span === s.minutes) {
      h += '<p class="small muted" style="margin:10px 0 0">La tua soglia: ' + S.settings.span + ' min</p>';
    }
    h += '</div>';
    h += '<div class="stack" style="margin-top:auto">' + btn('tm_go', 'Parto', 'block') + btn('tm_cancel', 'Indietro', 'soft block') + '</div>';
    return h;
  }

  function stepsHtml(s) {
    if (!s.steps.length) return '';
    let h = '<div class="tpanel"><ul class="list stepsl">';
    s.steps.forEach(function (st) {
      h += '<li class="task' + (st.done ? ' done' : '') + '"><button class="check" data-a="tm_step" data-id="' + esc(st.id) +
        '" aria-label="Segna come fatto: ' + esc(st.t) + '"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></button>' +
        '<span class="ttl">' + esc(st.t) + '</span></li>';
    });
    return h + '</ul></div>';
  }

  function parkHtml(s) {
    const n = (s.parkedIds || []).length;
    if (!ui.parkOpen) {
      return btn('tm_parkopen', 'Mi è venuto in mente…', 'block') +
        (n ? '<div class="tinfo small" data-n="parkcount">Parcheggiati: ' + n + '</div>' : '');
    }
    return '<div class="tpanel"><label class="f" for="tm_parkinp">Scrivilo qui: non farlo adesso, tornerò qui.</label>' +
      '<div class="addrow"><input type="text" id="tm_parkinp" data-i="tm_park" value="' + esc(ui.draft) + '" autocomplete="off" placeholder="Cosa ti è venuto in mente?">' +
      btn('tm_parkadd', 'Parcheggia', 'sm') + '</div>' +
      '<p class="small muted" style="margin:8px 0 0" data-n="parkmsg">' + esc(ui.parkMsg) + '</p>' +
      '<div class="row2" style="margin-top:6px"><span class="small" data-n="parkcount">Parcheggiati: ' + n + '</span>' +
      btn('tm_parkclose', 'Fatto', 'soft sm') + '</div></div>';
  }

  function viewRunning(s) {
    const now = Date.now();
    let h = '';
    if (s.kind === 'break') {
      h += '<div class="ttitle">Pausa</div><div class="tinfo small">Alzati, bevi un po\' d\'acqua, guarda fuori dalla finestra.</div>';
    } else if (s.kind === 'measure') {
      h += '<div class="ttitle">Quanto dura la mia attenzione?</div>' +
        '<div class="tinfo small">Lavora a qualcosa di tuo. Quando ti viene voglia di smettere, toccalo.</div>';
    } else {
      h += '<div class="ttitle">' + esc(s.title || (s.kind === 'quick' ? 'Solo qualche minuto' : 'Un blocco di lavoro')) + '</div>';
      h += stepsHtml(s);
      h += parkHtml(s).indexOf('tpanel') >= 0 ? parkHtml(s) : '';
    }
    const clock = s.kind === 'measure' ? fmtClock(now - s.startTs, true) : fmtClock(s.endTs - now, false);
    h += '<div class="tclock" data-n="clock">' + clock + '</div>';
    if (s.kind !== 'measure') h += '<div class="tinfo" data-n="info">Finisce alle ' + P.fmtTime(s.endTs) + '</div>';
    if (s.kind === 'work' || s.kind === 'quick') {
      if (!ui.parkOpen) h += parkHtml(s);
    }
    if (s.kind === 'measure') h += btn('tm_mstop', 'Mi è venuta voglia di smettere', 'block');
    if (ui.confirmExit) {
      h += '<div class="tpanel"><p style="margin:0 0 10px"><b>Vuoi uscire?</b> ' +
        (s.kind === 'measure' ? 'La misura non viene salvata.' : 'Il blocco non viene salvato.') + '</p><div class="cluster">' +
        btn('tm_exitno', 'Resto qui', 'sm') + btn('tm_exityes', 'Esco', 'soft sm') + '</div></div>';
    } else {
      h += '<div class="cluster">';
      if (s.kind !== 'measure') h += btn('tm_plus', '+5 minuti', 'soft sm');
      if (s.kind !== 'measure') h += btn('tm_done', s.kind === 'break' ? 'Pausa finita' : 'Ho finito', 'soft sm');
      h += btn('tm_exit', 'Esci', 'soft sm') + '</div>';
    }
    return h;
  }

  function viewEnded(s) {
    const step = ui.step;
    const title = esc(s.title || '');
    let h = '';
    if (step === 'brk') {
      h += '<div class="ttitle" style="margin-top:auto">Pausa finita</div>' +
        '<div class="stack" style="margin-bottom:auto">' +
        btn('tm_more', 'Un altro blocco', 'block') + btn('tm_close', 'Ho finito per ora', 'soft block') + '</div>';
    } else if (step === 'measured') {
      const n = s.measured || 1;
      const last = S.samples.slice(-3);
      const avg = last.length ? Math.max(1, Math.round(last.reduce(function (a, x) { return a + x.minutes; }, 0) / last.length)) : n;
      h += '<div class="ttitle" style="margin-top:auto">Segnato: ' + n + ' min</div>' +
        '<div class="tpanel">' + (last.length > 1 ? 'Media delle ultime ' + last.length + ' misure: <b>' + avg + ' min</b>.' : 'Prima misura: <b>' + avg + ' min</b>. Con qualche misura in più il numero diventa più affidabile.') + '</div>' +
        '<div class="stack" style="margin-bottom:auto">' +
        (ui.spanSet ? '<div class="tpanel">Soglia impostata a ' + S.settings.span + ' min.</div>' : btn('tm_mspan', 'Imposta ' + avg + ' min come mia soglia', 'block', ' data-v="' + avg + '"')) +
        btn('tm_magain', 'Un\'altra misura', 'soft block') + btn('tm_close', 'Chiudi', 'soft block') + '</div>';
    } else if (step === 'more') {
      h += '<div class="ttitle" style="margin-top:auto">Primi minuti fatti</div>' +
        '<div class="big-q" style="text-align:center;text-shadow:0 0 10px var(--paper)">Continuo per altri 10 minuti?</div>' +
        '<div class="stack" style="margin-bottom:auto">' + btn('tm_qyes', 'Sì, continuo', 'block') + btn('tm_qno', 'No, mi fermo qui', 'soft block') + '</div>';
    } else if (step === 'parked') {
      const list = parkedOf(s);
      const p = list[0];
      const tot = (s.parkedIds || []).length;
      h += '<div class="ttitle" style="margin-top:auto">Blocco finito</div>' +
        '<div class="tpanel"><p class="small muted" style="margin:0 0 6px">Pensiero parcheggiato (' + (tot - list.length + 1) + ' di ' + tot + ')</p>' +
        '<p style="margin:0;font-weight:600;overflow-wrap:anywhere">' + esc(p.text) + '</p></div>' +
        '<div class="stack" style="margin-bottom:auto">' + btn('tm_pk_today', 'Lo faccio oggi', 'block', ' data-id="' + esc(p.id) + '"') +
        btn('tm_pk_list', 'In lista', 'soft block', ' data-id="' + esc(p.id) + '"') +
        btn('tm_pk_drop', 'Scarta', 'soft block', ' data-id="' + esc(p.id) + '"') + '</div>';
    } else if (step === 'how') {
      h += '<div class="ttitle" style="margin-top:auto">Blocco finito</div>' +
        '<div class="tpanel"><b>Com\'è andata?</b>' + (title ? '<div class="small muted">' + title + '</div>' : '') + '</div>' +
        '<div class="stack" style="margin-bottom:auto">' +
        btn('tm_how_done', 'Compito finito', 'block') + btn('tm_how_prog', 'Ho avanzato', 'soft block') +
        btn('tm_how_stuck', 'Non sono riuscita a iniziare', 'soft block') + '</div>';
    } else if (step === 'stuck') {
      h += '<div class="ttitle" style="margin-top:auto">Può succedere</div>' +
        '<div class="tpanel">Non è un fallimento. Possiamo cercare insieme un primo passo ancora più piccolo.</div>' +
        '<div class="stack" style="margin-bottom:auto">' + btn('tm_stuck_help', 'Apri l\'aiuto', 'block') + btn('tm_close', 'Chiudi', 'soft block') + '</div>';
    } else {
      const task = taskOf(s);
      const canAgain = !(task && task.done);
      h += '<div class="ttitle" style="margin-top:auto">' + (s.kind === 'quick' ? 'Hai iniziato' : 'Ben fatto') + '</div>' +
        '<div class="tpanel">Una pausa di ' + (S.settings.pause || 5) + ' minuti aiuta a ripartire meglio.</div>' +
        (P.motivazione ? P.motivazione.rewardHtml(s) : '') +
        '<div class="stack" style="margin-bottom:auto">' + btn('tm_brk', 'Pausa di ' + (S.settings.pause || 5) + ' minuti', 'block') +
        (canAgain ? btn('tm_more', 'Un altro blocco', 'soft block') : '') + btn('tm_close', 'Ho chiuso per ora', 'soft block') + '</div>';
    }
    return h;
  }

  /* ---------- azioni ---------- */
  function afterParked() {
    const s = sess();
    if (!s) return;
    ui.step = stepFor(s);
    if (s.kind === 'quick' && ui.step === 'next') { /* mostra comunque la chiusura */ }
    render();
  }
  function toggleStep(id) {
    const s = sess();
    if (!s) return;
    const st = s.steps.find(function (x) { return x.id === id; });
    if (!st) return;
    st.done = !st.done;
    const task = taskOf(s);
    if (task && task.steps) {
      const ts = task.steps.find(function (x) { return x.id === id; }) || task.steps.find(function (x) { return x.t === st.t; });
      if (ts) ts.done = st.done;
    }
    P.save();
  }
  function addPark() {
    const s = sess();
    if (!s) return;
    const text = (ui.draft || '').trim();
    const inp = layer.querySelector('[data-i="tm_park"]');
    if (!text) { if (inp) inp.focus(); return; }
    const p = { id: P.uid(), text: text, ts: Date.now(), taskId: s.taskId || null, resolved: false };
    S.parked.push(p);
    s.parkedIds = s.parkedIds || [];
    s.parkedIds.push(p.id);
    P.save();
    ui.draft = '';
    ui.parkMsg = 'Parcheggiato. Non farlo adesso, tornerò qui.';
    if (inp) { inp.value = ''; inp.focus(); }
    setText('[data-n="parkmsg"]', ui.parkMsg);
    setText('[data-n="parkcount"]', 'Parcheggiati: ' + s.parkedIds.length);
  }
  function resolvePark(id, how) {
    const s = sess();
    const p = S.parked.find(function (x) { return x.id === id; });
    if (!s || !p) return;
    if (how === 'today') addTask({ title: p.text, prio: 'B', date: P.ymd() });
    else if (how === 'list') addTask({ title: p.text, prio: 'B', date: null });
    p.resolved = true;
    P.save();
    afterParked();
  }

  const A = {
    tm_dur: function (el) {
      const s = sess();
      if (!s || s.state !== 'ready') return;
      s.minutes = parseInt(el.getAttribute('data-v'), 10) || s.minutes;
      P.save();
      render();
    },
    tm_go: function () {
      const s = sess();
      if (!s || s.state !== 'ready') return;
      try { P.audioUnlock(); } catch (e) {}
      begin(s);
    },
    tm_cancel: function () { close(); },
    tm_step: function (el) {
      toggleStep(el.getAttribute('data-id'));
      const li = el.closest('.task');
      if (li) li.classList.toggle('done');
    },
    tm_parkopen: function () { ui.parkOpen = true; ui.parkMsg = ''; render(); },
    tm_parkclose: function () { ui.parkOpen = false; render(); },
    tm_parkadd: function () { addPark(); },
    tm_plus: function () {
      const s = sess();
      if (!s || s.state !== 'running' || !s.endTs) return;
      s.endTs += 5 * MIN;
      s.extra = (s.extra || 0) + 5;
      bumpScale(s);
      P.save();
      tick();
    },
    tm_done: function () {
      const s = sess();
      if (!s) return;
      try { P.audioUnlock(); } catch (e) {}
      finish(false);
    },
    tm_exit: function () { ui.confirmExit = true; render(); },
    tm_exitno: function () { ui.confirmExit = false; render(); },
    tm_exityes: function () { close(); },
    tm_close: function () { close(); },
    tm_pk_today: function (el) { resolvePark(el.getAttribute('data-id'), 'today'); },
    tm_pk_list: function (el) { resolvePark(el.getAttribute('data-id'), 'list'); },
    tm_pk_drop: function (el) { resolvePark(el.getAttribute('data-id'), 'drop'); },
    tm_how_done: function () {
      const s = sess();
      if (!s) return;
      const task = taskOf(s);
      const name = s.title || (task && task.title) || 'il compito';
      if (task && !task.done) { task.done = true; task.doneAt = Date.now(); }
      s.howDone = true;
      P.save();
      P.win('Ho finito: ' + name, 'task');
      ui.step = stepFor(s);
      render();
    },
    tm_how_prog: function () {
      const s = sess();
      if (!s) return;
      const name = s.title || (taskOf(s) && taskOf(s).title) || 'un compito';
      s.howDone = true;
      P.save();
      P.win('Ho lavorato ' + workedMin(s) + ' minuti su ' + name, 'block');
      ui.step = stepFor(s);
      render();
    },
    tm_how_stuck: function () {
      const s = sess();
      if (!s) return;
      s.howDone = true;
      P.save();
      ui.step = 'stuck';
      render();
    },
    tm_stuck_help: function () {
      close();
      P.go('aiuto');
    },
    tm_brk: function () {
      const s = sess();
      const o = { kind: 'break', minutes: S.settings.pause || 5, skipReady: true };
      if (s) { o.taskId = s.taskId; o.title = s.title; }
      startSession(o);
    },
    tm_more: function () {
      const s = sess();
      const o = { kind: 'work', minutes: S.settings.span || 25, skipReady: true };
      if (s) {
        o.taskId = s.taskId; o.title = s.title;
        if (s.kind !== 'break') { o.first = ''; o.barriers = s.barriers; o.steps = s.steps; }
      }
      try { P.audioUnlock(); } catch (e) {}
      startSession(o);
    },
    tm_qyes: function () {
      const s = sess();
      if (!s) return;
      const now = Date.now();
      s.doneMs = (s.doneMs || 0) + ((s.endedTs || now) - s.startTs);
      s.kind = 'work';
      s.minutes = 10;
      s.moreDone = true;
      s.state = 'running';
      s.startTs = now;
      s.endTs = now + 10 * MIN;
      s.extra = 0;
      delete s.scale;
      s.endedTs = null;
      P.save();
      try { P.audioUnlock(); } catch (e) {}
      ui.step = null;
      show();
    },
    tm_qno: function () {
      const s = sess();
      if (!s) return;
      s.moreDone = true;
      s.howDone = true;
      P.save();
      const name = s.title || (taskOf(s) && taskOf(s).title) || 'un compito';
      P.win('Ho iniziato: ' + workedMin(s) + ' minuti su ' + name, 'restart');
      ui.step = stepFor(s);
      render();
    },
    tm_mstop: function () {
      const s = sess();
      if (!s || s.state !== 'running') return;
      const now = Date.now();
      const m = Math.max(1, Math.round((now - s.startTs) / MIN));
      S.samples.push({ id: P.uid(), ts: now, minutes: m });
      s.measured = m;
      s.state = 'ended';
      s.endedTs = now;
      P.save();
      stopTick();
      unlock();
      ui.step = 'measured';
      ui.spanSet = false;
      render();
    },
    tm_mspan: function (el) {
      const v = parseInt(el.getAttribute('data-v'), 10);
      if (!(v >= 1)) return;
      S.settings.span = v;
      P.save();
      ui.spanSet = true;
      P.toast('Soglia impostata: ' + v + ' min');
      render();
    },
    tm_magain: function () { startSession({ kind: 'measure' }); }
  };

  const I = {
    tm_park: function (el) { ui.draft = el.value; }
  };

  Object.keys(A).forEach(function (k) { P.actions[k] = A[k]; });
  Object.keys(I).forEach(function (k) { P.inputs[k] = I[k]; });

  P.startSession = startSession;
  P.timer = { resume: resume, close: close };

  ensure();
  if (!root) document.addEventListener('DOMContentLoaded', ensure, { once: true });
})();
