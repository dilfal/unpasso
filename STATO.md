# STATO — Un passo (17/11/2026)

## Fatto
- Niente più APK: la parte Android (android/, www/, dist/ con APK 1.8, scripts/, Capacitor, native.js) è in
  `C:\Users\df\Dev\GitHub\web app\_archivio\un-passo-android-2026-11-17.zip`. Keystore in C:\Users\df\Android intatto.
- Web app iPhone: `avvisi.js` (piano degli avvisi → PUT al worker, testi in IndexedDB `unpasso-avvisi`),
  `sw.js` (push → showNotification sempre; pushsubscriptionchange; cache `un-passo-v11`),
  Altro → Promemoria (attiva/disattiva/prova), `site.webmanifest`, icone e splash chiare/scure,
  `black-translucent` + fascia scura `#statusband`. CNAME `unpasso.070293.xyz`, `.nojekyll`, `git init` (nessun commit).
- Worker `C:\Users\df\Dev\GitHub\web app\avvisi-unpasso.070293.xyz`: Durable Object `Iscrizione` con allarme,
  payload cifrato aes128gcm `{id,t}`, chiavi VAPID nuove (privata in `.dev.vars`), `workers_dev = false`.
  Test 26/26, `wrangler deploy --dry-run` ok. `git init`, nessun commit.
- Revisione finale fatta; corretti: doppio invio e PUT perso in `alarm()`, chiave VAPID cambiata in `enable()`.

## Da fare (serve l'utente)
1. 070293.xyz nell'account Cloudflare; `npx wrangler login`; nel worker `npx wrangler secret put VAPID_PRIVATA`, poi `npx wrangler deploy`.
   Primo deploy = prima verifica vera della classe DO semplice con `new_sqlite_classes` (dubbio aperto).
2. Repository GitHub per l'app (commit + push solo col sì dell'utente), Pages da `main` / root,
   DNS Cloudflare CNAME `unpasso` → `<utente>.github.io` (solo DNS).
3. Su iPhone: Safari → unpasso.070293.xyz → Aggiungi alla Home → Altro → Promemoria → Attiva → Avviso di prova.
   Dati dell'APK: «Salva backup» nell'APK, «Ripristina» nella web app.

## Dubbi aperti
- iOS potrebbe rifiutare `subscribe()` senza tocco in `recover()`: in quel caso compare l'invito a riattivare.
- Push con 429/5xx dal servizio push: persa senza nuovo tentativo (scelta, per evitare duplicati).
