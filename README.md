# Un passo

App web (PWA) per aiutare un'adulta con ADHD a passare dall'intenzione all'azione. Ispirata alla terapia cognitivo-comportamentale di Safren (*Mastering Your Adult ADHD*) e Ramsay (*Rethinking Adult ADHD*, *The Adult ADHD and Anxiety Workbook*). Non sostituisce la terapia.

- Solo HTML, CSS e JavaScript: nessuna libreria, funziona offline.
- I dati restano nel telefono (`localStorage`). Backup e ripristino in Altro, Per la visita e backup.
- Pensata per l'iPhone, installata dalla Home.

## Pubblicare su GitHub Pages (https://unpasso.070293.xyz)

1. Repository su GitHub con tutto il contenuto di questa cartella nella radice.
2. Settings, Pages, Source: branch `main`, cartella `/ (root)`. Il file `CNAME` (`unpasso.070293.xyz`) e `.nojekyll` ci sono già; in Pages, Custom domain, controlla che compaia `unpasso.070293.xyz` e attiva Enforce HTTPS.
3. DNS, in Cloudflare (solo DNS, nuvola grigia): record `CNAME`, nome `unpasso`, destinazione `<utente>.github.io`.
4. L'app sta alla radice del dominio, quindi tutti i percorsi sono assoluti (`/styles.css`, `/sw.js`, `/icons/...`).

**A ogni rilascio** cambia il nome della cache in `sw.js` (`un-passo-v11` diventa `un-passo-v12`): senza, il service worker non vede i file nuovi. Se cambi i file da mettere in cache, aggiorna anche l'elenco `PRECACHE`.

## Installare su iPhone e attivare i promemoria

1. Apri https://unpasso.070293.xyz in Safari (iOS 16.4 o successivo).
2. Condividi, Aggiungi alla schermata Home. Va installata così: i promemoria funzionano solo dall'app sulla Home, e Safari cancella i dati dei siti non installati dopo circa 7 giorni di inattività.
3. Apri Un passo dalla Home, poi Altro, Impostazioni, Promemoria, «Attiva i promemoria su questo iPhone» e consenti le notifiche. Con «Invia un avviso di prova» controlli che arrivino.

Se dopo aver modificato manifest o meta (`apple-mobile-web-app-status-bar-style`, icone) l'aspetto non cambia, togli l'app dalla Home e aggiungila di nuovo.

## Promemoria (Web Push)

Gli avvisi arrivano con le Web Push, tramite un worker su https://avvisi-unpasso.070293.xyz (`GET /chiave`, `PUT /piano`, `DELETE /iscrizione`). `avvisi.js` calcola l'elenco degli avvisi e manda al worker solo **orari e id**, e solo se il piano è cambiato (l'endpoint dell'iscrizione fa parte del confronto). I **testi** (titolo, messaggio, dove aprire l'app) restano in IndexedDB (`unpasso-avvisi`, store `testi`): quando arriva la push, `sw.js` li cerca lì per id e mostra la notifica. Se il testo manca, o è di un altro orario (avviso «una» con orario che differisce di oltre 120 secondi), mostra «Hai un promemoria.».

Gli id dei compiti e degli appuntamenti sono hash dell'id (FNV-1a, base 36), non posizioni: non cambiano se l'elenco si riordina. I testi nuovi si scrivono prima del `PUT`; quelli degli id spariti si cancellano solo dopo la risposta del worker.

Se l'iscrizione si perde (iOS la cambia o la scade), l'app, all'avvio e al ritorno in primo piano, la rifà da sola senza chiedere niente; `sw.js` fa lo stesso su `pushsubscriptionchange`, usando la chiave e l'ultimo piano salvati nello store `meta` di IndexedDB. Se non riesce, in Impostazioni, Promemoria compare l'invito a riattivarli.

## Dati dell'APK

I dati dell'APK Android non si portano da soli: dall'APK, in Altro, Per la visita e backup, «Salva backup»; poi sull'iPhone, nell'app installata, «Ripristina da backup».

## File

`index.html`, `styles.css`, `core.js` (stato e navigazione), `oggi.js`, `inizia.js`, `timer.js`, `aiuto.js`, `altro.js`, `agenda.js` (appuntamenti e compiti ripetuti), `sistemi.js` (posta e carte, posto delle cose), `emozioni.js` (emozioni e ansia, in Bloccata), `motivazione.js` (motivi e premi piccoli), `progressi.js` (riepilogo delle ultime otto settimane), `avvisi.js` (promemoria con le Web Push), `sw.js`, `site.webmanifest`, `icons/` (icone e schermate di avvio generate con `pwa-asset-generator` a partire da `icons/icon-maskable-512.png`). `CONTRATTO.md` descrive l'interfaccia tra i moduli (serve solo a chi sviluppa).

Per rigenerare icone e schermate (da una cartella temporanea per il manifest e l'HTML intermedi): `npx pwa-asset-generator icons/icon-maskable-512.png icons --padding "calc(50vh - 25%) calc(50vw - 25%)" -b "#F1F5F5" --type png --favicon --path-override "/icons"`, e la stessa con `-b "#0E1B20" --dark-mode --splash-only` per le schermate scure.
