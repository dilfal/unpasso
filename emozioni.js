/* Un passo: emozioni e ansia (nodi aggiuntivi della schermata «Bloccata»). Prefisso azioni e input: emo_.
   Stato non persistente in P.ui.params.help (lo stesso di aiuto.js): { node, w?, f?, a?, b?, u? }.
   Persistente (opzionale): S.cards = [{id, ts, title, lines:[{k, v}]}], le «carte di coping».
   Fonti (parole mie): Ramsay, The Adult ADHD and Anxiety Workbook (incertezza e «e se», evitamento che dà sollievo
   subito, ansia di dimenticare e esternalizzazione, coping framework e piano «se/quando X, allora Y» del capitolo 3);
   Ramsay, Rethinking Adult ADHD (nominare il disagio «ugh» e restare sul piano, sì impulsivo e «prendere tempo»,
   carte di coping). Esporta P.emozioni: owns(node), render(h), cardCount(). */
(function () {
  'use strict';
  const esc = P.esc;
  const ea = (s) => esc(s).replace(/"/g, '&quot;');
  const OWN = ['uff', 'worry', 'forget', 'avoid', 'buy', 'cards'];

  function H() {
    const p = P.ui.params || (P.ui.params = {});
    if (!p.help || typeof p.help !== 'object') p.help = { node: 'start' };
    return p.help;
  }
  function go(node) { P.ui.params.help = { node: node }; P.render(); window.scrollTo(0, 0); }
  function cards() { if (!Array.isArray(P.S.cards)) P.S.cards = []; return P.S.cards; }
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const trim = (s) => String(s || '').trim();
  function chip(action, v, label, on, extra) {
    return '<button class="chip" data-a="' + action + '" data-v="' + ea(v) + '"' + (extra || '') + ' aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(label) + '</button>';
  }
  function dots(n, tot) {
    let s = '';
    for (let i = 0; i < tot; i++) s += '<i' + (i < n ? ' class="on"' : '') + '></i>';
    return '<div class="dots" aria-hidden="true">' + s + '</div>';
  }
  function field(label, id, key, value, ph, prefix) {
    return '<div><label class="f" for="' + id + '">' + esc(label) + '</label><input type="text" id="' + id + '" data-i="' + prefix + '" data-k="' + key + '" value="' + ea(value || '') +
      '" placeholder="' + ea(ph || '') + '" autocomplete="off"></div>';
  }
  function whenChips(action, cur) {
    return '<div class="cluster" role="group" aria-label="Quando">' + chip(action, 'oggi', 'Oggi', cur === 'oggi') + chip(action, 'domani', 'Domani', cur === 'domani') +
      chip(action, 'lista', 'Senza data', cur === 'lista') + '</div>';
  }
  const dateOf = (w) => (w === 'oggi' ? P.ymd() : w === 'domani' ? P.addDays(P.ymd(), 1) : null);

  /* ---------- «uff»: dare un nome al disagio e restare sul piano ---------- */
  const U_LABELS = ['il mio «uff»', 'il mio «non ho voglia»', 'il mio «e se non ci riesco»'];
  const U_PHRASES = ['il disagio passa', 'basta iniziare', 'non devo sentirmi pronta', 'posso farlo anche con l’uff'];
  function nodeUff(h) {
    const u = h.u || (h.u = { rate: 5, label: '', phrase: '' });
    let s = '<h2 class="big-q">Mi annoio e mi dà fastidio (uff)</h2>';
    s += '<p>Il fastidio davanti a un compito non è un segnale che stai sbagliando: capita a quasi tutti, e con l’ADHD di più. Non serve che passi prima di cominciare. È come entrare in piscina: i primi minuti l’acqua sembra fredda, poi ti abitui. La domanda non è «ho voglia?», ma «posso fare il primo passo anche con l’uff?».</p>';
    s += '<div><label class="f">Quanto è forte adesso?</label><div class="stepper"><button aria-label="Meno" data-a="emo_u_rate" data-v="-">−</button><output>' + u.rate + ' su 10</output>' +
      '<button aria-label="Più" data-a="emo_u_rate" data-v="+">+</button></div></div>';
    s += '<div><label class="f">Come lo chiameresti?</label><div class="cluster" role="group" aria-label="Nome">' + U_LABELS.map((l) => chip('emo_u_label', l, l, u.label === l)).join('') + '</div>' +
      '<p class="small muted" style="margin:8px 0 0">Dargli un nome, anche piccolo, lo rende più chiaro: ci stai accanto invece di scappare.</p></div>';
    s += '<div><label class="f">Una frase per restare</label><div class="cluster" role="group" aria-label="Frase">' + U_PHRASES.map((p) => chip('emo_u_phrase', p, p, u.phrase === p)).join('') + '</div></div>';
    if (u.phrase) s += '<div class="card-line"><p class="big-q" style="font-size:1.35rem;margin:0">' + esc(cap(u.phrase)) + '.</p></div>';
    s += '<div class="stack"><button class="btn block" data-a="emo_u_go">Resto 10 minuti con l’uff</button>' +
      '<button class="btn soft block" data-a="aiu_thought">Scrivi il pensiero</button></div>';
    s += '<p class="small muted">Dopo i dieci minuti rivaluti: quasi sempre il disagio è calato, e se no hai comunque fatto qualcosa.</p>';
    return s;
  }
  const A = P.actions, I = P.inputs;
  A.emo_u_rate = (el) => { const u = H().u; if (!u) return; u.rate = Math.max(0, Math.min(10, u.rate + (el.dataset.v === '+' ? 1 : -1))); P.render(); };
  A.emo_u_label = (el) => { const u = H().u; if (!u) return; u.label = u.label === el.dataset.v ? '' : el.dataset.v; P.render(); };
  A.emo_u_phrase = (el) => { const u = H().u; if (!u) return; u.phrase = u.phrase === el.dataset.v ? '' : el.dataset.v; P.render(); };
  A.emo_u_go = () => {
    const u = H().u || {};
    P.startSession({ kind: 'quick', title: u.label ? 'Resto con ' + u.label : 'Dieci minuti con l’uff', minutes: 10 });
  };

  /* ---------- «e se…»: preoccupazione e incertezza ---------- */
  const COPES = [
    'Non so come andrà. Intanto faccio il mio passo.',
    'È un’ipotesi, non un fatto.',
    'Posso stare nel «non lo so» ancora un po’.',
    'Non devo risolverlo adesso.'
  ];
  function nodeWorry(h) {
    const w = h.w || (h.w = { step: 0, fear: '', can: null, small: '', ifthen: '', cope: '', done: false });
    if (w.done === 'task') {
      return dots(3, 3) + '<h2 class="big-q">Fatto.</h2><p>Il passo è tra i compiti di oggi: <b>' + esc(w.small) + '</b>. Il resto del pensiero può restare lì: adesso c’è un gesto concreto.</p>' +
        '<div class="stack"><button class="btn block" data-a="aiu_oggi">Vai a Oggi</button><button class="btn soft block" data-a="emo_w_card">Salva come carta</button></div>';
    }
    if (w.done === 'cope') {
      return dots(3, 3) + '<h2 class="big-q">Non si può sapere adesso.</h2><div class="card-line"><p class="big-q" style="font-size:1.3rem;margin:0">' + esc(w.cope) + '</p></div>' +
        '<p class="muted">Quando il pensiero torna, ripeti la frase e torna a quello che stavi facendo. Tornerà ancora: non vuol dire che non funziona.</p>' +
        '<div class="stack"><button class="btn block" data-a="aiu_oggi">Torno a Oggi</button><button class="btn soft block" data-a="emo_w_card">Salva come carta</button></div>';
    }
    if (w.step === 0) {
      return dots(1, 3) + '<h2 class="big-q">Mi preoccupo: e se…</h2>' +
        '<p>Con l’ADHD i piani sono sempre un po’ incerti, e l’incertezza fa partire i «e se». Rassicurarsi a parole spesso non basta: arriva un altro «e se». Qui non cerchiamo di eliminare l’incertezza, che non si può: guardiamo se c’è un passo da fare.</p>' +
        '<div><label class="f" for="emoFear">Che cosa temi che succeda?</label><input type="text" id="emoFear" data-i="emo_w_fear" value="' + ea(w.fear) + '" placeholder="per esempio: e se non finisco in tempo" autocomplete="off"></div>' +
        '<div class="stack"><button class="btn block" data-a="emo_w_next">Avanti</button></div>';
    }
    if (w.step === 1) {
      return dots(2, 3) + '<h2 class="big-q">C’è qualcosa che puoi fare adesso?</h2><div class="card-line"><p style="margin:0">«' + esc(w.fear) + '»</p></div>' +
        '<p class="muted">Anche un gesto piccolissimo conta. Se non dipende da te, o non si può sapere ancora, va bene lo stesso.</p>' +
        '<div class="stack"><button class="btn block" data-a="emo_w_can" data-v="si">Sì, un passo c’è</button><button class="btn soft block" data-a="emo_w_can" data-v="no">No, adesso non si può sapere</button>' +
        '<button class="btn ghost block" data-a="emo_w_prev">Indietro</button></div>';
    }
    if (w.can === 'si') {
      return dots(3, 3) + '<h2 class="big-q">Il passo più piccolo</h2>' +
        '<input type="text" id="emoSmall" data-i="emo_w_small" aria-label="Il passo più piccolo" value="' + ea(w.small) + '" placeholder="per esempio: scrivere a Marta per chiedere altri due giorni" autocomplete="off">' +
        '<div class="stack"><button class="btn block" data-a="emo_w_task">Aggiungi ai compiti di oggi</button><button class="btn ghost block" data-a="emo_w_prev">Indietro</button></div>';
    }
    return dots(3, 3) + '<h2 class="big-q">Una frase per il «non lo so»</h2>' +
      '<p class="muted">Sceglila tu: serve un pensiero che regga anche con l’incertezza.</p>' +
      '<div class="stack">' + COPES.map((c, i) => '<button class="opt" data-a="emo_w_cope" data-v="' + i + '">' + esc(c) + '</button>').join('') +
      '<button class="btn ghost block" data-a="emo_w_prev">Indietro</button></div>';
  }
  I.emo_w_fear = (el) => { const w = H().w; if (w) w.fear = el.value; };
  I.emo_w_small = (el) => { const w = H().w; if (w) w.small = el.value; };
  A.emo_w_next = () => {
    const w = H().w; if (!w) return;
    if (!trim(w.fear)) { P.toast('Scrivi che cosa temi, anche in due parole.'); return; }
    w.step = 1; P.render();
  };
  A.emo_w_prev = () => { const w = H().w; if (!w) return; w.step = Math.max(0, w.step - (w.can ? 0 : 1)); if (w.can) { w.can = null; w.step = 1; } P.render(); };
  A.emo_w_can = (el) => { const w = H().w; if (!w) return; w.can = el.dataset.v; w.step = 2; P.render(); };
  A.emo_w_cope = (el) => { const w = H().w; if (!w) return; w.cope = COPES[+el.dataset.v]; w.done = 'cope'; P.render(); };
  A.emo_w_task = () => {
    const w = H().w; if (!w) return;
    const small = trim(w.small);
    if (!small) { P.toast('Scrivi un passo piccolo, anche minuscolo.'); return; }
    P.oggi.addTask({ title: small, prio: 'B', date: P.ymd() });
    w.done = 'task'; P.render();
  };
  A.emo_w_card = () => {
    const w = H().w; if (!w) return;
    const lines = [{ k: 'Il pensiero', v: '«' + trim(w.fear) + '»' }];
    if (w.done === 'task') lines.push({ k: 'Il mio passo', v: trim(w.small) }); else lines.push({ k: 'Mi dico', v: w.cope });
    cards().push({ id: P.uid(), ts: Date.now(), title: 'Quando mi preoccupo: e se…', lines: lines });
    P.save(); P.toast('Carta salvata.');
  };

  /* ---------- una cosa da non dimenticare: scriverla fuori dalla testa ---------- */
  function nodeForget(h) {
    const f = h.f || (h.f = { text: '', kind: 'compito', when: 'oggi', done: '' });
    if (f.done) {
      return '<h2 class="big-q">Ora sta fuori dalla testa.</h2><p>' + esc(f.done) + ' Non devi più tenerlo a mente: quando ti serve, lo trovi lì.</p>' +
        '<div class="stack"><button class="btn block" data-a="aiu_oggi">Vai a Oggi</button><button class="btn soft block" data-a="emo_f_again">Un’altra cosa</button></div>';
    }
    return '<h2 class="big-q">Continuo a pensare a una cosa da non dimenticare</h2>' +
      '<p>Ripassarla di continuo a mente occupa spazio e energia, e toglie attenzione al resto, anche al sonno. Scriverla fuori dalla testa libera quello spazio: dille dove va, e la mente può lasciarla andare.</p>' +
      '<div><label class="f" for="emoForget">Che cos’è?</label><input type="text" id="emoForget" data-i="emo_f_text" value="' + ea(f.text) + '" placeholder="per esempio: chiamare il dentista" autocomplete="off" enterkeyhint="done"></div>' +
      '<div><label class="f">Che cos’è, di preciso?</label><div class="cluster" role="group" aria-label="Tipo">' +
      chip('emo_f_kind', 'compito', 'Un compito', f.kind === 'compito') + chip('emo_f_kind', 'appuntamento', 'Un appuntamento', f.kind === 'appuntamento') +
      chip('emo_f_kind', 'pensiero', 'Solo un pensiero', f.kind === 'pensiero') + '</div></div>' +
      (f.kind === 'compito' ? '<div><label class="f">Quando?</label>' + whenChips('emo_f_when', f.when) + '</div>' : '') +
      '<div class="stack"><button class="btn block" data-a="emo_f_save">Mettilo al sicuro</button></div>';
  }
  I.emo_f_text = (el) => { const f = H().f; if (f) f.text = el.value; };
  A.emo_f_kind = (el) => { const f = H().f; if (!f) return; f.kind = el.dataset.v; P.render(); };
  A.emo_f_when = (el) => { const f = H().f; if (!f) return; f.when = el.dataset.v; P.render(); };
  A.emo_f_again = () => { H().f = { text: '', kind: 'compito', when: 'oggi', done: '' }; P.render(); };
  A.emo_f_save = () => {
    const f = H().f; if (!f) return;
    const text = trim(f.text);
    if (!text) { P.toast('Scrivi che cos’è, anche in due parole.'); return; }
    if (f.kind === 'appuntamento') {
      if (P.agenda && P.agenda.openNew) { P.agenda.openNew({ title: text }); f.text = ''; return; }
    }
    if (f.kind === 'pensiero') {
      P.S.parked = Array.isArray(P.S.parked) ? P.S.parked : [];
      P.S.parked.push({ id: P.uid(), text: text, ts: Date.now(), taskId: null, resolved: false });
      P.save(); f.done = 'L’ho messo nel parcheggio pensieri.'; P.render(); return;
    }
    P.oggi.addTask({ title: text, prio: 'B', date: dateOf(f.when) });
    f.done = f.when === 'lista' ? 'È nella lista dei compiti.' : f.when === 'domani' ? 'È tra i compiti di domani.' : 'È tra i compiti di oggi.';
    P.render();
  };

  /* ---------- sto evitando qualcosa: la cornice di coping ---------- */
  const A_FEELINGS = ['ansia', 'fastidio', 'paura di sbagliare', 'noia', 'vergogna'];
  const A_HELP = ['Posso fare il primo passo anche con l’uff', 'Posso tenere la mente aperta e vedere come va', 'Non deve venire perfetto, deve partire'];
  const A_TOT = 6;
  function nodeAvoid(h) {
    const a = h.a || (h.a = { step: 0, situation: '', thought: '', helpful: '', feeling: '', label: '', action: '', escape: '', why: '', ifx: '', theny: '', when: 'oggi', time: '', done: null });
    if (a.done) {
      return '<h2 class="big-q">Hai un piano.</h2><div class="card-line"><p style="margin:0"><b>' + esc(a.action) + '</b></p></div>' +
        (a.ifx ? '<p class="muted">Se ' + esc(a.ifx) + ', allora ' + esc(a.theny || '…') + '.</p>' : '') +
        '<p>Il piano è tra i compiti' + (a.when === 'domani' ? ' di domani' : a.when === 'lista' ? '' : ' di oggi') + ', e la carta è salvata: puoi rileggerla quando serve.</p>' +
        '<div class="stack"><button class="btn block" data-a="emo_a_start">Inizia adesso</button><button class="btn soft block" data-a="aiu_oggi">Vai a Oggi</button></div>';
    }
    const nav = (last) => '<div class="stack"><button class="btn block" data-a="emo_a_next">' + (last ? 'Fine: vedi il piano' : 'Avanti') + '</button>' +
      (a.step > 0 ? '<button class="btn ghost block" data-a="emo_a_prev">Indietro</button>' : '') + '</div>';
    const s = a.step;
    if (s === 0) {
      return dots(1, A_TOT) + '<h2 class="big-q">Sto evitando qualcosa</h2>' +
        '<p>Evitare dà sollievo subito, ed è per questo che si ripete: il prezzo arriva dopo. Non è pigrizia, è un modo di proteggersi dall’ansia. Lo guardiamo in cinque passi, e alla fine hai un piano piccolo e concreto.</p>' +
        field('Che cosa stai evitando?', 'emoA0', 'situation', a.situation, 'per esempio: rispondere alla mail del capo', 'emo_a') + nav(false);
    }
    if (s === 1) {
      return dots(2, A_TOT) + '<h2 class="big-q">Che pensiero ti viene?</h2><p class="muted">È una previsione o un fatto? Spesso è una previsione negativa detta come se fosse certa.</p>' +
        field('Il pensiero', 'emoA1', 'thought', a.thought, 'per esempio: andrà male, non sono capace', 'emo_a') +
        '<div><label class="f">Un pensiero che ti aiuta di più</label><div class="cluster" role="group" aria-label="Pensiero utile">' + A_HELP.map((t) => chip('emo_a_pick', t, t, a.helpful === t, ' data-k="helpful"')).join('') + '</div></div>' + nav(false);
    }
    if (s === 2) {
      return dots(3, A_TOT) + '<h2 class="big-q">Che cosa senti?</h2><p class="muted">Nel corpo e come emozione. Dare un nome preciso aiuta a starci accanto.</p>' +
        '<div class="cluster" role="group" aria-label="Emozione">' + A_FEELINGS.map((t) => chip('emo_a_pick', t, t, a.feeling === t, ' data-k="feeling"')).join('') + '</div>' +
        field('Come la chiami, tu?', 'emoA2', 'label', a.label, 'per esempio: il mio «odio la burocrazia»', 'emo_a') + nav(false);
    }
    if (s === 3) {
      return dots(4, A_TOT) + '<h2 class="big-q">Il primo passo, concreto</h2><p class="muted">Specifico e piccolo, quasi troppo facile. Poi: come potresti scappare, e perché ne vale la pena.</p>' +
        field('Il primo passo', 'emoA3', 'action', a.action, 'per esempio: aprire la mail e leggerla una volta', 'emo_a') +
        field('Come potrei scappare?', 'emoA3b', 'escape', a.escape, 'per esempio: mi metto a cercare altro', 'emo_a') +
        field('Perché ne vale la pena?', 'emoA3c', 'why', a.why, 'per esempio: smetto di pensarci tutto il giorno', 'emo_a') + nav(false);
    }
    if (s === 4) {
      return dots(5, A_TOT) + '<h2 class="big-q">Se… allora</h2><p class="muted">Un piano che scatta in un momento preciso. Il «se» è l’ostacolo che prevedi, o l’ora in cui parti.</p>' +
        field('Se…', 'emoA4', 'ifx', a.ifx, 'per esempio: mi viene voglia di scappare', 'emo_a') +
        field('allora…', 'emoA4b', 'theny', a.theny, 'per esempio: faccio il primo passo per due minuti', 'emo_a') +
        '<div><label class="f">Quando lo fai?</label>' + whenChips('emo_a_when', a.when) + '</div>' + nav(false);
    }
    return dots(6, A_TOT) + '<h2 class="big-q">La tua carta</h2><div class="card-line">' +
      [['Evito', a.situation], ['Mi viene da pensare', a.thought], ['Mi aiuta di più', a.helpful], ['Sento', [a.feeling, a.label].filter(Boolean).join(' · ')],
        ['Primo passo', a.action], ['Se scappo', a.escape], ['Ne vale la pena perché', a.why], ['Se… allora', a.ifx ? a.ifx + ' → ' + a.theny : '']]
        .filter((r) => trim(r[1])).map((r) => '<p style="margin:0 0 8px"><span class="muted small">' + esc(r[0]) + '</span><br><b>' + esc(r[1]) + '</b></p>').join('') + '</div>' +
      '<div class="stack"><button class="btn block" data-a="emo_a_save" data-v="piano">Salva la carta e crea il compito</button>' +
      '<button class="btn soft block" data-a="emo_a_save" data-v="carta">Solo la carta</button><button class="btn ghost block" data-a="emo_a_prev">Indietro</button></div>';
  }
  I.emo_a = (el) => { const a = H().a; if (a && el.dataset.k) a[el.dataset.k] = el.value; };
  A.emo_a_pick = (el) => { const a = H().a; if (!a) return; const k = el.dataset.k; a[k] = a[k] === el.dataset.v ? '' : el.dataset.v; P.render(); };
  A.emo_a_when = (el) => { const a = H().a; if (!a) return; a.when = el.dataset.v; P.render(); };
  A.emo_a_prev = () => { const a = H().a; if (a && a.step > 0) { a.step--; P.render(); } };
  A.emo_a_next = () => {
    const a = H().a; if (!a) return;
    if (a.step === 0 && !trim(a.situation)) { P.toast('Scrivi che cosa stai evitando.'); return; }
    if (a.step === 3 && !trim(a.action)) { P.toast('Scrivi un primo passo, anche minuscolo.'); return; }
    if (a.step < A_TOT - 1) { a.step++; P.render(); window.scrollTo(0, 0); }
  };
  A.emo_a_save = (el) => {
    const a = H().a; if (!a || a.done) return;
    const rows = [['Evito', a.situation], ['Mi viene da pensare', a.thought], ['Mi aiuta di più', a.helpful], ['Sento', [a.feeling, a.label].filter(Boolean).join(' · ')],
      ['Primo passo', a.action], ['Se scappo', a.escape], ['Ne vale la pena perché', a.why], ['Se… allora', a.ifx ? a.ifx + ' → ' + a.theny : '']];
    cards().push({ id: P.uid(), ts: Date.now(), title: cap(trim(a.situation)), lines: rows.filter((r) => trim(r[1])).map((r) => ({ k: r[0], v: trim(r[1]) })) });
    if (el.dataset.v === 'piano') {
      const t = P.oggi.addTask({ title: trim(a.situation), prio: 'B', date: dateOf(a.when) });
      t.plan = { first: trim(a.action), date: dateOf(a.when), time: '', where: '', minutes: (P.S.settings && P.S.settings.span) || 25,
        barriers: a.ifx ? [{ if: trim(a.ifx), then: trim(a.theny) }] : [] };
      a.taskId = t.id;
    }
    P.save();
    a.done = true;
    P.render();
  };
  A.emo_a_start = () => {
    const a = H().a || {};
    if (a.taskId) P.startSession({ kind: 'work', taskId: a.taskId, minutes: 10 });
    else P.startSession({ kind: 'quick', title: trim(a.action) || 'Un primo passo', minutes: 5 });
  };

  /* ---------- sto per dire sì (o rispondere) d'impulso: prendere tempo ---------- */
  const B_PHRASES = [
    'Mi fa piacere che tu me l’abbia chiesto. Ti rispondo domani.',
    'Fammi controllare i miei impegni e ti dico.',
    'Grazie, ma stavolta no.',
    'Posso dirti di sì a una condizione: la scadenza la concordiamo insieme.'
  ];
  function busyBlock() {
    const t0 = P.ymd(), t7 = P.addDays(t0, 7);
    const ev = P.agenda && P.agenda.occurrences ? P.agenda.occurrences(t0, t7) : [];
    const imp = (P.S.tasks || []).filter((t) => !t.done && t.prio === 'A' && t.date && t.date >= t0 && t.date <= t7);
    const lines = [];
    if (ev.length) lines.push(ev.length + (ev.length === 1 ? ' appuntamento' : ' appuntamenti') + ' nei prossimi sette giorni');
    if (imp.length) lines.push(imp.length + (imp.length === 1 ? ' cosa importante' : ' cose importanti') + ' già in programma');
    return '<div class="hint stack"><div><b>Prima di rispondere, guarda cosa hai già</b></div><div>' + (lines.length ? esc(lines.join(' · ')) + '.' : 'Per ora la settimana è libera.') + '</div></div>';
  }
  function nodeBuy(h) {
    const b = h.b || (h.b = { who: '', done: false });
    if (b.done) {
      return '<h2 class="big-q">Ci pensi con calma.</h2><p>Ti ho messo tra i compiti di domani il momento di rispondere. Intanto la richiesta può aspettare.</p>' +
        '<div class="stack"><button class="btn block" data-a="aiu_oggi">Vai a Oggi</button></div>';
    }
    return '<h2 class="big-q">Sto per dire sì d’impulso</h2>' +
      '<p>Quando una proposta è interessante, o chi la fa è gentile, il «sì» parte da solo. Non devi rispondere subito: puoi dire che ti fa piacere e prendere tempo. Se ti insistono, basta ripetere la stessa frase. Non serve giustificarsi.</p>' + busyBlock() +
      '<div><label class="f">Una frase, da copiare</label><div class="stack">' + B_PHRASES.map((p, i) => '<button class="opt" data-a="emo_b_copy" data-v="' + i + '">' + esc(p) + '</button>').join('') + '</div></div>' +
      '<div><label class="f" for="emoWho">Che cosa ti hanno chiesto?</label><input type="text" id="emoWho" data-i="emo_b_who" value="' + ea(b.who) + '" placeholder="per esempio: organizzare la festa della scuola" autocomplete="off" enterkeyhint="done"></div>' +
      '<div class="stack"><button class="btn block" data-a="emo_b_task">Mi segno di rispondere domani</button></div>';
  }
  I.emo_b_who = (el) => { const b = H().b; if (b) b.who = el.value; };
  A.emo_b_copy = (el) => {
    const text = B_PHRASES[+el.dataset.v] || '';
    const ok = () => P.toast('Frase copiata.');
    const fail = () => P.toast('Non sono riuscita a copiare: puoi dirla a voce.');
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(ok, fail); return; } } catch (e) { /* ignora */ }
    fail();
  };
  A.emo_b_task = () => {
    const b = H().b; if (!b) return;
    const who = trim(b.who);
    if (!who) { P.toast('Scrivi che cosa ti hanno chiesto.'); return; }
    P.oggi.addTask({ title: 'Rispondere: ' + who, prio: 'B', date: P.addDays(P.ymd(), 1) });
    b.done = true; P.render();
  };

  /* ---------- le mie carte ---------- */
  let openCard = null;
  function nodeCards() {
    const list = cards().slice().sort((x, y) => y.ts - x.ts);
    let s = '<h2 class="big-q">Le mie carte</h2><p class="muted">Piccoli promemoria scritti da te per i momenti difficili: si rileggono, non vanno ricordati a memoria.</p>';
    if (!list.length) return s + '<p class="empty">Non hai ancora carte. Si creano alla fine di «e se…» e di «Sto evitando qualcosa».</p>';
    return s + '<div class="stack">' + list.map((c) => '<button class="opt" data-a="emo_c_open" data-id="' + ea(c.id) + '"><span>' + esc(c.title) + '</span><span aria-hidden="true">›</span></button>').join('') + '</div>';
  }
  function cardSheet(c, confirm) {
    let h = '<div class="row2"><h2>Carta</h2><button class="btn ghost sm" data-a="core_close">Chiudi</button></div><h3>' + esc(c.title) + '</h3>' +
      '<div class="card-line">' + c.lines.map((r) => '<p style="margin:0 0 8px"><span class="muted small">' + esc(r.k) + '</span><br><b>' + esc(r.v) + '</b></p>').join('') + '</div>';
    h += confirm ? '<div class="hint stack"><div>Eliminare questa carta? Non si può annullare.</div><div class="cluster"><button class="btn sm danger" data-a="emo_c_delyes" data-id="' + ea(c.id) + '">Sì, elimina</button>' +
      '<button class="btn sm soft" data-a="emo_c_open" data-id="' + ea(c.id) + '">No, la tengo</button></div></div>'
      : '<div class="stack"><button class="btn ghost block" data-a="emo_c_del" data-id="' + ea(c.id) + '">Elimina</button></div>';
    return h;
  }
  A.emo_c_open = (el) => { const c = cards().find((x) => x.id === el.dataset.id); if (!c) return; openCard = c.id; P.closeSheet(); P.sheet(cardSheet(c, false)); };
  A.emo_c_del = (el) => { const c = cards().find((x) => x.id === el.dataset.id); if (!c) return; P.closeSheet(); P.sheet(cardSheet(c, true)); };
  A.emo_c_delyes = (el) => { P.S.cards = cards().filter((x) => x.id !== el.dataset.id); P.save(); P.closeSheet(); P.render(); P.toast('Eliminata.'); };
  A.emo_open = (el) => { go(el.dataset.v); };

  /* ---------- interfaccia verso aiuto.js ---------- */
  P.emozioni = {
    owns: (n) => OWN.indexOf(n) >= 0,
    cardCount: () => cards().length,
    render(h) {
      switch (h.node) {
        case 'uff': return nodeUff(h);
        case 'worry': return nodeWorry(h);
        case 'forget': return nodeForget(h);
        case 'avoid': return nodeAvoid(h);
        case 'buy': return nodeBuy(h);
        case 'cards': return nodeCards(h);
        default: return '';
      }
    }
  };
})();
