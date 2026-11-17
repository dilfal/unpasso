/* aiuto.js: schermata «Bloccata» (tab id `aiuto`).
   Una domanda per schermata. Stato non persistente in P.ui.params.help:
     { node: 'start'|'nostart'|'perfect'|'distract'|'overwhelm'|'uff'|'slip',
       gesto?, breath?: 'idle'|'running'|'done', breathStart?: ts, phrase?,
       step?: 0-3 (ripartenza), why?: [], small?, done?: bool, taskId? }
   Persistente: solo S.slips (schema del contratto), via P.aiuto.startSlip().
   Esporta: P.aiuto.startSlip(). Azioni aiu_*, input aiu_*.
   I nodi uff, worry, forget, avoid, buy, cards sono in emozioni.js (P.emozioni), che ha la precedenza. */
(function(){
'use strict';
const {S,esc}=P;

const IN_MS=4000, OUT_MS=6000, CYCLES=6;
const WHY=['stanchezza','troppo carico','un imprevisto','ho perso la routine','emozioni difficili','altro'];
const PHRASES=['il disagio passa','basta iniziare','non devo sentirmi pronta'];

let tmr=null;
function stopTimers(){ if(tmr){ clearInterval(tmr); tmr=null; } }

function H(){
  const p=P.ui.params||(P.ui.params={});
  if(!p.help||typeof p.help!=='object') p.help={node:'start'};
  return p.help;
}
function setNode(node,extra){
  stopTimers();
  P.ui.params.help=Object.assign({node:node},extra||{});
  P.render();
}
function reducedMotion(){
  try{ return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  catch(e){ return false; }
}

/* ---------- intestazione e spiegazioni ---------- */
function top(h){
  const atStart=h.node==='start';
  return '<div><button class="back" data-a="aiu_back"'+(atStart?' disabled style="opacity:.4"':'')+'>Indietro</button>'
    +'<h1>Sono bloccata</h1></div>'
    +'<p class="muted">Va bene fermarsi un momento. Non devi risolvere tutto: basta un passo piccolo, e lo scegliamo insieme.</p>';
}

const TEXT={
  nostart:{
    q:'Non so da dove cominciare',
    t:'Quando un compito è grande o vago, la mente non trova la porta d’ingresso e resta ferma davanti. Non serve un piano completo: serve un gesto così piccolo che non si può discutere, da fare per due minuti. Spesso, una volta partita, continuare costa molto meno che iniziare.'
  },
  perfect:{
    q:'Voglio che venga perfetto, quindi non parto',
    t:'«O è perfetto o non vale» è un pensiero tutto-o-niente: lascia solo due caselle, e il risultato perfetto non arriva mai a partire. Una versione brutta, fatta in un tempo fisso, ti porta comunque più avanti del nulla e si può sempre migliorare dopo. Per dieci minuti il tuo unico compito è produrre qualcosa di imperfetto.'
  },
  distract:{
    q:'Mi distraggo con altro',
    t:'Le distrazioni sembrano urgenti soprattutto perché non sono il compito noioso: sono più piacevoli, e la mente le spinge avanti. Durante il blocco, quando arriva un’idea o una cosa da fare, non seguirla: scrivila nel parcheggio pensieri e ci torni dopo la pausa. In pochi minuti quella cosa può aspettare.'
  },
  overwhelm:{
    q:'Sono sopraffatta o in ansia',
    t:'Ansia e ADHD si alimentano a vicenda: il caos fa salire l’ansia, e l’ansia toglie la lucidità che serve per mettere ordine. Prima di decidere qualsiasi cosa, abbassiamo un poco il corpo: un minuto di respiro lento, con l’espirazione più lunga dell’inspirazione.'
  },
  uff:{
    q:'Mi annoio e mi dà fastidio (uff)',
    t:'Noia e fastidio non dicono che stai sbagliando: dicono che il compito non dà ricompensa subito. Il disagio sale, tocca un picco e poi cala, se non lo segui scappando verso altro. Scegli una frase da ripeterti e resta ancora un po’.'
  }
};

/* ---------- nodi ---------- */
function nodeStart(){
  const cards=P.emozioni?P.emozioni.cardCount():0;
  return '<h2 class="big-q">Cosa succede adesso?</h2>'
    +'<p class="cap">Non riesco a fare una cosa</p>'
    +'<div class="stack">'
    +'<button class="opt" data-a="aiu_pick" data-v="nostart">Non so da dove cominciare</button>'
    +'<button class="opt" data-a="aiu_pick" data-v="perfect">Voglio che venga perfetto, quindi non parto</button>'
    +'<button class="opt" data-a="aiu_pick" data-v="distract">Mi distraggo con altro</button>'
    +'<button class="opt" data-a="aiu_pick" data-v="uff">Mi annoio e mi dà fastidio (uff)</button>'
    +'</div>'
    +'<p class="cap" style="margin-top:18px">Sto male o sono agitata</p>'
    +'<div class="stack">'
    +'<button class="opt" data-a="aiu_pick" data-v="overwhelm">Sono sopraffatta o in ansia</button>'
    +(P.emozioni
      ?'<button class="opt" data-a="emo_open" data-v="worry">Mi preoccupo: e se…</button>'
      +'<button class="opt" data-a="emo_open" data-v="forget">Continuo a pensare a una cosa da non dimenticare</button>'
      +'<button class="opt" data-a="emo_open" data-v="avoid">Sto evitando qualcosa che mi mette ansia</button>'
      +'<button class="opt" data-a="emo_open" data-v="buy">Sto per dire sì, o rispondere, d’impulso</button>'
      :'')
    +'<button class="opt" data-a="aiu_slip">Ho saltato dei giorni e mi sento in ritardo</button>'
    +'</div>'
    +(cards?'<div class="stack" style="margin-top:18px"><button class="btn soft block" data-a="emo_open" data-v="cards">Le mie carte ('+cards+')</button></div>':'');
}

function branchHead(k){
  return '<h2 class="big-q">'+esc(TEXT[k].q)+'</h2><p>'+esc(TEXT[k].t)+'</p>';
}

function nodeNostart(h){
  return branchHead('nostart')
    +'<div><label class="f" for="aiuGesto">Il mio gesto da due minuti</label>'
    +'<input type="text" id="aiuGesto" data-i="aiu_gesto" value="'+esc(h.gesto||'')+'" placeholder="per esempio: aprire il file e scrivere il titolo" autocomplete="off"></div>'
    +'<div class="stack">'
    +'<button class="btn block" data-a="aiu_go2">Parto per 2 minuti</button>'
    +'<button class="btn soft block" data-a="aiu_spezza">Spezzalo bene</button>'
    +'</div>';
}

function nodePerfect(){
  return branchHead('perfect')
    +'<div class="hint">Regola per questi dieci minuti: <b>niente rifiniture</b>. Se ti accorgi che stai sistemando, torna a fare la versione brutta.</div>'
    +'<div class="stack">'
    +'<button class="btn block" data-a="aiu_p10">10 minuti per una versione brutta</button>'
    +'<button class="btn soft block" data-a="aiu_thought">Scrivi il pensiero</button>'
    +'</div>';
}

function nodeDistract(){
  const n=Math.max(1,parseInt(S.settings&&S.settings.span,10)||25);
  return branchHead('distract')
    +'<div class="hint">Il blocco dura <b>'+n+' minuti</b>. Il parcheggio pensieri è nella schermata del timer: lì metti tutto quello che ti viene in mente, senza giudicarlo.</div>'
    +'<button class="btn block" data-a="aiu_block">Riparti per un blocco</button>';
}

function nodeUff(h){
  const chips=PHRASES.map(function(p){
    return '<button class="chip" data-a="aiu_phrase" data-v="'+esc(p)+'" aria-pressed="'+(h.phrase===p?'true':'false')+'">'+esc(p)+'</button>';
  }).join('');
  return branchHead('uff')
    +'<div class="cluster">'+chips+'</div>'
    +(h.phrase?'<div class="card-line"><p class="big-q" style="font-size:1.35rem;margin:0">'+esc(h.phrase.charAt(0).toUpperCase()+h.phrase.slice(1))+'.</p></div>':'')
    +'<button class="btn block" data-a="aiu_uff10">Resto 10 minuti, poi rivaluto</button>';
}

function nodeOverwhelm(h){
  const total=CYCLES;
  let mid='';
  if(h.breath==='running'){
    const reduce=reducedMotion();
    mid='<div role="timer" aria-label="Respiro guidato">'
      +'<div class="breath" id="aiuBreath"'+(reduce?' style="background:transparent;border-color:transparent"':'')+'>inspira</div>'
      +'<p class="muted small" id="aiuCount" style="text-align:center" aria-live="off">Respiro 1 di '+total+'</p></div>'
      +'<button class="btn ghost block" data-a="aiu_breathStop">Mi fermo qui</button>';
  }else if(h.breath==='done'){
    mid='<div class="hint">Bene. Il corpo è un poco più giù. Adesso scegli una cosa sola.</div>'
      +(P.emozioni
        ?'<p class="cap" style="margin:4px 0 0">Che cosa c’è sotto?</p><div class="stack">'
        +'<button class="opt" data-a="emo_open" data-v="worry">Mi preoccupo: e se…</button>'
        +'<button class="opt" data-a="emo_open" data-v="forget">Ho paura di dimenticare qualcosa</button>'
        +'<button class="opt" data-a="emo_open" data-v="avoid">Sto evitando qualcosa</button></div>'
        :'')
      +'<div class="stack">'
      +'<button class="btn block" data-a="aiu_q5">Un blocco piccolo da 5 minuti</button>'
      +'<button class="btn soft block" data-a="aiu_thought">Scrivi il pensiero</button>'
      +'<button class="btn ghost block" data-a="aiu_breathStart">Respiro ancora un minuto</button>'
      +'</div>';
  }else{
    mid='<button class="btn block" data-a="aiu_breathStart">Respiro per un minuto</button>';
  }
  return branchHead('overwhelm')+mid;
}

/* ---------- ripartenza ---------- */
function dots(n){
  let s='';
  for(let i=0;i<4;i++) s+='<i'+(i<n?' class="on"':'')+'></i>';
  return '<div class="dots" aria-hidden="true">'+s+'</div>';
}
function prevBtn(h){
  return h.step>0?'<button class="btn ghost block" data-a="aiu_prev">Passo precedente</button>':'';
}

function nodeSlip(h){
  if(h.done){
    return dots(4)
      +'<h2 class="big-q">Sei ripartita.</h2>'
      +'<p>Il tuo passo di oggi è in cima ai compiti: <b>'+esc(h.small||'')+'</b>. Se te la senti, fai subito dieci minuti, così il ritardo smette di pesare.</p>'
      +'<div class="stack">'
      +'<button class="btn block" data-a="aiu_slip10">Parti per 10 minuti</button>'
      +'<button class="btn soft block" data-a="aiu_oggi">Vai a Oggi</button>'
      +'</div>';
  }
  const s=h.step||0;
  if(s===0){
    return dots(1)
      +'<h2 class="big-q">Succede, non è un azzeramento</h2>'
      +'<p>Saltare dei giorni capita a quasi tutti, e con l’ADHD capita ancora più spesso. Non cancella quello che hai già fatto e non significa che devi recuperare tutto: si riparte da qui, con un passo piccolo.</p>'
      +'<button class="btn block" data-a="aiu_next">Avanti</button>';
  }
  if(s===1){
    const chips=WHY.map(function(w){
      return '<button class="chip" data-a="aiu_why" data-v="'+esc(w)+'" aria-pressed="'+((h.why||[]).indexOf(w)>=0?'true':'false')+'">'+esc(w)+'</button>';
    }).join('');
    return dots(2)
      +'<h2 class="big-q">Cosa si è messo in mezzo?</h2>'
      +'<p class="muted">Puoi sceglierne più di una, o nessuna. Non serve per giudicare: serve per capire.</p>'
      +'<div class="cluster">'+chips+'</div>'
      +'<div class="stack"><button class="btn block" data-a="aiu_next">Avanti</button>'+prevBtn(h)+'</div>';
  }
  if(s===2){
    return dots(3)
      +'<h2 class="big-q">Il passo più piccolo che riprenderesti oggi</h2>'
      +'<p class="muted">Così piccolo da sembrare quasi troppo facile.</p>'
      +'<input type="text" id="aiuSmall" data-i="aiu_small" aria-label="Il passo più piccolo che riprenderesti oggi" value="'+esc(h.small||'')+'" placeholder="per esempio: rispondere a una sola email" autocomplete="off">'
      +'<div class="stack"><button class="btn block" data-a="aiu_next">Avanti</button>'+prevBtn(h)+'</div>';
  }
  const tags=(h.why||[]).map(function(w){ return '<span class="tag">'+esc(w)+'</span>'; }).join('');
  return dots(4)
    +'<h2 class="big-q">Ripartiamo da qui?</h2>'
    +(tags?'<div>'+tags+'</div>':'')
    +'<div class="card-line"><p style="margin:0"><b>'+esc(h.small||'')+'</b></p></div>'
    +'<p class="muted">Lo metto tra i compiti importanti di oggi.</p>'
    +'<div class="stack"><button class="btn block" data-a="aiu_confirm">Sì, riparto da qui</button>'+prevBtn(h)+'</div>';
}

/* ---------- schermata ---------- */
P.screens.aiuto={
  render(){
    stopTimers();
    const h=H();
    let body;
    if(P.emozioni&&P.emozioni.owns(h.node)){ return top(h)+P.emozioni.render(h); }
    switch(h.node){
      case 'nostart': body=nodeNostart(h); break;
      case 'perfect': body=nodePerfect(h); break;
      case 'distract': body=nodeDistract(h); break;
      case 'overwhelm': body=nodeOverwhelm(h); break;
      case 'uff': body=nodeUff(h); break;
      case 'slip': body=nodeSlip(h); break;
      default: h.node='start'; body=nodeStart(h);
    }
    return top(h)+body;
  },
  after(){ runBreath(); }
};

/* ---------- respiro guidato ---------- */
function runBreath(){
  stopTimers();
  const h0=H();
  if(h0.node!=='overwhelm'||h0.breath!=='running') return;
  const reduce=reducedMotion();
  const cycle=IN_MS+OUT_MS, total=CYCLES*cycle;
  let last='', lastN=0;
  const tick=function(){
    const h=H();
    const el=P.$('#aiuBreath');
    if(!el||P.ui.tab!=='aiuto'||h.node!=='overwhelm'||h.breath!=='running'){ stopTimers(); return; }
    const e=Date.now()-h.breathStart;
    if(e>=total){
      stopTimers();
      h.breath='done';
      P.render();
      return;
    }
    const ph=(e%cycle)<IN_MS?'in':'out';
    if(ph!==last){
      last=ph;
      el.textContent=ph==='in'?'inspira':'espira';
      if(!reduce){ el.classList.remove('in','out'); el.classList.add(ph); }
    }
    const n=Math.floor(e/cycle)+1;
    if(n!==lastN){
      lastN=n;
      const c=P.$('#aiuCount');
      if(c) c.textContent='Respiro '+n+' di '+CYCLES;
    }
  };
  tick();
  if(H().breath==='running') tmr=setInterval(tick,200);
}

/* ---------- azioni ---------- */
const A=P.actions;
A.aiu_back=function(){ if(H().node!=='start') setNode('start'); };
A.aiu_pick=function(el){ setNode(el.dataset.v); };
A.aiu_slip=function(){ P.aiuto.startSlip(); };

/* 1. nessun inizio */
A.aiu_go2=function(){
  const h=H();
  const g=(h.gesto||'').trim();
  if(!g){ P.toast('Scrivi un gesto piccolo, anche solo aprire il file.'); return; }
  P.startSession({kind:'quick',title:g,minutes:2});
};
A.aiu_spezza=function(){ P.inizia.begin({}); };

/* 2. perfezionismo */
A.aiu_p10=function(){ P.startSession({kind:'quick',title:'Una versione brutta',minutes:10}); };
A.aiu_thought=function(){ P.altro.openThought(); };

/* 3. distrazione */
A.aiu_block=function(){
  const n=Math.max(1,parseInt(S.settings&&S.settings.span,10)||25);
  P.startSession({kind:'work',minutes:n});
};

/* 4. sopraffatta */
A.aiu_breathStart=function(){
  const h=H();
  h.breath='running';
  h.breathStart=Date.now();
  P.render();
};
A.aiu_breathStop=function(){
  stopTimers();
  H().breath='done';
  P.render();
};
A.aiu_q5=function(){ P.startSession({kind:'quick',title:'Un blocco piccolo',minutes:5}); };

/* 5. uff */
A.aiu_phrase=function(el){
  const h=H();
  h.phrase=(h.phrase===el.dataset.v)?'':el.dataset.v;
  P.render();
};
A.aiu_uff10=function(){ P.startSession({kind:'quick',title:'Dieci minuti, poi rivaluto',minutes:10}); };

/* 6. ripartenza */
A.aiu_next=function(){
  const h=H();
  if(h.node!=='slip') return;
  if(h.step===2&&!(h.small||'').trim()){ P.toast('Scrivi un passo piccolo, anche minuscolo.'); return; }
  if(h.step<3){ h.step++; P.render(); }
};
A.aiu_prev=function(){
  const h=H();
  if(h.node==='slip'&&h.step>0){ h.step--; P.render(); }
};
A.aiu_why=function(el){
  const h=H();
  const v=el.dataset.v;
  h.why=h.why||[];
  const i=h.why.indexOf(v);
  if(i>=0) h.why.splice(i,1); else h.why.push(v);
  P.render();
};
A.aiu_confirm=function(){
  const h=H();
  if(h.done) return;
  const small=(h.small||'').trim();
  if(!small){ h.step=2; P.render(); P.toast('Scrivi un passo piccolo, anche minuscolo.'); return; }
  const task=P.oggi.addTask({title:small,prio:'A',date:P.ymd()});
  S.slips.push({id:P.uid(),ts:Date.now(),why:(h.why||[]).slice(),smallStep:small});
  P.save();
  P.win('Sono ripartita: '+small,'restart');
  h.small=small;
  h.taskId=task&&task.id;
  h.done=true;
  P.render();
};
A.aiu_slip10=function(){
  const h=H();
  const o={kind:'quick',title:h.small||'Ripartenza',minutes:10};
  if(h.taskId) o.taskId=h.taskId;
  P.startSession(o);
};
A.aiu_oggi=function(){ P.go('oggi'); };

/* ---------- input (senza ridisegnare) ---------- */
P.inputs.aiu_gesto=function(el){ H().gesto=el.value; };
P.inputs.aiu_small=function(el){ H().small=el.value; };

/* ---------- esportazione ---------- */
P.aiuto={
  startSlip(){
    stopTimers();
    P.go('aiuto',null,{help:{node:'slip',step:0,why:[],small:'',done:false}});
  }
};
})();
