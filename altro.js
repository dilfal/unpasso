/* Un passo: modulo «altro».
   Schermate: altro, altro/pensieri, altro/fatto, altro/checkin, altro/schede, altro/impostazioni, altro/visita.
   Esporta P.altro.openThought(initial). Prefisso azioni e input: alt_.
   Campi opzionali usati su P.S: nessuno nuovo (solo quelli dello schema del contratto). */
(function(){
'use strict';
const esc = P.esc;
const DAY = 86400000;

/* ---------- utilità ---------- */
function arr(k){ if(!Array.isArray(P.S[k])) P.S[k] = []; return P.S[k]; }
function sets(){
  const d = {span:25, pause:5, meds:false, medsPerWeek:7, sound:true, theme:'auto'};
  if(!P.S.settings || typeof P.S.settings !== 'object') P.S.settings = {};
  Object.keys(d).forEach(k => { if(P.S.settings[k] === undefined) P.S.settings[k] = d[k]; });
  return P.S.settings;
}
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
/* Promemoria (campo opzionale settings.rem, usato da avvisi.js, le Web Push):
   {plan: bool, morning|evening: {on, time:'HH:MM'}, week: {on, day:0-6 (0 = domenica), time}, meds: {on, times:['HH:MM',...]}} */
const HHMM = /^\d{1,2}:\d{2}$/;
function rem(){
  const s = sets();
  const r = (s.rem && typeof s.rem === 'object') ? s.rem : {};
  const t = (v, d) => (typeof v === 'string' && HHMM.test(v)) ? v : d;
  const blk = (k, d) => { const o = (r[k] && typeof r[k] === 'object') ? r[k] : {}; return {on: !!o.on, time: t(o.time, d)}; };
  const week = blk('week', '18:00');
  week.day = clamp(Math.round(+(r.week && r.week.day)) || 0, 0, 6);
  const mt = (r.meds && Array.isArray(r.meds.times)) ? r.meds.times.filter(x => typeof x === 'string' && HHMM.test(x)).slice(0, 4) : [];
  s.rem = {
    plan: r.plan === undefined ? true : !!r.plan,
    morning: blk('morning', '08:30'), evening: blk('evening', '21:00'), week: week,
    meds: {on: !!(r.meds && r.meds.on), times: mt.length ? mt : ['08:00']}
  };
  return s.rem;
}
P.remCfg = rem;
function dayOf(ts){ return P.ymd(new Date(ts)); }
function dlabel(ts){ return P.fmtDate(dayOf(ts)); }
function shortDate(d){ return d.slice(8, 10) + '/' + d.slice(5, 7); }
function mondayOf(d){ const wd = new Date(d + 'T12:00:00').getDay(); return P.addDays(d, -((wd + 6) % 7)); }
function applyTheme(t){
  const r = document.documentElement;
  if(t === 'light' || t === 'dark') r.dataset.theme = t; else r.removeAttribute('data-theme');
}
function confirmSheet(title, text, yesLabel, yesAction, yesId, danger){
  P.sheet(
    '<div class="grip"></div><h3>' + esc(title) + '</h3><p class="muted">' + text + '</p>' +
    '<div class="stack">' +
    '<button class="btn block' + (danger ? ' danger' : '') + '" data-a="' + yesAction + '"' + (yesId ? ' data-id="' + esc(yesId) + '"' : '') + '>' + esc(yesLabel) + '</button>' +
    '<button class="btn soft block" data-a="core_close">Annulla</button></div>'
  );
}
function head(title, sub){
  return '<button class="back" data-a="alt_go" data-v="">‹ Altro</button>' +
    '<div class="head"><div><h1>' + esc(title) + '</h1>' + (sub ? '<p class="sub muted">' + esc(sub) + '</p>' : '') + '</div></div>';
}
function stepper(act, value, unit){
  return '<div class="stepper"><button aria-label="Diminuisci" data-a="' + act + '" data-v="-">−</button>' +
    '<output>' + esc(String(value)) + (unit ? ' ' + esc(unit) : '') + '</output>' +
    '<button aria-label="Aumenta" data-a="' + act + '" data-v="+">+</button></div>';
}
function seg(act, opts, cur){
  return '<div class="seg">' + opts.map(o =>
    '<button data-a="' + act + '" data-v="' + o[0] + '" aria-pressed="' + (String(cur) === String(o[0])) + '">' + esc(o[1]) + '</button>').join('') + '</div>';
}

/* ---------- errori di pensiero ---------- */
const ERRORS = [
  ['tuttonulla', 'Tutto o niente', 'Vedi solo i due estremi, riuscita perfetta o disastro, e perdi tutte le vie di mezzo.'],
  ['catastrofizzare', 'Catastrofizzare', 'Passi subito allo scenario peggiore e lo tratti come se fosse il più probabile.'],
  ['etichettarmi', 'Etichettarmi', 'Da un singolo episodio passi a un giudizio su di te, tipo «sono un caso perso».'],
  ['personalizzare', 'Personalizzare', 'Ti prendi la colpa di cose che dipendono anche dagli altri o dal caso.'],
  ['ragionamentoemotivo', 'Ragionamento emotivo', '«Mi sento così, quindi è così»: l’emozione viene scambiata per un fatto.'],
  ['dovrei', 'Devo / dovrei', 'Regole rigide su come dovresti essere o agire, che portano più pressione e colpa che azione.'],
  ['generalizzare', 'Generalizzare', 'Da una volta sola passi a «sempre» o «mai».'],
  ['ingrandire', 'Ingrandire / minimizzare', 'Ingrandisci errori e difficoltà e rimpicciolisci riuscite e punti di forza.'],
  ['confronto', 'Confronto con gli altri', 'Ti misuri sugli altri guardando solo il loro lato migliore.'],
  ['perfezionismo', 'Perfezionismo', 'Standard così alti che iniziare pesa più che rimandare.'],
  ['incontrollabile', 'Pensare a ciò che non posso controllare', 'Consumi energie su ciò che non dipende da te e ne resta poca per ciò che puoi fare.'],
  ['ottimismo', 'Ottimismo che fa rimandare', '«Tanto ce la faccio all’ultimo»: sottostimi tempo e fatica, rimandi e poi ti ritrovi in affanno.']
];
function errLabel(k){ const e = ERRORS.find(x => x[0] === k); return e ? e[1] : k; }
const EMOTIONS = ['ansia', 'tristezza', 'rabbia', 'colpa', 'vergogna', 'frustrazione', 'senso di colpa', 'delusione', 'sollievo'];

/* ---------- menu ---------- */
P.screens['altro'] = {
  render(){
    const items = [
      ['pensieri', 'Registro dei pensieri', 'Quando un pensiero pesa, scrivilo e rivedilo'],
      ['fatto', 'Fatto!', 'Le cose che hai portato a termine'],
      ['progressi', 'I tuoi progressi', 'Le ultime otto settimane in breve'],
      ['checkin', 'Check-in settimanale', 'Cinque domande, una volta a settimana'],
      ['motivazione', 'Motivazione e premi', 'I tuoi motivi e i piccoli premi'],
      ['posta', 'Posta e carte', 'Un posto, momenti fissi, un pezzo alla volta'],
      ['cose', 'Il posto delle cose', 'Chiavi, portafoglio, telefono: sempre lì'],
      ['schede', 'Schede', 'Brevi note di approfondimento'],
      ['impostazioni', 'Impostazioni', 'Soglia di attenzione, pause, suono, tema'],
      ['visita', 'Per la visita e backup', 'Riepilogo da portare al terapeuta, copia dei dati']
    ];
    return '<div class="head"><div><h1>Altro</h1><p class="sub muted">Strumenti di riflessione e di cura dei tuoi dati.</p></div></div>' +
      '<div class="menu stack">' + items.map(i =>
        '<button class="opt" data-a="alt_go" data-v="' + i[0] + '"><span>' + esc(i[1]) + '<span class="s">' + esc(i[2]) + '</span></span><span aria-hidden="true">›</span></button>'
      ).join('') + '</div>' +
      '<p class="muted small">Questa app non sostituisce la terapia; i dati restano solo su questo telefono.</p>';
  }
};
P.actions.alt_go = el => {
  const v = el.dataset.v;
  if(v === 'checkin') C = null;
  if(v) P.go('altro', v); else P.go('altro');
  window.scrollTo(0, 0);
};

/* ---------- registro dei pensieri ---------- */
let T = null; // bozza del registro in corso

function newDraft(o){
  o = o || {};
  return {active: true, step: 0, situation: o.situation || '', thought: o.thought || '', emotion: '', intensity: 5, errors: [], reply: '', after: null};
}
function hasContent(t){ return !!((t.situation + t.thought + t.emotion + t.reply).trim()); }

P.altro = P.altro || {};
P.altro.visitText = function(){ return visitText(); };  
P.altro.openThought = function(initial){
  T = newDraft(initial);
  P.go('altro', 'pensieri', {step: 0, situation: T.situation, thought: T.thought});
  window.scrollTo(0, 0);
};

function slider(id, outId, val, dataI, extra){
  return '<input type="range" class="range" id="' + id + '" min="0" max="' + (extra && extra.max !== undefined ? extra.max : 10) + '" step="1" value="' + val +
    '" data-i="' + dataI + '" data-out="' + outId + '"' + (extra && extra.k ? ' data-k="' + extra.k + '"' : '') + '>';
}

function wizard(){
  const t = T;
  const dots = '<div class="dots" role="img" aria-label="Passo ' + (t.step + 1) + ' di 5">' +
    [0, 1, 2, 3, 4].map(i => '<i' + (i <= t.step ? ' class="on"' : '') + '></i>').join('') + '</div>';
  let body = '';
  if(t.step === 0){
    body = '<p class="big-q">Cosa è successo?</p>' +
      '<div class="hint">Descrivi la situazione come la vedrebbe una telecamera: dove, quando, con chi. Senza giudizi.</div>' +
      '<textarea data-i="alt_th" data-f="situation" aria-label="Situazione" placeholder="Per esempio: ero alla scrivania, dovevo rispondere a una mail importante…">' + esc(t.situation) + '</textarea>';
  } else if(t.step === 1){
    body = '<div class="card-line muted small">' + esc(t.situation) + '</div>' +
      '<p class="big-q">Quale pensiero ti è passato per la testa?</p>' +
      '<div class="hint">Scrivilo come l’hai pensato, anche se ora ti sembra esagerato. È il pensiero automatico: arriva da solo.</div>' +
      '<textarea data-i="alt_th" data-f="thought" aria-label="Pensiero automatico" placeholder="Per esempio: non ne combino mai una giusta.">' + esc(t.thought) + '</textarea>';
  } else if(t.step === 2){
    body = '<p class="big-q">Cosa hai provato?</p>' +
      '<div class="cluster">' + EMOTIONS.map(e =>
        '<button class="chip" data-a="alt_emo" data-v="' + esc(e) + '" aria-pressed="' + (t.emotion.trim().toLowerCase() === e) + '">' + esc(e) + '</button>').join('') + '</div>' +
      '<div><label class="f" for="alt-emo">Con parole tue</label>' +
      '<input type="text" id="alt-emo" data-i="alt_th" data-f="emotion" value="' + esc(t.emotion) + '" placeholder="Per esempio: ansia e un nodo allo stomaco" autocomplete="off"></div>' +
      '<div><div class="row2"><label class="f" for="alt-int" style="margin:0">Quanto è forte, da 0 a 10?</label><span class="rangeval" id="alt-intv">' + t.intensity + '</span></div>' +
      slider('alt-int', 'alt-intv', t.intensity, 'alt_int') + '</div>';
  } else if(t.step === 3){
    body = '<p class="big-q">C’è qualche scorciatoia di pensiero?</p>' +
      '<div class="hint">Scegline una o più, oppure nessuna se non ti riconosci. Non sono colpe: sono abitudini della mente, comuni a tutti e più frequenti con l’ADHD.</div>' +
      '<div class="stack">' + ERRORS.map(e => {
        const on = t.errors.indexOf(e[0]) >= 0;
        return '<button class="opt" data-a="alt_err" data-v="' + e[0] + '" aria-pressed="' + on + '" style="' +
          (on ? 'border-color:var(--sea);background:var(--foam);' : '') + 'flex-direction:column;align-items:flex-start;gap:2px">' +
          '<span style="font-weight:650">' + (on ? '✓ ' : '') + esc(e[1]) + '</span>' +
          '<span style="font-weight:400;color:var(--ink2);font-size:.9rem">' + esc(e[2]) + '</span></button>';
      }).join('') + '</div>';
  } else {
    const after = t.after === null ? t.intensity : t.after;
    body = '<div class="card-line muted small"><div>Pensiero: «' + esc(t.thought) + '»</div>' +
      (t.errors.length ? '<div>' + t.errors.map(k => '<span class="tag">' + esc(errLabel(k)) + '</span>').join('') + '</div>' : '') + '</div>' +
      '<p class="big-q">Una risposta più utile</p>' +
      '<div class="hint">Qualche domanda per aiutarti:<ul style="margin:6px 0 0;padding-left:20px">' +
      '<li>Cosa direi a una collega nella stessa situazione?</li>' +
      '<li>Cosa so davvero e cosa sto immaginando?</li>' +
      '<li>Qual è una lettura più equilibrata, anche solo un po’ più gentile?</li>' +
      '<li>Qual è un piccolo passo che posso fare adesso?</li></ul></div>' +
      '<textarea data-i="alt_th" data-f="reply" aria-label="Risposta più utile" placeholder="Scrivi qui la tua risposta…">' + esc(t.reply) + '</textarea>' +
      '<div><div class="row2"><label class="f" for="alt-after" style="margin:0">Adesso, quanto è forte (' + esc(t.emotion) + ')?</label><span class="rangeval" id="alt-afterv">' + after + '</span></div>' +
      slider('alt-after', 'alt-afterv', after, 'alt_after') +
      '<p class="muted small">Prima era ' + t.intensity + '. Se non è cambiato niente va bene lo stesso.</p></div>';
  }
  return '<div class="head"><div><h1>Registro dei pensieri</h1></div></div>' + dots + body +
    '<div class="row2"><button class="btn ghost" data-a="alt_prev">' + (t.step === 0 ? 'Annulla' : 'Indietro') + '</button>' +
    '<button class="btn" data-a="alt_next">' + (t.step === 4 ? 'Salva' : 'Avanti') + '</button></div>';
}

function thoughtList(){
  const list = arr('thoughts').slice().sort((a, b) => b.ts - a.ts);
  let h = head('Registro dei pensieri', 'Situazione, pensiero, emozione, e poi una risposta più utile.');
  h += '<div class="hint">Quando un pensiero ti pesa, fermarti a scriverlo lo rende meno vago e più facile da guardare. Ci vogliono pochi minuti.</div>';
  if(T && hasContent(T)){
    h += '<button class="btn block" data-a="alt_resume">Riprendi il registro iniziato</button>';
  }
  h += '<button class="btn' + (T && hasContent(T) ? ' soft' : '') + ' block" data-a="alt_newthought">Nuovo registro</button>';
  h += '<div class="group"><h2>Storico</h2>';
  if(!list.length){
    h += '<p class="empty">Ancora nessun registro. Quando ne scrivi uno compare qui.</p>';
  } else {
    h += list.map(x => {
      const hasAfter = x.intensityAfter !== null && x.intensityAfter !== undefined;
      return '<div class="thought">' +
        '<div class="muted small">' + esc(dlabel(x.ts)) + ', ' + esc(P.fmtTime(x.ts)) + '</div>' +
        (x.situation ? '<p class="small muted" style="margin:4px 0">' + esc(x.situation) + '</p>' : '') +
        '<p style="font-family:var(--serif);font-size:1.1rem;margin:4px 0">«' + esc(x.thought) + '»</p>' +
        '<div class="small">' + esc(x.emotion || '') + (x.intensity !== undefined ? ' <b>' + (hasAfter ? 'da ' + esc(String(x.intensity)) + ' a ' + esc(String(x.intensityAfter)) : esc(String(x.intensity)) + '/10') + '</b>' : '') + '</div>' +
        '<div>' + (x.errors || []).map(k => '<span class="tag">' + esc(errLabel(k)) + '</span>').join('') + '</div>' +
        (x.reply ? '<p class="card-line small" style="margin:8px 0">' + esc(x.reply) + '</p>' : '') +
        '<button class="btn ghost sm" data-a="alt_thdel" data-id="' + esc(x.id) + '">Elimina</button></div>';
    }).join('');
  }
  return h + '</div>';
}

P.screens['altro/pensieri'] = {
  render(){
    const p = (P.ui && P.ui.params) || {};
    if(p.situation || p.thought || p.step !== undefined){
      if(!T) T = newDraft(p);
      P.ui.params = {}; // parametri consumati: non ricreare la bozza dopo il salvataggio
    }
    return (T && T.active) ? wizard() : thoughtList();
  }
};

P.actions.alt_newthought = () => { T = newDraft(); P.render(); window.scrollTo(0, 0); };
P.actions.alt_resume = () => { if(T) T.active = true; P.render(); window.scrollTo(0, 0); };
P.actions.alt_emo = el => { T.emotion = el.dataset.v; P.render(); };
P.actions.alt_err = el => {
  const k = el.dataset.v, i = T.errors.indexOf(k);
  if(i >= 0) T.errors.splice(i, 1); else T.errors.push(k);
  P.render();
};
P.actions.alt_prev = () => {
  if(T.step === 0){
    if(hasContent(T)){
      confirmSheet('Scartare questo registro?', 'Quello che hai scritto finora andrà perso.', 'Scarta', 'alt_discard', '', true);
      return;
    }
    T = null; P.render(); return;
  }
  T.step--; P.render(); window.scrollTo(0, 0);
};
P.actions.alt_discard = () => { T = null; P.closeSheet(); P.render(); window.scrollTo(0, 0); };
P.actions.alt_next = () => {
  const need = 'Scrivi qualche parola per andare avanti';
  if(T.step === 0 && !T.situation.trim()) return P.toast(need);
  if(T.step === 1 && !T.thought.trim()) return P.toast(need);
  if(T.step === 2 && !T.emotion.trim()) return P.toast('Indica che emozione hai provato');
  if(T.step < 4){ T.step++; P.render(); window.scrollTo(0, 0); return; }
  if(!T.reply.trim()) return P.toast('Scrivi una risposta, anche breve');
  arr('thoughts').push({
    id: P.uid(), ts: Date.now(),
    situation: T.situation.trim(), thought: T.thought.trim(), emotion: T.emotion.trim(),
    intensity: T.intensity, errors: T.errors.slice(), reply: T.reply.trim(),
    intensityAfter: T.after === null ? T.intensity : T.after
  });
  P.save();
  T = null;
  P.win('Ho scritto un registro dei pensieri', 'other');
  P.render();
  window.scrollTo(0, 0);
};
P.actions.alt_thdel = el => {
  confirmSheet('Eliminare questo registro?', 'Non si può annullare.', 'Elimina', 'alt_thdel_do', el.dataset.id, true);
};
P.actions.alt_thdel_do = el => {
  P.S.thoughts = arr('thoughts').filter(x => x.id !== el.dataset.id);
  P.save(); P.closeSheet(); P.render();
};
P.inputs.alt_th = el => { if(T) T[el.dataset.f] = el.value; };
P.inputs.alt_int = el => {
  if(!T) return;
  T.intensity = +el.value;
  const o = document.getElementById(el.dataset.out); if(o) o.textContent = el.value;
};
P.inputs.alt_after = el => {
  if(!T) return;
  T.after = +el.value;
  const o = document.getElementById(el.dataset.out); if(o) o.textContent = el.value;
};

/* ---------- fatto! ---------- */
let winText = '';
const KIND = {task: 'compito', block: 'blocco superato', restart: 'ripartenza', other: ''};
P.screens['altro/fatto'] = {
  render(){
    const wins = arr('wins').slice().sort((a, b) => b.ts - a.ts);
    const mon = mondayOf(P.ymd());
    const n = wins.filter(w => dayOf(w.ts) >= mon).length;
    let h = head('Fatto!', 'Quello che hai portato a termine, anche in piccolo.');
    h += '<p class="big-q">Questa settimana: ' + n + '</p>';
    h += '<div class="hint">L’impegno e i piccoli completamenti contano: non serve che una cosa sia grande per essere riuscita.</div>';
    h += '<div><label class="f" for="alt-win">Aggiungi una cosa che hai fatto</label>' +
      '<div class="addrow"><input type="text" id="alt-win" data-i="alt_win" value="' + esc(winText) + '" placeholder="Per esempio: ho risposto a quella mail" autocomplete="off">' +
      '<button class="btn" data-a="alt_winadd">Aggiungi</button></div></div>';
    if(!wins.length){
      h += '<p class="empty">Qui compariranno i compiti completati e le ripartenze.</p>';
    } else {
      const days = [];
      const map = {};
      wins.forEach(w => { const d = dayOf(w.ts); if(!map[d]){ map[d] = []; days.push(d); } map[d].push(w); });
      h += days.map(d =>
        '<div class="group"><h3>' + esc(P.fmtDate(d)) + '</h3><ul class="list">' + map[d].map(w =>
          '<li class="task"><div class="body" style="cursor:default"><span class="ttl">' + esc(w.text) + '</span>' +
          '<span class="meta">' + esc(P.fmtTime(w.ts)) + (KIND[w.kind] ? ' · ' + KIND[w.kind] : '') + '</span></div></li>'
        ).join('') + '</ul></div>').join('');
    }
    return h;
  }
};
P.inputs.alt_win = el => { winText = el.value; };
P.actions.alt_winadd = () => {
  const t = winText.trim();
  if(!t) return P.toast('Scrivi cosa hai fatto');
  winText = '';
  P.win(t, 'other');
  P.render();
};

/* ---------- check-in settimanale ---------- */
let C = null;
const DIMS = [
  ['attenzione', 'Attenzione', 'Questa settimana quanto ti è stato difficile mantenere l’attenzione su ciò che stavi facendo?'],
  ['organizzazione', 'Organizzazione', 'Questa settimana quanto ti è stato difficile organizzarti e portare avanti i piani?'],
  ['rimando', 'Rimandare', 'Questa settimana quanto hai faticato a iniziare le cose e a non rimandarle?'],
  ['umore', 'Umore e ansia', 'Questa settimana quanto ti hanno pesato l’umore basso o l’ansia?'],
  ['impulsivita', 'Impulsività', 'Questa settimana quanto hai faticato a frenare gli impulsi, per esempio interrompere, comprare o rispondere d’istinto?']
];
const LEVELS = ['per niente', 'un po’', 'a volte', 'spesso', 'quasi sempre'];

function ciInit(){
  const wk = mondayOf(P.ymd());
  const ex = arr('checkins').find(c => c.date && mondayOf(c.date) === wk);
  C = {
    id: ex ? ex.id : null,
    existing: !!ex,
    scores: Object.assign({attenzione: 0, organizzazione: 0, rimando: 0, umore: 0, impulsivita: 0}, ex && ex.scores),
    planned: ex && ex.meds ? ex.meds.planned : sets().medsPerWeek,
    missed: ex && ex.meds ? ex.meds.missed : 0,
    worked: ex ? (ex.worked || '') : ''
  };
}
function total(sc){ return DIMS.reduce((s, d) => s + (+sc[d[0]] || 0), 0); }

function chart(){
  const byWeek = {};
  arr('checkins').forEach(c => {
    if(!c.date || !c.scores) return;
    const w = mondayOf(c.date);
    if(!byWeek[w] || byWeek[w].date < c.date) byWeek[w] = c;
  });
  const pts = Object.keys(byWeek).sort().slice(-8).map(w => ({d: byWeek[w].date, v: total(byWeek[w].scores)}));
  if(!pts.length) return '<p class="empty">Il grafico compare dopo il primo check-in.</p>';
  const W = 320, H = 110, x0 = 14, x1 = 306, yb = 86, yt = 10;
  const X = i => pts.length === 1 ? (x0 + x1) / 2 : x0 + i * (x1 - x0) / (pts.length - 1);
  const Y = v => yb - (v / 20) * (yb - yt);
  const line = pts.map((p, i) => X(i).toFixed(1) + ',' + Y(p.v).toFixed(1)).join(' ');
  const lab = 'font-size:10px;fill:var(--ink2)';
  return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Punteggio totale delle ultime settimane, da 0 a 20; più basso significa meno difficoltà" style="height:120px">' +
    '<line x1="' + x0 + '" y1="' + yb + '" x2="' + x1 + '" y2="' + yb + '" style="stroke:var(--line);stroke-width:1"/>' +
    (pts.length > 1 ? '<polyline points="' + line + '"/>' : '') +
    pts.map((p, i) => '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="4"/>').join('') +
    '<text x="' + x0 + '" y="104" style="' + lab + '">' + shortDate(pts[0].d) + '</text>' +
    (pts.length > 1 ? '<text x="' + x1 + '" y="104" text-anchor="end" style="' + lab + '">' + shortDate(pts[pts.length - 1].d) + '</text>' : '') +
    '</svg><p class="muted small">Punteggio totale da 0 a 20 delle ultime ' + pts.length + ' settimane. Più basso vuol dire meno difficoltà; guarda l’andamento, non il singolo numero.</p>';
}

P.screens['altro/checkin'] = {
  render(){
    if(!C) ciInit();
    let h = head('Check-in settimanale', 'Cinque domande, senza voti giusti o sbagliati.');
    if(C.existing) h += '<div class="hint">Questa settimana hai già fatto il check-in: se lo salvi di nuovo, lo aggiorni.</div>';
    h += DIMS.map(d => {
      const v = C.scores[d[0]];
      return '<div><label class="f" for="alt-ci-' + d[0] + '">' + esc(d[2]) + '</label>' +
        '<div class="row2"><span class="muted small">' + esc(LEVELS[0]) + '</span><output id="alt-ci-v-' + d[0] + '" style="font-weight:650">' + esc(LEVELS[v]) + '</output><span class="muted small">' + esc(LEVELS[4]) + '</span></div>' +
        '<input type="range" class="range" id="alt-ci-' + d[0] + '" min="0" max="4" step="1" value="' + v + '" data-i="alt_ci" data-k="' + d[0] + '" data-out="alt-ci-v-' + d[0] + '"></div>';
    }).join('');
    if(sets().meds){
      h += '<div class="group"><h3>Farmaco</h3>' +
        '<p class="muted small" style="margin-bottom:4px">Dosi previste questa settimana</p>' + stepper('alt_ci_planned', C.planned, '') +
        '<p class="muted small" style="margin:12px 0 4px">Dosi saltate</p>' + stepper('alt_ci_missed', C.missed, '') + '</div>';
    }
    h += '<div><label class="f" for="alt-worked">Cosa ha funzionato questa settimana?</label>' +
      '<textarea id="alt-worked" data-i="alt_ci_worked" placeholder="Anche una cosa piccola: un orario, un posto, un modo di iniziare…">' + esc(C.worked) + '</textarea></div>';
    h += '<button class="btn block" data-a="alt_ci_save">Salva il check-in</button>';
    h += '<div class="group"><h2>Le ultime settimane</h2>' + chart() + '</div>';
    return h;
  }
};
P.inputs.alt_ci = el => {
  if(!C) return;
  const v = +el.value;
  C.scores[el.dataset.k] = v;
  const o = document.getElementById(el.dataset.out); if(o) o.textContent = LEVELS[v];
};
P.inputs.alt_ci_worked = el => { if(C) C.worked = el.value; };
P.actions.alt_ci_planned = el => {
  C.planned = clamp(C.planned + (el.dataset.v === '+' ? 1 : -1), 0, 28);
  C.missed = Math.min(C.missed, C.planned);
  P.render();
};
P.actions.alt_ci_missed = el => {
  C.missed = clamp(C.missed + (el.dataset.v === '+' ? 1 : -1), 0, C.planned);
  P.render();
};
P.actions.alt_ci_save = () => {
  const list = arr('checkins');
  const entry = {
    id: C.id || P.uid(), date: P.ymd(),
    scores: Object.assign({}, C.scores),
    meds: sets().meds ? {planned: C.planned, missed: C.missed} : null,
    worked: C.worked.trim()
  };
  const i = list.findIndex(c => c.id === entry.id);
  if(i >= 0) list[i] = entry; else list.push(entry);
  P.save();
  C = null;
  P.toast('Check-in salvato');
  P.render();
};

/* ---------- schede ---------- */
const SCHEDE = [
  ['L’ADHD adulto non è pigrizia',
    ['Nell’adulto l’ADHD si comprende meglio come un disturbo dell’autoregolazione: la difficoltà non è sapere cosa fare, ma guidare in modo stabile il comportamento verso un obiettivo, soprattutto quando manca un’urgenza esterna.',
     'Sono coinvolte funzioni esecutive come memoria di lavoro, inibizione, gestione del tempo e regolazione emotiva, con una forte variabilità da un momento all’altro.',
     'Non dipende da scarsa intelligenza né da mancanza di volontà: molte persone brillanti compensano per anni a costo di molta fatica.',
     'Per questo la resa è incostante: alta su ciò che interessa o scade oggi, bassa su ciò che è importante ma senza scadenza.',
     'Ne segue che aiutano le strutture esterne (promemoria, scadenze, passi piccoli) più dello «sforzarsi di più». Le spiegazioni in termini di colpa o di carattere non aiutano e tendono a peggiorare l’umore.'],
    'Fonte: Ramsay, Rethinking Adult ADHD (impostazione generale del libro)'],
  ['Intenzione non è azione',
    ['Sapere cosa fare e farlo sono due processi distinti, e nell’ADHD il passaggio dall’uno all’altro è il punto fragile.',
     'L’intenzione vive nella testa, mentre l’azione richiede un segnale giusto, nel momento e nel luogo giusti.',
     'Per questo funzionano le intenzioni di implementazione: «quando succede X, faccio Y», con un primo gesto minuscolo, un posto e un orario.',
     'Il piano non serve a motivarti, serve a togliere una decisione alla te del futuro, che avrà meno energia.',
     'Se il compito non parte, spesso il primo passo era ancora troppo grande o troppo vago: riducilo finché quasi ti fa sorridere.'],
    'Fonte: Safren et al., Mastering Your Adult ADHD, cap. 4 (organizzare e pianificare)'],
  ['Perché il piano perfetto non basta',
    ['Di solito si pianifica per la giornata migliore: energia piena, nessun imprevisto, concentrazione ideale. La vita reale ha giornate medie e giornate storte.',
     'Un piano che regge solo nel caso migliore crolla al primo intoppo, e il crollo viene letto come un fallimento personale.',
     'Meglio un piano con dei margini: meno compiti, tempi più larghi, uno spazio cuscinetto per gli imprevisti e al massimo tre priorità.',
     'Prevedere gli ostacoli con un «se succede questo, allora faccio quest’altro» rende il piano elastico.',
     'Un piano riuscito a metà e adattato vale più di uno perfetto e abbandonato.'],
    'Fonte: Safren et al., Mastering Your Adult ADHD, cap. 4 (organizzare e pianificare) e cap. 14 (ricadute)'],
  ['La soglia di attenzione e i blocchi calibrati',
    ['Ognuno ha un tempo oltre il quale l’attenzione cala. Nell’ADHD spesso è più breve, e superarlo non è questione di impegno.',
     'Conviene misurarla (l’app può farlo) e lavorare per blocchi un po’ più brevi della soglia, con la pausa programmata prima del calo e non dopo.',
     'Le pause funzionano se sono brevi e definite e se l’attività è di quelle che non risucchiano: alzarsi, bere, camminare, più che il telefono.',
     'Un timer visibile rende il tempo concreto, perché il «tra poco» si percepisce male.',
     'Col tempo la soglia può allungarsi gradualmente, ma si parte da quella reale, non da quella desiderata.'],
    'Fonte: Safren et al., Mastering Your Adult ADHD, cap. 8 (attenzione e distraibilità)'],
  ['Le distrazioni che sembrano urgenti',
    ['Mentre lavori ti viene in mente una mail, una telefonata, una ricerca: sembra urgente perché la mente ADHD è attratta da ciò che è nuovo o immediato.',
     'Seguire l’impulso interrompe il compito, e tornare indietro costa più di quanto sembri.',
     'Un’alternativa è parcheggiare il pensiero in una riga, su un foglio o nell’app, e decidere alla pausa che farne.',
     'Aiuta anche togliere i richiami dall’ambiente: notifiche spente, telefono fuori vista, una sola scheda aperta.',
     'Prima di cedere chiediti: se aspetta venti minuti, cambia qualcosa? Quasi sempre no.'],
    'Fonte: Safren et al., Mastering Your Adult ADHD, cap. 8 (attenzione e distraibilità) e cap. 9 (ambiente)'],
  ['Procrastinare e il fastidio («uff»)',
    ['Spesso rimandare non è disorganizzazione ma evitamento di un fastidio: noia, incertezza, paura di sbagliare.',
     'Il momento in cui pensi «uff» è il punto critico: se lo segui, il sollievo immediato rinforza l’evitamento e la volta dopo sarà più difficile.',
     'Si può riconoscere quel «uff» come un’informazione e rispondere con un passo piccolissimo, di pochi minuti, dichiarando che serve solo ad avviarsi.',
     'Quasi sempre la parte più dura è l’inizio, non il compito. Frasi come «devo sentirmi pronta» o «lo faccio meglio domani» sono giustificazioni da riconoscere.',
     'Dopo il passo, una piccola ricompensa chiude il cerchio e rende più probabile la volta successiva.'],
    'Fonte: Safren et al., Mastering Your Adult ADHD, cap. 13 (procrastinazione) e cap. 10-12 (pensiero adattivo)'],
  ['Previsioni ottimistiche dei tempi',
    ['Tutti tendiamo a sottostimare quanto durerà un compito, e nell’ADHD la distorsione è più marcata, anche perché la percezione del tempo è meno precisa.',
     'Il rimedio è empirico: annota quanto ci metti davvero e usa quel dato, con un margine (spesso circa metà in più).',
     'Spezzare il compito in passi piccoli rende la stima più affidabile.',
     'Ricorda di contare anche l’avvio, le transizioni e le interruzioni, che di solito non entrano nel conto.',
     'Con qualche settimana di dati la tua agenda diventa realistica e meno frustrante.'],
    'Fonte: Safren et al., Mastering Your Adult ADHD, cap. 4 (organizzare e pianificare)'],
  ['Ansia e ADHD che si alimentano',
    ['L’ansia è frequente insieme all’ADHD e le due condizioni si rinforzano a vicenda.',
     'I ritardi e gli errori generano preoccupazione; la preoccupazione consuma memoria di lavoro e attenzione, peggiora la resa e porta a evitare, e l’evitamento allunga il circolo.',
     'Il registro dei pensieri serve a rallentare la catena: separare situazione, pensiero ed emozione e cercare una lettura più equilibrata.',
     'Contano anche il corpo e la routine: respiro lento, movimento e sonno regolare abbassano il livello di base.',
     'Distinguere ciò che è controllabile da ciò che non lo è riduce la ruminazione. Se ansia o umore peggiorano in modo significativo, vale la pena parlarne con chi ti segue.'],
    'Fonte: Ramsay, Rethinking Adult ADHD, cap. Cognitive interventions in action; Safren et al., Mastering Your Adult ADHD, cap. 10-12 (pensiero adattivo)'],
  ['Scivolare non è fallire',
    ['Ricadute e giornate a vuoto fanno parte del percorso e non ne segnano la fine.',
     'Il rischio maggiore non è lo scivolone ma il pensiero «ho rovinato tutto», che porta a mollare del tutto (l’effetto «tanto ormai»).',
     'Una mossa utile: riconosci cosa è successo senza giudicare, individua cosa lo ha favorito e scegli il passo più piccolo per riprendere oggi.',
     'Le ricadute sono dati: mostrano quale strategia non reggeva e va semplificata.',
     'Valuta il percorso su settimane, non sul singolo giorno: conta più ripartire che non cadere mai.'],
    'Fonte: Safren et al., Mastering Your Adult ADHD, cap. 14 (ricadute)'],
  ['Calendario e lista: la base di tutto',
    ['Per Safren calendario e lista dei compiti sono il fondamento dell’organizzazione: necessari, anche se da soli non bastano, come mangiare lo è per stare bene.',
     'Regole semplici: ogni appuntamento va sul calendario, ogni compito sulla lista, e i bigliettini sparsi si copiano lì e si buttano, perché i fogli sparsi si perdono.',
     'La lista si guarda ogni giorno e si aggiorna: ciò che non hai finito passa al giorno dopo.',
     'Non cercare il sistema perfetto, è una trappola che porta a non averne nessuno: scegline uno semplice e tienilo almeno tre mesi, il tempo di farlo diventare un’abitudine.'],
    'Fonte: Safren et al., Mastering Your Adult ADHD, cap. 4 (organizzare e pianificare)'],
  ['Un tocco solo: posta, carte e oggetti',
    ['Posta e carte si accumulano perché non si decide subito che farne. Il metodo «un tocco solo» (OHIO: Only Handle It Once) dice di decidere nel momento in cui il foglio è in mano: farlo, archiviarlo o buttarlo.',
     'Non esiste una categoria «decido dopo»: è lì che nascono le pile.',
     'Serve un solo posto dove arriva la posta e due o tre momenti fissi a settimana per svuotarlo, scritti sul calendario.',
     'Se è troppo, spezza il lavoro: venti minuti, oppure i primi venti fogli. Fermarsi al traguardo è già un risultato.',
     'Anche per chiavi, portafoglio e telefono vale un posto preciso, dove li rimetti sempre.'],
    'Fonte: Safren et al., Mastering Your Adult ADHD, cap. 7 (sistemi organizzativi) e cap. 9 (oggetti importanti)'],
  ['L’incertezza e i «e se»',
    ['L’ADHD rende i piani incerti: non sai se avrai energia, se ce la farai, se qualcosa si metterà in mezzo. L’incertezza è uno dei motori dell’ansia, perché ogni «e se» ne chiama un altro.',
     'Rassicurarti con le parole spesso non basta: dopo il «andrà bene» arriva un nuovo «e se». Non serve eliminare l’incertezza, che non si può: serve imparare a starci.',
     'Una domanda utile: c’è qualcosa, anche piccolissima, che posso fare adesso? Se sì, quel passo scioglie parte del nodo. Se no, serve una frase che regga il «non lo so».'],
    'Fonte: Ramsay, The Adult ADHD and Anxiety Workbook, cap. 1 (ADHD e ansia)'],
  ['Evitare dà sollievo, ma si paga dopo',
    ['Davanti a ciò che mette ansia, la risposta più comune è evitare. Il sollievo arriva subito, e proprio per questo l’evitamento si ripete: la mente impara che scappare funziona.',
     'Il prezzo arriva più tardi, con lo stress, la fretta e il rimprovero a se stessi: «perché lo faccio sempre?». Non è pigrizia, è un modo di proteggersi.',
     'Aiuta guardare la situazione in tre parti: che cosa penso, che cosa sento, che cosa posso fare. E chiudere con un piano «se… allora» legato a un momento preciso.'],
    'Fonte: Ramsay, The Adult ADHD and Anxiety Workbook, cap. 1 e 3 (evitamento e cornice di coping)'],
  ['Scrivere fuori dalla testa',
    ['Tenere a mente qualcosa per non dimenticarla, ripassandola di continuo, occupa spazio mentale e toglie energia al resto, anche al sonno.',
     'Il rimedio è semplice: scrivere ciò che vuoi ricordare in un posto che guardi davvero, calendario, lista o appunti. Appena è fuori dalla testa, la mente può lasciarlo andare.'],
    'Fonte: Ramsay, The Adult ADHD and Anxiety Workbook, cap. 1 (ansia di dimenticare)'],
  ['Prendere tempo prima di dire sì',
    ['Con l’ADHD è facile dire sì d’impulso: la proposta è interessante, chi la fa è gentile, e la risposta parte prima di aver guardato gli impegni.',
     'Si può imparare a prendere tempo con una frase pronta: «mi fa piacere che tu me l’abbia chiesto, ti rispondo domani». Una frase già scelta evita la pressione di rispondere subito.',
     'Il tempo serve a controllare gli impegni che hai già e, se vuoi, a proporre altre condizioni, per esempio un’altra scadenza.'],
    'Fonte: Ramsay, Rethinking Adult ADHD, cap. 4 (pensieri e impulsività)'],
  ['Le carte di coping',
    ['Una carta di coping è un promemoria scritto, su un cartoncino o sul telefono, con i pensieri e i gesti che ti aiutano in una situazione difficile.',
     'Serve perché nel momento critico la memoria di lavoro è la prima a mancare e l’ansia ti fa tornare in mente solo pensieri ansiosi. Leggere è più facile che ricordare.',
     'Le frasi migliori sono brevi: «definisco il primo passo», «noto la sensazione, non ci agisco», «mi prendo tempo per pensarci».'],
    'Fonte: Ramsay, Rethinking Adult ADHD, cap. 4 (modificazione cognitiva)'],
  ['Il perché e il piccolo premio',
    ['Nell’ADHD è difficile muoversi per un compito quando la ricompensa non è immediata. Per questo la motivazione va sostenuta dall’esterno.',
     'Un motivo scritto e visibile nel momento in cui parti pesa più di uno solo pensato.',
     'Un traguardo che si vede aiuta, come «alle 16:30 ho finito il mio blocco»: ogni traguardo raggiunto è già un risultato.',
     'Un premio piccolo e subito dopo rinforza il gesto più di uno lontano. E il piacere di aver concluso qualcosa, anche di piccolo, è spesso sottovalutato: notalo.'],
    'Fonte: Ramsay, Rethinking Adult ADHD, cap. 5 (procrastinazione e motivazione)'],
  ['Parlarsi come a un’amica',
    ['Molte persone con ADHD sanno dare ottimi consigli agli altri e sono durissime con se stesse davanti agli stessi errori.',
     'Un trucco semplice è parlarti con un po’ di distanza, in seconda o terza persona, magari col tuo nome: «è successo, ripartiamo da un passo piccolo».',
     'Notare i piccoli avanzamenti, senza aspettare il traguardo, è parte del lavoro: aiuta a ripartire dopo gli scivoloni.'],
    'Fonte: Ramsay, The Adult ADHD and Anxiety Workbook, cap. 5 e 9 (autocompassione e progressi graduali)']
];
P.screens['altro/schede'] = {
  render(){
    return head('Schede', 'Idee di base, in breve. Tocca un titolo per aprirla.') +
      '<div class="schede">' + SCHEDE.map(s =>
        '<details><summary>' + esc(s[0]) + '</summary><p>' + s[1].map(esc).join(' ') + '</p><p class="ref">' + esc(s[2]) + '</p></details>'
      ).join('') + '</div>';
  }
};

/* ---------- impostazioni ---------- */
P.screens['altro/impostazioni'] = {
  render(){
    const s = sets();
    const samples = arr('samples');
    const avg = samples.length ? Math.round(samples.reduce((a, x) => a + (+x.minutes || 0), 0) / samples.length) : null;
    let h = head('Impostazioni');
    h += '<div><h3>Soglia di attenzione</h3><p class="muted small">Per quanto riesci a lavorare di fila prima che l’attenzione cali. Serve a calibrare la durata dei blocchi.</p>' +
      stepper('alt_span', s.span, 'min') +
      '<p class="muted small" style="margin-top:8px">' + (avg ? 'Dalle tue misure: media di ' + avg + ' minuti su ' + samples.length + (samples.length === 1 ? ' misura.' : ' misure.') : 'Non hai ancora misure.') + '</p>' +
      '<button class="btn soft block" data-a="alt_measure">Misura la mia soglia</button></div>';
    h += '<div><h3>Pausa</h3><p class="muted small">Durata della pausa tra un blocco e l’altro.</p>' + stepper('alt_pause', s.pause, 'min') + '</div>';
    h += '<div><h3>Suono</h3><p class="muted small">Un suono leggero quando finisce un blocco.</p>' + seg('alt_sound', [['1', 'Sì'], ['0', 'No']], s.sound ? '1' : '0') + '</div>';
    h += '<div><h3>Tema</h3>' + seg('alt_theme', [['auto', 'Automatico'], ['light', 'Chiaro'], ['dark', 'Scuro']], s.theme) + '</div>';
    h += '<div><h3>Farmaco</h3><p class="muted small">Se lo attivi, il check-in settimanale chiede anche le dosi previste e quelle saltate.</p>' +
      seg('alt_meds', [['1', 'Sì'], ['0', 'No']], s.meds ? '1' : '0');
    if(s.meds) h += '<p class="muted small" style="margin:12px 0 4px">Dosi a settimana</p>' + stepper('alt_mpw', s.medsPerWeek, '');
    h += '</div>';
    h += remHtml();
    return h;
  },
  after(){
    // lo stato delle notifiche si legge in modo asincrono: si ridisegna solo se è cambiato
    if(P.rem) P.rem.refresh().then(changed => { if(changed && P.ui.tab === 'altro' && P.ui.view === 'impostazioni') P.render(); }, () => {});
  }
};
function remBlock(k, title, sub, r, extra){
  const on = !!r[k].on;
  return '<div><h3>' + esc(title) + '</h3><p class="muted small">' + esc(sub) + '</p>' +
    seg('alt_rem_on', [[k + ':1', 'Sì'], [k + ':0', 'No']], k + ':' + (on ? 1 : 0)) +
    (on ? '<div style="margin-top:10px"><label class="f" for="rem-' + k + '">Ora</label>' +
      '<input id="rem-' + k + '" type="time" data-i="alt_rem_time" data-k="' + k + '" value="' + esc(r[k].time) + '"></div>' + (extra || '') : '') +
    '</div>';
}
function remHtml(){
  const st = (P.rem && P.rem.status) || {};
  if(!st.installed){
    return '<div><h2>Promemoria</h2><p class="muted small">Per ricevere i promemoria l’app deve stare sulla Home dell’iPhone. Apri questo indirizzo in Safari, tocca Condividi, poi «Aggiungi alla schermata Home». Poi apri Un passo dalla Home: qui potrai attivare i promemoria.</p></div>';
  }
  if(!st.supported){
    return '<div><h2>Promemoria</h2><p class="muted small">Questo iPhone o questo browser non supporta gli avvisi dalle app sulla Home. Servono iOS 16.4 o successivo: se puoi, aggiorna il sistema e riapri l’app dalla Home.</p></div>';
  }
  if(!st.subscribed){
    return '<div><h2>Promemoria</h2>' +
      (st.wanted ? '<p class="banner">I promemoria si sono disattivati su questo iPhone. Riattivali con il pulsante qui sotto.</p>' : '') +
      '<p class="muted small">Notifiche che arrivano anche con l’app chiusa: compiti pianificati, appuntamenti, lista del mattino, revisione della sera, check-in, posta e farmaco. I testi restano nel telefono: al server arrivano solo gli orari.</p>' +
      '<button class="btn block" data-a="alt_rem_enable">Attiva i promemoria su questo iPhone</button>' +
      (st.permission === 'denied' ? '<p class="muted small" style="margin-top:8px">Le notifiche sono bloccate per Un passo: attivale da Impostazioni, Notifiche, Un passo, poi riprova.</p>' : '') + '</div>';
  }
  const s = sets(), r = rem();
  const days = [[1, 'Lunedì'], [2, 'Martedì'], [3, 'Mercoledì'], [4, 'Giovedì'], [5, 'Venerdì'], [6, 'Sabato'], [0, 'Domenica']];
  let h = '<div><h2>Promemoria</h2><p class="muted small">Ogni avviso arriva una volta sola, alla sua ora, senza solleciti. Mattina, sera, posta, check-in e farmaco tornano ogni giorno o ogni settimana finché sono attivi; compiti e appuntamenti arrivano solo alla data scelta. Toccandolo, l’app si apre nel punto giusto.</p></div>';
  h += '<div><h3>Al momento pianificato</h3><p class="muted small">Un avviso all’ora che scegli quando pianifichi un compito, con il primo gesto che hai scritto.</p>' +
    seg('alt_rem_on', [['plan:1', 'Sì'], ['plan:0', 'No']], 'plan:' + (r.plan ? 1 : 0)) + '</div>';
  h += remBlock('morning', 'Mattina', 'Guarda la lista di oggi: la guida di Safren consiglia di farlo ogni giorno.', r);
  h += remBlock('evening', 'Revisione della sera', 'Due minuti per chiudere la giornata e preparare domani.', r);
  h += remBlock('week', 'Check-in settimanale', 'Cinque domande, una volta a settimana.', r,
    '<div style="margin-top:10px"><label class="f" for="rem-day">Giorno</label><select id="rem-day" data-i="alt_rem_day">' +
    days.map(d => '<option value="' + d[0] + '"' + (r.week.day === d[0] ? ' selected' : '') + '>' + d[1] + '</option>').join('') + '</select></div>');
  if(s.meds){
    h += '<div><h3>Farmaco</h3><p class="muted small">Nell’avviso non compare il nome del farmaco.</p>' +
      seg('alt_rem_on', [['meds:1', 'Sì'], ['meds:0', 'No']], 'meds:' + (r.meds.on ? 1 : 0));
    if(r.meds.on){
      h += '<div class="stack" style="margin-top:10px">' + r.meds.times.map((t, i) =>
        '<div class="addrow"><input type="time" aria-label="Orario ' + (i + 1) + '" data-i="alt_rem_mtime" data-n="' + i + '" value="' + esc(t) + '">' +
        (r.meds.times.length > 1 ? '<button class="btn ghost sm" data-a="alt_rem_mdel" data-v="' + i + '" aria-label="Togli l’orario ' + (i + 1) + '">Togli</button>' : '') + '</div>').join('') +
        (r.meds.times.length < 4 ? '<button class="btn soft sm" data-a="alt_rem_madd">Aggiungi un orario</button>' : '') + '</div>';
    }
    h += '</div>';
  }
  h += '<div><button class="btn soft block" data-a="alt_rem_test">Invia un avviso di prova</button>' +
    '<p class="muted small" style="margin-top:8px">Arriva tra 10 secondi, anche se esci dall’app. Può avere qualche secondo di ritardo. Se non arriva, controlla Impostazioni, Notifiche, Un passo sull’iPhone.</p></div>';
  h += '<div><button class="btn ghost block" data-a="alt_rem_disable">Disattiva i promemoria su questo iPhone</button></div>';
  return h;
}
P.actions.alt_rem_on = el => {
  const [k, v] = String(el.dataset.v).split(':'), r = rem();
  if(k === 'plan') r.plan = v === '1'; else if(r[k]) r[k].on = v === '1';
  P.save(); P.render();
};
P.inputs.alt_rem_time = el => { const r = rem(), k = el.dataset.k; if(r[k] && HHMM.test(el.value)){ r[k].time = el.value; P.save(); } };
P.inputs.alt_rem_day = el => { rem().week.day = clamp(+el.value || 0, 0, 6); P.save(); };
P.inputs.alt_rem_mtime = el => { const r = rem(), i = +el.dataset.n; if(HHMM.test(el.value) && i >= 0 && i < r.meds.times.length){ r.meds.times[i] = el.value; P.save(); } };
P.actions.alt_rem_madd = () => { const r = rem(); if(r.meds.times.length < 4){ r.meds.times.push('20:00'); P.save(); P.render(); } };
P.actions.alt_rem_mdel = el => { const r = rem(), i = +el.dataset.v; if(r.meds.times.length > 1){ r.meds.times.splice(i, 1); P.save(); P.render(); } };
P.actions.alt_rem_enable = () => {
  if(!P.rem) return;
  P.rem.enable().then(r => { P.toast(r.msg); P.render(); });
};
P.actions.alt_rem_disable = () => {
  if(!P.rem) return;
  P.rem.disable().then(r => { P.toast(r.msg); P.render(); });
};
P.actions.alt_rem_test = () => {
  if(!P.rem) return;
  P.rem.test().then(r => P.toast(r.msg));
};
function stepVal(el){ return el.dataset.v === '+' ? 1 : -1; }
P.actions.alt_span = el => { const s = sets(); s.span = clamp((+s.span || 25) + 5 * stepVal(el), 5, 90); P.save(); P.render(); };
P.actions.alt_pause = el => { const s = sets(); s.pause = clamp((+s.pause || 5) + stepVal(el), 1, 30); P.save(); P.render(); };
P.actions.alt_mpw = el => { const s = sets(); s.medsPerWeek = clamp((+s.medsPerWeek || 7) + stepVal(el), 1, 28); P.save(); P.render(); };
P.actions.alt_sound = el => { sets().sound = el.dataset.v === '1'; P.save(); P.render(); };
P.actions.alt_meds = el => { sets().meds = el.dataset.v === '1'; P.save(); P.render(); };
P.actions.alt_theme = el => { const s = sets(); s.theme = el.dataset.v; applyTheme(s.theme); P.save(); P.render(); };
P.actions.alt_measure = () => { P.startSession({kind: 'measure', skipReady: true}); };
try { applyTheme(sets().theme); } catch(e) { /* nessun problema: resta il tema automatico */ }

/* ---------- per la visita e backup ---------- */
let pendingBackup = null;

function visitData(){
  const today = P.ymd();
  const from4 = P.addDays(today, -28);
  const fromTs = Date.now() - 28 * DAY;
  const cis = arr('checkins').filter(c => c.date && c.scores).sort((a, b) => a.date < b.date ? 1 : -1);
  const samples = arr('samples');
  const medsRecent = cis.filter(c => c.date >= from4 && c.meds);
  return {
    today: today,
    checkins: cis.slice(0, 6),
    sampleN: samples.length,
    sampleAvg: samples.length ? Math.round(samples.reduce((a, x) => a + (+x.minutes || 0), 0) / samples.length) : null,
    span: sets().span,
    tasksDone: arr('tasks').filter(t => t.done && t.doneAt && t.doneAt >= fromTs).length,
    restarts: arr('wins').filter(w => w.kind === 'restart' && w.ts >= fromTs).length,
    slips: arr('slips').filter(s => s.ts >= fromTs).length,
    medsOn: sets().meds,
    medsPlanned: medsRecent.reduce((a, c) => a + (+c.meds.planned || 0), 0),
    medsMissed: medsRecent.reduce((a, c) => a + (+c.meds.missed || 0), 0),
    medsN: medsRecent.length,
    thoughts: arr('thoughts').slice().sort((a, b) => b.ts - a.ts).slice(0, 5)
  };
}
function thoughtLine(x){
  const a = (x.intensityAfter === null || x.intensityAfter === undefined) ? '' : ' (poi ' + x.intensityAfter + ')';
  return x.emotion + ' ' + x.intensity + '/10' + a;
}
function visitText(){
  const d = visitData();
  const L = [];
  L.push('Riepilogo per la visita, ' + P.fmtDate(d.today));
  L.push('');
  L.push('Check-in settimanali (0 = nessuna difficoltà, 4 = molta; attenzione, organizzazione, rimandare, umore e ansia, impulsività):');
  if(!d.checkins.length) L.push('- nessun check-in registrato');
  d.checkins.forEach(c => {
    const s = c.scores;
    L.push('- ' + shortDate(c.date) + ': ' + [s.attenzione, s.organizzazione, s.rimando, s.umore, s.impulsivita].join(', ') + ' (totale ' + total(s) + '/20)');
  });
  L.push('');
  L.push('Soglia di attenzione: ' + (d.sampleAvg ? 'media ' + d.sampleAvg + ' min su ' + d.sampleN + ' misure; ' : 'nessuna misura; ') + 'impostata a ' + d.span + ' min.');
  L.push('Compiti completati nelle ultime 4 settimane: ' + d.tasksDone + '.');
  L.push('Ripartenze (ultime 4 settimane): ' + d.restarts + '. Scivolamenti registrati: ' + d.slips + '.');
  if(d.medsOn) L.push('Dosi saltate (ultime 4 settimane): ' + (d.medsN ? d.medsMissed + ' su ' + d.medsPlanned + ' previste.' : 'nessun dato.'));
  L.push('');
  L.push('Ultimi registri dei pensieri:');
  if(!d.thoughts.length) L.push('- nessuno');
  d.thoughts.forEach(x => {
    L.push('- ' + dlabel(x.ts) + ': «' + x.thought + '» (' + thoughtLine(x) + ')' +
      ((x.errors || []).length ? ' [' + x.errors.map(errLabel).join(', ') + ']' : '') +
      (x.reply ? ' Risposta: ' + x.reply : ''));
  });
  return L.join('\n');
}

P.screens['altro/visita'] = {
  render(){
    const d = visitData();
    let h = head('Per la visita e backup', 'Un riepilogo da mostrare al terapeuta e la copia dei tuoi dati.');
    h += '<div class="group" style="margin-top:6px"><h2>Riepilogo</h2><p class="muted small">' + esc(P.fmtDate(d.today)) + '</p>';
    h += '<h3 style="margin-top:12px">Check-in</h3>';
    if(!d.checkins.length){
      h += '<p class="empty">Nessun check-in registrato.</p>';
    } else {
      const th = 'text-align:center;padding:6px 4px;border-bottom:1px solid var(--line);font-weight:650';
      const td = 'text-align:center;padding:6px 4px;border-bottom:1px solid var(--line)';
      h += '<table style="width:100%;border-collapse:collapse;font-size:.9rem"><thead><tr>' +
        '<th style="' + th + ';text-align:left">Data</th>' +
        ['Att', 'Org', 'Rim', 'Um', 'Imp', 'Tot'].map(x => '<th style="' + th + '">' + x + '</th>').join('') + '</tr></thead><tbody>' +
        d.checkins.map(c => {
          const s = c.scores;
          return '<tr><td style="' + td + ';text-align:left">' + esc(shortDate(c.date)) + '</td>' +
            [s.attenzione, s.organizzazione, s.rimando, s.umore, s.impulsivita].map(v => '<td style="' + td + '">' + esc(String(v)) + '</td>').join('') +
            '<td style="' + td + ';font-weight:650">' + total(s) + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<p class="muted small">Da 0 (nessuna difficoltà) a 4 (molta). Att attenzione, Org organizzazione, Rim rimandare, Um umore e ansia, Imp impulsività; totale su 20.</p>';
    }
    h += '<h3 style="margin-top:12px">Soglia di attenzione</h3><p>' +
      (d.sampleAvg ? 'Media delle misure: <b>' + d.sampleAvg + ' minuti</b> su ' + d.sampleN + (d.sampleN === 1 ? ' misura' : ' misure') + '. ' : 'Nessuna misura ancora. ') +
      'Valore impostato: ' + d.span + ' minuti.</p>';
    h += '<h3>Ultime 4 settimane</h3><ul style="margin:0;padding-left:20px">' +
      '<li>Compiti completati: <b>' + d.tasksDone + '</b></li>' +
      '<li>Ripartenze: <b>' + d.restarts + '</b></li>' +
      '<li>Scivolamenti registrati: <b>' + d.slips + '</b></li>' +
      (d.medsOn ? '<li>Dosi saltate: <b>' + (d.medsN ? d.medsMissed + ' su ' + d.medsPlanned + ' previste' : 'nessun dato') + '</b></li>' : '') +
      '</ul>';
    h += '<h3 style="margin-top:12px">Ultimi registri dei pensieri</h3>';
    if(!d.thoughts.length){
      h += '<p class="empty">Nessun registro.</p>';
    } else {
      h += d.thoughts.map(x =>
        '<div class="thought"><div class="muted small">' + esc(dlabel(x.ts)) + '</div>' +
        '<p style="margin:2px 0">«' + esc(x.thought) + '»</p>' +
        '<div class="small">' + esc(thoughtLine(x)) + '</div>' +
        '<div>' + (x.errors || []).map(k => '<span class="tag">' + esc(errLabel(k)) + '</span>').join('') + '</div>' +
        (x.reply ? '<p class="small" style="margin:4px 0 0">Risposta: ' + esc(x.reply) + '</p>' : '') + '</div>').join('');
    }
    h += '</div>';
    h += '<div class="group"><h2>Condividi e copia</h2><div class="stack">' +
      '<button class="btn block" data-a="alt_share">Condividi</button>' +
      '<button class="btn soft block" data-a="alt_print">Stampa / PDF</button>' +
      '<button class="btn soft block" data-a="alt_backup">Salva backup</button>' +
      '<button class="btn soft block" data-a="alt_pickfile">Ripristina da backup</button>' +
      '<input type="file" id="alt-file" accept="application/json,.json" data-i="alt_file" hidden>' +
      '<button class="btn danger block" data-a="alt_wipe">Cancella tutti i dati</button></div>' +
      '<p class="muted small" style="margin-top:12px">Il backup è un file che puoi tenere dove vuoi. I dati restano comunque solo su questo telefono.</p></div>';
    return h;
  }
};

function fallbackCopy(text){
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    P.toast(ok ? 'Copiato negli appunti' : 'Non sono riuscita a copiare');
  } catch(e) { P.toast('Non sono riuscita a copiare'); }
}
function copyText(text){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(() => P.toast('Copiato negli appunti'), () => fallbackCopy(text));
  } else fallbackCopy(text);
}
P.actions.alt_share = () => {
  const text = visitText();
  if(navigator.share){
    navigator.share({title: 'Riepilogo per la visita', text: text}).catch(e => {
      if(!e || e.name !== 'AbortError') copyText(text);
    });
  } else copyText(text);
};
P.actions.alt_print = () => { window.print(); };
P.actions.alt_backup = () => {
  const name = 'un-passo-' + P.ymd() + '.json';
  try {
    const json = JSON.stringify(P.S, null, 1);
    // dove il sistema lo permette, il foglio di condivisione con il file (su iPhone: Salva su File)
    if(typeof File === 'function' && navigator.share && navigator.canShare){
      const file = new File([json], name, {type: 'application/json'});
      if(navigator.canShare({files: [file]})){
        navigator.share({files: [file], title: 'Backup di Un passo'}).then(
          () => P.toast('Backup pronto'),
          e => { if(!e || e.name !== 'AbortError') P.toast('Non sono riuscita a salvare il backup'); });
        return;
      }
    }
    const blob = new Blob([json], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
    P.toast('Backup salvato');
  } catch(e) { P.toast('Non sono riuscita a salvare il backup'); }
};
P.actions.alt_pickfile = () => { const f = document.getElementById('alt-file'); if(f) f.click(); };
P.inputs.alt_file = el => {
  const f = el.files && el.files[0];
  el.value = '';
  if(!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data = null;
    try { data = JSON.parse(String(reader.result)); } catch(e) { data = null; }
    if(!data || typeof data !== 'object' || data.v === undefined || !Array.isArray(data.tasks)){
      P.toast('Questo file non è un backup di Un passo');
      return;
    }
    pendingBackup = data;
    const n = (k) => Array.isArray(data[k]) ? data[k].length : 0;
    confirmSheet('Ripristinare questo backup?',
      'Il backup contiene ' + n('tasks') + ' compiti, ' + n('thoughts') + ' registri dei pensieri e ' + n('checkins') + ' check-in. I dati che hai ora su questo telefono verranno sostituiti.',
      'Sostituisci i dati', 'alt_restore_do', '', true);
  };
  reader.onerror = () => P.toast('Non sono riuscita a leggere il file');
  reader.readAsText(f);
};
function defaults(){
  return {v: 1, tasks: [], parked: [], wins: [], thoughts: [], checkins: [], slips: [], samples: [],
    settings: {span: 25, pause: 5, meds: false, medsPerWeek: 7, sound: true, theme: 'auto'}, session: null, lastReview: null};
}
function replaceState(data){
  Object.keys(P.S).forEach(k => { delete P.S[k]; });
  Object.assign(P.S, data);
  const d = defaults();
  Object.keys(d).forEach(k => { if(P.S[k] === undefined) P.S[k] = d[k]; });
  P.S.session = P.S.session || null;
  P.save();
  T = null; C = null; winText = '';
  try { applyTheme(sets().theme); } catch(e) {}
}
P.actions.alt_restore_do = () => {
  if(!pendingBackup){ P.closeSheet(); return; }
  replaceState(pendingBackup);
  pendingBackup = null;
  P.closeSheet();
  P.toast('Backup ripristinato');
  P.render();
};
P.actions.alt_wipe = () => {
  confirmSheet('Cancellare tutti i dati?', 'Compiti, registri, check-in e impostazioni verranno cancellati da questo telefono. Se vuoi tenerli, salva prima un backup.', 'Continua', 'alt_wipe2', '', true);
};
P.actions.alt_wipe2 = () => {
  P.closeSheet();
  P.sheet(
    '<div class="grip"></div><h3>Ultima conferma</h3><p class="muted">Sei proprio sicura? Dopo questo passaggio non si torna indietro.</p>' +
    '<div class="stack"><button class="btn danger block" data-a="alt_wipe_do">Sì, cancella tutto</button>' +
    '<button class="btn soft block" data-a="core_close">No, tieni i miei dati</button></div>'
  );
};
P.actions.alt_wipe_do = () => {
  replaceState(defaults());
  P.closeSheet();
  P.toast('Dati cancellati');
  P.go('altro');
};
})();
