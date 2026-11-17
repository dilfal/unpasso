/* disco.js: il quadrante a disco del timer (stile «Disco», impostazione settings.timerStyle).
   Tutto SVG generato da codice; i colori stanno in styles.css (classi .d-*), solo variabili CSS.
   Lo 0 è in alto, i numeri crescono in senso antiorario; il disco parte dalle ore 12 e si estende
   in senso antiorario per (minuti rimanenti / scala) × 360°.
   Esporta P.disco: {SCALES, scaleFor(min), create(host, cb) -> {set(scala, remMin), svg}}.
   cb: {drag(min) mentre si trascina, end(min) al rilascio, key(delta) con le frecce, active() -> bool}. */
(function () {
  'use strict';
  const P = window.P;
  if (!P) return;

  const NS = 'http://www.w3.org/2000/svg';
  const SCALES = [5, 10, 20, 30, 60, 120];
  const NUM_EVERY = { 5: 1, 10: 1, 20: 2, 30: 5, 60: 5, 120: 10 };
  const MINOR_EVERY = { 5: 0.25, 10: 0.5, 20: 1, 30: 1, 60: 1, 120: 2 };
  const C = 100, R_FACE = 90, R_TICK = 88, R_NUM = 72, R_DISC = 60;

  function scaleFor(min) {
    for (let i = 0; i < SCALES.length; i++) if (SCALES[i] >= min) return SCALES[i];
    return 120;
  }
  const f = (n) => (Math.round(n * 100) / 100).toString();
  // punto a distanza r dal centro, ad angolo th (gradi, antiorario dalle ore 12)
  function pt(r, th) {
    const a = th * Math.PI / 180;
    return [C - r * Math.sin(a), C - r * Math.cos(a)];
  }
  function el(name, attrs, parent) {
    const n = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n);
    return n;
  }
  function sectorPath(th) {
    if (!(th > 0.05)) return '';
    const top = f(C) + ' ' + f(C - R_DISC);
    if (th >= 359.9) {
      return 'M' + top + ' A' + R_DISC + ' ' + R_DISC + ' 0 1 0 ' + f(C) + ' ' + f(C + R_DISC) +
        ' A' + R_DISC + ' ' + R_DISC + ' 0 1 0 ' + top + ' Z';
    }
    const e = pt(R_DISC, th);
    return 'M' + f(C) + ' ' + f(C) + ' L' + top + ' A' + R_DISC + ' ' + R_DISC + ' 0 ' + (th > 180 ? 1 : 0) + ' 0 ' + f(e[0]) + ' ' + f(e[1]) + ' Z';
  }

  function create(host, cb) {
    cb = cb || {};
    const svg = el('svg', { viewBox: '0 0 200 200', role: 'slider', tabindex: '0', 'aria-label': 'Tempo rimanente',
      'aria-valuemin': '0', 'aria-valuemax': '5', 'aria-valuenow': '0', 'aria-valuetext': '0 minuti', focusable: 'true' });
    el('rect', { x: 3, y: 3, width: 194, height: 194, rx: 30, 'class': 'd-frame' }, svg);
    el('circle', { cx: C, cy: C, r: R_FACE, 'class': 'd-face' }, svg);
    const marks = el('g', {}, svg);
    const disc = el('path', { 'class': 'd-disc', d: '' }, svg);
    el('circle', { cx: C, cy: C, r: 5.5, 'class': 'd-pivot' }, svg);
    host.appendChild(svg);

    let scale = 0, shownTh = null, shownNow = null;

    function buildMarks(sc) {
      while (marks.firstChild) marks.removeChild(marks.firstChild);
      const ne = NUM_EVERY[sc], me = MINOR_EVERY[sc];
      const nMinor = Math.round(sc / me);
      for (let i = 0; i < nMinor; i++) {
        const v = i * me;
        const major = Math.abs(v / ne - Math.round(v / ne)) < 1e-6;
        if (major) continue;
        const th = v / sc * 360, a = pt(R_TICK, th), b = pt(R_TICK - 4.5, th);
        el('line', { x1: f(a[0]), y1: f(a[1]), x2: f(b[0]), y2: f(b[1]), 'class': 'd-tick' }, marks);
      }
      for (let v = 0; v < sc - 1e-6; v += ne) {
        const th = v / sc * 360, a = pt(R_TICK, th), b = pt(R_TICK - 8, th), p = pt(R_NUM, th);
        el('line', { x1: f(a[0]), y1: f(a[1]), x2: f(b[0]), y2: f(b[1]), 'class': 'd-tick d-major' }, marks);
        const t = el('text', { x: f(p[0]), y: f(p[1]), dy: '.36em', 'text-anchor': 'middle', 'class': 'd-num' }, marks);
        t.textContent = String(Math.round(v * 100) / 100);
      }
    }

    // sc: scala in minuti; remMin: minuti rimanenti (anche con decimali)
    function set(sc, remMin) {
      if (sc !== scale) {
        scale = sc;
        buildMarks(sc);
        svg.setAttribute('aria-valuemax', String(sc));
        shownTh = null; shownNow = null;
      }
      const th = Math.max(0, Math.min(1, remMin / sc)) * 360;
      if (th !== shownTh) { shownTh = th; disc.setAttribute('d', sectorPath(th)); }
      const now = Math.max(0, Math.min(sc, Math.ceil(remMin - 1e-9)));
      if (now !== shownNow) {
        shownNow = now;
        svg.setAttribute('aria-valuenow', String(now));
        svg.setAttribute('aria-valuetext', now + (now === 1 ? ' minuto' : ' minuti'));
      }
    }

    /* ---- trascinamento: conta solo se il tocco INIZIA dentro il cerchio del quadrante ---- */
    let drag = null;
    function local(e) {
      const r = svg.getBoundingClientRect();
      if (!r.width) return null;
      return [(e.clientX - r.left) / r.width * 200, (e.clientY - r.top) / r.height * 200];
    }
    function minutesAt(p, prev) {
      const dx = p[0] - C, dy = p[1] - C;
      let th = Math.atan2(-dx, -dy) * 180 / Math.PI;   // antiorario dalle ore 12
      if (th < 0) th += 360;
      let m = th / 360 * scale;
      if (prev != null && Math.abs(m - prev) > scale / 2) m = prev < scale / 2 ? 0 : scale;   // passaggio dallo 0: niente salto
      return Math.max(1, Math.min(scale, Math.round(m)));
    }
    svg.addEventListener('pointerdown', function (e) {
      if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (cb.active && !cb.active()) return;
      const p = local(e);
      if (!p) return;
      const d = Math.hypot(p[0] - C, p[1] - C);
      if (d > R_FACE || d < 6) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, min: null };
      try { svg.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
      e.preventDefault();
    });
    svg.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 10) return;
      drag.moved = true;
      const p = local(e);
      if (!p) return;
      const m = minutesAt(p, drag.min);
      if (m !== drag.min) { drag.min = m; if (cb.drag) cb.drag(m); }
      e.preventDefault();
    });
    function stop(e, commit) {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      try { svg.releasePointerCapture(e.pointerId); } catch (err) { /* ignora */ }
      if (commit && d.moved && d.min != null && cb.end) cb.end(d.min);
      else if (cb.end) cb.end(null);   // annullato o semplice tocco: si ripristina la vista
    }
    svg.addEventListener('pointerup', function (e) { stop(e, true); });
    svg.addEventListener('pointercancel', function (e) { stop(e, false); });
    svg.addEventListener('lostpointercapture', function (e) { stop(e, false); });

    /* ---- tastiera ---- */
    svg.addEventListener('keydown', function (e) {
      let d = 0;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') d = 1;
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') d = -1;
      if (!d) return;
      e.preventDefault();
      e.stopPropagation();
      if (cb.key) cb.key(d);
    });

    return { svg: svg, set: set };
  }

  P.disco = { SCALES: SCALES, scaleFor: scaleFor, create: create };
})();
