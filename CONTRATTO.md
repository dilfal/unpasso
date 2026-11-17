# Contratto dei moduli: app «Un passo» (PWA ADHD, italiano, iPhone)

Cartella: `C:\Users\df\Dev\GitHub\web app\ADHD`. JS vanilla, nessuna libreria, nessun CDN, tutto offline. Stili già in `styles.css` (leggilo: classi `.btn .btn.soft .btn.ghost .btn.sm .btn.block .chip[aria-pressed] .seg .list .task .check .prio.A .group .hint .opt .stack .cluster .addrow .dots i.on .stepper .big-q .sheet .scrim .banner .row2 .menu .thought .tag .schede .toast`, variabili `--sea --saffron --foam --ink --ink2 --line --paper --surface --wine`). Se ti serve una classe nuova, aggiungila in fondo a `styles.css` con un commento col nome del tuo modulo (non toccare il resto).

Tono: italiano, dai del tu, femminile dove serve (la paziente è una donna adulta, laureata in medicina, lavora). Calmo, sobrio, mai colpevolizzante, frasi brevi, frasi in minuscolo dopo il punto (sentence case), niente MAIUSCOLO per etichette, niente emoji, niente «→» sui bottoni. Le idee vengono dai libri CBT di Safren (Mastering Your Adult ADHD) e Ramsay (Rethinking Adult ADHD; Adult ADHD and Anxiety Workbook): usa parole tue, mai copiare.

## Nucleo (`core.js`, scritto dal coordinatore; non modificarlo)
Globale `window.P`:
- `P.S` stato persistente (salvato in localStorage chiave `un-passo-v1`), `P.save()` da chiamare dopo ogni modifica.
- `P.esc(s)` escape HTML (usalo SEMPRE per testo dell'utente), `P.uid()`, `P.ymd(date?)` -> 'YYYY-MM-DD' locale, `P.addDays('YYYY-MM-DD', n)`, `P.fmtDate('YYYY-MM-DD')` -> «venerdì 6 novembre», `P.fmtTime(ms)` -> 'HH:MM'.
- `P.ui` stato non persistente: `{tab, view, params}`. `P.go(tab, view=null, params={})` cambia schermata e fa render. `P.render()` ridisegna.
- `P.screens` registro: chiave `tab` oppure `tab/view` (es. `'oggi'`, `'inizia'`, `'aiuto'`, `'altro'`, `'altro/pensieri'`). Valore `{ render(){ return stringaHTML }, after(){ /* opzionale, dopo l'inserimento nel DOM */ } }`. Il nucleo inserisce l'HTML in `<main id="main" class="screen">`.
- `P.actions` registro dei click: nell'HTML usa `<button data-a="prefisso_nome" data-id="..." data-v="...">`; il nucleo chiama `P.actions.prefisso_nome(el, event)`. Prefissi OBBLIGATORI per evitare collisioni: `oggi_` (modulo oggi), `ini_` (inizia), `tm_` (timer), `aiu_` (aiuto), `alt_` (altro).
- `P.inputs` registro degli input: `<input data-i="prefisso_nome">`; il nucleo chiama `P.inputs.prefisso_nome(el, event)` ad ogni evento `input`/`change`, SENZA ridisegnare (per non perdere il focus). Aggiorna tu lo stato; chiama `P.render()` solo se serve.
- `P.sheet(html)` apre un foglio dal basso (con scrim; tocco fuori o `data-a="core_close"` lo chiude), `P.closeSheet()`. Dopo `P.sheet` il DOM del foglio è in `#sheet`.
- `P.toast(testo)` messaggio breve (2,5 s).
- `P.win(testo, kind='task')` aggiunge un successo a `S.wins` (vedi schema) e mostra un toast «Fatto!».
- `P.chime()` suono di fine (WebAudio; il timer deve chiamare `P.audioUnlock()` dentro un tocco dell'utente prima).
- `P.audioUnlock()`.
- `P.esc`, `P.$`(selettore, radice?) scorciatoia querySelector.
- Per aprire il timer (funzione definita in `timer.js`): `P.startSession({kind, taskId, title, minutes, first, barriers, steps})` (vedi sotto).
- Il nucleo ridisegna anche quando torna in primo piano. Il timer è un overlay separato `#timer` gestito SOLO da `timer.js`.

## Schema di `P.S` (non cambiarlo; se serve un campo nuovo, aggiungilo come opzionale e documentalo in testa al tuo file)
```
S = {
 v:1,
 tasks:[{id,title,prio:'A'|'B'|'C',date:'YYYY-MM-DD'|null,done:false,doneAt:ts|null,created:ts,
         steps:[{id,t,done:false}],
         plan:null | {first:'',date:'YYYY-MM-DD'|null,time:'HH:MM'|'',where:'',minutes:25,barriers:[{if:'',then:''}]}}],
 events?:[{id,title,date,time:'HH:MM'|'',where,remind:null|0|15|30|60|120 (minuti prima),repeat:'none'|'day'|'week'|'month'}],  // appuntamenti (agenda.js)
 mail?:{place,rules,days:[0-6],time:'HH:MM',notify:bool,last:null|{ts,n,fare}},  // posta e carte (sistemi.js)
 cards?:[{id,ts,title,lines:[{k,v}]}],  // carte di coping (emozioni.js)
 motiv?:{why:[testo],rewards:[testo]},  // motivi e premi piccoli (motivazione.js); task.why = perché quel compito conta
 places?:[{id,what,where}],  // il posto delle cose (sistemi.js)
 parked:[{id,text,ts,taskId|null,resolved:false}],   // parcheggio pensieri
 wins:[{id,text,ts,kind:'task'|'block'|'restart'|'other'}],
 thoughts:[{id,ts,situation,thought,emotion,intensity:0-10,errors:['tuttonulla',...],reply,intensityAfter:0-10|null}],
 checkins:[{id,date:'YYYY-MM-DD',scores:{attenzione:0-4,organizzazione:0-4,rimando:0-4,umore:0-4,impulsivita:0-4},meds:{planned:n,missed:n}|null,worked:''}],
 slips:[{id,ts,why:[],smallStep:''}],
 samples:[{id,ts,minutes}],           // misure della soglia di attenzione
 settings:{span:25,pause:5,meds:false,medsPerWeek:7,sound:true,theme:'auto'|'light'|'dark',
   rem?:{plan:bool,morning:{on,time:'HH:MM'},evening:{on,time},week:{on,day:0-6,time},meds:{on,times:['HH:MM']}}},  // promemoria (vedi avvisi.js; letti con P.remCfg())
 session:null | { id, kind:'work'|'break'|'measure'|'quick', state:'ready'|'running'|'ended',
                  taskId, title, minutes, first, barriers:[{if,then}], steps:[{id,t,done}],
                  startTs, endTs, parkedIds:[], extra:0 },
 lastReview:null|'YYYY-MM-DD'
}
```
Priorità: A = importante (massimo 3 per giorno), B = utile, C = se avanza.

## Moduli e file
- `core.js` (coordinatore) + `index.html`.
- `oggi.js`: schermata `oggi` (tab «Oggi»).
- `inizia.js`: schermata `inizia` (percorso guidato di pianificazione di un compito).
- `timer.js`: overlay timer a schermo intero + `P.startSession`.
- `aiuto.js`: schermata `aiuto` (pulsante «Sono bloccata», respiro, ripartenza).
- `altro.js`: schermate `altro`, `altro/pensieri`, `altro/fatto`, `altro/checkin`, `altro/schede`, `altro/impostazioni`, `altro/visita` (riepilogo e backup).
- `agenda.js`: appuntamenti (`S.events`) e compiti ripetuti (`task.repeat`, `task.next`, `task.rday`). Prefisso `age_`. Esporta `P.agenda.{todayHtml, upcomingHtml, tomorrowHtml, openNew, occurrences, repeatBlock, onTaskDone, onTaskReopen}`; `oggi.js` li usa se esistono.
- `sistemi.js`: schermate `altro/posta` (centro di smistamento, regole, giorni fissi, smistamento guidato OHIO) e `altro/cose` (posto delle cose, «prima di uscire»). Prefisso `sis_`. Esporta `P.sistemi.{todayHtml, openSort, openLeaving}` e `P.mailCfg()`.
- `emozioni.js`: nodi emotivi della schermata «Bloccata» (`uff`, `worry`, `forget`, `avoid`, `buy`, `cards`) e carte di coping (`S.cards`). Prefisso `emo_`. `aiuto.js` gli cede il rendering via `P.emozioni.owns/render`.
- `motivazione.js`: schermata `altro/motivazione` (motivi e premi piccoli), campo `task.why`, e i riquadri nel timer (perché e traguardo prima di partire, premio alla fine). Prefisso `mot_`. Esporta `P.motivazione.{readyHtml, rewardHtml, whyField}`.
- `progressi.js`: schermata `altro/progressi` (barre delle cose portate a termine nelle ultime 8 settimane, dettaglio, pensieri, check-in). Nessun campo nuovo: legge `wins`, `slips`, `thoughts`, `checkins`, `cards`. Esporta `P.progressi.weekCounts(n)`.
- `avvisi.js`: promemoria con le Web Push (piano al worker, testi in IndexedDB, tocco sulla notifica). Esporta `P.rem.{status, refresh, enable, disable, test, sync}`.
- `sw.js` (cache e push), `site.webmanifest`, `icons/`.

Ogni file è un IIFE: `(function(){ 'use strict'; const {S,esc,...}=P; ... })();` registra in `P.screens`, `P.actions`, `P.inputs`. Non accedere a `P` prima che esista (core.js è caricato per primo; l'ordine è core, oggi, inizia, timer, aiuto, altro). Se serve un'altra funzione di un modulo diverso, chiamala a runtime con `P.oggi.xxx`/`P.timer.xxx`: esporta in `P.<modulo>` solo ciò che dichiari qui sotto.

Esportazioni tra moduli (dichiarate):
- `oggi.js` esporta `P.oggi.openTask(id)` (foglio di dettaglio del compito), `P.oggi.addTask({title,prio,date})` -> task creato, `P.oggi.toggleDone(id)`.
- `inizia.js` esporta `P.inizia.begin({taskId?, title?})`: va su tab `inizia` con il percorso precompilato.
- `timer.js` esporta `P.startSession(opts)` con opts `{kind:'work'|'break'|'measure'|'quick', taskId?, title?, minutes?, first?, barriers?, steps?, skipReady?:bool}`; se `kind:'work'|'quick'` e `!skipReady` mostra prima la schermata «pronta» (primo gesto, ostacoli previsti, scelta durata) poi «Parto».
- `aiuto.js` esporta `P.aiuto.startSlip()`.
- `altro.js` esporta `P.altro.openThought(initial?)` (apre il registro dei pensieri, `initial={situation?,thought?}`).
- `core.js` (tab bar): Oggi, Inizia, Bloccata (id tab `aiuto`), Altro.

Qualità minima: tocchi ≥44px, input a 16px (già in CSS), `aria-label` sui bottoni solo icona, nessun `alert()`/`confirm()` (usa `P.sheet` con due bottoni), nessun errore in console, nessun uso di API non supportate da Safari iOS 16.4 (niente `structuredClone` va bene, ma niente `Array.prototype.findLast`, niente `:has` essenziale). Usa `Date.now()` per i tempi (mai contatori). Testa con `node --check <file>`.
