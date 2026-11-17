/* Un passo: vedere i progressi. Prefisso azioni: prog_.
   Nessun campo nuovo: legge S.wins (ogni scivolone vi salva già una «ripartenza», quindi S.slips non si somma),
   S.thoughts, S.checkins, S.cards.
   Fonti (parole mie): Safren et al., Mastering Your Adult ADHD (revisione del mese: guardare che cosa è cambiato e
   che cosa ha funzionato); Ramsay, The Adult ADHD and Anxiety Workbook (celebrare i progressi graduali, non solo il
   traguardo). Niente serie di giorni, niente punteggi di colpa: una settimana leggera fa parte del percorso.
   Esporta P.progressi: weekCounts(n). */
(function () {
  'use strict';
  const esc = P.esc;
  const WEEKS = 8;
  const arr = (k) => (Array.isArray(P.S[k]) ? P.S[k] : []);
  const dayOf = (ts) => P.ymd(new Date(ts));
  function mondayOf(d) { const wd = new Date(d + 'T12:00:00').getDay(); return P.addDays(d, -((wd + 6) % 7)); }
  const shortDate = (d) => d.slice(8, 10) + '/' + d.slice(5, 7);

  /* ultime n settimane, dalla più vecchia alla corrente */
  function weekCounts(n) {
    const cur = mondayOf(P.ymd());
    const weeks = [];
    for (let i = n - 1; i >= 0; i--) weeks.push({ mon: P.addDays(cur, -7 * i), n: 0 });
    arr('wins').forEach((w) => {
      if (!w || !w.ts) return;
      const m = mondayOf(dayOf(w.ts));
      const slot = weeks.find((x) => x.mon === m);
      if (slot) slot.n++;
    });
    return weeks;
  }
  P.progressi = { weekCounts: weekCounts };

  function bars(weeks) {
    const max = Math.max(4, ...weeks.map((w) => w.n));
    const W = 320, H = 130, x0 = 8, x1 = 312, yb = 100, yt = 14;
    const slot = (x1 - x0) / weeks.length, bw = Math.min(26, slot - 8);
    const lab = 'font-size:10px;fill:var(--ink2)';
    let s = '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Cose portate a termine in ciascuna delle ultime ' + weeks.length + ' settimane: ' +
      weeks.map((w) => w.n).join(', ') + '" style="height:140px">' +
      '<line x1="' + x0 + '" y1="' + yb + '" x2="' + x1 + '" y2="' + yb + '" style="stroke:var(--line);stroke-width:1"/>';
    weeks.forEach((w, i) => {
      const cx = x0 + slot * i + slot / 2;
      const h = w.n ? Math.max(3, (w.n / max) * (yb - yt)) : 0;
      const last = i === weeks.length - 1;
      if (h) s += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + (yb - h).toFixed(1) + '" width="' + bw + '" height="' + h.toFixed(1) +
        '" rx="4" style="fill:var(--sea);opacity:' + (last ? 1 : 0.7) + '"/>';
      else s += '<line x1="' + (cx - 6).toFixed(1) + '" y1="' + (yb - 1) + '" x2="' + (cx + 6).toFixed(1) + '" y2="' + (yb - 1) + '" style="stroke:var(--line);stroke-width:2;stroke-linecap:round"/>';
      s += '<text x="' + cx.toFixed(1) + '" y="' + (yb - h - 4).toFixed(1) + '" text-anchor="middle" style="' + lab + ';font-weight:650">' + (w.n || '') + '</text>';
      if (i === 0 || last || i === Math.floor(weeks.length / 2)) {
        s += '<text x="' + cx.toFixed(1) + '" y="118" text-anchor="middle" style="' + lab + '">' + shortDate(w.mon) + '</text>';
      }
    });
    return s + '</svg>';
  }

  function stat(n, label) {
    return '<div class="tpanel" style="text-align:center;border:1px solid var(--line)"><div style="font-family:var(--serif);font-size:1.7rem;line-height:1.1">' + n + '</div>' +
      '<div class="muted small">' + esc(label) + '</div></div>';
  }
  const plural = (n, one, many) => (n === 1 ? one : many);

  P.screens['altro/progressi'] = {
    render() {
      const weeks = weekCounts(WEEKS);
      const from = new Date(weeks[0].mon + 'T00:00:00').getTime();
      const inRange = (ts) => ts && ts >= from;
      const wins = arr('wins').filter((w) => inRange(w && w.ts));
      const by = (k) => wins.filter((w) => w.kind === k).length;
      const tasks = by('task'), blocks = by('block'), restarts = by('restart');
      const thoughts = arr('thoughts').filter((x) => inRange(x && x.ts));
      const cards = arr('cards').filter((x) => inRange(x && x.ts)).length;
      const total = weeks.reduce((s, w) => s + w.n, 0);

      let h = '<button class="back" data-a="alt_go" data-v="">‹ Altro</button>' +
        '<div class="head"><div><h1>I tuoi progressi</h1><p class="sub muted">Le ultime otto settimane, in breve.</p></div></div>';

      if (!total && !thoughts.length) {
        return h + '<p class="empty">Qui comparirà quello che porti a termine: compiti, blocchi, ripartenze. Comincia da una cosa piccola, e conta già.</p>' +
          '<button class="btn block" data-a="alt_go" data-v="fatto">Aggiungi una cosa che hai fatto</button>';
      }

      h += '<div class="group"><h2>Cose portate a termine</h2>' + bars(weeks) +
        '<p class="muted small">Ogni barra è una settimana. Non devono salire sempre: una settimana piena e una leggera fanno parte dello stesso percorso.</p></div>';

      const cur = weeks[weeks.length - 1].n, prev = weeks[weeks.length - 2].n;
      let line = 'In queste otto settimane hai portato a termine ' + total + ' ' + plural(total, 'cosa', 'cose') + '.';
      if (cur && prev && cur > prev) line += ' Questa settimana sei già sopra la scorsa.';
      else if (cur && !prev) line += ' Questa settimana hai ripreso: è un buon segno.';
      h += '<div class="hint">' + esc(line) + '</div>';

      h += '<div class="group"><h2>In dettaglio</h2><div class="row2" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        stat(tasks, plural(tasks, 'compito finito', 'compiti finiti')) +
        stat(blocks, plural(blocks, 'blocco superato', 'blocchi superati')) +
        stat(restarts, plural(restarts, 'ripartenza', 'ripartenze')) +
        stat(cards, plural(cards, 'carta di coping', 'carte di coping')) + '</div>' +
        '<p class="muted small" style="margin-top:8px">Le ripartenze contano quanto il resto: scivolare e riprendere è la parte più importante del lavoro.</p></div>';

      const withAfter = thoughts.filter((x) => typeof x.intensity === 'number' && typeof x.intensityAfter === 'number');
      if (withAfter.length) {
        const a = withAfter.reduce((s, x) => s + x.intensity, 0) / withAfter.length;
        const b = withAfter.reduce((s, x) => s + x.intensityAfter, 0) / withAfter.length;
        const fmt = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
        let t;
        if (b < a - 0.05) t = 'Nei tuoi registri dei pensieri l’intensità del disagio è scesa in media da ' + fmt(a) + ' a ' + fmt(b) + ' su 10: scrivere e rispondere al pensiero sembra aiutarti.';
        else t = 'Hai scritto ' + withAfter.length + ' ' + plural(withAfter.length, 'registro', 'registri') + ' dei pensieri. L’intensità media prima era ' + fmt(a) + ', dopo ' + fmt(b) + ' su 10: a volte il disagio resta, e va bene così, scriverlo ti ha comunque dato un po’ di distanza.';
        h += '<div class="group"><h2>Pensieri</h2><p>' + esc(t) + '</p></div>';
      }

      const cis = arr('checkins').filter((c) => c && c.date && c.scores).sort((x, y) => (x.date < y.date ? -1 : 1));
      if (cis.length >= 2) {
        const sum = (c) => Object.keys(c.scores).reduce((s, k) => s + (+c.scores[k] || 0), 0);
        const f = cis[0], l = cis[cis.length - 1];
        h += '<div class="group"><h2>Check-in</h2><p>Il primo check-in (' + esc(P.fmtDate(f.date)) + ') era a ' + sum(f) + ' su 20, l’ultimo (' + esc(P.fmtDate(l.date)) + ') a ' + sum(l) +
          '. Più basso vuol dire meno difficoltà, ma guarda l’andamento di più settimane, non due numeri soli.</p>' +
          '<button class="btn ghost sm" data-a="alt_go" data-v="checkin">Apri il check-in</button></div>';
      }

      const worked = cis.filter((c) => c.worked && String(c.worked).trim()).slice(-3).reverse();
      if (worked.length) {
        h += '<div class="group"><h2>Che cosa ha funzionato</h2><ul class="list">' + worked.map((c) =>
          '<li class="task"><div class="body" style="cursor:default"><span class="ttl">' + esc(c.worked) + '</span><span class="meta">' + esc(P.fmtDate(c.date)) + '</span></div></li>').join('') + '</ul>' +
          '<p class="muted small">Quello che ha funzionato una volta, spesso funziona di nuovo: riprendilo.</p></div>';
      }

      h += '<button class="btn soft block" data-a="alt_go" data-v="fatto">Vedi l’elenco di Fatto!</button>';
      return h;
    }
  };
})();
