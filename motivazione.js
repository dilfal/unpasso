/* Un passo: motivazione e premi piccoli. Prefisso azioni e input: mot_.
   Campi nuovi, tutti opzionali:
   - S.motiv = {why:[testo], rewards:[testo]}: i motivi per cui fai le cose e i premi piccoli
   - task.why = testo: perché quel compito conta per te
   Fonti (parole mie): Ramsay, Rethinking Adult ADHD (definire l'obiettivo e il suo valore; promemoria esterni dei
   valori nel punto in cui si agisce; traguardi visibili; il piacere del completamento, spesso sottovalutato; un
   gesto che segna la partenza e rinforza la fine); Ramsay, The Adult ADHD and Anxiety Workbook (rinforzo positivo
   contro il sollievo immediato dell'evitamento; autocompassione; parlarsi in seconda o terza persona; celebrare i
   progressi graduali). Nessun punteggio o serie di giorni: l'obiettivo è ricordare, non misurare la colpa.
   Esporta P.motivazione: readyHtml(task, s), rewardHtml(s), whyField(task). */
(function () {
  'use strict';
  const esc = P.esc;
  const ea = (s) => esc(s).replace(/"/g, '&quot;');
  const trim = (s) => String(s || '').trim();
  const MAX = 8;
  const WHY_IDEAS = [
    'Voglio sapere che posso mantenere un impegno anche quando non è divertente.',
    'Voglio arrivare a fine giornata con meno cose in sospeso.',
    'Voglio potermi fidare di me.',
    'Voglio più tempo per le cose che mi piacciono.'
  ];
  const REWARD_IDEAS = ['Un tè con calma', 'Cinque minuti di musica', 'Una passeggiata fino alla porta', 'Un messaggio a un’amica', 'Guardare fuori dalla finestra'];

  function motiv() {
    const m = (P.S.motiv && typeof P.S.motiv === 'object') ? P.S.motiv : {};
    const clean = (a) => (Array.isArray(a) ? a.map(trim).filter(Boolean).slice(0, MAX) : []);
    P.S.motiv = { why: clean(m.why), rewards: clean(m.rewards) };
    return P.S.motiv;
  }
  function chip(action, v, label, on) {
    return '<button class="chip" data-a="' + action + '" data-v="' + ea(v) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(label) + '</button>';
  }

  /* ---------- schermata: motivazione e premi ---------- */
  let draft = { why: '', rewards: '' };
  function listBlock(kind, title, help, items, ideas, ph) {
    let h = '<div class="group"><h2>' + esc(title) + '</h2><p class="cap">' + esc(help) + '</p>';
    if (items.length) {
      h += '<ul class="list">' + items.map((t, i) =>
        '<li class="task"><span class="body" style="cursor:default"><span class="ttl">' + esc(t) + '</span></span>' +
        '<button class="xbtn" data-a="mot_del" data-k="' + kind + '" data-v="' + i + '" aria-label="Togli: ' + ea(t) + '">×</button></li>').join('') + '</ul>';
    }
    if (items.length < MAX) {
      h += '<div class="cluster" style="margin-top:8px" role="group" aria-label="Idee">' +
        ideas.filter((x) => items.indexOf(x) < 0).slice(0, 4).map((x) => '<button class="chip" data-a="mot_idea" data-k="' + kind + '" data-v="' + ea(x) + '" aria-pressed="false">' + esc(x) + '</button>').join('') + '</div>' +
        '<div class="addrow" style="margin-top:10px"><input type="text" id="mot-' + kind + '" data-i="mot_draft" data-k="' + kind + '" value="' + ea(draft[kind]) + '" placeholder="' + ea(ph) + '" autocomplete="off" enterkeyhint="done" aria-label="' + ea(title) + '">' +
        '<button class="btn soft sm" data-a="mot_add" data-k="' + kind + '">Aggiungi</button></div>';
    }
    return h + '</div>';
  }
  P.screens['altro/motivazione'] = {
    render() {
      const m = motiv();
      let h = '<button class="back" data-a="alt_go" data-v="">‹ Altro</button>' +
        '<div class="head"><div><h1>Motivazione e premi</h1><p class="sub muted">Ricordarti perché lo fai, e un piccolo premio dopo.</p></div></div>';
      h += '<div class="hint">La motivazione non è un obbligo di avere voglia: è un ricordo del perché, messo dove lo vedi nel momento in cui parti. Con l’ADHD serve vederlo, non solo saperlo.</div>';
      h += listBlock('why', 'I miei motivi', 'Frasi tue, brevi. Compaiono quando stai per iniziare un blocco.', m.why, WHY_IDEAS, 'Per esempio: così smetto di pensarci');
      h += listBlock('rewards', 'Premi piccoli', 'Qualcosa di minuscolo, a portata di mano, subito dopo. Un premio vicino rinforza il gesto più di uno lontano.', m.rewards, REWARD_IDEAS, 'Per esempio: un caffè in balcone');
      h += '<div class="hint stack"><div><b>Come ti parli</b></div><div>Quando qualcosa va storto, prova a dirlo come lo diresti a un’amica, o usando il tuo nome: «è successo, ripartiamo da un passo piccolo». Mettere un po’ di distanza aiuta a essere gentili. Ogni piccolo avanzamento conta, anche se il traguardo è ancora lontano.</div></div>';
      return h;
    }
  };
  const A = P.actions, I = P.inputs;
  I.mot_draft = (el) => { const k = el.dataset.k; if (k in draft) draft[k] = el.value; };
  function add(kind, text) {
    const t = trim(text), m = motiv();
    if (!t) { P.toast('Scrivi prima una frase.'); return false; }
    if (m[kind].indexOf(t) >= 0) return true;
    if (m[kind].length >= MAX) { P.toast('Ne hai già ' + MAX + ': tienine poche, quelle che contano.'); return false; }
    m[kind].push(t);
    return true;
  }
  A.mot_idea = (el) => { if (add(el.dataset.k, el.dataset.v)) { P.save(); P.render(); } };
  A.mot_add = (el) => {
    const k = el.dataset.k;
    if (add(k, draft[k])) { draft[k] = ''; P.save(); P.render(); }
  };
  A.mot_del = (el) => { const m = motiv(), k = el.dataset.k; if (m[k]) { m[k].splice(+el.dataset.v, 1); P.save(); P.render(); } };

  /* ---------- il perché di un compito (foglio di dettaglio e Inizia) ---------- */
  function whyField(t) {
    const ideas = motiv().why;
    return '<div><label class="f" for="mot-twhy">Perché mi importa</label>' +
      '<input type="text" id="mot-twhy" data-i="mot_twhy" data-id="' + ea(t.id) + '" value="' + ea(t.why || '') + '" placeholder="Per esempio: così smetto di pensarci" autocomplete="off">' +
      (ideas.length ? '<div class="cluster" style="margin-top:8px" role="group" aria-label="I miei motivi">' + ideas.slice(0, 3).map((x) => chip('mot_pickwhy', x, x, t.why === x).replace('data-v=', 'data-id="' + ea(t.id) + '" data-v=')).join('') + '</div>' : '') + '</div>';
  }
  I.mot_twhy = (el) => { const t = (P.S.tasks || []).find((x) => x.id === el.dataset.id); if (t) { t.why = el.value; P.save(); } };
  A.mot_pickwhy = (el) => {
    const t = (P.S.tasks || []).find((x) => x.id === el.dataset.id);
    if (!t) return;
    t.why = t.why === el.dataset.v ? '' : el.dataset.v;
    P.save();
    const inp = document.getElementById('mot-twhy');
    if (inp) inp.value = t.why;
    document.querySelectorAll('[data-a="mot_pickwhy"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === t.why)));
  };

  /* ---------- nel timer: il perché e il traguardo prima di partire, il premio alla fine ---------- */
  function readyHtml(task, s) {
    let m = trim(task && task.why);
    const list = motiv().why;
    if (!m && list.length) m = list[(Math.floor(Date.now() / 86400000) + trim(s && s.title).length) % list.length];
    let h = '';
    if (m) h += '<div class="tpanel"><b>Perché lo faccio:</b> ' + esc(m) + '</div>';
    if (s && s.minutes && (s.kind === 'work' || s.kind === 'quick')) {
      h += '<div class="tpanel"><b>Traguardo:</b> se parti ora, alle ' + P.fmtTime(Date.now() + s.minutes * 60000) + ' hai fatto il tuo blocco. Come ti sentirai a quell’ora?</div>';
    }
    return h;
  }
  function rewardHtml(s) {
    const list = motiv().rewards;
    if (!s || !list.length) return '';
    if (!s.reward || list.indexOf(s.reward) < 0) s.reward = list[Math.floor(Math.random() * list.length)];
    return '<div class="tpanel"><b>Un premio piccolo, se ti va:</b> ' + esc(s.reward) + '</div>';
  }

  P.motivazione = { readyHtml: readyHtml, rewardHtml: rewardHtml, whyField: whyField };
})();
