/* Un passo: inizia.js
 * Percorso guidato «Inizia» (pianificazione di un compito). Prefisso azioni e input: ini_
 *
 * Stato: P.ui.params.wiz = {step, taskId, title, steps:[{id,t,done}], first, date, time, where,
 *   minutes, barriers:[{if,then}]}  (solo in memoria: la bozza NON va in S finché non si salva).
 * Campi extra opzionali di wiz: newTitle (testo del campo «Qualcosa di nuovo»), fromNew (true se il
 *   compito è nuovo e ancora da creare).
 * Esporta: P.inizia.begin({taskId?, title?}).
 */
(function(){
'use strict';

const esc = P.esc;
const st = () => P.S;            // letto a ogni uso: P.S può essere sostituito (import)
const LAST = 5;                  // passi 0..5 (5 = riepilogo)
const draft = {step:'', bnew:''};  // testi non ancora aggiunti
let refocus = null;

const FIRSTS = ['Apro il file','Prendo il materiale','Vado alla scrivania','Metto il timer'];
const BARRIERS = [
  {k:'tel',  label:'il telefono',                     if:'il telefono mi distrae',               then:'lo metto in un\'altra stanza'},
  {k:'altro',label:'mi viene in mente altro',         if:'mi viene in mente altro',              then:'lo scrivo nel parcheggio pensieri e torno qui'},
  {k:'ansia',label:'mi sale l\'ansia o il fastidio',  if:'mi sale l\'ansia o il fastidio',       then:'respiro per un minuto, poi continuo 5 minuti e rivaluto'},
  {k:'stanca',label:'sono stanca',                    if:'sono stanca',                          then:'riduco il blocco a 10 minuti'},
  {k:'perf', label:'voglio farlo perfetto',           if:'voglio farlo perfetto',                then:'scrivo una prima versione brutta'},
  {k:'interr',label:'mi interrompono',                if:'mi interrompono',                      then:'annoto a che punto sono e riprendo da lì'}
];

const pad = n => (n < 10 ? '0' : '') + n;
const span = () => ((st().settings && st().settings.span) || 25);

function fresh(){
  return {step:0, taskId:null, title:'', steps:[], first:'', date:P.ymd(), time:'', where:'',
          minutes:span(), barriers:[], newTitle:'', fromNew:false, why:''};
}
function reset(){ draft.step=''; draft.bnew=''; refocus=null; }
function wiz(){
  if(!P.ui.params || typeof P.ui.params !== 'object') P.ui.params = {};
  let w = P.ui.params.wiz;
  if(!w){ w = P.ui.params.wiz = fresh(); }
  if(!Array.isArray(w.steps)) w.steps = [];
  if(!Array.isArray(w.barriers)) w.barriers = [];
  if(typeof w.step !== 'number') w.step = 0;
  if(!w.minutes) w.minutes = span();
  if(!w.date) w.date = P.ymd();
  return w;
}
function clearWiz(){ if(P.ui.params) P.ui.params.wiz = null; reset(); }

function loadTask(w, t){
  const today = P.ymd();
  const p = t.plan || {};
  w.taskId = t.id; w.title = t.title; w.fromNew = false; w.newTitle = '';
  w.steps = (t.steps || []).map(s => ({id:s.id || P.uid(), t:s.t, done:!!s.done}));
  w.first = p.first || '';
  w.why = t.why || '';
  const d = p.date || t.date;
  w.date = (d && d >= today) ? d : today;
  w.time = p.time || '';
  w.where = p.where || '';
  w.minutes = p.minutes || span();
  w.barriers = (p.barriers || []).map(b => ({if:b.if, then:b.then}));
}
function selectNew(w, title){
  const f = fresh();
  Object.keys(f).forEach(k => { w[k] = f[k]; });
  w.title = title; w.newTitle = title; w.fromNew = true; w.step = 0;
  reset();
}

/* ---------- calcoli ---------- */
function endTime(w){
  const m = /^(\d{1,2}):(\d{2})$/.exec(w.time || '');
  if(!m) return '';
  let tot = (+m[1]) * 60 + (+m[2]) + (+w.minutes || 0);
  tot = ((tot % 1440) + 1440) % 1440;
  return pad(Math.floor(tot / 60)) + ':' + pad(tot % 60);
}
function endHtml(w){
  const e = endTime(w);
  return e ? 'Finisce alle <b>' + e + '</b>.' : 'Scegli un\'ora e vedrai quando finisce.';
}
function dayWord(w){
  const today = P.ymd();
  if(w.date === today) return 'oggi';
  if(w.date === P.addDays(today, 1)) return 'domani';
  return P.fmtDate(w.date);
}
function cleanBarriers(w){
  return w.barriers.map(b => ({if:(b.if||'').trim(), then:(b.then||'').trim()})).filter(b => b.if && b.then);
}
function flushStepDraft(w){
  const t = draft.step.trim();
  if(t){ w.steps.push({id:P.uid(), t:t, done:false}); }
  draft.step = '';
}
function flushBarrierDraft(w){
  const t = draft.bnew.trim();
  if(t){ w.barriers.push({if:t, then:''}); }
  draft.bnew = '';
}

/* ---------- salvataggio ---------- */
function persist(w){
  const S = st();
  const title = (w.title || '').trim();
  let task = w.taskId ? S.tasks.find(t => t.id === w.taskId) : null;
  if(!task){
    let made = null;
    if(P.oggi && P.oggi.addTask){
      try { made = P.oggi.addTask({title:title, prio:'B', date:w.date}); } catch(e){ made = null; }
    }
    if(made && made.id){ task = S.tasks.find(t => t.id === made.id) || made; }
    if(!task){
      task = {id:P.uid(), title:title, prio:'B', date:w.date, done:false, doneAt:null, created:Date.now(), steps:[], plan:null};
      S.tasks.push(task);
    } else if(S.tasks.indexOf(task) < 0){
      S.tasks.push(task);
    }
  }
  task.steps = w.steps.filter(s => (s.t || '').trim()).map(s => ({id:s.id || P.uid(), t:s.t.trim(), done:!!s.done}));
  task.plan = {
    first:(w.first || '').trim(),
    date:w.date,
    time:w.time || '',
    where:(w.where || '').trim(),
    minutes:+w.minutes || span(),
    barriers:cleanBarriers(w)
  };
  task.why = (w.why || '').trim();
  task.date = task.plan.date;
  P.save();
  return task;
}

/* ---------- schermate ---------- */
function dots(n){
  let h = '';
  for(let i = 0; i <= LAST; i++) h += '<i' + (i <= n ? ' class="on"' : '') + '></i>';
  return '<div class="dots" role="img" aria-label="Passo ' + (n + 1) + ' di ' + (LAST + 1) + '">' + h + '</div>';
}
function nav(w){
  if(w.step === LAST){
    return '<div class="stack">' +
      '<button class="btn block" data-a="ini_go">Parti adesso</button>' +
      '<button class="btn soft block" data-a="ini_save">Salva nel piano</button>' +
      '<button class="btn ghost block" data-a="ini_back">Indietro</button></div>';
  }
  return '<div class="stack"><button class="btn block" data-a="ini_next">Avanti</button>' +
    (w.step > 0 ? '<div class="row2"><button class="btn ghost sm" data-a="ini_back">Indietro</button>' +
                  '<button class="btn ghost sm" data-a="ini_skip">Salta</button></div>' : '') + '</div>';
}
function head(w, q, intro){
  return '<div><h2 class="big-q">' + q + '</h2>' +
    (w.step > 0 ? '<p class="muted small" style="margin:8px 0 0">Compito: <b>' + esc(w.title) + '</b></p>' : '') +
    (intro ? '<p class="muted" style="margin:8px 0 0">' + intro + '</p>' : '') + '</div>';
}

function r0(w){
  const today = P.ymd();
  const rank = {A:0, B:1, C:2};
  const cmp = (a, b) => ((rank[a.prio] !== undefined ? rank[a.prio] : 1) - (rank[b.prio] !== undefined ? rank[b.prio] : 1)) ||
                        ((a.created || 0) - (b.created || 0));
  const open = st().tasks.filter(t => !t.done);
  const g1 = open.filter(t => t.date && t.date <= today).sort(cmp);
  const g2 = open.filter(t => !(t.date && t.date <= today)).sort(cmp);
  const typed = (w.newTitle || '').trim() !== '';
  const item = t => {
    const sel = !typed && w.taskId === t.id;
    const bits = [];
    if(t.date === today) bits.push('oggi'); else if(t.date) bits.push(P.fmtDate(t.date));
    if(t.steps && t.steps.length) bits.push(t.steps.length + (t.steps.length === 1 ? ' passo' : ' passi'));
    if(t.plan) bits.push('ha già un piano');
    return '<button class="opt" data-a="ini_pick" data-id="' + esc(t.id) + '" aria-pressed="' + sel + '"' +
      (sel ? ' style="border-color:var(--sea);background:var(--foam)"' : '') + '>' +
      '<span><span class="prio ' + esc(t.prio) + '">' + esc(t.prio) + '</span>' + esc(t.title) +
      (bits.length ? '<span class="s">' + esc(bits.join(' · ')) + '</span>' : '') + '</span>' +
      (sel ? '<span class="tag">scelto</span>' : '') + '</button>';
  };
  const group = (title, list) => list.length
    ? '<div class="group" style="margin-top:0"><h3 style="margin-bottom:8px">' + title + '</h3><div class="stack menu">' + list.map(item).join('') + '</div></div>' : '';
  let list = group('Per oggi', g1) + group(g1.length ? 'Gli altri compiti' : 'I tuoi compiti', g2);
  if(!open.length) list = '<p class="empty">Non hai ancora compiti aperti. Scrivine uno qui sotto.</p>';
  return dots(0) +
    head(w, 'Da cosa partiamo?', 'Tocca un compito che hai già, oppure scrivine uno nuovo.') +
    list +
    '<form data-ini="new" autocomplete="off"><label class="f" for="ini-new">Qualcosa di nuovo</label>' +
    '<input id="ini-new" type="text" data-i="ini_new" enterkeyhint="go" value="' + esc(w.newTitle || '') + '" placeholder="Per esempio: chiamare il commercialista"></form>' +
    nav(w);
}

function r1(w){
  const rows = w.steps.map(s =>
    '<li class="task' + (s.done ? ' done' : '') + '"><span class="body"><span class="ttl">' + esc(s.t) + '</span></span>' +
    '<button class="xbtn" data-a="ini_stepdel" data-id="' + esc(s.id) + '" aria-label="Elimina il passo: ' + esc(s.t) + '">×</button></li>'
  ).join('');
  return dots(1) +
    head(w, 'Passi', 'Scrivi i passi piccoli, uno alla volta. Ognuno deve essere abbastanza breve da stare in un solo blocco di tempo.') +
    (rows ? '<ul class="list stepsl">' + rows + '</ul>' : '<p class="empty">Ancora nessun passo. Va bene anche partire con uno solo.</p>') +
    '<form class="addrow" data-ini="step" autocomplete="off">' +
    '<input type="text" data-i="ini_stepnew" enterkeyhint="done" aria-label="Nuovo passo" value="' + esc(draft.step) + '" placeholder="Il prossimo passo piccolo">' +
    '<button type="submit" class="btn">Aggiungi</button></form>' +
    '<div class="hint">Se un passo ti fa dire «uff», spezzalo ancora: <b>più è piccolo, più è facile cominciare</b>.</div>' +
    nav(w);
}

function r2(w){
  const chips = FIRSTS.map(f =>
    '<button class="chip" data-a="ini_first" data-v="' + esc(f) + '" aria-pressed="' + (w.first === f) + '">' + esc(f) + '</button>').join('');
  return dots(2) +
    head(w, 'Primo gesto', 'Qual è il gesto più piccolo che ti mette in movimento? Non deve far avanzare il lavoro: serve solo a partire.') +
    '<div><label class="f" for="ini-first">Il mio primo gesto</label>' +
    '<input id="ini-first" type="text" data-i="ini_first" value="' + esc(w.first) + '" placeholder="Per esempio: apro il file"></div>' +
    '<div><p class="muted small" style="margin-bottom:8px">Qualche idea</p><div class="cluster">' + chips + '</div></div>' +
    '<div><label class="f" for="ini-why">Perché mi importa <span class="muted small">(facoltativo)</span></label>' +
    '<input id="ini-why" type="text" data-i="ini_why" value="' + esc(w.why || '') + '" placeholder="Per esempio: così smetto di pensarci" autocomplete="off">' +
    '<p class="muted small" style="margin:6px 0 0">Te lo ricordo quando stai per partire.</p></div>' +
    nav(w);
}

function r3(w){
  const today = P.ymd(), tomorrow = P.addDays(today, 1);
  const sp = span();
  const vals = [10, 15, 25, 40, 60];
  if(vals.indexOf(sp) < 0){ vals.push(sp); vals.sort((a, b) => a - b); }
  const chips = vals.map(v =>
    '<button class="chip" data-a="ini_min" data-v="' + v + '" aria-pressed="' + (w.minutes === v) + '"' +
    (v === sp ? ' style="border-color:var(--saffron);border-width:3px" title="La tua soglia di attenzione"' : '') + '>' + v + '</button>').join('');
  const other = (w.date !== today && w.date !== tomorrow)
    ? '<p class="muted small" style="margin:8px 0 0">Giorno già scelto: ' + esc(P.fmtDate(w.date)) + '</p>' : '';
  const warn = w.minutes > 2.5 * sp;
  return dots(3) +
    head(w, 'Quando, dove, quanto', 'Un piano preciso è più facile da seguire di una buona intenzione.') +
    '<div><label class="f">Giorno</label><div class="seg">' +
    '<button data-a="ini_day" data-v="today" aria-pressed="' + (w.date === today) + '">Oggi</button>' +
    '<button data-a="ini_day" data-v="tomorrow" aria-pressed="' + (w.date === tomorrow) + '">Domani</button></div>' + other + '</div>' +
    '<div><label class="f" for="ini-time">Ora</label><input id="ini-time" type="time" data-i="ini_time" value="' + esc(w.time) + '"></div>' +
    '<div><label class="f" for="ini-where">Dove</label>' +
    '<input id="ini-where" type="text" data-i="ini_where" value="' + esc(w.where) + '" placeholder="Per esempio: scrivania, cucina, biblioteca"></div>' +
    '<div><label class="f">Quanto</label>' +
    '<div class="stepper"><button data-a="ini_dec" aria-label="Meno tempo">−</button><output aria-live="polite">' + w.minutes + ' min</output>' +
    '<button data-a="ini_inc" aria-label="Più tempo">+</button></div>' +
    '<div class="cluster" style="margin-top:12px">' + chips + '</div>' +
    '<p class="muted small" style="margin:8px 0 0">Il bordo giallo è la tua soglia di attenzione (' + sp + ' min).</p></div>' +
    '<div class="hint" id="ini-end" aria-live="polite">' + endHtml(w) + '</div>' +
    '<div class="hint" id="ini-warn"' + (warn ? '' : ' hidden') + '>Pensa a una giornata normale, non alla migliore: meglio un blocco che riesci a superare.</div>' +
    nav(w);
}

function r4(w){
  const chips = BARRIERS.map(p =>
    '<button class="chip" data-a="ini_barrier" data-v="' + p.k + '" aria-pressed="' + w.barriers.some(b => b.if === p.if) + '">' + esc(p.label) + '</button>').join('');
  const rows = w.barriers.map((b, i) =>
    '<div class="card-line stack"><label class="f" for="ini-b' + i + '" style="margin:0">Se ' + esc(b.if) + ', allora</label>' +
    '<div class="addrow"><input id="ini-b' + i + '" type="text" data-i="ini_bthen" data-id="' + i + '" value="' + esc(b.then) + '" placeholder="Che cosa farai?">' +
    '<button class="xbtn" data-a="ini_bdel" data-id="' + i + '" aria-label="Togli questo ostacolo">×</button></div></div>').join('');
  return dots(4) +
    head(w, 'Cosa potrebbe intralciarti?', 'Pensa agli ostacoli probabili e decidi in anticipo che cosa farai. Tocca quelli che ti riguardano.') +
    '<div class="cluster">' + chips + '</div>' +
    (rows ? '<div class="stack" style="gap:16px">' + rows + '</div>' : '') +
    '<form data-ini="bnew" autocomplete="off"><label class="f" for="ini-bnew">Un altro ostacolo, con parole tue</label>' +
    '<div class="addrow"><input id="ini-bnew" type="text" data-i="ini_bnew" enterkeyhint="done" value="' + esc(draft.bnew) + '" placeholder="Per esempio: arriva una mail urgente">' +
    '<button type="submit" class="btn soft">Aggiungi</button></div></form>' +
    nav(w);
}

function r5(w){
  const steps = w.steps.filter(s => (s.t || '').trim());
  const bars = cleanBarriers(w);
  const end = endTime(w);
  const line = (k, v) => '<div class="card-line"><b>' + k + '</b><br>' + v + '</div>';
  return dots(5) +
    head(w, 'Riepilogo', 'Ecco il tuo piano. Puoi partire adesso oppure tenerlo per dopo.') +
    '<div class="stack" style="gap:14px">' +
    line('Compito', esc(w.title)) +
    line('Passi', steps.length ? '<ol style="margin:4px 0 0;padding-left:20px">' + steps.map(s => '<li>' + esc(s.t) + '</li>').join('') + '</ol>' : 'nessuno scritto') +
    line('Primo gesto', (w.first || '').trim() ? esc(w.first.trim()) : 'non scelto') +
    ((w.why || '').trim() ? line('Perché mi importa', esc(w.why.trim())) : '') +
    line('Quando', esc(dayWord(w)) + (w.time ? ' alle ' + esc(w.time) : ', senza un\'ora fissa')) +
    line('Dove', (w.where || '').trim() ? esc(w.where.trim()) : 'non deciso') +
    line('Quanto', w.minutes + ' minuti' + (end ? ', finisci alle ' + end : '')) +
    line('Se capita un ostacolo', bars.length ? bars.map(b => 'Se ' + esc(b.if) + ', allora ' + esc(b.then) + '.').join('<br>') : 'nessuno previsto') +
    '</div>' + nav(w);
}

/* ---------- registro ---------- */
function show(){ P.render(); try { window.scrollTo(0, 0); } catch(e){} }

P.screens.inizia = {
  render(){
    const w = wiz();
    if(w.step > 0 && !(w.title || '').trim()){ w.step = 0; }
    const f = [r0, r1, r2, r3, r4, r5][Math.max(0, Math.min(LAST, w.step))];
    return f(w);
  },
  after(){
    document.querySelectorAll('#main form[data-ini]').forEach(f => f.addEventListener('submit', onSubmit));
    if(refocus){
      const el = document.querySelector(refocus); refocus = null;
      if(el) el.focus();
    }
  }
};

function onSubmit(e){
  e.preventDefault();
  const f = e.currentTarget, w = wiz();
  const inp = f.querySelector('input[type=text]');
  const val = inp ? inp.value.trim() : '';
  const kind = f.dataset.ini;
  if(kind === 'new'){
    if(!val){ P.toast('Scrivi che cosa vuoi fare.'); return; }
    if(!(w.fromNew && w.title === val)) selectNew(w, val);
    w.step = 1; show();
  } else if(kind === 'step'){
    if(!val) return;
    w.steps.push({id:P.uid(), t:val, done:false});
    draft.step = ''; refocus = '#main [data-i="ini_stepnew"]'; P.render();
  } else if(kind === 'bnew'){
    if(!val) return;
    w.barriers.push({if:val, then:''});
    draft.bnew = ''; refocus = '#main [data-i="ini_bthen"][data-id="' + (w.barriers.length - 1) + '"]'; P.render();
  }
}

const A = P.actions;

A.ini_pick = el => {
  const w = wiz(), t = st().tasks.find(x => x.id === el.dataset.id);
  if(!t) return;
  if(w.taskId !== t.id || (w.newTitle || '').trim()){ loadTask(w, t); w.step = 0; reset(); }
  P.render();
};
A.ini_next = () => {
  const w = wiz();
  if(w.step === 0){
    const nt = (w.newTitle || '').trim();
    if(nt){ if(!(w.fromNew && w.title === nt)) selectNew(w, nt); }
    else if(!w.taskId){ P.toast('Scegli un compito o scrivine uno nuovo.'); return; }
  } else if(w.step === 1){ flushStepDraft(w); }
  else if(w.step === 4){ flushBarrierDraft(w); }
  w.step = Math.min(LAST, w.step + 1); show();
};
A.ini_skip = () => { const w = wiz(); w.step = Math.min(LAST, w.step + 1); show(); };
A.ini_back = () => { const w = wiz(); w.step = Math.max(0, w.step - 1); show(); };
A.ini_stepdel = el => { const w = wiz(); w.steps = w.steps.filter(s => s.id !== el.dataset.id); P.render(); };
A.ini_first = el => { const w = wiz(), v = el.dataset.v; w.first = (w.first === v) ? '' : v; P.render(); };
A.ini_day = el => {
  const w = wiz(), today = P.ymd();
  w.date = el.dataset.v === 'tomorrow' ? P.addDays(today, 1) : today;
  P.render();
};
A.ini_min = el => { wiz().minutes = +el.dataset.v || span(); P.render(); };
A.ini_dec = () => { const w = wiz(); w.minutes = Math.max(5, (+w.minutes || span()) - 5); P.render(); };
A.ini_inc = () => { const w = wiz(); w.minutes = Math.min(180, (+w.minutes || span()) + 5); P.render(); };
A.ini_barrier = el => {
  const w = wiz(), p = BARRIERS.find(x => x.k === el.dataset.v);
  if(!p) return;
  if(w.barriers.some(b => b.if === p.if)) w.barriers = w.barriers.filter(b => b.if !== p.if);
  else w.barriers.push({if:p.if, then:p.then});
  P.render();
};
A.ini_bdel = el => { const w = wiz(); w.barriers.splice(+el.dataset.id, 1); P.render(); };
A.ini_save = () => {
  const w = wiz();
  const task = persist(w);
  clearWiz();
  P.toast('Salvato nel piano');
  P.go('oggi');
  return task;
};
A.ini_go = () => {
  const w = wiz();
  w.date = P.ymd();   // «Parti adesso» vale per oggi
  const task = persist(w);
  const opts = {
    kind:'work', taskId:task.id, title:task.title, minutes:task.plan.minutes, first:task.plan.first,
    barriers:task.plan.barriers.map(b => ({if:b.if, then:b.then})),
    steps:task.steps.map(s => ({id:s.id, t:s.t, done:s.done})), skipReady:true
  };
  clearWiz();
  if(P.audioUnlock) P.audioUnlock();
  if(P.startSession) P.startSession(opts);
  else P.go('oggi');
};

/* ---------- input (senza ridisegnare) ---------- */
const I = P.inputs;

I.ini_new = el => {
  const w = wiz();
  w.newTitle = el.value;
  if(el.value.trim()){
    w.taskId = null;
    document.querySelectorAll('#main [data-a="ini_pick"]').forEach(b => {
      b.setAttribute('aria-pressed', 'false'); b.removeAttribute('style');
      const tg = b.querySelector('.tag'); if(tg) tg.remove();
    });
  }
};
I.ini_stepnew = el => { draft.step = el.value; };
I.ini_bnew = el => { draft.bnew = el.value; };
I.ini_first = el => { wiz().first = el.value; };
I.ini_why = el => { wiz().why = el.value; };
I.ini_where = el => { wiz().where = el.value; };
I.ini_time = el => {
  const w = wiz(); w.time = el.value;
  const e = document.getElementById('ini-end'); if(e) e.innerHTML = endHtml(w);
};
I.ini_bthen = el => {
  const b = wiz().barriers[+el.dataset.id];
  if(b) b.then = el.value;
};

/* ---------- esportazione ---------- */
P.inizia = P.inizia || {};
P.inizia.begin = function(opts){
  opts = opts || {};
  reset();
  const w = fresh();
  const t = opts.taskId ? st().tasks.find(x => x.id === opts.taskId) : null;
  if(t){ loadTask(w, t); w.step = 1; }
  else if(opts.title && String(opts.title).trim()){
    selectNew(w, String(opts.title).trim()); w.step = 1;
  }
  P.go('inizia', null, {wiz:w});
};

})();
