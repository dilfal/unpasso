/* Un passo: promemoria con le Web Push (iPhone, app installata dalla Home).
   Cosa fa:
   - calcola l'elenco degli avvisi (compiti pianificati, appuntamenti, posta, mattina, sera, check-in, farmaco, timer);
   - salva i testi di ogni avviso in IndexedDB (unpasso-avvisi, store testi, chiave = id): li legge il service worker quando arriva la push;
   - manda al worker (https://avvisi-unpasso.070293.xyz) solo orari e id, mai i testi: PUT /piano, solo se il piano è cambiato;
   - schermo acceso durante il timer: lo fa timer.js (Screen Wake Lock), qui non serve altro;
   - toccare una notifica porta l'app nel punto giusto (messaggio dal service worker oppure parametri go e taskId nell'indirizzo).
   Esporta P.rem: {status, refresh(), enable(), disable(), test(), sync()}.
   Id degli avvisi: timer, prova, mattina, sera, settimana (check-in), posta, farmaco0..3,
   c<hash> (compito: FNV-1a dell'id del compito, base 36), a<hash> (appuntamento: FNV-1a di id evento + data dell'occorrenza).
   IndexedDB unpasso-avvisi (versione 2): store testi (chiave id) e store meta ({k, v}: chiave VAPID e ultimo piano, letti da sw.js). */
(function () {
  'use strict';
  const P = window.P;
  if (!P) return;

  const WORKER = 'https://avvisi-unpasso.070293.xyz';
  const DB_NAME = 'unpasso-avvisi';
  const STORE = 'testi';
  const HASH_KEY = 'un-passo-avvisi-hash';
  const ACTIVE_KEY = 'un-passo-avvisi-attivi';   // '1' = l'utente ha attivato i promemoria
  const PROVA_KEY = 'un-passo-avvisi-prova';
  const DAY = 86400000;
  const TIME = /^(\d{1,2}):(\d{2})$/;

  /* ---------- piccoli aiuti ---------- */
  const z2 = (n) => String(n).padStart(2, '0');
  function hm(str) {
    const m = TIME.exec(str || '');
    return m ? { hour: Math.min(23, +m[1]), minute: Math.min(59, +m[2]) } : null;
  }
  const hhmm = (t) => z2(t.hour) + ':' + z2(t.minute);
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignora */ } }
  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return String(h >>> 0) + ':' + str.length;
  }
  function fnv(str) {   // FNV-1a a 32 bit, in base 36
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }
  function uniqueId(base, used) {   // id stabile; in caso di collisione si aggiunge un suffisso
    let id = base, n = 2;
    while (used[id]) id = base + '_' + (n++);
    used[id] = true;
    return id;
  }
  function b64ToU8(b64) {
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]);
  }

  /* ---------- iscrizione con la chiave VAPID attuale ---------- */
  function sameKey(sub, u8) {
    const k = sub && sub.options && sub.options.applicationServerKey;
    if (!k) return true;   // chiave non leggibile: si prova comunque, ci pensa il catch
    const a = new Uint8Array(k);
    if (a.length !== u8.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== u8[i]) return false;
    return true;
  }
  // Un'iscrizione fatta con un'altra chiave fa lanciare InvalidStateError a subscribe(): la si toglie e si riprova una volta. Non chiede mai il permesso.
  function subscribeWith(reg, keyB64) {
    const key = b64ToU8(keyB64);
    const opts = { userVisibleOnly: true, applicationServerKey: key };
    return reg.pushManager.getSubscription().catch(function () { return null; }).then(function (old) {
      return old && !sameKey(old, key) ? old.unsubscribe().catch(function () { /* ignora */ }) : null;
    }).then(function () {
      return reg.pushManager.subscribe(opts);
    }).catch(function () {
      return reg.pushManager.getSubscription().then(function (old) { return old ? old.unsubscribe() : null; })
        .then(function () { return reg.pushManager.subscribe(opts); });
    });
  }

  /* ---------- stato del dispositivo ---------- */
  function isInstalled() {
    return navigator.standalone === true || !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }
  function isSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }
  function getReg() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);
    return navigator.serviceWorker.getRegistration('/').then(function (r) { return r || null; }, function () { return null; });
  }
  function readyReg() {
    return withTimeout(navigator.serviceWorker.ready, 8000);
  }
  function getSub() {
    return getReg().then(function (reg) {
      return reg && reg.pushManager ? reg.pushManager.getSubscription() : null;
    }).catch(function () { return null; });
  }

  /* ---------- testi in IndexedDB ---------- */
  function openDb() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('niente IndexedDB')); return; }
      const r = indexedDB.open(DB_NAME, 2);
      r.onupgradeneeded = function () {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' });
        if (!r.result.objectStoreNames.contains('meta')) r.result.createObjectStore('meta', { keyPath: 'k' });
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  // esegue work(transazione) e risolve alla fine della transazione, con il risultato della richiesta che work restituisce
  function idb(stores, mode, work) {
    return openDb().then(function (db) {
      return new Promise(function (res, rej) {
        const tx = db.transaction(stores, mode);
        const out = work(tx);
        tx.oncomplete = function () { db.close(); res(out && 'result' in out ? out.result : undefined); };
        tx.onerror = tx.onabort = function () { db.close(); rej(tx.error); };
      });
    });
  }
  // i testi nuovi si scrivono prima del PUT; quelli degli id spariti si tolgono solo dopo la risposta del worker
  function putTexts(list) {
    return idb(STORE, 'readwrite', function (tx) { list.forEach(function (t) { tx.objectStore(STORE).put(t); }); });
  }
  function pruneTexts(keep) {
    return idb(STORE, 'readwrite', function (tx) {
      const st = tx.objectStore(STORE);
      const r = st.getAllKeys();
      r.onsuccess = function () { r.result.forEach(function (k) { if (!keep[k]) st.delete(k); }); };
    });
  }
  function metaSet(k, v) { return idb('meta', 'readwrite', function (tx) { tx.objectStore('meta').put({ k: k, v: v }); }); }
  function metaDel(k) { return idb('meta', 'readwrite', function (tx) { tx.objectStore('meta').delete(k); }); }
  function metaGet(k) {
    return idb('meta', 'readonly', function (tx) { return tx.objectStore('meta').get(k); }).then(function (r) { return r ? r.v : null; });
  }

  /* ---------- l'elenco degli avvisi ---------- */
  // Ogni voce: {a: avviso nel formato del worker, x: testo e destinazione (restano nel telefono)}.
  function note(a, title, body, go, taskId) {
    const x = { id: a.id, title: title, body: body, go: go };
    if (a.tipo === 'una') x.quando = a.quando;   // il service worker scarta il testo se la push è di un altro orario
    if (taskId) x.taskId = taskId;
    return { a: a, x: x };
  }
  function timerNote() {
    const s = P.S && P.S.session;
    if (!s || s.state !== 'running' || s.kind === 'measure' || !s.endTs || s.endTs <= Date.now() + 1000) return null;
    const isBreak = s.kind === 'break';
    return note({ id: 'timer', tipo: 'una', quando: s.endTs + 3000 },
      isBreak ? 'La pausa è finita' : 'Il tempo è finito',
      isBreak ? 'Quando sei pronta, riparti con un passo piccolo.'
        : (s.title ? s.title + '. ' : '') + 'Apri Un passo per decidere come proseguire.',
      'none');
  }
  function desired() {
    const out = [];
    const now = Date.now();
    const cfg = P.remCfg ? P.remCfg() : null;

    const tn = timerNote();
    if (tn) out.push(tn);
    const prova = +lsGet(PROVA_KEY) || 0;
    if (prova > now + 1000) {
      out.push(note({ id: 'prova', tipo: 'una', quando: prova }, 'Avviso di prova', 'Se lo vedi, i promemoria funzionano.', 'oggi'));
    }
    if (!cfg) return out;

    if (cfg.plan) {
      const items = [];
      (P.S.tasks || []).forEach(function (t) {
        const p = t && t.plan;
        if (!t || t.done || !p || !p.date || !hm(p.time)) return;
        const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.date), tm = hm(p.time);
        if (!d) return;
        const at = new Date(+d[1], +d[2] - 1, +d[3], tm.hour, tm.minute, 0, 0).getTime();
        if (at > now + 5000 && at < now + 90 * DAY) items.push({ t: t, at: at });
      });
      items.sort(function (a, b) { return a.at - b.at; });
      const usedC = {};
      items.slice(0, 60).forEach(function (it) {
        const p = it.t.plan;
        const body = (p.first ? 'Primo gesto: ' + p.first : 'Un passo piccolo, poi vedi.') + (p.where ? ' Dove: ' + p.where + '.' : '');
        out.push(note({ id: uniqueId('c' + fnv(String(it.t.id)), usedC), tipo: 'una', quando: it.at }, it.t.title || 'È il momento', body, 'task', it.t.id));
      });
    }
    if (P.agenda && P.agenda.occurrences) {
      // Appuntamenti con ora e avviso: i prossimi 30 giorni, ripetizioni comprese.
      const fire = [];
      P.agenda.occurrences(P.ymd(), P.ymd(new Date(now + 30 * DAY))).forEach(function (o) {
        const ev = o.ev, tm = hm(ev.time);
        if (!tm || ev.remind === null || ev.remind === undefined) return;
        const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(o.date);
        if (!d) return;
        const start = new Date(+d[1], +d[2] - 1, +d[3], tm.hour, tm.minute, 0, 0).getTime();
        const at = start - ev.remind * 60000;
        if (at > now + 5000) fire.push({ ev: ev, at: at, start: start, date: o.date });
      });
      fire.sort(function (a, b) { return a.at - b.at; });
      const usedA = {};
      fire.slice(0, 40).forEach(function (f) {
        const when = f.ev.remind === 0 ? 'Adesso' : f.ev.remind === 60 ? 'Tra un’ora' : f.ev.remind === 120 ? 'Tra due ore' : 'Tra ' + f.ev.remind + ' minuti';
        out.push(note({ id: uniqueId('a' + fnv(String(f.ev.id) + '|' + f.date), usedA), tipo: 'una', quando: f.at }, f.ev.title,
          when + ', alle ' + P.fmtTime(f.start) + (f.ev.where ? '. ' + f.ev.where : '') + '.', 'oggi'));
      });
    }
    const mc = P.mailCfg ? P.mailCfg() : null;
    if (mc && mc.notify && mc.days.length && hm(mc.time)) {
      // giorni come getDay: 0 = domenica, identici a quelli del worker
      const days = mc.days.filter(function (d, i, a) { return d >= 0 && d <= 6 && a.indexOf(d) === i; }).sort();
      if (days.length) {
        out.push(note({ id: 'posta', tipo: 'settimana', ora: hhmm(hm(mc.time)), giorni: days },
          'Smista la posta', 'Pochi minuti, un pezzo alla volta.', 'posta'));
      }
    }
    if (cfg.morning.on && hm(cfg.morning.time)) {
      out.push(note({ id: 'mattina', tipo: 'giorno', ora: hhmm(hm(cfg.morning.time)) },
        'La lista di oggi', 'Dai un’occhiata: scegli fino a tre cose che contano.', 'oggi'));
    }
    if (cfg.evening.on && hm(cfg.evening.time)) {
      out.push(note({ id: 'sera', tipo: 'giorno', ora: hhmm(hm(cfg.evening.time)) },
        'Revisione della sera', 'Due minuti per chiudere la giornata e preparare domani.', 'review'));
    }
    if (cfg.week.on && hm(cfg.week.time)) {
      out.push(note({ id: 'settimana', tipo: 'settimana', ora: hhmm(hm(cfg.week.time)), giorni: [cfg.week.day] },
        'Check-in della settimana', 'Un minuto, cinque domande.', 'checkin'));
    }
    if (cfg.meds.on && P.S.settings && P.S.settings.meds) {
      cfg.meds.times.forEach(function (tm, i) {
        if (hm(tm)) {
          out.push(note({ id: 'farmaco' + i, tipo: 'giorno', ora: hhmm(hm(tm)) }, 'Promemoria', 'È l’ora della tua dose.', 'none'));
        }
      });
    }
    return out;
  }

  /* ---------- sincronizzazione col worker ---------- */
  let running = false;
  let again = null;       // richiesta arrivata mentre una sincronizzazione era in corso
  let timerRq = null;

  function doSync(force) {
    return getSub().then(function (sub) {
      if (!sub || !isSupported() || Notification.permission !== 'granted') return false;
      let list;
      try { list = desired(); } catch (e) { return false; }
      const json = sub.toJSON ? sub.toJSON() : {};
      const keys = (json && json.keys) || {};
      if (!keys.p256dh || !keys.auth) return false;
      const body = JSON.stringify({
        endpoint: sub.endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        fuso: (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'Europe/Rome',
        avvisi: list.map(function (e) { return e.a; })
      });
      const h = hash(body);
      const keep = {};
      list.forEach(function (e) { keep[e.a.id] = true; });
      const prune = function () { return pruneTexts(keep).catch(function () { /* ignora */ }); };
      // 1) testi nuovi e ultimo piano nel telefono, 2) PUT solo se il piano è cambiato, 3) via i testi vecchi solo dopo la risposta
      return putTexts(list.map(function (e) { return e.x; })).catch(function () { /* senza testi la push mostra il testo generico */ })
        .then(function () { return metaSet('piano', { fuso: JSON.parse(body).fuso, avvisi: list.map(function (e) { return e.a; }) }).catch(function () { /* ignora */ }); })
        .then(function () {
          if (!force && lsGet(HASH_KEY) === h) return prune().then(function () { return true; });
          return fetch(WORKER + '/piano', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: body })
            .then(function (r) {
              if (!r.ok) return false;
              lsSet(HASH_KEY, h);
              return prune().then(function () { return true; });
            });
        });
    }).catch(function () { return false; });  // nessuna rete: si riprova al prossimo evento
  }

  function sync(force) {
    if (running) { again = (again === true) || !!force; return Promise.resolve(false); }
    running = true;
    return doSync(force).then(function (ok) {
      running = false;
      if (again !== null) { const f = again; again = null; doSync(f); }
      return ok;
    }, function () { running = false; return false; });
  }
  function request(delay) {
    clearTimeout(timerRq);
    timerRq = setTimeout(function () { sync(false); }, delay);
  }

  /* ---------- stato e comandi per Altro, Impostazioni, Promemoria ---------- */
  const status = { known: false, installed: isInstalled(), supported: isSupported(), permission: 'default', subscribed: false, wanted: lsGet(ACTIVE_KEY) === '1' };
  let lastTry = 0;

  // l'utente li ha attivati e il permesso c'è, ma l'iscrizione è sparita: si riprova senza chiedere niente
  function recover() {
    if (lsGet(ACTIVE_KEY) !== '1' || !isSupported() || Notification.permission !== 'granted') return Promise.resolve(false);
    return getSub().then(function (sub) {
      if (sub) return true;
      if (Date.now() - lastTry < 30000) return false;
      lastTry = Date.now();
      return readyReg().then(function (reg) {
        return metaGet('chiave').catch(function () { return null; }).then(function (k) {
          return k || fetch(WORKER + '/chiave').then(function (r) { if (!r.ok) throw new Error('chiave'); return r.text(); }).then(function (t) { return t.trim(); });
        }).then(function (k) {
          return subscribeWith(reg, k).then(function () {
            metaSet('chiave', k).catch(function () { /* ignora */ });
            lsSet(HASH_KEY, null);
            request(0);
            return true;
          });
        });
      }).catch(function () { return false; });
    });
  }

  function refresh() {
    const next = { known: true, installed: isInstalled(), supported: isSupported(), permission: 'default', subscribed: false, wanted: lsGet(ACTIVE_KEY) === '1' };
    if (next.supported) next.permission = Notification.permission;
    return (next.supported ? recover().then(getSub) : Promise.resolve(null)).then(function (sub) {
      next.subscribed = !!sub && next.permission === 'granted';
      const changed = Object.keys(next).some(function (k) { return status[k] !== next[k]; });
      Object.assign(status, next);
      return changed;
    });
  }

  function enable() {
    if (!isSupported()) return Promise.resolve({ ok: false, msg: 'Questo iPhone non supporta gli avvisi.' });
    // il permesso si chiede solo qui, dentro il tocco sul pulsante
    return Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') {
        return refresh().then(function () {
          return { ok: false, msg: 'Le notifiche sono disattivate: attivale da Impostazioni, Notifiche, Un passo.' };
        });
      }
      return readyReg().then(function (reg) {
        return fetch(WORKER + '/chiave').then(function (r) {
          if (!r.ok) throw new Error('chiave');
          return r.text();
        }).then(function (key) {
          key = key.trim();
          return subscribeWith(reg, key).then(function (sub) {
            return metaSet('chiave', key).catch(function () { /* ignora */ }).then(function () { return sub; });
          });
        });
      }).then(function () {
        lsSet(ACTIVE_KEY, '1');
        lsSet(HASH_KEY, null);
        return sync(true);
      }).then(function (ok) {
        return refresh().then(function () {
          return ok ? { ok: true, msg: 'Promemoria attivati' }
            : { ok: true, msg: 'Promemoria attivati: li sincronizzo appena c’è rete' };
        });
      });
    }).catch(function () {
      return refresh().then(function () { return { ok: false, msg: 'Non sono riuscita ad attivare i promemoria. Controlla la connessione e riprova.' }; });
    });
  }

  function disable() {
    return getSub().then(function (sub) {
      if (!sub) return null;
      const ep = sub.endpoint;
      return fetch(WORKER + '/iscrizione', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: ep }) })
        .catch(function () { /* il worker lo toglie da solo quando la push non arriva più */ })
        .then(function () { return sub.unsubscribe(); });
    }).then(function () {
      lsSet(ACTIVE_KEY, null);
      lsSet(HASH_KEY, null);
      lsSet(PROVA_KEY, null);
      return Promise.all([pruneTexts({}), metaDel('chiave'), metaDel('piano')]).catch(function () { /* ignora */ });
    }).then(function () {
      return refresh().then(function () { return { ok: true, msg: 'Promemoria disattivati' }; });
    }).catch(function () {
      return refresh().then(function () { return { ok: false, msg: 'Non sono riuscita a disattivarli. Riprova.' }; });
    });
  }

  function test() {
    return getSub().then(function (sub) {
      if (!sub || Notification.permission !== 'granted') return { ok: false, msg: 'Prima attiva i promemoria.' };
      lsSet(PROVA_KEY, String(Date.now() + 10000));
      return sync(true).then(function (ok) {
        return ok ? { ok: true, msg: 'Arriva tra 10 secondi, anche con l’app chiusa' }
          : { ok: false, msg: 'Non sono riuscita a programmare l’avviso. Controlla la connessione.' };
      });
    });
  }

  P.rem = { status: status, refresh: refresh, enable: enable, disable: disable, test: test, sync: function () { request(2000); } };

  /* ---------- salvataggi, ritorno in primo piano, avvio ---------- */
  function timerSig() {
    const n = timerNote();
    return n ? n.a.quando + '|' + n.x.title + '|' + n.x.body : '';
  }
  let lastTimerSig = '';
  const origSave = P.save;
  P.save = function () {
    const r = origSave.apply(this, arguments);
    try {
      const sig = timerSig();
      if (sig !== lastTimerSig) { lastTimerSig = sig; request(0); }   // timer avviato, spostato, finito o fermato: subito
      else request(2000);                                             // il resto: dopo circa 2 secondi
    } catch (e) { /* ignora */ }
    return r;
  };

  function closeTimerNotifications() {
    getReg().then(function (reg) {
      if (!reg || !reg.getNotifications) return;
      return reg.getNotifications({ tag: 'timer' }).then(function (list) {
        list.forEach(function (n) { n.close(); });
      });
    }).catch(function () { /* ignora */ });
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    closeTimerNotifications();
    refresh().catch(function () { /* ignora */ });
    request(300);
  });

  /* ---------- toccare una notifica ---------- */
  const appReady = new Promise(function (res) {
    if (document.readyState === 'complete') setTimeout(res, 300);
    else window.addEventListener('load', function () { setTimeout(res, 300); });
  });
  function apri(x) {
    try {
      if (!x || !x.go) return;
      if (x.go === 'task') {
        const t = (P.S.tasks || []).find(function (q) { return q.id === x.taskId && !q.done; });
        if (t && !P.S.session && P.startSession) P.startSession({ kind: 'work', taskId: t.id });
        else if (!P.S.session) P.go('oggi');
      } else if (x.go === 'oggi') { if (!P.S.session) P.go('oggi'); }
      else if (x.go === 'review') { if (!P.S.session) { P.go('oggi'); if (P.actions.oggi_review) P.actions.oggi_review(); } }
      else if (x.go === 'checkin') { if (!P.S.session) P.go('altro', 'checkin'); }
      else if (x.go === 'posta') { if (!P.S.session) { P.go('altro', 'posta'); if (P.sistemi) P.sistemi.openSort(); } }
    } catch (e) { /* ignora */ }
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (ev) {
      const d = ev && ev.data;
      if (d && d.tipo === 'avvisi-apri') appReady.then(function () { apri({ go: d.go, taskId: d.taskId }); });
    });
  }
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('go')) {
      const x = { go: q.get('go'), taskId: q.get('taskId') || '' };
      history.replaceState(null, '', location.pathname);
      appReady.then(function () { apri(x); });
    }
  } catch (e) { /* ignora */ }

  window.addEventListener('load', function () {
    lastTimerSig = timerSig();
    closeTimerNotifications();
    refresh().then(function () { request(0); }, function () { /* ignora */ });
  });
})();
