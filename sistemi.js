/* Un passo: sistemi (posta e carte, posto delle cose). Prefisso azioni e input: sis_.
   Campi nuovi, tutti opzionali:
   - S.mail = {place, rules, days:[0-6] (0 = domenica), time:'HH:MM', notify:bool, last:null|{ts, n, fare}}
   - S.places = [{id, what, where}]
   Dalla guida di Safren: Worksheet 2 «Steps for Sorting Mail» (centro di smistamento, regole, due o tre momenti fissi
   a settimana), metodo OHIO (Only Handle It Once: mai una categoria «decido dopo») e «Keeping Track of Important
   Objects» (un posto preciso per ogni oggetto importante). Parole mie.
   Esporta P.sistemi: todayHtml, openSort, openLeaving; P.mailCfg() (usato da avvisi.js per gli avvisi). */
(function () {
  'use strict';
  const esc = P.esc;
  const ea = (s) => esc(s).replace(/"/g, '&quot;');
  const HHMM = /^\d{1,2}:\d{2}$/;
  const DAYS = [[1, 'Lun'], [2, 'Mar'], [3, 'Mer'], [4, 'Gio'], [5, 'Ven'], [6, 'Sab'], [0, 'Dom']];
  const RULES = [
    'Pago le bollette appena arrivano.',
    'Conservo le ricevute per sei mesi.',
    'Se non so dire perché mi servirà di sicuro, la butto.'
  ];
  const THINGS = ['Chiavi', 'Portafoglio', 'Telefono', 'Occhiali', 'Documenti'];

  /* ---------- dati ---------- */
  function mail() {
    const m = (P.S.mail && typeof P.S.mail === 'object') ? P.S.mail : {};
    const days = Array.isArray(m.days) ? m.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [];
    P.S.mail = {
      place: String(m.place || ''), rules: String(m.rules || ''),
      days: Array.from(new Set(days)).sort(), time: HHMM.test(m.time || '') ? m.time : '18:30',
      notify: m.notify !== false, last: m.last && typeof m.last === 'object' ? m.last : null
    };
    return P.S.mail;
  }
  function places() { if (!Array.isArray(P.S.places)) P.S.places = []; return P.S.places; }
  P.mailCfg = mail;

  function back() { return '<button class="back" data-a="alt_go" data-v="">‹ Altro</button>'; }
  function head(title, sub) {
    return back() + '<div class="head"><div><h1>' + esc(title) + '</h1>' + (sub ? '<p class="sub muted">' + esc(sub) + '</p>' : '') + '</div></div>';
  }
  function chip(action, v, label, on) {
    return '<button class="chip" data-a="' + action + '" data-v="' + ea(v) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(label) + '</button>';
  }

  /* ---------- schermata: posta e carte ---------- */
  P.screens['altro/posta'] = {
    render() {
      const m = mail();
      let h = head('Posta e carte', 'Un posto dove la posta si ferma e qualche momento fisso per smistarla.');
      h += '<div class="hint"><b>Un tocco solo.</b> Ogni foglio lo prendi in mano una volta sola e decidi subito che cosa farne: farlo, metterlo in lista, archiviarlo o buttarlo. Non esiste una pila «poi vedo».</div>';

      h += '<div class="group"><h2>Il tuo centro di smistamento</h2>' +
        '<p class="cap">Un cestino, un cassetto o una scatola dove finisce tutta la posta. Meglio vicino al cestino della carta (e al trita-documenti, se ce l’hai): la pubblicità la butti subito.</p>' +
        '<input type="text" id="sis-place" data-i="sis_place" value="' + ea(m.place) + '" placeholder="Per esempio: il cestino all’ingresso" autocomplete="off" aria-label="Dove sta il centro di smistamento"></div>';

      h += '<div class="group"><h2>Le tue regole</h2>' +
        '<p class="cap">Poche, scritte da te. Se non sai dire perché ti servirà di sicuro, di solito si può buttare.</p>' +
        '<textarea id="sis-rules" rows="4" data-i="sis_rules" aria-label="Le tue regole per la posta" placeholder="Le regole che vuoi darti">' + esc(m.rules) + '</textarea>' +
        '<div class="cluster" style="margin-top:10px" role="group" aria-label="Regole da aggiungere">' +
        RULES.map((r, i) => chip('sis_rule', String(i), '+ ' + r.replace(/\.$/, ''), m.rules.indexOf(r) >= 0)).join('') + '</div></div>';

      h += '<div class="group"><h2>Quando smisti</h2>' +
        '<p class="cap">Due o tre volte a settimana, quando non sei stanca né di fretta. Così le bollette non scadono in fondo a una pila.</p>' +
        '<div class="cluster" role="group" aria-label="Giorni">' + DAYS.map((d) => chip('sis_day', String(d[0]), d[1], m.days.indexOf(d[0]) >= 0)).join('') + '</div>';
      if (m.days.length) {
        h += '<div style="margin-top:12px"><label class="f" for="sis-time">A che ora</label><input type="time" id="sis-time" data-i="sis_time" value="' + ea(m.time) + '"></div>';
        h += '<p class="small muted" style="margin:12px 0 6px">Ti avviso a quell’ora</p>' +
          '<div class="seg">' + [['1', 'Sì'], ['0', 'No']].map((o) =>
            '<button data-a="sis_notify" data-v="' + o[0] + '" aria-pressed="' + ((m.notify ? '1' : '0') === o[0]) + '">' + o[1] + '</button>').join('') + '</div>';
        if (m.notify && P.rem && P.rem.status && P.rem.status.known && !P.rem.status.subscribed) {
          h += '<p class="small muted" style="margin:12px 0 0">Per ricevere gli avvisi attiva i promemoria in Altro, Impostazioni.</p>';
        }
      }
      h += '</div>';

      h += '<div class="hint"><b>Bollette.</b> Per quelle che arrivano uguali ogni mese (affitto, rate) puoi attivare l’addebito automatico in banca. Per le altre, un compito che si ripete, con la scadenza.</div>';

      h += '<div class="stack"><button class="btn block" data-a="sis_sort">Smista adesso</button>' +
        (m.last ? '<p class="cap" style="margin:0">Ultima volta: ' + esc(P.fmtDate(P.ymd(new Date(m.last.ts)))) + ', ' + m.last.n + (m.last.n === 1 ? ' pezzo.' : ' pezzi.') + '</p>' : '') + '</div>';
      return h;
    }
  };

  const A = P.actions, I = P.inputs;
  I.sis_place = (el) => { mail().place = el.value; P.save(); };
  I.sis_rules = (el) => { mail().rules = el.value; P.save(); };
  I.sis_time = (el) => { if (HHMM.test(el.value)) { mail().time = el.value; P.save(); } };
  A.sis_rule = (el) => {
    const m = mail(), r = RULES[+el.dataset.v];
    if (!r) return;
    if (m.rules.indexOf(r) < 0) m.rules = (m.rules.trim() ? m.rules.replace(/\s+$/, '') + '\n' : '') + r;
    P.save(); P.render();
  };
  A.sis_day = (el) => {
    const m = mail(), d = +el.dataset.v, i = m.days.indexOf(d);
    if (i >= 0) m.days.splice(i, 1); else m.days.push(d);
    m.days.sort();
    if (m.days.length && m.notify && P.rem && P.rem.sync) P.rem.sync();
    P.save(); P.render();
  };
  A.sis_notify = (el) => {
    mail().notify = el.dataset.v === '1';
    if (mail().notify && P.rem && P.rem.sync) P.rem.sync();
    P.save(); P.render();
  };
  A.sis_sort = () => { openSort(); };

  /* ---------- foglio: smistare la posta, un pezzo alla volta ---------- */
  let sort = null; // {mode:'start'|'item'|'todo'|'end', goal:null|10|20, n, c:{subito,fare,archivio,butta}, todo:{title,when,date}, reached}
  function showSort() { P.closeSheet(); P.sheet(sortHtml()); }
  function openSort() {
    sort = { mode: 'start', goal: 10, n: 0, c: { subito: 0, fare: 0, archivio: 0, butta: 0 }, todo: { title: '', when: 'oggi', date: '' }, reached: false };
    showSort();
  }
  function sortHtml() {
    const s = sort;
    let h = '<div class="row2"><h2>Smista la posta</h2><button class="btn ghost sm" data-a="sis_sortclose">Chiudi</button></div>';
    if (s.mode === 'start') {
      h += '<p class="muted">Metti il centro di smistamento davanti a te, con il cestino della carta a portata di mano. Un pezzo alla volta, e ogni pezzo lo decidi subito.</p>';
      h += '<div><label class="f">Quanti pezzi fai adesso?</label><div class="cluster" role="group" aria-label="Obiettivo">' +
        chip('sis_goal', '10', '10 pezzi', s.goal === 10) + chip('sis_goal', '20', '20 pezzi', s.goal === 20) + chip('sis_goal', '0', 'Finché ne ho', s.goal === null) + '</div>' +
        '<p class="small muted" style="margin:8px 0 0">Se è troppo, un traguardo piccolo aiuta: quando lo raggiungi puoi fermarti.</p></div>';
      h += '<div class="stack"><button class="btn block" data-a="sis_begin">Parto</button></div>';
    } else if (s.mode === 'item') {
      h += '<p class="muted">Pezzo n. ' + (s.n + 1) + (s.goal ? ' di ' + s.goal : '') + '. Prendilo in mano e decidi adesso.</p>';
      h += '<div class="stack">' +
        '<button class="btn block" data-a="sis_do" data-v="subito">Lo faccio subito</button>' +
        '<p class="small muted" style="margin:-4px 0 4px">Se farlo costa quanto metterlo da parte, fallo adesso.</p>' +
        '<button class="btn soft block" data-a="sis_do" data-v="fare">Da fare: lo metto in lista</button>' +
        '<button class="btn soft block" data-a="sis_do" data-v="archivio">Lo archivio</button>' +
        '<button class="btn soft block" data-a="sis_do" data-v="butta">Lo butto o lo distruggo</button>' +
        '<button class="btn ghost block" data-a="sis_end">Basta così</button></div>';
    } else if (s.mode === 'todo') {
      h += '<div><label class="f" for="sis-ttitle">Che cosa devi fare?</label><input type="text" id="sis-ttitle" data-i="sis_ttitle" value="' + ea(s.todo.title) +
        '" placeholder="Per esempio: pagare la bolletta della luce" autocomplete="off" enterkeyhint="done"></div>';
      h += '<div><label class="f">Entro quando?</label><div class="cluster" role="group" aria-label="Quando">' +
        chip('sis_twhen', 'oggi', 'Oggi', s.todo.when === 'oggi') + chip('sis_twhen', 'domani', 'Domani', s.todo.when === 'domani') +
        chip('sis_twhen', 'lista', 'Senza data', s.todo.when === 'lista') + '</div>' +
        '<label class="f" for="sis-tdate" style="margin-top:12px">Oppure scegli la scadenza</label>' +
        '<input type="date" id="sis-tdate" data-i="sis_tdate" value="' + ea(s.todo.date) + '"></div>';
      h += '<div class="stack"><button class="btn block" data-a="sis_tadd">Aggiungi alla lista</button>' +
        '<button class="btn ghost block" data-a="sis_tback">Indietro</button></div>';
    } else {
      const c = s.c;
      const lines = [];
      if (c.subito) lines.push(c.subito + (c.subito === 1 ? ' fatto subito' : ' fatti subito'));
      if (c.fare) lines.push(c.fare + ' in lista');
      if (c.archivio) lines.push(c.archivio + (c.archivio === 1 ? ' archiviato' : ' archiviati'));
      if (c.butta) lines.push(c.butta + (c.butta === 1 ? ' buttato' : ' buttati'));
      h += s.n
        ? '<p>' + (s.reached ? 'Traguardo raggiunto. ' : '') + 'Hai smistato <b>' + s.n + (s.n === 1 ? ' pezzo' : ' pezzi') + '</b>' + (lines.length ? ': ' + esc(lines.join(', ')) : '') + '.</p>' +
          '<p class="muted">Quello che resta può aspettare il prossimo momento. Va bene così.</p>'
        : '<p class="muted">Non hai smistato niente, e non fa niente. Ci riprovi quando vuoi.</p>';
      h += '<div class="stack">' + (s.reached ? '<button class="btn soft block" data-a="sis_more">Ne faccio altri</button>' : '') +
        '<button class="btn block" data-a="sis_sortclose">Chiudi</button></div>';
    }
    return h;
  }
  function finishSort() {
    if (sort && sort.n > 0) { mail().last = { ts: Date.now(), n: sort.n, fare: sort.c.fare }; P.save(); }
  }
  A.sis_goal = (el) => { if (!sort) return; sort.goal = +el.dataset.v || null; showSort(); };
  A.sis_begin = () => { if (!sort) return; sort.mode = 'item'; showSort(); };
  A.sis_do = (el) => {
    if (!sort) return;
    const k = el.dataset.v;
    if (k === 'fare') { sort.todo = { title: '', when: 'oggi', date: '' }; sort.mode = 'todo'; showSort(); return; }
    sort.c[k] = (sort.c[k] || 0) + 1;
    advance();
  };
  function advance() {
    sort.n += 1;
    if (sort.goal && sort.n >= sort.goal) { sort.reached = true; sort.mode = 'end'; finishSort(); }
    else sort.mode = 'item';
    showSort();
  }
  A.sis_more = () => { if (!sort) return; sort.goal = null; sort.reached = false; sort.mode = 'item'; showSort(); };
  A.sis_end = () => { if (!sort) return; sort.mode = 'end'; finishSort(); showSort(); };
  A.sis_sortclose = () => {
    if (sort && sort.mode !== 'end') finishSort();
    sort = null;
    P.closeSheet();
    P.render();
  };
  I.sis_ttitle = (el) => { if (sort) sort.todo.title = el.value; };
  I.sis_tdate = (el) => { if (sort && /^\d{4}-\d{2}-\d{2}$/.test(el.value)) { sort.todo.date = el.value; sort.todo.when = ''; } };
  A.sis_twhen = (el) => { if (!sort) return; sort.todo.when = el.dataset.v; sort.todo.date = ''; showSort(); };
  A.sis_tback = () => { if (!sort) return; sort.mode = 'item'; showSort(); };
  A.sis_tadd = () => {
    if (!sort) return;
    const t = sort.todo, title = t.title.trim();
    if (!title) { P.toast('Scrivi prima che cosa devi fare.'); return; }
    const date = t.date || (t.when === 'oggi' ? P.ymd() : t.when === 'domani' ? P.addDays(P.ymd(), 1) : null);
    if (P.oggi && P.oggi.addTask) P.oggi.addTask({ title: title, prio: 'B', date: date });
    sort.c.fare += 1;
    advance();
  };

  /* ---------- schermata: il posto delle cose ---------- */
  let draft = { what: '', where: '' };
  P.screens['altro/cose'] = {
    render() {
      const list = places();
      let h = head('Il posto delle cose', 'Chiavi, portafoglio, telefono: sempre nello stesso posto.');
      h += '<div class="hint">Per ogni cosa importante, un posto solo. Rimettila lì ogni volta, anche quando hai fretta. Dillo anche a chi vive con te, e chiedigli di ricordartelo: senza arrabbiarti, se lo fa.</div>';
      h += '<div class="group"><h2>Le tue cose</h2>';
      if (list.length) {
        h += '<ul class="list">' + list.map((p) =>
          '<li class="task"><span class="body" style="cursor:default"><span class="ttl">' + esc(p.what) + '</span><span class="meta">' + esc(p.where || 'posto da scegliere') + '</span></span>' +
          '<button class="xbtn" data-a="sis_pdel" data-id="' + ea(p.id) + '" aria-label="Togli: ' + ea(p.what) + '">×</button></li>').join('') + '</ul>';
      } else {
        h += '<p class="empty">Ancora niente. Parti da una cosa sola, quella che perdi più spesso.</p>';
      }
      h += '</div>';
      h += '<div class="group"><h2>Aggiungi</h2>' +
        '<div class="cluster" role="group" aria-label="Idee">' + THINGS.map((t) => chip('sis_pidea', t, t, draft.what === t)).join('') + '</div>' +
        '<div style="margin-top:12px"><label class="f" for="sis-pwhat">Che cosa?</label><input type="text" id="sis-pwhat" data-i="sis_pwhat" value="' + ea(draft.what) + '" autocomplete="off"></div>' +
        '<div style="margin-top:12px"><label class="f" for="sis-pwhere">Dove sta?</label><input type="text" id="sis-pwhere" data-i="sis_pwhere" value="' + ea(draft.where) + '" placeholder="Per esempio: il cestino accanto alla porta" autocomplete="off" enterkeyhint="done"></div>' +
        '<div class="stack" style="margin-top:12px"><button class="btn block" data-a="sis_padd">Aggiungi</button></div></div>';
      if (list.length) h += '<div class="stack"><button class="btn soft block" data-a="sis_leave">Prima di uscire</button></div>';
      return h;
    }
  };
  I.sis_pwhat = (el) => { draft.what = el.value; };
  I.sis_pwhere = (el) => { draft.where = el.value; };
  A.sis_pidea = (el) => { draft.what = el.dataset.v; P.render(); };
  A.sis_padd = () => {
    const what = draft.what.trim();
    if (!what) { P.toast('Scrivi prima che cosa è.'); return; }
    places().push({ id: P.uid(), what: what, where: draft.where.trim() });
    draft = { what: '', where: '' };
    P.save(); P.render();
    P.toast('Aggiunta.');
  };
  A.sis_pdel = (el) => {
    P.S.places = places().filter((p) => p.id !== el.dataset.id);
    P.save(); P.render();
  };

  /* ---------- foglio: prima di uscire ---------- */
  let out = null; // {checked:{id:true}}
  function showLeave() { const o = document.getElementById('sheet'); const keep = o ? o.scrollTop : 0; P.closeSheet(); P.sheet(leaveHtml()); const n = document.getElementById('sheet'); if (n) n.scrollTop = keep; }
  function openLeaving() {
    if (!places().length) { P.go('altro', 'cose'); return; }
    out = { checked: {} };
    showLeave();
  }
  function leaveHtml() {
    const list = places();
    const all = list.every((p) => out.checked[p.id]);
    let h = '<div class="row2"><h2>Prima di uscire</h2><button class="btn ghost sm" data-a="core_close">Chiudi</button></div>';
    h += '<p class="muted">Hai con te tutto?</p><div class="stack">' + list.map((p) =>
      '<button class="opt sel" data-a="sis_lcheck" data-id="' + ea(p.id) + '" aria-pressed="' + (out.checked[p.id] ? 'true' : 'false') + '">' +
      '<span style="overflow-wrap:anywhere">' + esc(p.what) + (p.where ? '<span class="s"> — ' + esc(p.where) + '</span>' : '') + '</span>' +
      '<span class="muted small">' + (out.checked[p.id] ? 'sì' : '') + '</span></button>').join('') + '</div>';
    h += all ? '<div class="hint">Hai tutto. Buona giornata.</div>' : '';
    return h;
  }
  A.sis_leave = () => { openLeaving(); };
  A.sis_lcheck = (el) => { if (!out) return; out.checked[el.dataset.id] = !out.checked[el.dataset.id]; showLeave(); };

  /* ---------- scorciatoie in Oggi ---------- */
  function todayHtml() {
    const btns = [];
    const m = mail();
    if (m.days.length && m.days.indexOf(new Date().getDay()) >= 0) {
      btns.push('<button class="btn soft block" data-a="sis_sort">Oggi è giorno di posta: smista</button>');
    }
    if (places().length) btns.push('<button class="btn soft block" data-a="sis_leave">Prima di uscire</button>');
    return btns.length ? '<section class="group"><div class="stack">' + btns.join('') + '</div></section>' : '';
  }

  P.sistemi = { todayHtml: todayHtml, openSort: openSort, openLeaving: openLeaving };
})();
