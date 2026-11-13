
/* ------------------------------------------------------------------ */
/* Каталог форм Flora 3D                                               */
/* Каждая форма — функция, которая выдаёт точку фигуры в единичных      */
/* координатах (x вправо, y вверх, z к зрителю). Нейроны и частицы      */
/* садятся на эти точки, и фигура собирается из них.                    */
/* sample(rnd, o) → часть: 0 — обычная, 1 — приглушённый контур,        */
/* 2 — яркая деталь. o[3] — ключ для раскраски по группам (если есть).  */
/* ------------------------------------------------------------------ */
const F3S = (function () {
  "use strict";
  const TAU = 6.283185307179586, PI = Math.PI;
  const gs = (r) => (r() + r() + r() + r() - 2) * 0.87;
  function dir(r, o) { const y = r() * 2 - 1, a = r() * TAU, q = Math.sqrt(1 - y * y); o[0] = Math.cos(a) * q; o[1] = y; o[2] = Math.sin(a) * q; }
  function ell(r, C, R, o) { dir(r, o); o[0] = C[0] + o[0] * R[0]; o[1] = C[1] + o[1] * R[1]; o[2] = C[2] + o[2] * R[2]; }
  function blobAt(r, C, R, o) { dir(r, o); const k = R * Math.cbrt(r()); o[0] = C[0] + o[0] * k; o[1] = C[1] + o[1] * k; o[2] = C[2] + o[2] * k; }
  // точка на поверхности трубки A→B; радиус — число, пара или профиль по длине
  function tube(r, A, B, ra, rb, o, t) {
    if (t == null) t = r();
    const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], l = Math.hypot(dx, dy, dz) || 1;
    let ux, uy, uz;
    if (Math.abs(dy) < 0.9 * l) { ux = dz; uy = 0; uz = -dx; } else { ux = 0; uy = -dz; uz = dy; }
    const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const vx = (dy * uz - dz * uy) / l, vy = (dz * ux - dx * uz) / l, vz = (dx * uy - dy * ux) / l;
    let R;
    if (typeof ra === "number") R = ra + (rb - ra) * t;
    else { const f = t * (ra.length - 1), i = Math.min(ra.length - 2, f | 0); R = ra[i] + (ra[i + 1] - ra[i]) * (f - i); }
    const a = r() * TAU, c = Math.cos(a) * R, s = Math.sin(a) * R;
    o[0] = A[0] + dx * t + ux * c + vx * s; o[1] = A[1] + dy * t + uy * c + vy * s; o[2] = A[2] + dz * t + uz * c + vz * s;
  }
  function onPath(P, t, o) {
    const n = P.length - 1, f = Math.min(n - 1e-6, Math.max(0, t) * n), i = f | 0, k = f - i, a = P[i], b = P[i + 1];
    o[0] = a[0] + (b[0] - a[0]) * k; o[1] = a[1] + (b[1] - a[1]) * k; o[2] = a[2] + (b[2] - a[2]) * k;
  }
  // трубка вдоль ломаной
  function pipe(r, P, ra, rb, o) { const n = P.length - 1, f = r() * n, i = Math.min(n - 1, f | 0); tube(r, P[i], P[i + 1], ra + (rb - ra) * (i / n), ra + (rb - ra) * ((i + 1) / n), o, f - i); }
  // тело вращения с овальным сечением: кольца [y, rx, rz, cx, cz]
  function mkLathe(rings) { let a = 0; return { rings, cum: rings.slice(1).map((q, i) => (a += Math.abs(q[0] - rings[i][0]) * (q[1] + q[2] + rings[i][1] + rings[i][2]) + 1e-4)) }; }
  function lathe(r, L, o) {
    const i = pick(L.cum, r), a = L.rings[i], b = L.rings[i + 1], t = r(), an = r() * TAU;
    o[0] = a[3] + (b[3] - a[3]) * t + (a[1] + (b[1] - a[1]) * t) * Math.cos(an); o[1] = a[0] + (b[0] - a[0]) * t; o[2] = a[4] + (b[4] - a[4]) * t + (a[2] + (b[2] - a[2]) * t) * Math.sin(an);
  }
  function weights(S) { let a = 0; return S.map((s) => (a += Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]) + 0.02)); }
  function pick(cum, r) { const t = r() * cum[cum.length - 1]; let lo = 0, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < t) lo = m + 1; else hi = m; } return lo; }
  // плавная кривая через точки (Катмулл — Ром)
  function spline(P, per, closed) {
    const n = P.length, out = [], g = (i) => (closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
    for (let i = 0; i < (closed ? n : n - 1); i++) for (let k = 0; k < per; k++) {
      const t = k / per, a = g(i - 1), b = g(i), c = g(i + 1), d = g(i + 2), q = [];
      for (let m = 0; m < b.length; m++) q.push(0.5 * (2 * b[m] + (c[m] - a[m]) * t + (2 * a[m] - 5 * b[m] + 4 * c[m] - d[m]) * t * t + (3 * b[m] - a[m] - 3 * c[m] + d[m]) * t * t * t));
      out.push(q);
    }
    if (!closed) out.push(P[n - 1].slice());
    return out;
  }
  function grow(S, a, d, len, rad, depth, r, c, tag) {
    const b = [a[0] + d[0] * len, a[1] + d[1] * len, a[2] + d[2] * len];
    S.push({ a, b, ra: rad, rb: rad * c.taper, depth, tag });
    if (depth <= 0) { c.tips.push({ p: b, tag }); return; }
    const n = c.split + (r() < c.extra ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const nd = [d[0] + (r() * 2 - 1) * c.spread + c.bias[0], d[1] + (r() * 2 - 1) * c.spread + c.bias[1], d[2] + (r() * 2 - 1) * c.spread];
      const l = Math.hypot(nd[0], nd[1], nd[2]) || 1; nd[0] /= l; nd[1] /= l; nd[2] /= l;
      grow(S, b, nd, len * c.shrink * (0.8 + 0.4 * r()), rad * c.taper, depth - 1, r, c, tag == null ? i : tag);
    }
  }
  const lazy = (f) => { let v; return () => v || (v = f()); };
  const polyLines = (emit, P, al, mx) => { for (let i = 0; i + 1 < P.length; i++) { emit(P[i][0], P[i][1], P[i][2], P[i + 1][0], P[i + 1][1], P[i + 1][2], al); if (mx) emit(-P[i][0], P[i][1], P[i][2], -P[i + 1][0], P[i + 1][1], P[i + 1][2], al); } };

  /* ---------- сердце: желудочки с мышечными волокнами, предсердия, аорта с дугой, лёгочный ствол, полые вены, коронарные артерии ---------- */
  const HEART = lazy(() => {
    const A = [-0.06, 0.26, 0], B = [0.2, -0.74, 0.08], d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], len = Math.hypot(d[0], d[1], d[2]);
    d[0] /= len; d[1] /= len; d[2] /= len;
    const u = [d[1], -d[0], 0], ul = Math.hypot(u[0], u[1]); u[0] /= ul; u[1] /= ul;
    const v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
    // поверхность желудочков: t — от основания к верхушке, a — вокруг оси
    const vent = (t, a, o) => {
      const R = 0.47 * Math.pow(Math.max(0, 1 - Math.pow(t, 1.9)), 0.55) * (0.86 + 0.14 * Math.sin(PI * Math.min(1, t * 1.3))) * (1 - 0.07 * Math.exp(-Math.pow((((a - 1.2 + PI) % TAU + TAU) % TAU - PI) / 0.16, 2)));
      const c = Math.cos(a) * R * (1 + 0.1 * Math.cos(a)), s = Math.sin(a) * R * 0.84, l = t * len;
      o[0] = A[0] + d[0] * l + u[0] * c + v[0] * s; o[1] = A[1] + d[1] * l + u[1] * c + v[1] * s; o[2] = A[2] + d[2] * l + u[2] * c + v[2] * s;
    };
    const cor = [], P = (f) => { const q = []; for (let i = 0; i <= 26; i++) { const o = [0, 0, 0]; f(i / 26, o); q.push(o); } cor.push(q); };
    P((k, o) => vent(0.05 + 0.9 * k, 1.2 + 0.1 * Math.sin(k * 9), o));                       // передняя межжелудочковая
    for (const [t0, s] of [[0.2, 1], [0.38, 1], [0.3, -1], [0.55, -1]]) P((k, o) => vent(t0 + 0.4 * k, 1.2 + s * (0.25 + 0.75 * k) + 0.06 * Math.sin(k * 11), o));
    P((k, o) => vent(0.07 + 0.03 * Math.sin(k * 8), 1.2 - k * 4.2, o));                      // правая венечная по борозде
    for (const a0 of [-0.3, -1.3, -2.4]) P((k, o) => vent(0.1 + 0.7 * k, 1.2 + a0 + 0.12 * Math.sin(k * 7), o));
    P((k, o) => vent(0.06 + 0.02 * Math.sin(k * 6), 1.2 + k * 1.9, o));                      // огибающая
    const ves = [
      { p: spline([[-0.02, 0.3, 0.05], [-0.07, 0.52, 0.06], [-0.02, 0.76, 0.02], [0.14, 0.86, -0.08], [0.27, 0.76, -0.2], [0.3, 0.45, -0.27], [0.28, 0.02, -0.3]], 6), ra: 0.09, rb: 0.072, k: 3 },
      { p: [[-0.02, 0.8, 0.0], [-0.08, 1.02, 0.02]], ra: 0.034, rb: 0.03, k: 3.2 }, { p: [[0.08, 0.85, -0.05], [0.09, 1.04, -0.05]], ra: 0.03, rb: 0.026, k: 3.3 }, { p: [[0.2, 0.83, -0.14], [0.27, 1.0, -0.16]], ra: 0.03, rb: 0.026, k: 3.4 },
      { p: spline([[0.1, 0.28, 0.16], [0.07, 0.46, 0.14], [0.04, 0.6, 0.06]], 5), ra: 0.085, rb: 0.075, k: 4 },
      { p: spline([[0.04, 0.6, 0.06], [0.2, 0.64, -0.02], [0.4, 0.6, -0.1]], 5), ra: 0.06, rb: 0.045, k: 4.2 }, { p: spline([[0.04, 0.6, 0.06], [-0.12, 0.62, -0.06], [-0.36, 0.58, -0.12]], 5), ra: 0.06, rb: 0.045, k: 4.3 },
      { p: [[-0.31, 0.5, 0.0], [-0.32, 0.98, -0.03]], ra: 0.062, rb: 0.058, k: 5 }, { p: [[-0.29, 0.18, -0.06], [-0.27, -0.12, -0.12]], ra: 0.064, rb: 0.06, k: 5.2 },
      { p: [[0.26, 0.42, -0.2], [0.44, 0.44, -0.24]], ra: 0.03, rb: 0.026, k: 6 }, { p: [[0.24, 0.32, -0.22], [0.42, 0.3, -0.27]], ra: 0.03, rb: 0.026, k: 6.1 },
    ];
    let a = 0; const vc = ves.map((q) => (a += (q.p.length - 1) * (q.ra + q.rb)));
    return { vent, cor, ves, vc };
  });
  function heart(r, o) {
    const H = HEART(), k = r();
    if (k < 0.46) {
      for (;;) { const t = Math.pow(r(), 0.8), a = r() * TAU; if (r() > 0.4 + 0.6 * Math.abs(Math.sin(a * 5 + t * 8))) continue; H.vent(t, a, o); o[3] = t; break; }   // спиральные мышечные волокна
      return 0;
    }
    if (k < 0.6) { if (r() < 0.5) ell(r, [-0.31, 0.33, 0.04], [0.21, 0.2, 0.19], o); else ell(r, [0.14, 0.4, -0.18], [0.21, 0.17, 0.17], o); o[3] = 1.5 + (o[0] > 0 ? 0.3 : 0); return r() < 0.75 ? 0 : 1; }
    if (k < 0.86) { const q = H.ves[pick(H.vc, r)]; pipe(r, q.p, q.ra, q.rb, o); o[3] = q.k; return r() < 0.15 ? 2 : 0; }
    onPath(H.cor[(r() * H.cor.length) | 0], r(), o); o[0] += gs(r) * 0.006; o[1] += gs(r) * 0.006; o[2] += gs(r) * 0.006; o[3] = 0.5;
    return 2;
  }
  function heartLines(emit) { const H = HEART(); for (const c of H.cor) polyLines(emit, c, 0.9); for (const q of H.ves) polyLines(emit, q.p, 0.35); }
  const heartFix = (f) => (r, o) => { const p = f(r, o); o[0] *= 0.92; o[1] = (o[1] - 0.14) * 0.92; o[2] *= 0.92; return p; };

  /* ---------- ДНК: две цепи со смещением, сахарофосфатный остов из бусин, пары оснований из двух половин ---------- */
  const BP = 34, strand = (t, s, o, R) => { const a = t * TAU * 3.2 + s * 2.45; o[0] = Math.cos(a) * (R || 0.3); o[1] = t * 1.96 - 0.98; o[2] = Math.sin(a) * (R || 0.3); };
  function dna(r, o) {
    const k = r(), p = [0, 0, 0];
    if (k < 0.3) { strand(r(), r() < 0.5 ? 0 : 1, o); const a = r() * TAU; o[0] += Math.cos(a) * 0.022; o[1] += gs(r) * 0.006; o[2] += Math.sin(a) * 0.022; o[3] = -o[1]; return 0; }
    const i = (r() * BP) | 0, t = (i + 0.5) / BP;
    if (k < 0.5) { strand(t, r() < 0.5 ? 0 : 1, p); blobAt(r, p, 0.034, o); o[3] = -o[1]; return 2; }       // фосфатные группы
    if (k < 0.94) {
      // основание: плоская пластинка от цепи к оси, пары встречаются посередине с зазором
      const s = r() < 0.5 ? 0 : 1, u = 0.08 + 0.38 * r(), q = [0, 0, 0];
      strand(t, s, p); strand(t, 1 - s, q);
      o[0] = p[0] + (q[0] - p[0]) * u + gs(r) * 0.006; o[1] = p[1] + (r() - 0.5) * 0.03; o[2] = p[2] + (q[2] - p[2]) * u + gs(r) * 0.006;
      o[3] = -o[1] + (s ? 0.012 : 0);
      return u > 0.42 ? 2 : 0;
    }
    strand(r(), r() < 0.5 ? 0 : 1, o, 0.3 + Math.abs(gs(r)) * 0.14); o[1] += gs(r) * 0.03; o[3] = -o[1];
    return 1;
  }
  function dnaLines(emit) {
    const a = [0, 0, 0], b = [0, 0, 0];
    for (let s = 0; s < 2; s++) for (let i = 0; i < 220; i++) { strand(i / 220, s, a); strand((i + 1) / 220, s, b); emit(a[0], a[1], a[2], b[0], b[1], b[2], 0.9); }
    for (let i = 0; i < BP; i++) { strand((i + 0.5) / BP, 0, a); strand((i + 0.5) / BP, 1, b); emit(a[0], a[1], a[2], b[0], b[1], b[2], 0.45); }
  }

  /* ---------- человек: кожа контуром, внутри скелет, мозг, лёгкие, сердце, спинной мозг и нервы ---------- */
  const BODY = lazy(() => {
    const head = mkLathe([[1, 0.012, 0.012, 0, 0], [0.975, 0.058, 0.07, 0, -0.005], [0.93, 0.076, 0.092, 0, -0.004], [0.88, 0.079, 0.096, 0, 0], [0.83, 0.073, 0.09, 0, 0.006], [0.79, 0.062, 0.074, 0, 0.012], [0.762, 0.042, 0.05, 0, 0.018], [0.75, 0.014, 0.016, 0, 0.022]]);
    const torso = mkLathe([[0.752, 0.036, 0.04, 0, 0], [0.7, 0.042, 0.044, 0, -0.004], [0.672, 0.11, 0.056, 0, -0.006], [0.645, 0.168, 0.072, 0, -0.004], [0.6, 0.172, 0.086, 0, 0], [0.54, 0.16, 0.092, 0, 0.004], [0.47, 0.146, 0.086, 0, 0.004], [0.4, 0.13, 0.076, 0, 0.002], [0.345, 0.124, 0.072, 0, 0], [0.28, 0.136, 0.078, 0, -0.002], [0.22, 0.152, 0.088, 0, -0.004], [0.16, 0.156, 0.092, 0, -0.004], [0.105, 0.135, 0.086, 0, -0.002]]);
    const S = [0.2, 0.632, -0.004], E = [0.25, 0.36, -0.01], W = [0.276, 0.125, 0.02], K = [0.288, 0.04, 0.03];
    const H = [0.086, 0.1, 0], Kn = [0.098, -0.43, 0.008], An = [0.092, -0.915, -0.012], heel = [0.092, -0.97, -0.05], toe = [0.1, -0.985, 0.125];
    const limbs = [
      { a: S, b: E, p: [0.05, 0.05, 0.047, 0.041, 0.036, 0.034] }, { a: E, b: W, p: [0.035, 0.04, 0.037, 0.03, 0.024, 0.021] }, { a: W, b: K, p: [0.022, 0.03, 0.034, 0.033], fz: 0.45 },
      { a: H, b: Kn, p: [0.082, 0.09, 0.083, 0.069, 0.057, 0.05] }, { a: Kn, b: An, p: [0.05, 0.056, 0.058, 0.046, 0.034, 0.03] }, { a: heel, b: toe, p: [0.03, 0.037, 0.035, 0.028, 0.018], fy: 0.6 },
    ];
    const tips = [];
    for (let f = 0; f < 4; f++) { const tp = [K[0] + 0.006, K[1] - 0.088 + Math.abs(f - 1.5) * 0.012, K[2] + (f - 1.5) * 0.021]; tips.push(tp); limbs.push({ a: [K[0], K[1], K[2] + (f - 1.5) * 0.016], b: tp, p: [0.0088, 0.008, 0.007, 0.0055] }); }
    const thumb = [0.262, 0.03, 0.078]; tips.push(thumb); limbs.push({ a: [0.268, 0.1, 0.045], b: thumb, p: [0.011, 0.01, 0.0085, 0.0065] });
    let acc = 0; const lc = limbs.map((q) => (acc += Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1], q.b[2] - q.a[2]) * (q.p[1] + q.p[2]) + 2e-4));
    // скелет: кости справа, слева — зеркально; C — кости по центру
    const sz = (y) => -0.034 + 0.02 * Math.sin((y - 0.13) * 9.5), spine = [];
    for (let i = 0; i <= 34; i++) { const y = 0.762 - 0.642 * (i / 34); spine.push([0, y, sz(y)]); }
    const B = [], C = [spine, [[0, 0.632, 0.086], [0, 0.56, 0.094], [0, 0.47, 0.09]], [[0, 0.2, -0.06], [0, 0.15, -0.075], [0, 0.11, -0.06]]];
    for (let k = 0; k < 12; k++) {
      const y0 = 0.655 - k * 0.021, w = 0.075 + 0.075 * Math.sin(PI * (k + 1.5) / 13), dk = 0.062 + 0.03 * Math.sin(PI * (k + 1) / 12), amax = PI * (k < 7 ? 0.92 : k < 10 ? 0.74 : 0.42), rib = [];
      for (let i = 0; i <= 12; i++) { const a = amax * i / 12; rib.push([w * Math.sin(a), y0 - 0.04 * Math.sin(a * 0.6), sz(y0) + dk * (1 - Math.cos(a))]); }
      B.push(rib);
    }
    B.push([[0.012, 0.635, 0.078], [0.1, 0.652, 0.045], [0.185, 0.645, 0.002]], [[0.1, 0.62, -0.07], [0.172, 0.6, -0.06], [0.12, 0.5, -0.078], [0.1, 0.62, -0.07]]);
    B.push(spline([[0.03, 0.2, -0.06], [0.09, 0.246, -0.05], [0.142, 0.236, 0], [0.136, 0.19, 0.05], [0.08, 0.13, 0.072], [0.01, 0.105, 0.078]], 4), spline([[0.05, 0.13, -0.03], [0.072, 0.08, -0.02], [0.042, 0.07, 0.03], [0.01, 0.1, 0.07]], 4));
    B.push([S, E], [E, [W[0] - 0.012, W[1], W[2] + 0.012]], [[E[0] + 0.006, E[1], E[2] - 0.012], [W[0] + 0.012, W[1], W[2] - 0.01]]);
    for (const tp of tips) B.push([W, [(W[0] + tp[0]) / 2 + 0.004, (W[1] + tp[1]) / 2 + 0.012, (W[2] + tp[2]) / 2], tp]);
    B.push([[0.06, 0.125, 0], [0.125, 0.09, -0.01], Kn], [Kn, An], [[Kn[0] + 0.022, Kn[1] - 0.02, -0.01], [An[0] + 0.018, An[1], -0.02]], [An, heel]);
    for (let f = 0; f < 5; f++) B.push([An, [0.075 + 0.012 * f, -0.965, 0.05], [0.07 + 0.016 * f, -0.985, 0.12 - 0.006 * f]]);
    B.push(spline([[0, 0.765, 0.072], [0.046, 0.776, 0.046], [0.066, 0.81, -0.008], [0.069, 0.862, -0.02]], 4));
    // нервы: спинной мозг и главные стволы
    const N = [spine.map((q) => [0, q[1], q[2] + 0.006])], Nm = [];
    for (const tp of [tips[0], tips[2], tips[4]]) Nm.push(spline([[0.012, 0.66, -0.02], [0.1, 0.645, -0.01], [S[0] - 0.01, S[1] - 0.03, 0.01], [E[0] - 0.012, E[1], 0.012], [W[0] - 0.004, W[1], W[2] + 0.004], tp], 4));
    for (const tx of [0.075, 0.11]) Nm.push(spline([[0.012, 0.17, -0.05], [0.07, 0.11, -0.03], [H[0] + 0.012, 0.0, -0.02], [Kn[0], Kn[1], -0.025], [An[0], An[1] + 0.05, -0.02], [tx, -0.98, 0.11]], 4));
    for (let k = 0; k < 8; k++) Nm.push([[0.01, 0.62 - k * 0.05, sz(0.62 - k * 0.05)], [0.06 + 0.02 * Math.sin(k), 0.6 - k * 0.05, -0.02], [0.1 + 0.025 * Math.sin(k * 2), 0.585 - k * 0.052, 0.02]]);
    const joints = [S, E, W, H, Kn, An];
    return { head, torso, limbs, lc, B, C, N, Nm, joints, spine };
  });
  function body(r, o) {
    const Bd = BODY(), k = r();
    let mirror = true, part;
    if (k < 0.3) {
      // кожа
      const m = r();
      if (m < 0.12) lathe(r, Bd.head, o); else if (m < 0.48) lathe(r, Bd.torso, o);
      else { const q = Bd.limbs[pick(Bd.lc, r)]; tube(r, q.a, q.b, q.p, 0, o); if (q.fz) o[2] = q.a[2] + (o[2] - q.a[2]) * q.fz + (q.b[2] - q.a[2]) * 0.3; if (q.fy) o[1] = q.a[1] + (o[1] - q.a[1]) * q.fy; }
      part = 1;
    } else if (k < 0.62) {
      // кости
      const m = r();
      if (m < 0.2) {
        const q = Bd.spine[(r() * 25 | 0) + 2]; const a = r() * TAU, R = 0.017 * Math.sqrt(r());
        o[0] = Math.cos(a) * R; o[1] = q[1] + (r() - 0.5) * 0.008; o[2] = q[2] + Math.sin(a) * R; mirror = false; part = 2;     // позвонки
      } else if (m < 0.34) { lathe(r, Bd.head, o); o[0] *= 0.9; o[1] = 0.885 + (o[1] - 0.885) * 0.9; o[2] *= 0.9; if (o[1] < 0.8) o[1] = 0.8 + (o[1] - 0.8) * 0.4; part = 0; }
      else if (m < 0.4) { const e = [0.031, 0.888, 0.083], a = r() * TAU; o[0] = e[0] + Math.cos(a) * 0.019; o[1] = e[1] + Math.sin(a) * 0.016; o[2] = e[2]; part = 2; }
      else if (m < 0.46) { blobAt(r, Bd.joints[(r() * 6) | 0], 0.02, o); part = 2; }
      else {
        const cen = r() < 0.12, P = cen ? Bd.C[1 + ((r() * 2) | 0)] : Bd.B[(r() * Bd.B.length) | 0];
        onPath(P, r(), o); const a = r() * TAU, R = 0.007; o[0] += Math.cos(a) * R; o[1] += gs(r) * 0.003; o[2] += Math.sin(a) * R;
        mirror = !cen; part = 0;
      }
    } else if (k < 0.69) { F3D.brainPoint(r, o); o[0] *= 0.076; o[1] = o[1] * 0.076 + 0.895; o[2] = o[2] * 0.076 - 0.004; mirror = false; part = 2; }
    else if (k < 0.78) {
      // лёгкие с бронхами
      const m = r();
      if (m < 0.7) { ell(r, [0.078, 0.535, 0.012], [0.055, 0.095, 0.052], o); if (o[0] < 0.03) o[0] = 0.03 + (o[0] - 0.03) * 0.3; part = 1; }
      else { const t = r(), b = r(); o[0] = 0.01 + 0.07 * t + gs(r) * 0.012 * t; o[1] = 0.6 - 0.07 * t - b * 0.1 * t + gs(r) * 0.02 * t; o[2] = 0.01 + gs(r) * 0.02 * t; part = 0; }
    } else if (k < 0.82) { heart(r, o); o[0] = 0.022 + o[0] * 0.055; o[1] = 0.545 + o[1] * 0.055; o[2] = 0.05 + o[2] * 0.055; mirror = false; part = 2; }
    else {
      const cen = r() < 0.2;
      onPath(cen ? Bd.N[0] : Bd.Nm[(r() * Bd.Nm.length) | 0], r(), o); o[0] += gs(r) * 0.004; o[1] += gs(r) * 0.004; o[2] += gs(r) * 0.004;
      mirror = !cen; part = 2;
    }
    if (mirror && r() < 0.5) o[0] = -o[0];
    return part;
  }
  function bodyLines(emit) { const Bd = BODY(); for (const P of Bd.B) polyLines(emit, P, 0.8, true); for (const P of Bd.C) polyLines(emit, P, 0.9); for (const P of Bd.Nm) polyLines(emit, P, 0.45, true); }

  /* ---------- глаз: радужка из волокон с воротничком и криптами, зрачок, блик, сосуды склеры, веки с ресницами ---------- */
  const EYE = lazy(() => {
    const r = NG.rand("shape:eye"), V = [], Ls = [];
    const sp = (x, y) => [x, y, Math.sqrt(Math.max(0.0001, 0.36 - x * x - y * y)) + 0.002];
    for (let i = 0; i < 16; i++) {
      // сосуды идут от края глазного яблока к радужке и ветвятся
      const a = i / 16 * TAU + r() * 0.3; let rr = 0.58, an = a; const q = [];
      for (let k = 0; k < 9; k++) { q.push(sp(Math.cos(an) * rr, Math.sin(an) * rr)); rr -= 0.022 + r() * 0.012; an += (r() - 0.5) * 0.22; }
      V.push(q);
      if (r() < 0.7) { const b = []; let r2 = q[3][0], an2 = an + (r() < 0.5 ? 0.35 : -0.35), rr2 = Math.hypot(q[3][0], q[3][1]); r2 = rr2; for (let k = 0; k < 5; k++) { b.push(sp(Math.cos(an2) * r2, Math.sin(an2) * r2)); r2 -= 0.02; an2 += (r() - 0.5) * 0.3; } V.push(b); }
    }
    const lid = (x, up) => { const h = up > 0 ? 0.47 * Math.pow(Math.max(0, 1 - x * x), 0.62) * (1 + 0.1 * x) : -0.36 * Math.pow(Math.max(0, 1 - x * x), 0.8); return [x * 0.98 + 0.0, h, 0.34 + 0.27 * (1 - x * x)]; };
    for (let i = 0; i < 44; i++) { const x = -0.9 + 1.8 * (i + r() * 0.6) / 44, b = lid(x, 1), l = 0.1 + 0.07 * Math.sin(PI * (x + 1) / 2) + r() * 0.03, sw = (x - 0.1) * 0.12; Ls.push([b, [b[0] + sw * 0.5, b[1] + l * 0.55, b[2] + 0.07], [b[0] + sw, b[1] + l, b[2] + 0.05]]); }
    for (let i = 0; i < 26; i++) { const x = -0.8 + 1.6 * (i + r() * 0.6) / 26, b = lid(x, -1), l = 0.045 + r() * 0.02; Ls.push([b, [b[0] + (x - 0.1) * 0.05, b[1] - l, b[2] + 0.04]]); }
    return { V, Ls, lid };
  });
  function eye(r, o) {
    const Ey = EYE(), k = r();
    const dome = (x, y) => Math.sqrt(Math.max(0.0001, 0.36 - x * x - y * y)) + 0.035;
    if (k < 0.1) { for (;;) { dir(r, o); if (o[2] > -0.05) break; } o[0] *= 0.6; o[1] *= 0.6; o[2] *= 0.6; o[3] = 0.95; return 1; }
    if (k < 0.2) { onPath(Ey.V[(r() * Ey.V.length) | 0], r(), o); o[0] += gs(r) * 0.004; o[1] += gs(r) * 0.004; o[3] = 0.9; return 0; }
    if (k < 0.66) {
      // радужка: тонкие волнистые волокна, плотнее у зрачка, с промежутками-криптами
      for (;;) {
        const f = ((r() * 150) | 0) / 150 * TAU, rr = 0.128 + 0.2 * Math.pow(r(), 0.85), wav = 0.012 * Math.sin(rr * 70 + f * 9), a = f + wav + gs(r) * 0.004;
        if (rr > 0.19 && r() > 0.42 + 0.58 * Math.abs(Math.sin(f * 11.5) * Math.sin(rr * 46 + f * 3))) continue;
        o[0] = Math.cos(a) * rr; o[1] = Math.sin(a) * rr; o[2] = dome(o[0], o[1]); o[3] = rr;
        return rr < 0.19 ? 2 : 0;
      }
    }
    if (k < 0.74) {
      // край зрачка, зубчатый воротничок и лимб
      const m = r(), a = r() * TAU, rr = m < 0.4 ? 0.126 + gs(r) * 0.002 : m < 0.75 ? 0.19 + 0.008 * Math.sin(a * 26) + gs(r) * 0.002 : 0.332 + gs(r) * 0.004;
      o[0] = Math.cos(a) * rr; o[1] = Math.sin(a) * rr; o[2] = dome(o[0], o[1]); o[3] = rr;
      return m < 0.75 ? 2 : 1;
    }
    if (k < 0.77) { blobAt(r, [0.085, 0.11, 0.6], 0.03, o); o[2] = dome(o[0], o[1]) + 0.012; o[3] = 0.1; return 2; }       // блик на роговице
    if (k < 0.9) {
      const up = r() < 0.6 ? 1 : -1, x = r() * 2 - 1, p = Ey.lid(x, up), m = r();
      o[0] = p[0]; o[1] = p[1] + (m < 0.3 && up > 0 ? 0.09 + 0.05 * (1 - x * x) : 0) + gs(r) * 0.006; o[2] = p[2] + gs(r) * 0.008 - (m < 0.3 && up > 0 ? 0.05 : 0); o[3] = 0.8;
      return m < 0.3 ? 1 : 2;
    }
    if (k < 0.92) { blobAt(r, [-0.93, -0.02, 0.36], 0.045, o); o[3] = 0.85; return 0; }
    onPath(Ey.Ls[(r() * Ey.Ls.length) | 0], Math.pow(r(), 0.8), o); o[3] = 0.85;
    return 1;
  }
  function eyeLines(emit) {
    const Ey = EYE(), z = (x, y) => Math.sqrt(Math.max(0.0001, 0.36 - x * x - y * y)) + 0.035;
    for (let i = 0; i < 75; i++) { const f = i / 75 * TAU, a = 0.13, b = 0.33; emit(Math.cos(f) * a, Math.sin(f) * a, z(Math.cos(f) * a, Math.sin(f) * a), Math.cos(f + 0.03) * b, Math.sin(f + 0.03) * b, z(Math.cos(f) * b, Math.sin(f) * b), 0.4); }
    for (const up of [1, -1]) { const P = []; for (let i = 0; i <= 50; i++) P.push(Ey.lid(-1 + i / 25, up)); polyLines(emit, P, 1); }
    for (const q of Ey.V) polyLines(emit, q, 0.5);
    for (const q of Ey.Ls) polyLines(emit, q, 0.7);
  }

  /* ---------- нейрон: тело с ядром, дендриты с шипиками, аксон в миелиновых муфтах, окончания с пузырьками ---------- */
  const NEURON = lazy(() => {
    const r = NG.rand("shape:neuron"), D = [], A = [], Tm = [], c = { split: 2, extra: 0.32, spread: 0.6, shrink: 0.72, taper: 0.68, bias: [-0.1, 0], tips: [] };
    const C = [-0.42, 0.08, 0];
    for (let i = 0; i < 7; i++) {
      const a = PI * (0.42 + 1.16 * (i / 6)), e = (r() * 2 - 1) * 0.7, d = [Math.cos(a) * Math.cos(e), Math.sin(a) * Math.cos(e), Math.sin(e)];
      grow(D, [C[0] + d[0] * 0.1, C[1] + d[1] * 0.1, d[2] * 0.1], d, 0.19, 0.026, 5, r, c, i);
    }
    for (let i = 0; i <= 48; i++) { const x = -0.31 + 0.93 * (i / 48); A.push([x, 0.06 + 0.06 * Math.sin(x * 7), 0.04 * Math.sin(x * 5)]); }
    const tc = { split: 2, extra: 0.5, spread: 0.7, shrink: 0.72, taper: 0.72, bias: [0.25, 0], tips: [] };
    grow(Tm, A[48], [1, 0.1, 0], 0.1, 0.014, 4, r, tc, 0);
    return { C, D, dc: weights(D), A, Tm, tmc: weights(Tm), tips: tc.tips };
  });
  function neuron(r, o) {
    const Nn = NEURON(), k = r();
    if (k < 0.12) {
      const m = r();
      if (m < 0.6) ell(r, Nn.C, [0.125, 0.115, 0.115], o); else if (m < 0.9) ell(r, [Nn.C[0] + 0.01, Nn.C[1], 0.01], [0.05, 0.05, 0.05], o); else blobAt(r, [Nn.C[0] + 0.02, Nn.C[1] + 0.01, 0.02], 0.016, o);
      return m < 0.6 ? 0 : 2;
    }
    if (k < 0.56) {
      const s = Nn.D[pick(Nn.dc, r)], spine = r() < 0.28;
      tube(r, s.a, s.b, spine ? s.ra + 0.012 + 0.014 * r() : s.ra, spine ? s.rb + 0.012 + 0.014 * r() : s.rb, o);       // шипики на дендритах
      return spine ? 2 : 0;
    }
    if (k < 0.82) {
      const t = r(), m = (t * 8) % 1, hill = t < 0.05;
      onPath(Nn.A, t, o);
      const R = hill ? 0.05 - 0.6 * t : m < 0.08 || m > 0.92 ? 0.011 : 0.046 * (0.8 + 0.2 * Math.sin(PI * m)), a = r() * TAU;
      o[1] += Math.cos(a) * R; o[2] += Math.sin(a) * R;
      return R < 0.02 ? 2 : r() < 0.2 ? 1 : 0;
    }
    if (k < 0.92) { const s = Nn.Tm[pick(Nn.tmc, r)]; tube(r, s.a, s.b, s.ra, s.rb, o); return 0; }
    blobAt(r, Nn.tips[(r() * Nn.tips.length) | 0].p, 0.026, o);
    return 2;
  }
  function neuronLines(emit) { const Nn = NEURON(); for (const s of Nn.D.concat(Nn.Tm)) emit(s.a[0], s.a[1], s.a[2], s.b[0], s.b[1], s.b[2], 0.6); polyLines(emit, Nn.A, 0.9); }

  /* ---------- дерево: ствол с расширением у корней, шесть уровней ветвей, листва гроздьями, корни ---------- */
  const TREE = lazy(() => {
    const r = NG.rand("shape:tree"), W = [], Rt = [];
    const c = { split: 2, extra: 0.42, spread: 0.58, shrink: 0.76, taper: 0.7, bias: [0, 0.16], tips: [] };
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.5, d = [Math.cos(a) * 0.6, 0.8, Math.sin(a) * 0.6]; grow(W, [0.01 * Math.cos(a), -0.36 - 0.035 * i, 0.01 * Math.sin(a)], d, 0.3, 0.046, 5, r, c, i); }
    const rc = { split: 2, extra: 0.4, spread: 0.7, shrink: 0.7, taper: 0.62, bias: [0, -0.08], tips: [] };
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; grow(Rt, [0, -0.92, 0], [Math.cos(a) * 0.92, -0.28, Math.sin(a) * 0.92], 0.18, 0.04, 3, r, rc, i); }
    const twigs = W.filter((s) => s.depth <= 1);
    return { W, wc: weights(W), Rt, rc: weights(Rt), twigs, trunk: mkLathe([[-0.96, 0.12, 0.12, 0, 0], [-0.9, 0.085, 0.085, 0, 0], [-0.75, 0.07, 0.07, 0, 0], [-0.5, 0.062, 0.062, 0.006, 0], [-0.34, 0.056, 0.056, 0.01, 0]]) };
  });
  function tree(r, o) {
    const Tr = TREE(), k = r();
    if (k < 0.56) {
      // лист у случайной тонкой ветки
      const s = Tr.twigs[(r() * Tr.twigs.length) | 0], t = r(), sp = 0.035 + 0.05 * r();
      o[0] = s.a[0] + (s.b[0] - s.a[0]) * t + gs(r) * sp; o[1] = s.a[1] + (s.b[1] - s.a[1]) * t + gs(r) * sp * 0.8; o[2] = s.a[2] + (s.b[2] - s.a[2]) * t + gs(r) * sp;
      o[3] = s.tag + 0.2 - 0.2 * o[1];
      return r() < 0.12 ? 2 : 0;
    }
    if (k < 0.7) { for (;;) { lathe(r, Tr.trunk, o); if (r() < 0.35 + 0.65 * Math.abs(Math.sin(Math.atan2(o[2], o[0]) * 9 + o[1] * 4))) break; } o[3] = 4.6; return 1; }       // кора бороздами
    if (k < 0.9) { const s = Tr.W[pick(Tr.wc, r)]; tube(r, s.a, s.b, s.ra, s.rb, o); o[3] = s.tag + 0.5 - 0.2 * o[1]; return s.depth < 2 ? 0 : 1; }
    const s = Tr.Rt[pick(Tr.rc, r)]; tube(r, s.a, s.b, s.ra, s.rb, o); o[3] = 5;
    return 1;
  }
  function treeLines(emit) { const Tr = TREE(); for (const s of Tr.W.concat(Tr.Rt)) emit(s.a[0], s.a[1], s.a[2], s.b[0], s.b[1], s.b[2], s.depth < 3 ? 0.45 : 0.8); }

  /* ---------- цветок Flora: пять лепестков с выемкой и волнистым краем, жилки, тычинки с пыльниками, чашелистики, стебель с листьями ---------- */
  function petal(k, u, v, o, sc, tw) {
    const f = PI / 2 - k * TAU / 5 + (tw || 0), s = sc || 1, rho = (0.07 + 0.8 * u * (1 - 0.06 * Math.exp(-v * v * 9) * Math.pow(u, 6))) * s;
    const lat = v * 0.32 * s * Math.pow(Math.sin(PI * Math.min(1, u * 1.01)), 0.72) * (1 - 0.18 * u);
    o[0] = (Math.cos(f) * rho - Math.sin(f) * lat) * 0.76; o[1] = (Math.sin(f) * rho + Math.cos(f) * lat) * 0.76 + 0.3;
    o[2] = (0.34 * u * u * s - 1.1 * lat * lat + 0.018 * u * Math.sin(v * 9 + k) * Math.sin(u * 5)) * 0.76 + (sc ? 0.05 : 0);
  }
  const stemAt = (t, o) => { o[0] = 0.09 * Math.sin(t * 2.4); o[1] = 0.3 - t * 1.27; o[2] = -0.05 - 0.24 * t; };
  function leaf(side, at, u, v, o) { const b = [0, 0, 0]; stemAt(at, b); const L = 0.34 * u, w = v * 0.085 * Math.sin(PI * u) ; o[0] = b[0] + side * L * 0.9 + 0; o[1] = b[1] + L * 0.42 - 0.3 * L * L + w * 0.5; o[2] = b[2] + 0.05 * u + w * side * 0.6 + 0.02; }
  function flower(r, o) {
    const k = r();
    if (k < 0.66) {
      const p = (r() * 5) | 0, m = r(), u = Math.pow(r(), 0.72), inner = r() < 0.25;
      const v = m < 0.26 ? (r() < 0.5 ? -1 : 1) * (0.965 + 0.035 * r()) : m < 0.5 ? (((r() * 7) | 0) - 3) / 3.4 * (0.25 + 0.75 * u) + gs(r) * 0.012 : r() * 2 - 1;
      petal(p, u, v, o, inner ? 0.55 : 1, inner ? TAU / 10 : 0);
      o[2] += gs(r) * 0.005; o[3] = p + 0.3 * u + (inner ? 0.4 : 0);
      return m < 0.5 ? 2 : 0;
    }
    if (k < 0.76) {
      // тычинки: нити расходятся из центра, на концах пыльники
      const i = (r() * 14) | 0, a = i / 14 * TAU + 0.2, t = r(), L = 0.17 + 0.05 * Math.sin(i * 3), an = t > 0.86;
      o[0] = Math.cos(a) * L * t * 0.8; o[1] = 0.3 + Math.sin(a) * L * t * 0.8; o[2] = 0.05 + 0.2 * t - 0.07 * t * t;
      if (an) { o[0] += gs(r) * 0.012; o[1] += gs(r) * 0.012; o[2] += gs(r) * 0.01; }
      o[3] = 5;
      return an ? 2 : 0;
    }
    if (k < 0.8) { blobAt(r, [0, 0.3, 0.07], 0.045, o); o[3] = 5; return 2; }
    if (k < 0.86) { const p = (r() * 5) | 0; petal(p, r() * 0.42, r() * 2 - 1, o, 0.6, TAU / 10); o[2] = -0.02 - Math.abs(o[2]) * 0.6; o[3] = 6; return 1; }       // чашелистики
    if (k < 0.93) { stemAt(r(), o); const a = r() * TAU; o[0] += Math.cos(a) * 0.02; o[2] += Math.sin(a) * 0.02; o[3] = 6.2 - o[1]; return 1; }
    const side = r() < 0.5 ? -1 : 1, m = r();
    leaf(side, side > 0 ? 0.48 : 0.66, Math.pow(r(), 0.8), m < 0.3 ? (r() < 0.5 ? -1 : 1) : m < 0.45 ? 0 : r() * 2 - 1, o); o[3] = 6.5 - o[1];
    return m < 0.45 ? 0 : 1;
  }
  function flowerLines(emit) {
    const a = [0, 0, 0], b = [0, 0, 0];
    for (let p = 0; p < 5; p++) for (const v of [-1, -0.6, -0.3, 0, 0.3, 0.6, 1]) for (let i = 0; i < 24; i++) { const w0 = Math.abs(v) < 1 ? v * (0.25 + 0.75 * i / 24) : v, w1 = Math.abs(v) < 1 ? v * (0.25 + 0.75 * (i + 1) / 24) : v; petal(p, i / 24, w0, a); petal(p, (i + 1) / 24, w1, b); emit(a[0], a[1], a[2], b[0], b[1], b[2], Math.abs(v) === 1 ? 0.9 : 0.4); }
    for (let i = 0; i < 30; i++) { stemAt(i / 30, a); stemAt((i + 1) / 30, b); emit(a[0], a[1], a[2], b[0], b[1], b[2], 0.7); }
    for (const [side, at] of [[1, 0.48], [-1, 0.66]]) for (const v of [-1, 0, 1]) for (let i = 0; i < 12; i++) { leaf(side, at, i / 12, v, a); leaf(side, at, (i + 1) / 12, v, b); emit(a[0], a[1], a[2], b[0], b[1], b[2], 0.6); }
  }

  /* ---------- бабочка: передние и задние крылья своей формы, ячейка и жилки, тёмная кайма с пятнами, тело из трёх отделов, усики с булавами ---------- */
  const FLY = lazy(() => {
    const fw = spline([[0.035, 0.12], [0.22, 0.44], [0.52, 0.72], [0.82, 0.86], [0.97, 0.8], [0.95, 0.6], [0.84, 0.38], [0.72, 0.2], [0.42, 0.1], [0.16, 0.065]], 7, true);
    const hw = spline([[0.035, 0.03], [0.3, 0.06], [0.62, 0.1], [0.74, -0.04], [0.73, -0.3], [0.6, -0.55], [0.42, -0.7], [0.24, -0.68], [0.11, -0.46], [0.05, -0.2]], 7, true);
    const mk = (P) => { let a = 0; const cum = []; for (let i = 1; i + 1 < P.length; i++) cum.push((a += Math.abs((P[i][0] - P[0][0]) * (P[i + 1][1] - P[0][1]) - (P[i + 1][0] - P[0][0]) * (P[i][1] - P[0][1])) + 1e-5)); return { P, cum }; };
    return { w: [mk(fw), mk(hw)], cell: [[0.4, 0.42], [0.36, -0.2]] };
  });
  const wz = (x, y) => 0.11 * Math.abs(x) + 0.02 * Math.sin(y * 6);
  function butterfly(r, o) {
    const Fl = FLY(), k = r();
    if (k < 0.1) {
      const m = r();
      if (m < 0.14) blobAt(r, [0, 0.215, 0.01], 0.03, o); else if (m < 0.45) ell(r, [0, 0.11, 0.01], [0.036, 0.08, 0.042], o);
      else { const t = r(), R = 0.032 * (1 - 0.8 * t) * (0.86 + 0.14 * Math.abs(Math.sin(t * 28))), a = r() * TAU; o[0] = Math.cos(a) * R; o[1] = 0.04 - 0.36 * t; o[2] = Math.sin(a) * R; }
      o[3] = 0; return 2;
    }
    if (k < 0.14) { const s = r() < 0.5 ? -1 : 1, t = r(), club = t > 0.9; o[0] = s * (0.02 + 0.2 * t * t) + (club ? gs(r) * 0.008 : 0); o[1] = 0.23 + 0.4 * t + (club ? gs(r) * 0.01 : 0); o[2] = 0.03 * t; o[3] = 0; return 2; }
    const wi = r() < 0.56 ? 0 : 1, Wg = Fl.w[wi], P = Wg.P, root = P[0], i = pick(Wg.cum, r) + 1, m = r(), cell = Fl.cell[wi];
    let f, e = r();
    if (m < 0.2) f = 0.955 + 0.045 * r();                               // кромка
    else if (m < 0.42) { f = 0.82 + 0.12 * (r() < 0.5 ? 0.25 : 0.8) + gs(r) * 0.012; e = (((e * 9) | 0) + 0.5) / 9; }     // два ряда пятен в кайме
    else if (m < 0.66) { f = r(); e = r() < 0.5 ? 0.02 : 0.98; }         // жилки: идут вдоль лучей к каждой вершине края
    else f = Math.sqrt(r());
    const ex = P[i][0] + (P[i + 1][0] - P[i][0]) * e, ey = P[i][1] + (P[i + 1][1] - P[i][1]) * e;
    // жилки начинаются от конца срединной ячейки, а не от корня
    const sx = f > 0.45 ? cell[0] + (root[0] - cell[0]) * 0.35 : root[0], sy = f > 0.45 ? cell[1] + (root[1] - cell[1]) * 0.35 : root[1], g = m >= 0.42 && m < 0.66 && f > 0.45 ? (f - 0.45) / 0.55 : null;
    let x = g == null ? root[0] + (ex - root[0]) * f : sx + (ex - sx) * g, y = g == null ? root[1] + (ey - root[1]) * f : sy + (ey - sy) * g;
    if (r() < 0.5) x = -x;
    o[0] = x; o[1] = y - 0.04; o[2] = wz(x, y) + gs(r) * 0.006; o[3] = Math.hypot(x, y - 0.05) + wi * 0.02;
    return m < 0.2 ? 1 : m < 0.42 ? 2 : m < 0.66 ? 2 : f > 0.8 ? 1 : 0;
  }
  function butterflyLines(emit) {
    const Fl = FLY();
    for (let wi = 0; wi < 2; wi++) {
      const P = Fl.w[wi].P, c = Fl.cell[wi], n = P.length;
      for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; for (const s of [1, -1]) emit(s * a[0], a[1] - 0.04, wz(a[0], a[1]), s * b[0], b[1] - 0.04, wz(b[0], b[1]), 1); }
      const sx = c[0] + (P[0][0] - c[0]) * 0.35, sy = c[1] + (P[0][1] - c[1]) * 0.35;
      for (let i = 6; i < n - 4; i += 5) for (const s of [1, -1]) emit(s * sx, sy - 0.04, wz(sx, sy), s * P[i][0], P[i][1] - 0.04, wz(P[i][0], P[i][1]), 0.5);
      for (const s of [1, -1]) { emit(s * P[0][0], P[0][1] - 0.04, 0, s * sx, sy - 0.04, wz(sx, sy), 0.6); emit(s * P[0][0], P[0][1] - 0.04, 0, s * c[0], c[1] - 0.04, wz(c[0], c[1]), 0.6); emit(s * sx, sy - 0.04, wz(sx, sy), s * c[0], c[1] - 0.04, wz(c[0], c[1]), 0.6); }
    }
  }

  /* ---------- медуза: купол с радиальными каналами, кольцевой канал, четыре гонады, ротовые лопасти с оборками, щупальца разной длины ---------- */
  const NT = 28, tentAt = (k, t, o) => { const a = k / NT * TAU, R = 0.484 * (1 - 0.3 * t), L = 1.1 + 0.42 * Math.sin(k * 2.3); o[0] = R * Math.cos(a) + 0.045 * Math.sin(t * 9 + k); o[1] = 0.535 - t * L; o[2] = R * Math.sin(a) + 0.045 * Math.cos(t * 8 + k * 2); };
  function jelly(r, o) {
    const k = r();
    if (k < 0.38) {
      const inner = k > 0.31;
      for (;;) {
        const a = r() * TAU, cf = 1 - r() * 0.75, sf = Math.sqrt(1 - cf * cf), R = inner ? 0.37 : 0.5;
        if (!inner && r() > 0.22 + 0.78 * Math.pow(Math.abs(Math.cos(a * 8)), 6) && r() > 0.3) continue;
        o[0] = R * sf * Math.cos(a); o[1] = 0.42 + 0.46 * cf * (inner ? 0.8 : 1); o[2] = R * sf * Math.sin(a);
        return inner ? 1 : 0;
      }
    }
    if (k < 0.45) { const a = r() * TAU; o[0] = 0.484 * Math.cos(a); o[1] = 0.535 + 0.022 * Math.sin(a * NT) + gs(r) * 0.005; o[2] = 0.484 * Math.sin(a); return 2; }
    if (k < 0.53) { const q = (r() * 4) | 0, a = q * TAU / 4 + 0.39 + (r() - 0.5) * 0.9, R = 0.17 + 0.05 * Math.cos((a - q * TAU / 4 - 0.39) * 3.4) + gs(r) * 0.008; o[0] = R * Math.cos(a); o[1] = 0.74 + gs(r) * 0.012; o[2] = R * Math.sin(a); return 2; }       // гонады
    if (k < 0.74) {
      const q = (r() * 4) | 0, t = r(), a = q * TAU / 4 + t * 2.4, R = 0.09 + 0.05 * Math.sin(t * 9), w = (r() * 2 - 1) * 0.05 * (1 + 2 * t), ru = 0.02 * Math.sin(w * 90 + t * 30) * (1 + 2 * t);
      o[0] = R * Math.cos(a) + Math.cos(a + 1.57) * w + ru; o[1] = 0.52 - t * 1.0; o[2] = R * Math.sin(a) + Math.sin(a + 1.57) * w + ru;
      return Math.abs(w) > 0.045 * (1 + 2 * t) ? 2 : 0;
    }
    tentAt((r() * NT) | 0, Math.pow(r(), 0.85), o); o[0] += gs(r) * 0.005; o[2] += gs(r) * 0.005;
    return r() < 0.22 ? 2 : 0;
  }
  function jellyLines(emit) {
    const a = [0, 0, 0], b = [0, 0, 0];
    for (let k = 0; k < NT; k++) for (let i = 0; i < 26; i++) { tentAt(k, i / 26, a); tentAt(k, (i + 1) / 26, b); emit(a[0], a[1], a[2], b[0], b[1], b[2], 0.7 * (1 - i / 30)); }
    for (let k = 0; k < 16; k++) for (let i = 0; i < 10; i++) { const an = k / 16 * TAU, f = (c) => { const cf = 1 - c * 0.75, sf = Math.sqrt(1 - cf * cf); return [0.5 * sf * Math.cos(an), 0.42 + 0.46 * cf, 0.5 * sf * Math.sin(an)]; }, p = f(i / 10), q = f((i + 1) / 10); emit(p[0], p[1], p[2], q[0], q[1], q[2], 0.5); }
  }

  /* ---------- паук: брюшко с рисунком и паутинными бородавками, головогрудь, восемь глаз, хелицеры, педипальпы, ноги из пяти члеников с волосками ---------- */
  const SPIDER = lazy(() => {
    const Lg = [], up = 0.1, Pp = [];
    for (const s of [-1, 1]) {
      [34, 66, 102, 140].forEach((deg, i) => {
        const be = deg * PI / 180, h = [s * Math.sin(be), 0, Math.cos(be)], k = i === 0 || i === 3 ? 1.1 : 0.92, p0 = [s * 0.13 * Math.sin(be), 0.03 + up, 0.1 + 0.15 * Math.cos(be)];
        const st = (p, l, dy) => [p[0] + h[0] * l * k, p[1] + dy, p[2] + h[2] * l * k];
        const p1 = st(p0, 0.06, 0.03), p2 = st(p1, 0.2, 0.28), p3 = st(p2, 0.1, 0.05), p4 = st(p3, 0.26, -0.3), p5 = st(p4, 0.2, -0.34), p6 = st(p5, 0.05, -0.06);
        Lg.push([p0, p1, p2, p3, p4, p5, p6]);
      });
      Pp.push([[s * 0.06, 0.02 + up, 0.27], [s * 0.1, 0.07 + up, 0.37], [s * 0.09, -0.02 + up, 0.44], [s * 0.08, -0.08 + up, 0.45]]);
    }
    return { Lg, Pp, up };
  });
  function spider(r, o) {
    const Sp = SPIDER(), k = r(), up = Sp.up;
    if (k < 0.24) {
      ell(r, [0, 0.1 + up, -0.36], [0.27, 0.23, 0.34], o);
      const z = o[2] + 0.36, top = o[1] > 0.2 + up, mark = top && (Math.abs(o[0]) < 0.03 + 0.05 * Math.abs(Math.sin(z * 14)) || (Math.abs(z + 0.02) < 0.03 && Math.abs(o[0]) < 0.14));
      o[3] = 0;
      return mark ? 2 : r() < 0.45 + 0.55 * Math.cos(z * 30) ? 0 : 1;
    }
    if (k < 0.27) { const s = r() < 0.5 ? -1 : 1; tube(r, [s * 0.03, 0.02 + up, -0.68], [s * 0.035, -0.02 + up, -0.74], 0.02, 0.008, o); o[3] = 0; return 2; }
    if (k < 0.37) { ell(r, [0, 0.04 + up, 0.1], [0.17, 0.12, 0.2], o); if (Math.abs(o[0]) < 0.012 && o[1] > 0.1 + up) o[1] -= 0.01; o[3] = 1; return 0; }
    if (k < 0.41) { const i = (r() * 8) | 0, row = i < 4 ? 0 : 1, j = i % 4, e = [(j - 1.5) * (row ? 0.05 : 0.036), 0.1 + up + row * 0.035, 0.285 - row * 0.03]; blobAt(r, e, row ? 0.012 : 0.016, o); o[3] = 1; return 2; }
    if (k < 0.45) { const s = r() < 0.5 ? -1 : 1, t = r(); if (t < 0.6) tube(r, [s * 0.04, 0.02 + up, 0.29], [s * 0.045, -0.06 + up, 0.33], 0.03, 0.022, o); else tube(r, [s * 0.045, -0.06 + up, 0.33], [s * 0.02, -0.13 + up, 0.31], 0.012, 0.003, o); o[3] = 1; return t < 0.6 ? 0 : 2; }
    if (k < 0.5) { const P = Sp.Pp[(r() * 2) | 0]; pipe(r, P, 0.022, 0.012, o); o[3] = 1.5; return 0; }
    const li = (r() * 8) | 0, P = Sp.Lg[li], sg = (r() * 6) | 0, m = r(), R = [0.036, 0.034, 0.03, 0.026, 0.02, 0.013, 0.006];
    o[3] = 2 + li / 8;
    if (m < 0.1) { blobAt(r, P[1 + ((r() * 5) | 0)], 0.03, o); return 2; }
    tube(r, P[sg], P[sg + 1], m < 0.34 ? R[sg] + 0.012 + 0.03 * r() : R[sg], m < 0.34 ? R[sg + 1] + 0.012 + 0.03 * r() : R[sg + 1], o);       // волоски вокруг ног
    return m < 0.34 ? 1 : 0;
  }
  function spiderLines(emit) { const Sp = SPIDER(); for (const P of Sp.Lg.concat(Sp.Pp)) polyLines(emit, P, 0.85); }

  /* ---------- узел ---------- */
  const knotAt = (t, o) => { const c = 2 + Math.cos(3 * t); o[0] = c * Math.cos(2 * t) / 3.3; o[1] = c * Math.sin(2 * t) / 3.3; o[2] = Math.sin(3 * t) * 1.25 / 3.3; };
  function knot(r, o) {
    const t = r() * TAU, a = [0, 0, 0], b = [0, 0, 0];
    knotAt(t, a); knotAt(t + 0.01, b);
    if (r() < 0.2) { o[0] = a[0] + gs(r) * 0.006; o[1] = a[1] + gs(r) * 0.006; o[2] = a[2] + gs(r) * 0.006; o[3] = t; return 2; }
    tube(r, a, b, 0.09, 0.09, o, 0); o[3] = t;
    return r() < 0.3 + 0.7 * Math.abs(Math.sin(t * 24)) ? 0 : 1;
  }
  function knotLines(emit) { const a = [0, 0, 0], b = [0, 0, 0]; for (let i = 0; i < 360; i++) { knotAt(i / 360 * TAU, a); knotAt((i + 1) / 360 * TAU, b); emit(a[0], a[1], a[2], b[0], b[1], b[2], 0.8); } }

  /* ---------- планета: полосы облаков, кольца C, B, A со щелями Кассини и Энке, тонкое кольцо F, спутники ---------- */
  const tilt = (o) => { const x = o[0], y = o[1], z = o[2], c = Math.cos(0.42), s = Math.sin(0.42), y1 = y * c - x * s, x1 = x * c + y * s, c2 = Math.cos(0.3), s2 = Math.sin(0.3); o[0] = x1; o[1] = y1 * c2 - z * s2; o[2] = z * c2 + y1 * s2; };
  function saturn(r, o) {
    const k = r();
    if (k < 0.4) { for (;;) { dir(r, o); if (r() < 0.18 + 0.82 * (0.5 + 0.5 * Math.sin(o[1] * 19 + 0.6 * Math.sin(o[1] * 7)))) break; } o[3] = 0.2 + 0.2 * o[1]; o[0] *= 0.4; o[1] *= 0.365; o[2] *= 0.4; tilt(o); return 0; }
    if (k < 0.43) { const m = (r() * 3) | 0, c = [[0.78, 0.02, 0.5], [-0.9, -0.03, 0.2], [0.3, 0.05, -0.95]][m]; blobAt(r, c, 0.02, o); o[3] = 1.2; tilt(o); return 2; }
    let rr;
    for (;;) { rr = 0.5 + 0.5 * r(); if (rr > 0.742 && rr < 0.782) continue; if (rr > 0.878 && rr < 0.888) continue; if (rr > 0.925 && rr < 0.965) continue; if (rr < 0.58 && r() < 0.7) continue; if (rr > 0.975 && r() < 0.6) continue; break; }
    const a = r() * TAU; o[0] = rr * Math.cos(a); o[1] = gs(r) * 0.003; o[2] = rr * Math.sin(a); o[3] = rr; tilt(o);
    return rr < 0.58 ? 1 : rr < 0.742 ? 0 : rr > 0.965 ? 2 : 0;
  }
  function saturnLines(emit) { const a = [0, 0, 0], b = [0, 0, 0]; for (const rr of [0.5, 0.58, 0.742, 0.782, 0.925, 0.97]) for (let i = 0; i < 140; i++) { const f = i / 140 * TAU, g = (i + 1) / 140 * TAU; a[0] = rr * Math.cos(f); a[1] = 0; a[2] = rr * Math.sin(f); b[0] = rr * Math.cos(g); b[1] = 0; b[2] = rr * Math.sin(g); tilt(a); tilt(b); emit(a[0], a[1], a[2], b[0], b[1], b[2], 0.4); } }

  /* ---------- своя форма: слово или картинка ---------- */
  function fromMask(id, cv, keyX, lineH) {
    const w = cv.width, h = cv.height, d = cv.getContext("2d").getImageData(0, 0, w, h).data;
    const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 110;
    const fill = [], edge = [];
    let x0 = w, x1 = 0, y0 = h, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue;
      fill.push(y * w + x);
      if (!on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1)) edge.push(y * w + x);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (fill.length < 12) return null;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, sc = 1.9 / Math.max(x1 - x0 + 1, (y1 - y0 + 1) * 1.15);
    return {
      id, cat: "custom", scale: 96, fit: 1.0, pose: { yaw: 0, pitch: 0.02 }, key: "custom", build: keyX ? 3 : 2, anim: {},
      sample(r, o) {
        const e = r() < 0.4, p = e ? edge[(r() * edge.length) | 0] : fill[(r() * fill.length) | 0], px = p % w, py = (p / w) | 0;
        o[0] = (px + r() - 0.5 - cx) * sc; o[1] = -(py + r() - 0.5 - cy) * sc; o[2] = gs(r) * (e ? 0.012 : 0.04);
        o[3] = keyX ? Math.round((py - y0) / (lineH || h)) * 10 + o[0] : -o[1];
        return e ? 2 : 0;
      },
    };
  }
  function textShape(doc, text) {
    text = String(text || "").trim().slice(0, 60);
    if (!text) return null;
    const cv = doc.createElement("canvas"); cv.width = 720; cv.height = 360;
    const g = cv.getContext("2d"), words = text.split(/\s+/);
    const nl = text.length > 22 ? 3 : text.length > 9 && words.length > 1 ? 2 : 1, lines = [];
    const per = Math.ceil(text.length / nl);
    let cur = "";
    for (const wd of words) { if (cur && (cur + " " + wd).length > per && lines.length < nl - 1) { lines.push(cur); cur = wd; } else cur = cur ? cur + " " + wd : wd; }
    lines.push(cur);
    let fs = Math.min(200, 330 / lines.length);
    const font = () => (g.font = "800 " + fs + 'px -apple-system, "Segoe UI", system-ui, sans-serif');
    font();
    while (fs > 24 && Math.max(...lines.map((l) => g.measureText(l).width)) > 690) { fs -= 6; font(); }
    g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
    lines.forEach((l, i) => g.fillText(l, 360, 180 + (i - (lines.length - 1) / 2) * fs * 1.08));
    return fromMask("word", cv, true, fs * 1.08);
  }
  function maskFromImage(doc, img) {
    const m = 220 / Math.max(img.width, img.height), cv = doc.createElement("canvas");
    cv.width = Math.max(8, Math.round(img.width * m)); cv.height = Math.max(8, Math.round(img.height * m));
    const g = cv.getContext("2d"); g.drawImage(img, 0, 0, cv.width, cv.height);
    const im = g.getImageData(0, 0, cv.width, cv.height), d = im.data, n = cv.width * cv.height;
    let clear = 0;
    for (let i = 0; i < n; i++) if (d[i * 4 + 3] < 200) clear++;
    const c = [0, 0, 0];
    for (const i of [0, cv.width - 1, n - cv.width, n - 1]) for (let k = 0; k < 3; k++) c[k] += d[i * 4 + k] / 4;
    for (let i = 0; i < n; i++) {
      const fg = clear > n * 0.04 ? d[i * 4 + 3] > 128 : Math.abs(d[i * 4] - c[0]) + Math.abs(d[i * 4 + 1] - c[1]) + Math.abs(d[i * 4 + 2] - c[2]) > 90;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255; d[i * 4 + 3] = fg ? 255 : 0;
    }
    g.putImageData(im, 0, 0);
    return cv;
  }
  function loadImage(doc, src) { return new Promise((res, rej) => { const im = doc.createElement("img"); im.onload = () => res(im); im.onerror = rej; im.src = src; }); }

  /* ---------- каталог ---------- */
  const blob = (C) => (r, o) => { const c = C[(r() * C.length) | 0]; o[0] = c[0] + gs(r) * c[3]; o[1] = c[1] + gs(r) * c[3]; o[2] = c[2] + gs(r) * c[3]; return 0; };
  const P1 = [[-0.4, 0.3, 0, 0.2], [0.35, 0.35, 0.1, 0.17], [0.1, -0.2, 0, 0.24], [-0.45, -0.4, 0, 0.14], [0.55, -0.35, 0, 0.13]];
  const SHAPES = [
    { id: "organism", cat: "data", name: () => L("Организм", "Organism"), prev: blob(P1) },
    { id: "spheres", cat: "data", name: () => L("Сферы", "Spheres"), prev: (r, o) => { const c = P1[(r() * 5) | 0]; dir(r, o); o[0] = c[0] + o[0] * c[3] * 1.2; o[1] = c[1] + o[1] * c[3] * 1.2; o[2] = o[2] * c[3]; return 0; } },
    { id: "galaxy", cat: "data", name: () => L("Галактика", "Galaxy"), prev: (r, o) => { const t = r(), a = ((r() * 3) | 0) * TAU / 3 + 2.4 * Math.log(1 + t * 6), R = 0.1 + 0.85 * Math.sqrt(t); o[0] = Math.cos(a) * R + gs(r) * 0.05; o[1] = (Math.sin(a) * R + gs(r) * 0.05) * 0.55; o[2] = 0; return 0; } },
    { id: "brain", cat: "anatomy", name: () => L("Мозг", "Brain"), prev: (r, o) => { F3D.brainPoint(r, o); const x = o[0]; o[0] = o[2] * 0.85; o[2] = x; o[1] = o[1] * 0.85 + 0.1; return 0; } },
    { id: "anatomy", cat: "anatomy", name: () => L("Нервы", "Nerves"), prev: (r, o) => { if (r() < 0.5) { F3D.brainPoint(r, o); o[0] *= 0.36; o[1] = o[1] * 0.36 + 0.6; o[2] *= 0.36; } else { const t = r(), s = r() < 0.5 ? -1 : 1, u = r() < 0.4 ? 0 : r(); o[0] = s * u * 0.34 * Math.sin(PI * Math.min(1, t * 1.6)); o[1] = 0.4 - t * 1.35 - u * 0.12; o[2] = 0; } return 0; } },
    { id: "body", cat: "anatomy", name: () => L("Человек", "Human"), sample: body, lines: bodyLines, key: "y", build: 1, scale: 100, fit: 1.06, pose: { yaw: 0.3, pitch: 0.03 }, anim: {}, dust: 1.6 },
    { id: "heart", cat: "anatomy", name: () => L("Сердце", "Heart"), sample: heartFix(heart), lines: (emit) => heartLines((a, b, c, d, e, f, al) => emit(a * 0.92, (b - 0.14) * 0.92, c * 0.92, d * 0.92, (e - 0.14) * 0.92, f * 0.92, al)), key: "custom", build: 1, scale: 96, fit: 0.98, pose: { yaw: 0.15, pitch: 0.05 }, anim: { beat: 0.045 }, dust: 1.4 },
    { id: "eye", cat: "anatomy", name: () => L("Глаз", "Eye"), sample: eye, lines: eyeLines, key: "custom", build: 2, scale: 96, fit: 0.92, pose: { yaw: 0.16, pitch: 0.04 }, anim: {}, dust: 1.4 },
    { id: "neuron", cat: "anatomy", name: () => L("Нейрон", "Neuron"), sample: neuron, lines: neuronLines, key: "x", build: 3, scale: 100, fit: 0.9, pose: { yaw: 0.15, pitch: 0.08 }, anim: {}, dust: 1.2 },
    { id: "dna", cat: "anatomy", name: () => L("ДНК", "DNA"), sample: dna, lines: dnaLines, key: "custom", build: 1, scale: 98, fit: 1.02, pose: { yaw: 0.3, pitch: 0.1 }, anim: {}, dust: 1.2 },
    { id: "flower", cat: "nature", name: () => L("Цветок", "Flower"), sample: flower, lines: flowerLines, key: "custom", build: 2, scale: 98, fit: 1.0, pose: { yaw: 0.22, pitch: 0.1 }, anim: {}, dust: 1.3 },
    { id: "tree", cat: "nature", name: () => L("Дерево", "Tree"), sample: tree, lines: treeLines, key: "custom", build: 1, scale: 100, fit: 1.05, pose: { yaw: 0.4, pitch: 0.08 }, anim: {}, dust: 1.5 },
    { id: "butterfly", cat: "nature", name: () => L("Бабочка", "Butterfly"), sample: butterfly, lines: butterflyLines, key: "custom", build: 2, scale: 100, fit: 0.98, pose: { yaw: 0.22, pitch: 0.14 }, anim: { flap: 0.5 }, dust: 1.4 },
    { id: "jellyfish", cat: "nature", name: () => L("Медуза", "Jellyfish"), sample: jelly, lines: jellyLines, key: "y", build: 1, scale: 100, fit: 1.05, pose: { yaw: 0.3, pitch: 0.06 }, anim: { sway: 1 }, dust: 1.3 },
    { id: "spider", cat: "nature", name: () => L("Паук", "Spider"), sample: spider, lines: spiderLines, key: "custom", build: 2, scale: 98, fit: 1.02, pose: { yaw: 0.6, pitch: 0.42 }, anim: {}, dust: 1.3 },
    { id: "knot", cat: "abstract", name: () => L("Узел", "Knot"), sample: knot, lines: knotLines, key: "custom", build: 0, scale: 100, fit: 0.95, pose: { yaw: 0.2, pitch: 0.5 }, anim: {} },
    { id: "saturn", cat: "abstract", name: () => L("Планета", "Planet"), sample: saturn, lines: saturnLines, key: "custom", build: 2, scale: 98, fit: 0.98, pose: { yaw: 0.2, pitch: 0.24 }, anim: {}, dust: 1.2 },
  ];
  const CATS = [["data", () => L("По связям", "By links")], ["anatomy", () => L("Анатомия", "Anatomy")], ["nature", () => L("Живое", "Living")], ["abstract", () => L("Абстракция", "Abstract")]];
  const custom = {};
  function get(id) { if (id === "word" || id === "image") return custom[id] || null; const s = SHAPES.find((x) => x.id === id); return s && s.sample ? s : null; }
  const known = (id) => id === "word" || id === "image" || SHAPES.some((x) => x.id === id);
  const keyOf = (sh, o) => (sh.key === "x" ? o[0] : sh.key === "custom" ? o[3] : -o[1]);

  function preview(cv, sh) {
    const g = cv.getContext("2d"), w = cv.width, h = cv.height, f = sh.sample || sh.prev, r = NG.rand("prev:" + sh.id), o = [0, 0, 0, 0];
    g.clearRect(0, 0, w, h);
    if (!f) return;
    const yaw = (sh.pose ? sh.pose.yaw : 0.3), cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(0.2), sp = Math.sin(0.2);
    for (let i = 0; i < 1100; i++) {
      const part = f(r, o), x = o[0] * cy + o[2] * sy, z = o[2] * cy - o[0] * sy, y = o[1] * cp - z * sp;
      g.fillStyle = "rgba(255,255,255," + (part === 1 ? 0.22 : part === 2 ? 0.95 : 0.55) + ")";
      g.fillRect(w / 2 + x * w * 0.45, h / 2 - y * h * 0.45, 1.2, 1.2);
    }
  }
  return { SHAPES, CATS, get, known, keyOf, custom, textShape, maskFromImage, fromMask, loadImage, preview };
})();
