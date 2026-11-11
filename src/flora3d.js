
/* ------------------------------------------------------------------ */
/* Flora 3D — объёмный живой организм хранилища                        */
/* Заметка = яркая точка, ссылка = тонкая нить, вокруг — декоративная   */
/* пыль, которая повторяет структуру связей, но заметкой не считается.  */
/* Свой WebGL2-рендер: перспектива, глубина, HDR-свечение. Без зависимостей. */
/* ------------------------------------------------------------------ */
const F3D = (function () {
  "use strict";
  const rand = NG.rand, hexRgb = NG.hexRgb, toLin = NG.toLin;

  const PALETTES = [
    { id: "flora", name: () => L("Флора", "Flora"), c: NG.PALETTE },
    { id: "aurora", name: () => L("Аврора", "Aurora"), c: ["#ff5e7a", "#ffb347", "#ffe66d", "#5df2a0", "#42c9f5", "#7b8cff", "#d17bff", "#ff8ad8"] },
    { id: "ice", name: () => L("Лёд", "Ice"), c: ["#42c9f5", "#9be6ff", "#3d8bff", "#c4f3ff", "#5ee6e0", "#7aa8ff", "#e2f9ff", "#2fb4d8"] },
    { id: "emerald", name: () => L("Изумруд", "Emerald"), c: ["#47e6ad", "#a4f5c8", "#1fbf7a", "#c9f7a6", "#6ef0d0", "#2fd35f", "#e3ffcf", "#12a680"] },
    { id: "violet", name: () => L("Фиалка", "Violet"), c: ["#a58bff", "#d6b8ff", "#7b5cff", "#f0a8ff", "#8fb4ff", "#c07bff", "#ffd0f5", "#6a6cff"] },
    { id: "coral", name: () => L("Коралл", "Coral"), c: ["#ff7f90", "#ffb38a", "#ff4f6d", "#ffd28a", "#ff9bc0", "#ff6a3d", "#ffe2b8", "#e0486b"] },
    { id: "mono", name: () => L("Моно", "Mono"), c: ["#ffffff", "#cfd6e2", "#a9b4c6", "#eef2f8", "#bcc5d4", "#95a2b7", "#f6f8fb", "#b3bece"] },
  ];
  const DEFAULTS = {
    palette: "flora", form: "organism", groupBy: "folder", labels: "groups",
    density: 40000, pointSize: 1, links: 0.6, glow: 1, speed: 1,
    fires: 1, wave: 0.5, turning: true, motion: true, clickOpens: false,
  };
  const FOV = (42 * Math.PI) / 180;
  const WORLD = 100;          // радиус сцены в мировых единицах
  const MAX_LINES = 16000;    // одновременно видимых связей
  const GOLD = 2.399963229728653;
  const FORMS = ["organism", "brain", "anatomy", "spheres", "galaxy"];
  const FAN_B = 16, FAN_L = 44, FS = 12;   // вспышки: сколько одновременно, лучей в каждой, чисел на вершину
  const FAN_DUR = 1.7;

  /* ---------- нервная система: позвоночник и нервы ---------- */
  const NV = 26;                             // позвонков
  function spinePt(t, o) {                   // t: 0 — у основания мозга, 1 — низ
    o[0] = 0; o[1] = 40 - 138 * t; o[2] = -8 + 7 * Math.sin(t * 5.4 + 0.4) * (1 - 0.35 * t) - 4 * t;
  }
  function nervePt(i, side, u, o) {          // i-й позвонок, u: 0..1 вдоль нерва
    const t = (i + 0.5) / NV;
    spinePt(t, o);
    if (t < 0.48) {                          // рёбра: дуги вперёд и вниз, шире всего посередине
      const k = Math.sin(Math.PI * Math.min(1, (t / 0.48) * 0.9 + 0.1)), a = u * Math.PI * 0.82;
      o[0] += side * (14 + 22 * k) * Math.sin(a); o[2] += (10 + 12 * k) * (1 - Math.cos(a)); o[1] -= 12 * u + 5 * u * u;
    } else {                                 // нижние нервы свисают в стороны
      const k = (t - 0.48) / 0.52;
      o[0] += side * (30 - 16 * k) * (1 - Math.pow(1 - u, 2)); o[1] -= (26 + 26 * (1 - k)) * u * u + 6 * u; o[2] += 5 * u;
    }
  }

  /* ---------- математика камеры ---------- */
  function persp(o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o.fill(0); o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf;
  }
  function lookAt(o, ex, ey, ez, cx, cy, cz) {
    let zx = ex - cx, zy = ey - cy, zz = ez - cz;
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = zz, xy = 0, xz = -zx;                      // up(0,1,0) × z
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
    o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
    o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
    o[12] = -(xx * ex + xy * ey + xz * ez); o[13] = -(yx * ex + yy * ey + yz * ez); o[14] = -(zx * ex + zy * ey + zz * ez); o[15] = 1;
  }
  function mul(o, a, b) {
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /* ------------------------------------------------------------------ */
  /* Модель: группы и стабильная 3D-раскладка                            */
  /* Одна и та же база всегда даёт одну и ту же форму: случайность берётся */
  /* из пути заметки, а не из Math.random.                                */
  /* ------------------------------------------------------------------ */
  function groupKeys(nodes, adj, deg, by) {
    const N = nodes.length, keys = new Array(N), names = new Map();
    if (by === "tag") {
      const freq = new Map();
      for (const n of nodes) for (const t of n.tags || []) freq.set(t, (freq.get(t) || 0) + 1);
      for (let i = 0; i < N; i++) {
        let best = "", bc = 0;
        for (const t of nodes[i].tags || []) { const c = freq.get(t); if (c > bc || (c === bc && t < best)) { best = t; bc = c; } }
        keys[i] = best;
        if (!names.has(best)) names.set(best, best ? "#" + best : L("Без тегов", "No tags"));
      }
    } else if (by === "links") {
      // сообщества по ссылкам: каждая заметка берёт самую частую метку соседей
      const lab = new Int32Array(N);
      for (let i = 0; i < N; i++) lab[i] = i;
      const cnt = new Map();
      for (let it = 0; it < 14; it++) {
        let changed = 0;
        for (let i = 0; i < N; i++) {
          const a = adj[i];
          if (!a.length) continue;
          cnt.clear();
          let best = lab[i], bc = 0;
          for (let k = 0; k < a.length; k++) {
            const l = lab[a[k]], c = (cnt.get(l) || 0) + 1 + deg[a[k]] * 0.001;
            cnt.set(l, c);
            if (c > bc || (c === bc && l < best)) { best = l; bc = c; }
          }
          if (best !== lab[i]) { lab[i] = best; changed++; }
        }
        if (!changed) break;
      }
      const hub = new Map();
      for (let i = 0; i < N; i++) { if (!adj[i].length) continue; const h = hub.get(lab[i]); if (h == null || deg[i] > deg[h]) hub.set(lab[i], i); }
      for (let i = 0; i < N; i++) {
        if (!adj[i].length) { keys[i] = ""; names.set("", L("Без связей", "Unlinked")); continue; }
        const h = hub.get(lab[i]);
        keys[i] = "c:" + nodes[h].id;
        if (!names.has(keys[i])) names.set(keys[i], nodes[h].title);
      }
    } else {
      // папки: верхний уровень, а если их всего одна-две — на уровень глубже
      const top = (f, d) => f.split("/").slice(0, d).join("/");
      const tops = new Set();
      let deeper = false;
      for (const n of nodes) { tops.add(top(n.folder || "", 1)); if ((n.folder || "").indexOf("/") > 0) deeper = true; }
      const d = tops.size < 3 && deeper ? 2 : 1;
      for (let i = 0; i < N; i++) {
        const k = top(nodes[i].folder || "", d);
        keys[i] = k;
        if (!names.has(k)) names.set(k, k ? k.slice(k.lastIndexOf("/") + 1) : L("Корень хранилища", "Vault root"));
      }
    }
    return { keys, names };
  }

  // упаковка шаров: большие — к центру, без пересечений, связанные тянутся друг к другу
  function pack(n, rad, links, gap, seed, flat) {
    const X = new Float32Array(3 * n);
    if (n < 2) return X;
    const rnd = rand(seed);
    let vol = 0;
    for (let i = 0; i < n; i++) {
      const r = rad[i];
      if (i) {
        const y = rnd() * 2 - 1, a = rnd() * 6.2832, q = Math.sqrt(1 - y * y), d = Math.cbrt(vol) * 1.05 + r;
        X[i * 3] = Math.cos(a) * q * d; X[i * 3 + 1] = y * d; X[i * 3 + 2] = Math.sin(a) * q * d;
      }
      vol += r * r * r;
    }
    const iters = n > 1800 ? 0 : Math.min(180, Math.max(24, Math.floor(4e6 / (n * n))));
    for (let it = 0; it < iters; it++) {
      const settle = it >= iters - 14;      // last passes only push apart, so nothing ends up overlapping
      for (let i = 0; i < n; i++) {
        const ix = i * 3;
        for (let j = i + 1; j < n; j++) {
          const jx = j * 3;
          let dx = X[jx] - X[ix], dy = X[jx + 1] - X[ix + 1], dz = X[jx + 2] - X[ix + 2];
          const min = rad[i] + rad[j] + gap, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 >= min * min) continue;
          let d = Math.sqrt(d2);
          if (d < 1e-4) { dx = 0.01 * (i + 1); dy = 0.013; dz = -0.007 * (j + 1); d = Math.hypot(dx, dy, dz); }
          const push = (min - d) / d, wi = rad[j] / (rad[i] + rad[j]), wj = 1 - wi;
          X[ix] -= dx * push * wi; X[ix + 1] -= dy * push * wi; X[ix + 2] -= dz * push * wi;
          X[jx] += dx * push * wj; X[jx + 1] += dy * push * wj; X[jx + 2] += dz * push * wj;
        }
      }
      if (links && !settle) for (let k = 0; k < links.length; k++) {
        const l = links[k], ix = l[0] * 3, jx = l[1] * 3;
        const dx = X[jx] - X[ix], dy = X[jx + 1] - X[ix + 1], dz = X[jx + 2] - X[ix + 2];
        const d = Math.hypot(dx, dy, dz), min = rad[l[0]] + rad[l[1]] + gap;
        if (d <= min) continue;
        const pull = ((d - min) / d) * 0.03 * Math.min(1, l[2] / 8);
        X[ix] += dx * pull; X[ix + 1] += dy * pull; X[ix + 2] += dz * pull;
        X[jx] -= dx * pull; X[jx + 1] -= dy * pull; X[jx + 2] -= dz * pull;
      }
      if (!settle) for (let i = 0; i < 3 * n; i++) X[i] *= 0.988;
      if (flat) for (let i = 0; i < n; i++) X[i * 3 + 1] *= settle ? 0 : 0.7;   // spheres lie in one plane, so none hides behind another
    }
    return X;
  }

  function buildModel(g, s) {
    const nodes = g.nodes, N = nodes.length;
    const idx = new Map();
    for (let i = 0; i < N; i++) idx.set(nodes[i].id, i);
    const adj = Array.from({ length: N }, () => []);
    const edges = [];
    for (const e of g.edges) {
      const a = idx.get(e.a), b = idx.get(e.b);
      if (a == null || b == null || a === b) continue;
      adj[a].push(b); adj[b].push(a); edges.push([a, b, e.w || 1]);
    }
    const deg = new Int32Array(N);
    for (let i = 0; i < N; i++) deg[i] = adj[i].length;
    const h1 = new Float32Array(N), h2 = new Float32Array(N);
    for (let i = 0; i < N; i++) { const r = rand(nodes[i].id); h1[i] = r(); h2[i] = r(); }
    const byDeg = (p, q) => deg[q] - deg[p] || (nodes[p].id < nodes[q].id ? -1 : 1);
    for (let i = 0; i < N; i++) adj[i].sort(byDeg);

    // группы
    const gk = groupKeys(nodes, adj, deg, s.groupBy);
    const cmap = new Map();
    for (let i = 0; i < N; i++) {
      let c = cmap.get(gk.keys[i]);
      if (!c) { c = { key: gk.keys[i], name: gk.names.get(gk.keys[i]), nodes: [] }; cmap.set(c.key, c); }
      c.nodes.push(i);
    }
    const clusters = [...cmap.values()].sort((p, q) => q.nodes.length - p.nodes.length || (p.key < q.key ? -1 : 1));
    const cof = new Int32Array(N);
    clusters.forEach((c, ci) => { c.i = ci; for (const i of c.nodes) cof[i] = ci; });

    // раскладка внутри группы: дерево связей растёт от самой связанной заметки
    const P = new Float32Array(3 * N);
    const par = new Int32Array(N), dep = new Int32Array(N), sub = new Int32Array(N), seen = new Uint8Array(N);
    const D = new Float32Array(3 * N);
    const crad = new Float32Array(clusters.length);
    for (const c of clusters) {
      const order = c.nodes.slice().sort(byDeg);
      const comps = [], loose = [];
      for (const root of order) {
        if (seen[root]) continue;
        seen[root] = 1;
        let has = false;
        for (const j of adj[root]) if (cof[j] === c.i) { has = true; break; }
        if (!has) { loose.push(root); continue; }
        const ord = [root];
        par[root] = -1; dep[root] = 0;
        for (let q = 0; q < ord.length; q++) {
          const u = ord[q];
          for (const v of adj[u]) if (!seen[v] && cof[v] === c.i) { seen[v] = 1; par[v] = u; dep[v] = dep[u] + 1; ord.push(v); }
        }
        for (let q = ord.length - 1; q >= 0; q--) { const u = ord[q]; sub[u] = (sub[u] || 0) + 1; if (par[u] >= 0) sub[par[u]] = (sub[par[u]] || 0) + sub[u]; }
        const kids = new Map();
        for (const u of ord) if (par[u] >= 0) { const l = kids.get(par[u]); if (l) l.push(u); else kids.set(par[u], [u]); }
        P[root * 3] = P[root * 3 + 1] = P[root * 3 + 2] = 0;
        let R = 0;
        for (const u of ord) {
          const ch = kids.get(u);
          if (!ch) continue;
          const k = ch.length, ux = u * 3;
          const dx = D[ux], dy = D[ux + 1], dz = D[ux + 2];
          let ax = 0, ay = 0, az = 0, bx = 0, by = 0, bz = 0, cap = 0;
          if (par[u] >= 0) {
            // базис вокруг направления роста
            if (Math.abs(dy) < 0.9) { ax = dz; ay = 0; az = -dx; } else { ax = 0; ay = -dz; az = dy; }
            const l = Math.hypot(ax, ay, az) || 1; ax /= l; ay /= l; az /= l;
            bx = dy * az - dz * ay; by = dz * ax - dx * az; bz = dx * ay - dy * ax;
            cap = Math.min(1.3, 0.3 + 0.17 * Math.sqrt(k));
          }
          const a0 = h1[u] * 6.2832;
          for (let i = 0; i < k; i++) {
            const v = ch[i], vx = v * 3;
            let nx, ny, nz;
            if (par[u] < 0) {
              const y = 1 - (2 * (i + 0.5)) / k, q = Math.sqrt(Math.max(0, 1 - y * y)), a = i * GOLD + a0;
              nx = Math.cos(a) * q; ny = y; nz = Math.sin(a) * q;
            } else {
              const ct = 1 - ((i + 0.5) / k) * (1 - Math.cos(cap)), st = Math.sqrt(Math.max(0, 1 - ct * ct)), a = i * GOLD + a0;
              const ca = Math.cos(a) * st, sa = Math.sin(a) * st;
              nx = dx * ct + ax * ca + bx * sa; ny = dy * ct + ay * ca + by * sa; nz = dz * ct + az * ca + bz * sa;
            }
            const len = (0.9 + 0.55 * Math.log2(1 + sub[v])) * Math.max(0.42, Math.pow(0.9, dep[v])) * (0.78 + 0.44 * h2[v]) * (1 + 0.06 * Math.sqrt(k));
            D[vx] = nx; D[vx + 1] = ny; D[vx + 2] = nz;
            P[vx] = P[ux] + nx * len; P[vx + 1] = P[ux + 1] + ny * len; P[vx + 2] = P[ux + 2] + nz * len;
            const r = Math.hypot(P[vx], P[vx + 1], P[vx + 2]);
            if (r > R) R = r;
          }
        }
        comps.push({ ord, r: R + 0.8 });
      }
      comps.sort((p, q) => q.ord.length - p.ord.length);
      const rr = new Float32Array(comps.length);
      comps.forEach((cp, i) => (rr[i] = cp.r));
      const cx = pack(comps.length, rr, null, 0.3, "comp:" + c.key);
      let Rin = 0;
      comps.forEach((cp, i) => {
        const ox = cx[i * 3], oy = cx[i * 3 + 1], oz = cx[i * 3 + 2];
        for (const u of cp.ord) { P[u * 3] += ox; P[u * 3 + 1] += oy; P[u * 3 + 2] += oz; }
        Rin = Math.max(Rin, Math.hypot(ox, oy, oz) + cp.r);
      });
      // заметки без связей внутри группы — рассеянное облако
      const m = loose.length;
      let Rl = 0;
      if (m) {
        Rl = Math.max(Rin * 1.22, 1.25 * Math.cbrt(m) + 0.5);
        for (const u of loose) {
          const y = h1[u] * 2 - 1, a = h2[u] * 6.2832, q = Math.sqrt(1 - y * y);
          const t = (h1[u] * 7.31 + h2[u] * 3.17) % 1;
          const r = Rin ? Rl * (0.5 + 0.5 * Math.cbrt(t)) : Rl * Math.pow(t, 0.55);
          P[u * 3] = Math.cos(a) * q * r; P[u * 3 + 1] = y * r; P[u * 3 + 2] = Math.sin(a) * q * r;
        }
      }
      crad[c.i] = Math.max(Rin, Rl) + 0.5;
      if (s.form === "spheres") {
        // группа — шар: самая связанная заметка в центре, остальные на оболочке, связи расходятся веером
        const n = order.length, Rs = 1.15 * Math.cbrt(n) + 0.9, a0 = h1[order[0]] * 6.2832;
        for (let k = 0; k < n; k++) {
          const u = order[k], y = 1 - (2 * (k + 0.5)) / n, q = Math.sqrt(Math.max(0, 1 - y * y)), a = k * GOLD + a0;
          const r = k === 0 && n > 3 ? 0 : Rs * (0.84 + 0.16 * h2[u]);
          P[u * 3] = Math.cos(a) * q * r; P[u * 3 + 1] = y * r; P[u * 3 + 2] = Math.sin(a) * q * r;
        }
        c.rs = Rs;
        crad[c.i] = Rs + 0.6;
      }
    }

    // группы в пространстве: связанные — ближе
    const cl = new Map();
    for (const e of edges) {
      const a = cof[e[0]], b = cof[e[1]];
      if (a === b) continue;
      const k = a < b ? a * 65536 + b : b * 65536 + a;
      const l = cl.get(k);
      if (l) l[2] += 1; else cl.set(k, [Math.min(a, b), Math.max(a, b), 1]);
    }
    let avg = 0;
    for (let i = 0; i < crad.length; i++) avg += crad[i];
    avg /= crad.length || 1;
    const cc = pack(clusters.length, crad, [...cl.values()], avg * 0.5, "clusters:" + s.groupBy, s.form === "spheres");
    for (let i = 0; i < N; i++) { const c = cof[i] * 3; P[i * 3] += cc[c]; P[i * 3 + 1] += cc[c + 1]; P[i * 3 + 2] += cc[c + 2]; }

    // центр и масштаб: вся сцена в шаре радиуса WORLD
    let mx = 0, my = 0, mz = 0;
    for (let i = 0; i < N; i++) { mx += P[i * 3]; my += P[i * 3 + 1]; mz += P[i * 3 + 2]; }
    if (N) { mx /= N; my /= N; mz /= N; }
    const rs = new Float32Array(N);
    for (let i = 0; i < N; i++) rs[i] = Math.hypot(P[i * 3] - mx, P[i * 3 + 1] - my, P[i * 3 + 2] - mz);
    const sorted = rs.slice().sort();
    const whole = s.form === "spheres";   // spheres keep their exact size, so scale by the farthest note instead
    const R = N ? Math.max(1e-3, whole ? sorted[N - 1] / 1.2 : sorted[Math.min(N - 1, Math.floor(N * 0.96))]) : 1;   // радиус основной массы
    const unit = N > 1 ? (WORLD * 0.8) / R : WORLD / 4;
    for (let i = 0; i < N; i++) {
      // основная масса занимает 80% радиуса; редкие дальние заметки мягко прижаты к границе сцены
      const r = rs[i] * unit, lim = WORLD * 0.8;
      const k = r > lim && !whole ? ((lim + WORLD * 0.2 * (1 - Math.exp(-(r - lim) / (WORLD * 0.2)))) / r) * unit : unit;
      P[i * 3] = (P[i * 3] - mx) * k; P[i * 3 + 1] = (P[i * 3 + 1] - my) * k; P[i * 3 + 2] = (P[i * 3 + 2] - mz) * k;
    }
    const fitR = WORLD * ({ brain: 1.04, anatomy: 1.1, galaxy: 1.0, spheres: 0.9 }[s.form] || 0.86);

    if (s.form === "brain" || s.form === "anatomy") {
      // те же группы, вписанные в объём мозга: два полушария, плоское основание
      for (let i = 0; i < N; i++) {
        const x = P[i * 3], y = P[i * 3 + 1];
        P[i * 3] = x * 0.8 + (x >= 0 ? 5 : -5);
        P[i * 3 + 1] = y * (y > 0 ? 0.72 : 0.5) + 8;
        P[i * 3 + 2] *= 1.12;
      }
      if (s.form === "anatomy") {
        // нервная система: мозг наверху, ниже — позвоночник и нервы из частиц
        for (let i = 0; i < N; i++) { P[i * 3] *= 0.36; P[i * 3 + 1] = P[i * 3 + 1] * 0.36 + 58; P[i * 3 + 2] *= 0.36; }
      }
    } else if (s.form === "galaxy") {
      // галактика: группы ложатся вдоль спиральных рукавов, большие — ближе к ядру
      const A = clamp(clusters.length, 2, 5), armN = new Float32Array(A), armK = new Float32Array(A);
      clusters.forEach((c, ci) => { c.arm = ci % A; armN[c.arm] += c.nodes.length; });
      for (const c of clusters) {
        const ord = c.nodes.slice().sort((p, q) => P[p * 3] - P[q * 3] || p - q);   // соседи по раскладке остаются рядом
        for (const i of ord) {
          const t = (armK[c.arm]++ + 0.5) / armN[c.arm];
          const r = 9 + 84 * Math.sqrt(t), th = (c.arm * 6.2832) / A + 2.1 * Math.log(1 + r / 9);
          const dr = (h1[i] - 0.5) * 2 * (2.5 + 0.09 * r), w = (h2[i] - 0.5) * 2 * (2.5 + 0.11 * r);
          const y = (((h1[i] * 13.7) % 1) - 0.5) * 2 * (5 * Math.max(0, 1 - r / 120) + 1.2);
          P[i * 3] = Math.cos(th) * (r + dr) - Math.sin(th) * w; P[i * 3 + 1] = y; P[i * 3 + 2] = Math.sin(th) * (r + dr) + Math.cos(th) * w;
        }
      }
    }
    for (const c of clusters) {
      let x = 0, y = 0, z = 0;
      for (const i of c.nodes) { x += P[i * 3]; y += P[i * 3 + 1]; z += P[i * 3 + 2]; }
      const n = c.nodes.length; x /= n; y /= n; z /= n;
      let r2 = 0;
      for (const i of c.nodes) { const dx = P[i * 3] - x, dy = P[i * 3 + 1] - y, dz = P[i * 3 + 2] - z; r2 += dx * dx + dy * dy + dz * dz; }
      c.x = x; c.y = y; c.z = z; c.r = Math.max(unit * 0.8, Math.sqrt(r2 / n) * 1.5);
    }
    return { nodes, N, adj, deg, edges, clusters, cof, P, unit, idx, h1, h2, fitR };
  }

  // точка мозга (единичные координаты): кора с извилинами, височные доли, мозжечок, ствол
  // x — вправо, y — вверх, z — вперёд (лоб)
  function brainPoint(rnd, out) {
    const pick = rnd();
    if (pick < 0.6) {
      for (let tries = 0; tries < 14; tries++) {
        const y = rnd() * 2 - 1, a = rnd() * 6.2832, q = Math.sqrt(1 - y * y);
        const dx = Math.cos(a) * q, dy = y, dz = Math.sin(a) * q;
        if (dy < -0.6) continue;
        // извилины: волнистые гребни, в бороздах точек почти нет
        const f1 = Math.sin(dx * 10 + Math.sin(dz * 7 + dy * 4) * 1.9 + dy * 6), f2 = Math.cos(dz * 9 + Math.sin(dx * 7 - dy * 3) * 1.6);
        const fold = Math.abs(f1 * f2);
        if (rnd() > 0.08 + 0.92 * Math.pow(fold, 0.8)) continue;
        let r = 1 + 0.04 * fold;
        r *= 1 - 0.24 * Math.exp(-(dx * dx) / 0.01) * clamp((dy + 0.15) / 0.5, 0, 1);    // щель между полушариями
        r *= 1 + 0.07 * clamp(dz, 0, 1) * clamp(dy + 0.2, 0, 1);                          // лоб чуть выше
        r *= 1 - 0.09 * clamp(-dz - 0.5, 0, 1);                                           // затылок уже
        r *= 1 - 0.09 * rnd() * rnd();                                                    // толщина коры
        out[0] = dx * 0.84 * r; out[1] = dy * (dy > 0 ? 0.74 : 0.5) * r + 0.08; out[2] = dz * 1.1 * r;
        return 0;
      }
    }
    if (pick < 0.7) {
      // височные доли: два вытянутых овала снизу по бокам
      const y = rnd() * 2 - 1, a = rnd() * 6.2832, q = Math.sqrt(1 - y * y), side = rnd() < 0.5 ? -1 : 1;
      const r = 1 - 0.1 * rnd() * rnd();
      out[0] = side * 0.5 + Math.cos(a) * q * 0.3 * r; out[1] = -0.3 + y * 0.2 * r; out[2] = 0.18 + Math.sin(a) * q * 0.56 * r;
      return 0;
    }
    if (pick < 0.78) {
      // редкий внутренний объём, чтобы форма не выглядела пустой скорлупой
      const y = rnd() * 2 - 1, a = rnd() * 6.2832, q = Math.sqrt(1 - y * y), r = Math.cbrt(rnd()) * 0.9;
      out[0] = Math.cos(a) * q * 0.8 * r; out[1] = y * (y > 0 ? 0.7 : 0.46) * r + 0.08; out[2] = Math.sin(a) * q * 1.04 * r;
      return 3;
    }
    if (pick < 0.92) {
      for (let tries = 0; tries < 8; tries++) {
        const y = rnd() * 2 - 1, a = rnd() * 6.2832, q = Math.sqrt(1 - y * y);
        if (rnd() > 0.2 + 0.8 * Math.abs(Math.sin(y * 30))) continue;                     // листки мозжечка
        const r = 1 - 0.08 * rnd() * rnd();
        out[0] = Math.cos(a) * q * 0.52 * r; out[1] = y * 0.24 * r - 0.5; out[2] = Math.sin(a) * q * 0.34 * r - 0.68;
        return 1;
      }
    }
    const t = rnd(), a = rnd() * 6.2832, r = (0.13 - 0.06 * t) * (0.9 + 0.1 * rnd());
    out[0] = Math.cos(a) * r; out[1] = -0.42 - t * 0.78; out[2] = Math.sin(a) * r - 0.24 - t * 0.16;
    return 2;
  }

  /* ------------------------------------------------------------------ */
  /* Шейдеры                                                             */
  /* ------------------------------------------------------------------ */
  const SH = {
    pointV: `#version 300 es
    layout(location=0) in vec3 a_from; layout(location=1) in vec3 a_to; layout(location=2) in vec4 a_col; layout(location=3) in vec4 a_misc; layout(location=4) in float a_hl;
    uniform mat4 u_vp; uniform float u_mix, u_time, u_px, u_size, u_motion, u_focusC, u_dim, u_dustDim, u_fog0, u_fog1, u_dpr, u_maxPt, u_stream, u_fade, u_wave, u_focus, u_minNode;
    out vec4 v_col; out float v_kind; out float v_px; out float v_ph;
    void main(){
      float ph = a_misc.y, kind = a_misc.w, inten = a_col.a;
      vec3 p;
      if (u_stream > 0.5) {
        float t = fract(ph * 7.0 + u_time * 0.11);      // частица течёт от выбранной заметки к соседу
        p = mix(a_from, a_to, t);
        inten *= sin(t * 3.14159);
      } else {
        p = mix(a_from, a_to, u_mix);
        p += sin(u_mix * 3.14159) * 7.0 * vec3(sin(ph * 40.0), cos(ph * 27.0), sin(ph * 61.0));   // вихрь при перестройке
        if (kind < 0.5) p += 0.55 * u_motion * vec3(sin(u_time * 0.31 + ph * 6.283), sin(u_time * 0.23 + ph * 12.7), sin(u_time * 0.27 + ph * 19.1));
      }
      p *= 1.0 + 0.011 * u_motion * sin(u_time * 0.42 - length(p) * 0.035);                       // дыхание
      vec4 clip = u_vp * vec4(p, 1.0);
      gl_Position = clip;
      float w = max(clip.w, 0.001);
      float size = a_misc.x * u_size * u_px / w;
      if (kind > 0.5) size *= 1.0 + 0.14 * u_motion * sin(u_time * 1.3 + ph * 43.0);              // нейроны слегка пульсируют
      float fog = clamp((u_fog1 - w) / (u_fog1 - u_fog0), 0.0, 1.0);
      inten *= mix(0.08, 1.0, fog * fog);
      // волны активности: области медленно разгораются и гаснут
      float wv = sin(dot(p, vec3(0.031, 0.043, 0.027)) - u_time * 0.5 + sin(p.y * 0.035 + u_time * 0.17) * 1.6);
      inten *= 1.0 - u_wave * u_motion * (kind > 0.5 ? 0.35 : 0.8) * (1.0 - smoothstep(-0.5, 0.6, wv));
      // глубина резкости: вдали от плоскости фокуса точка мягче и шире
      float coc = clamp(abs(w - u_focus) / u_focus, 0.0, 1.0);
      size *= 1.0 + 0.15 * coc; inten /= 1.0 + 0.5 * coc;
      float focus = (u_focusC < 0.0 || abs(a_misc.z - u_focusC) < 0.5) ? 1.0 : u_dim;
      inten *= focus * a_hl * (kind > 0.5 ? 1.0 : u_dustDim);
      inten *= 1.0 + u_motion * 2.4 * pow(max(0.0, sin(u_time * 0.6 + ph * 97.0)), 28.0);          // редкие вспышки-синапсы
      float minS = kind > 0.5 ? u_minNode * u_dpr : 1.5 * u_dpr;
      if (size < minS) { if (kind < 0.5) inten *= (size * size) / (minS * minS); size = minS; }
      // близкие точки не раздуваются в пятна: размер ограничен, лишний свет гаснет
      float maxS = min(u_maxPt, (kind > 0.5 ? 110.0 : 7.0) * u_dpr);
      if (size > maxS) { if (kind < 0.5) inten *= maxS / size; size = maxS; }
      gl_PointSize = size;
      v_px = size / u_dpr; v_ph = ph;
      inten *= u_fade;
      v_col = vec4(a_col.rgb, inten); v_kind = kind;
    }`,
    pointF: `#version 300 es
    precision highp float;
    in vec4 v_col; in float v_kind; in float v_px; in float v_ph; uniform float u_time; out vec4 o;
    void main(){
      vec2 q = gl_PointCoord * 2.0 - 1.0;
      float d2 = dot(q, q);
      if (d2 > 1.0) discard;
      float d = sqrt(d2);
      float soft = exp(-d2 * 4.5) * (1.0 - d2);          // мелкая точка вдали: мягкое зерно, чтобы не мерцала
      vec3 col = v_col.rgb;
      float a;
      if (v_kind > 0.5) {
        // нейрон: светлое ядро с чётким краем, тонкая мембрана и изогнутые отростки — у каждого свои
        float sharp = clamp((v_px - 9.0) / 9.0, 0.0, 1.0);
        float aa = 2.0 / max(v_px, 1.0);
        float core = 1.0 - smoothstep(0.12 - aa, 0.12 + aa, d);
        float ring = exp(-pow((d - 0.215) / max(0.022, aa * 0.8), 2.0)) * 0.7;
        float halo = exp(-d2 * 16.0) * 0.6;
        float th = atan(q.y, q.x), arms = 0.0;
        for (int k = 0; k < 6; k++) {
          float fk = float(k);
          float h = fract(sin(v_ph * 91.7 + fk * 37.3) * 4375.85);
          float a0 = fk * 1.0472 + (h - 0.5) * 0.9 + (h > 0.5 ? 0.3 : -0.3) * sin(d * 4.5 + h * 6.0) + 0.07 * sin(u_time * 0.8 + fk * 2.1 + v_ph * 9.0);
          float da = abs(mod(th - a0 + 3.14159, 6.28318) - 3.14159);
          float len = 0.5 + 0.45 * fract(h * 7.13);
          float w = max(0.02, 1.1 / max(v_px, 1.0)) + 0.035 * (1.0 - d);
          arms += exp(-pow(da * d / w, 2.0)) * smoothstep(len, len * 0.35, d) * step(0.12, d);
        }
        arms = min(arms, 1.0) * 0.6;
        a = mix(soft * 0.5 + exp(-d2 * 26.0) * 1.7, halo + ring + arms, sharp);
        col = mix(col, vec3(1.0), (0.8 * core + 0.25 * arms) * sharp);
        a += core * sharp * 2.6;
      } else {
        // частица: маленький чёткий диск вместо размытого шарика
        float sharp = clamp((v_px - 2.5) / 3.0, 0.0, 1.0);
        float aa = 1.4 / max(v_px, 1.0);
        float disc = 1.0 - smoothstep(0.42 - aa, 0.42 + aa, d);
        a = mix(soft, disc * 1.15 + exp(-d2 * 3.0) * 0.08 * (1.0 - d2), sharp);
      }
      o = vec4(col * v_col.a * a, 1.0);
    }`,
    lineV: `#version 300 es
    layout(location=0) in vec3 a_from; layout(location=1) in vec3 a_to; layout(location=2) in vec4 a_col; layout(location=3) in vec2 a_misc;
    uniform mat4 u_vp; uniform float u_mix, u_time, u_motion, u_focusC, u_dim, u_fog0, u_fog1, u_k;
    out vec4 v_col; out float v_t; out float v_ph;
    void main(){
      vec3 p = mix(a_from, a_to, u_mix);
      p *= 1.0 + 0.011 * u_motion * sin(u_time * 0.42 - length(p) * 0.035);
      vec4 clip = u_vp * vec4(p, 1.0);
      gl_Position = clip;
      float fog = clamp((u_fog1 - clip.w) / (u_fog1 - u_fog0), 0.0, 1.0);
      float focus = (u_focusC < 0.0 || abs(a_misc.y - u_focusC) < 0.5) ? 1.0 : u_dim;
      float sw = sin(u_mix * 3.14159);
      v_col = vec4(a_col.rgb, a_col.a * u_k * mix(0.06, 1.0, fog * fog) * focus * (1.0 - sw) * (u_mix < 1.0 ? u_mix * u_mix : 1.0));
      v_t = mod(a_misc.x, 2.0); v_ph = floor(a_misc.x * 0.5) * 0.61;
    }`,
    lineF: `#version 300 es
    precision highp float;
    in vec4 v_col; in float v_t; in float v_ph; uniform float u_time, u_pulse, u_freq, u_spd; out vec4 o;
    void main(){
      // импульс бежит по связи от одной заметки к другой
      float sg = pow(max(0.0, sin(v_t * u_freq - u_time * u_spd + v_ph)), 12.0);
      o = vec4(v_col.rgb * v_col.a * (1.0 + u_pulse * 4.0 * sg), 1.0);
    }`,
    // вспышка нейрона: веер лучей вырастает из заметки в сторону связанной и гаснет
    fanV: `#version 300 es
    layout(location=0) in vec3 a_o; layout(location=1) in vec3 a_d; layout(location=2) in vec4 a_col; layout(location=3) in vec2 a_misc;
    uniform mat4 u_vp; uniform float u_time, u_motion, u_fog0, u_fog1, u_dpr, u_dur, u_pt;
    out vec4 v_col;
    void main(){
      float age = (u_time - a_col.a) / u_dur, v = a_misc.x;
      float grow = 1.0 - pow(1.0 - clamp(age * 1.9, 0.0, 1.0), 3.0);
      vec3 p = a_o + a_d * grow * v;
      p *= 1.0 + 0.011 * u_motion * sin(u_time * 0.42 - length(p) * 0.035);
      vec4 clip = u_vp * vec4(p, 1.0);
      gl_Position = clip;
      float env = (age <= 0.0 || age >= 1.0) ? 0.0 : smoothstep(0.0, 0.07, age) * pow(1.0 - age, 1.6);
      float fog = clamp((u_fog1 - clip.w) / (u_fog1 - u_fog0), 0.0, 1.0);
      float a = mix(1.0, 0.05, v) * env * mix(0.25, 1.0, fog);
      if (u_pt > 0.5) a *= v < 0.5 ? 0.06 : 3.0 * a_misc.y;
      v_col = vec4(mix(vec3(1.0), a_col.rgb, 0.3 + 0.7 * v), a);
      gl_PointSize = (v < 0.5 ? 9.0 : 2.4) * u_dpr * (0.5 + env);
    }`,
    fanF: `#version 300 es
    precision highp float;
    in vec4 v_col; uniform float u_pt; out vec4 o;
    void main(){
      float a = 1.0;
      if (u_pt > 0.5) { vec2 q = gl_PointCoord * 2.0 - 1.0; a = exp(-dot(q, q) * 4.0); }
      o = vec4(v_col.rgb * v_col.a * a, 1.0);
    }`,
    compF: `#version 300 es
    precision highp float;
    in vec2 v_uv; uniform sampler2D u_scene; uniform sampler2D u_bloom; uniform float u_bloomK, u_exp; uniform vec3 u_bg; out vec4 o;
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = v_uv - 0.5;
      float r2 = dot(c, c);
      vec3 col = texture(u_scene, v_uv).rgb + texture(u_bloom, v_uv).rgb * u_bloomK;
      col += u_bg * (1.0 - smoothstep(0.0, 0.5, r2));          // едва заметная глубина в центре
      col *= 1.0 - smoothstep(0.16, 0.85, r2) * 0.5;
      col = pow(aces(col * u_exp), vec3(1.0 / 2.2));
      vec2 fp = gl_FragCoord.xy;
      col += (hash(fp) + hash(fp + vec2(17.31, 41.7)) - 1.0) / 255.0;
      o = vec4(col, 1.0);
    }`,
  };
  const PS = 14, LS = 12;   // чисел на точку и на вершину линии

  /* ------------------------------------------------------------------ */
  /* Сцена                                                               */
  /* ------------------------------------------------------------------ */
  class Flora3D {
    /**
     * host — элемент, в котором живёт сцена.
     * opts: { settings, icon(el, name), onOpen(node, ev), onSave(), onProgress(p), onReady() }
     */
    constructor(host, opts) {
      this.host = host;
      this.opts = opts || {};
      this.doc = host.ownerDocument;
      this.win = this.doc.defaultView || window;
      this.s = Object.assign({}, DEFAULTS, this.opts.settings || {});
      if (!PALETTES.some((p) => p.id === this.s.palette)) this.s.palette = DEFAULTS.palette;
      this.reduced = !!(this.win.matchMedia && this.win.matchMedia("(prefers-reduced-motion: reduce)").matches);
      this.motionOn = this.s.motion && !this.reduced;
      this.time = 0;
      this.cam = { yaw: 0.6, pitch: 0.18, dist: 330, x: 0, y: 0, z: 0 };
      this.camTo = Object.assign({}, this.cam);
      this.mixT = 1; this.dimCur = 1; this.dustDimCur = 1; this.focusC = -1;
      this.sel = -1; this.hover = -1; this.isolate = -1; this.hoverC = -1; this.found = null;
      this.model = null; this.nodeN = 0; this.dustN = 0; this.lineN = 0; this.streamN = 0; this.hiN = 0;
      this.quality = 1; this.slow = 0; this.dustCut = 1;
      if (FORMS.indexOf(this.s.form) < 0) this.s.form = DEFAULTS.form;
      this.fanData = new Float32Array(FAN_B * FAN_L * 2 * FS);
      this.fanNext = 0; this.fanClock = 0.6; this.fanQueue = [];
      this.pointers = new Map();
      this.V = new Float32Array(16); this.Pm = new Float32Array(16); this.VP = new Float32Array(16);
      this.labelPool = []; this.labelsOn = [];
      this._build();
      try { this._initGL(); } catch (e) { this._fail(e); return; }
      this._bind();
      this.resize();
      this._tick = (now) => this._frame(now);
      this.raf = this.win.requestAnimationFrame(this._tick);
    }

    /* ---------- DOM ---------- */
    _el(tag, cls, parent, text) {
      const e = this.doc.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      if (parent) parent.appendChild(e);
      return e;
    }
    _ico(el, name) { if (this.opts.icon) { el.textContent = ""; this.opts.icon(el, name); } }
    _btn(parent, icon, label, title) {
      const b = this._el("button", "ng-ctl-btn", parent);
      b.type = "button";
      b.setAttribute("aria-label", title || label);
      if (title) b.title = title;
      if (icon) this._ico(this._el("span", "ng-ctl-ico", b), icon);
      if (label) this._el("span", "ng-ctl-text", b, label); else b.classList.add("is-icon");
      return b;
    }

    _build() {
      const host = this.host;
      host.classList.add("f3d");
      host.tabIndex = 0;
      this.c = this._el("canvas", "f3d-canvas", host);
      this.labels = this._el("div", "f3d-labels", host);
      this.tip = this._el("div", "f3d-tip", host);

      // поиск
      const left = this._el("div", "f3d-left", host);
      const sb = this._el("div", "f3d-search ng-glass-dark", left);
      this._ico(this._el("span", "f3d-search-ico", sb), "search");
      this.q = this._el("input", "f3d-search-input", sb);
      this.q.type = "search";
      this.q.placeholder = L("Найти заметку, #тег или папку", "Find a note, #tag or folder");
      this.q.setAttribute("aria-label", this.q.placeholder);
      this.qCount = this._el("span", "f3d-search-count", sb);
      this.card = this._el("div", "f3d-card ng-glass-dark", left);
      this.card.hidden = true;

      // кнопки
      const bar = this._el("div", "ng-ctl f3d-ctl", host);
      const g1 = this._el("div", "ng-ctl-group", bar);
      this.bPlay = this._btn(g1, "pause", "", L("Пауза анимации (пробел)", "Pause animation (Space)"));
      this.bPlay.onclick = () => this.setMotion(!this.motionOn, true);
      const fit = this._btn(g1, "scan", "", L("Показать всё (F или двойной клик по фону)", "Fit all (F or double-click the background)"));
      fit.onclick = () => this.fit();
      this.bPanel = this._btn(g1, "sliders-horizontal", L("Вид", "Look"), L("Палитра, форма, частицы и свечение", "Palette, shape, particles and glow"));
      this.bPanel.onclick = () => this._togglePanel();

      this.panel = this._el("div", "f3d-panel ng-glass-dark", host);
      this.panel.hidden = true;
      this._buildPanel();

      this.legend = this._el("div", "f3d-legend ng-glass-dark", host);
      this.note = this._el("div", "f3d-note", host);
      this.note.hidden = true;
      this._syncPlay();
    }

    _buildPanel() {
      const p = this.panel, s = this.s;
      p.textContent = "";
      const section = (title) => { this._el("div", "f3d-h", p, title); return this._el("div", "f3d-sec", p); };
      const seg = (parent, key, items, after) => {
        const row = this._el("div", "f3d-seg", parent);
        const btns = items.map(([v, label]) => {
          const b = this._el("button", "f3d-seg-btn", row, label);
          b.type = "button";
          b.onclick = () => { if (s[key] === v) return; s[key] = v; sync(); this._save(); after(); };
          return [v, b];
        });
        const sync = () => btns.forEach(([v, b]) => { b.classList.toggle("is-on", s[key] === v); b.setAttribute("aria-pressed", String(s[key] === v)); });
        sync();
      };
      const slider = (parent, label, key, min, max, step, fmt, after) => {
        const row = this._el("label", "f3d-row", parent);
        this._el("span", "f3d-row-name", row, label);
        const val = this._el("span", "f3d-row-val", row, fmt(s[key]));
        const r = this._el("input", "f3d-range", row);
        r.type = "range"; r.min = min; r.max = max; r.step = step; r.value = s[key];
        r.oninput = () => { s[key] = Number(r.value); val.textContent = fmt(s[key]); this.dirty = true; if (after) after(false); };
        r.onchange = () => { this._save(); if (after) after(true); };
      };
      const toggle = (parent, label, key, after) => {
        const row = this._el("label", "f3d-row f3d-row-toggle", parent);
        this._el("span", "f3d-row-name", row, label);
        const t = this._el("input", "f3d-toggle", row);
        t.type = "checkbox"; t.checked = !!s[key];
        t.onchange = () => { s[key] = t.checked; this._save(); this.dirty = true; if (after) after(); };
      };
      const pct = (v) => Math.round(v * 100) + "%";

      let sec = section(L("Палитра", "Palette"));
      const pal = this._el("div", "f3d-pal", sec);
      const sw = PALETTES.map((P) => {
        const b = this._el("button", "f3d-pal-btn", pal);
        b.type = "button";
        b.title = P.name(); b.setAttribute("aria-label", P.name());
        b.style.setProperty("--f3d-sw", "linear-gradient(120deg, " + P.c.slice(0, 5).join(", ") + ")");
        b.onclick = () => { s.palette = P.id; syncPal(); this._save(); this._rebuild(false); };
        return [P.id, b];
      });
      const syncPal = () => sw.forEach(([id, b]) => b.classList.toggle("is-on", s.palette === id));
      syncPal();

      sec = section(L("Форма", "Shape"));
      seg(sec, "form", [["organism", L("Организм", "Organism")], ["brain", L("Мозг", "Brain")], ["anatomy", L("Нервы", "Nerves")], ["spheres", L("Сферы", "Spheres")], ["galaxy", L("Галактика", "Galaxy")]], () => { this._pose(); this._rebuild(true); });
      sec = section(L("Группы", "Groups"));
      seg(sec, "groupBy", [["folder", L("Папки", "Folders")], ["tag", L("Теги", "Tags")], ["links", L("Связи", "Links")]], () => { this.isolate = -1; this._rebuild(true); });
      sec = section(L("Подписи", "Labels"));
      seg(sec, "labels", [["off", L("Нет", "Off")], ["groups", L("Группы", "Groups")], ["hubs", L("И заметки", "And notes")]], () => { this.dirty = true; });

      sec = section(L("Частицы и свет", "Particles and light"));
      slider(sec, L("Частицы", "Particles"), "density", 5000, 120000, 5000, (v) => floraNum(Math.round(v / 1000)) + L(" тыс.", "k"), (done) => { if (done) this._rebuild(false); });
      slider(sec, L("Размер точек", "Point size"), "pointSize", 0.5, 2, 0.05, pct);
      slider(sec, L("Связи", "Links"), "links", 0, 1.5, 0.05, pct);
      slider(sec, L("Свечение", "Glow"), "glow", 0, 2, 0.05, pct);

      sec = section(L("Движение", "Motion"));
      slider(sec, L("Скорость", "Speed"), "speed", 0.2, 3, 0.1, (v) => "×" + v.toFixed(1));
      slider(sec, L("Вспышки нейронов", "Neuron firing"), "fires", 0, 3, 0.1, (v) => (v ? "×" + v.toFixed(1) : L("нет", "off")));
      slider(sec, L("Волны активности", "Activity waves"), "wave", 0, 1, 0.05, pct);
      toggle(sec, L("Медленное вращение", "Slow rotation"), "turning");
      toggle(sec, L("Открывать заметку одним кликом", "Open a note with one click"), "clickOpens");
    }

    // у каждой формы свой выгодный ракурс
    _pose() {
      const f = this.s.form;
      this.camTo.pitch = f === "galaxy" ? 0.62 : f === "spheres" ? 0.85 : f === "anatomy" ? 0.04 : f === "brain" ? 0.14 : 0.2;
      if (f === "anatomy" || f === "brain") this.camTo.yaw = Math.round(this.camTo.yaw / 6.2832) * 6.2832 + (f === "brain" ? 1.2 : 0.3);
      if (this.model) { this.model.fitR = WORLD * ({ brain: 1.04, anatomy: 1.1, galaxy: 1.0, spheres: 0.9 }[f] || 0.86); }
      this.isolate = -1; this.select(-1);
      const aspect = this.w / Math.max(1, this.h), half = aspect >= 1 ? FOV / 2 : Math.atan(Math.tan(FOV / 2) * aspect);
      Object.assign(this.camTo, { x: 0, y: 0, z: 0, dist: (this.model ? this.model.fitR : WORLD) * 1.08 / Math.sin(half) });
    }

    _togglePanel(force) {
      const open = force == null ? this.panel.hidden : force;
      this.panel.hidden = !open;
      this.bPanel.classList.toggle("is-on", open);
    }
    _syncPlay() {
      this._ico(this.bPlay.querySelector(".ng-ctl-ico"), this.motionOn ? "pause" : "play");
      this.bPlay.classList.toggle("is-on", !this.motionOn);
    }
    _save() { if (this.opts.onSave) this.opts.onSave(this.s); }
    _fail(e) {
      console.error("Flora 3D:", e);
      this.dead = true;
      this.note.hidden = false;
      this.note.textContent = L("Не удалось запустить 3D-графику: этому устройству нужен WebGL2.", "3D graphics could not start: this device needs WebGL2.");
      if (this.opts.onReady) this.opts.onReady();
    }

    setMotion(on, user) {
      this.motionOn = on;
      if (user) { this.s.motion = on; this._save(); }
      this._syncPlay();
      this.dirty = true;
    }

    /* ---------- WebGL ---------- */
    _prog(vs, fs) {
      const gl = this.gl;
      const mk = (type, src) => {
        const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
        return sh;
      };
      const p = gl.createProgram();
      gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
      return { p, u };
    }

    _initGL() {
      const gl = this.c.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: "high-performance" });
      if (!gl) throw new Error("WebGL2");
      this.gl = gl;
      this.hdr = !!gl.getExtension("EXT_color_buffer_float");
      this.pPoint = this._prog(SH.pointV, SH.pointF);
      this.pLine = this._prog(SH.lineV, SH.lineF);
      this.pFan = this._prog(SH.fanV, SH.fanF);
      this.pDown = this._prog(NG.SHADERS.fsV, NG.SHADERS.downF);
      this.pUp = this._prog(NG.SHADERS.fsV, NG.SHADERS.upF);
      this.pComp = this._prog(NG.SHADERS.fsV, SH.compF);
      const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
      this.maxPt = range ? range[1] : 64;
      const pointVao = (withHl) => {
        const vao = gl.createVertexArray(), buf = gl.createBuffer();
        gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        const S = PS * 4;
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, S, 24);
        gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, S, 40);
        let hl = null;
        if (withHl) { hl = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, hl); gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 4, 0); }
        return { vao, buf, hl };
      };
      const lineVao = () => {
        const vao = gl.createVertexArray(), buf = gl.createBuffer();
        gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        const S = LS * 4;
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
        gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, S, 24);
        gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, S, 40);
        return { vao, buf };
      };
      this.gDust = pointVao(false); this.gNode = pointVao(true); this.gStream = pointVao(false);
      this.gLine = lineVao(); this.gHi = lineVao();
      this.gFan = lineVao();     // та же разметка: 3 + 3 + 4 + 2 числа на вершину
      for (let i = 0; i < this.fanData.length; i += FS) this.fanData[i + 9] = -1e6;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.gFan.buf); gl.bufferData(gl.ARRAY_BUFFER, this.fanData, gl.DYNAMIC_DRAW);
      this.vaoFs = gl.createVertexArray();
      gl.bindVertexArray(null);
      this.targets = null;
    }

    _target(w, h) {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (this.hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!ok && this.hdr) { gl.deleteTexture(tex); gl.deleteFramebuffer(fbo); this.hdr = false; return this._target(w, h); }
      return { tex, fbo, w, h };
    }
    _free() {
      if (!this.targets) return;
      const gl = this.gl;
      for (const t of [this.targets.scene].concat(this.targets.mips)) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
      this.targets = null;
    }

    resize() {
      if (this.dead) return;
      const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
      const dpr = Math.max(1, Math.min(this.win.devicePixelRatio || 1, 2) * this.quality);
      const W = Math.round(w * dpr), H = Math.round(h * dpr);
      if (this.targets && W === this.c.width && H === this.c.height) return;
      this.w = w; this.h = h; this.dpr = dpr;
      this.c.width = W; this.c.height = H;
      this._free();
      const mips = [];
      let mw = W >> 1, mh = H >> 1;
      while (mips.length < 6 && mw >= 4 && mh >= 4) { mips.push(this._target(mw, mh)); mw >>= 1; mh >>= 1; }
      this.targets = { scene: this._target(W, H), mips };
      this.dirty = true;
    }

    /* ---------- данные ---------- */
    _yield() { return new Promise((r) => this.win.setTimeout(r, 0)); }

    /** graph: { nodes: [{id, title, folder, tags}], edges: [{a, b, w}] } */
    async setData(graph) {
      if (this.dead) return;
      const token = (this._token = (this._token || 0) + 1);
      const selId = this.sel >= 0 && this.model ? this.model.nodes[this.sel].id : null;
      this.graph = graph;
      const progress = (p) => { if (this.opts.onProgress) this.opts.onProgress(p); };
      progress(0.1);
      await this._yield();
      if (token !== this._token || this.destroyed) return;
      const model = buildModel(graph, this.s);
      progress(0.55);
      await this._yield();
      if (token !== this._token || this.destroyed) return;
      this._apply(model, true);
      progress(1);
      const first = !this.ready;
      this.ready = true;
      if (first) this.fit(true);
      this.sel = -1;
      if (selId != null && model.idx.has(selId)) this.select(model.idx.get(selId), true); else this._card();
      if (this.q.value) this.search(this.q.value);
      this.note.hidden = model.N > 0;
      if (!model.N) this.note.textContent = L("В хранилище пока нет заметок. Создайте первую — и здесь появится её точка.", "This vault has no notes yet. Create one and its point will appear here.");
      if (this.opts.onReady) this.opts.onReady();
    }

    // пересчёт после смены настроек; morph — плавный перелёт точек на новые места
    _rebuild(morph) {
      if (!this.graph || this.dead) return;
      const selId = this.sel >= 0 ? this.model.nodes[this.sel].id : null;
      const relayout = morph || !this.model;
      const model = relayout ? buildModel(this.graph, this.s) : this.model;
      this._apply(model, morph);
      this.sel = -1;
      if (selId != null && model.idx.has(selId)) this.select(model.idx.get(selId), true); else this._card();
      if (this.q.value) this.search(this.q.value); else this._hl();
    }

    _colors(model) {
      const pal = (PALETTES.find((p) => p.id === this.s.palette) || PALETTES[0]).c;
      const n = pal.length;
      model.clusters.forEach((c, i) => {
        const base = hexRgb(pal[i % n]), tier = (i / n) | 0, k = tier ? Math.min(0.5, 0.22 * tier) : 0;
        const rgb = [base[0] + (255 - base[0]) * k, base[1] + (255 - base[1]) * k, base[2] + (255 - base[2]) * k];
        c.hex = "rgb(" + rgb.map((v) => v | 0).join(",") + ")";
        c.lin = toLin(rgb);
      });
      this.bg = toLin(hexRgb(pal[0])).map((v) => v * 0.006);
    }

    _apply(model, morph) {
      const gl = this.gl, s = this.s, N = model.N, P = model.P, unit = model.unit;
      const prev = this.model, e = ease(this.mixT);
      this._colors(model);
      // в маленьком хранилище заметки далеко друг от друга: размеры точек и ореолов не растут вместе с расстояниями
      const us = Math.min(unit, 2.4);
      const nb = clamp(0.62 * us, 0.55, 3.2) * (N < 200 ? 1.3 : 1);     // базовый размер точки в мире
      model.nb = nb;

      /* заметки */
      const nd = new Float32Array(N * PS);
      model.size = new Float32Array(N);
      // отросткам нужно место: в маленьком хранилище нейрон крупный, в большом — скромнее, чтобы клетки не сливались
      const sk = clamp(2.6 * Math.pow(200 / Math.max(1, N), 0.3), 1.15, 2.6);
      model.sk = sk;
      for (let i = 0; i < N; i++) {
        const o = i * PS, c = model.clusters[model.cof[i]], d = model.deg[i];
        let fx = P[i * 3] * 0.04, fy = P[i * 3 + 1] * 0.04, fz = P[i * 3 + 2] * 0.04;   // первый показ: всё раскрывается из центра
        if (prev && morph) {
          const j = prev.idx.get(model.nodes[i].id);
          if (j != null) {
            const a = this.nodeData, q = j * PS;
            fx = a[q] + (a[q + 3] - a[q]) * e; fy = a[q + 1] + (a[q + 4] - a[q + 1]) * e; fz = a[q + 2] + (a[q + 5] - a[q + 2]) * e;
          }
        } else if (prev) { fx = P[i * 3]; fy = P[i * 3 + 1]; fz = P[i * 3 + 2]; }
        nd[o] = fx; nd[o + 1] = fy; nd[o + 2] = fz;
        nd[o + 3] = P[i * 3]; nd[o + 4] = P[i * 3 + 1]; nd[o + 5] = P[i * 3 + 2];
        const wk = Math.min(0.5, 0.1 + 0.07 * Math.log2(1 + d));          // связанные заметки светлее
        nd[o + 6] = c.lin[0] + (1 - c.lin[0]) * wk; nd[o + 7] = c.lin[1] + (1 - c.lin[1]) * wk; nd[o + 8] = c.lin[2] + (1 - c.lin[2]) * wk;
        nd[o + 9] = 0.55 + 0.2 * Math.min(4, Math.log2(1 + d));
        const sz = nb * (2.0 + 0.9 * Math.log2(1 + d)) * sk * (s.form === "anatomy" ? 0.6 : 1);       // вместе с отростками
        model.size[i] = sz;
        if (s.form === "anatomy") nd[o + 9] *= 0.6;       // in the small crown the notes sit close together
        nd[o + 10] = sz; nd[o + 11] = model.h1[i]; nd[o + 12] = model.cof[i]; nd[o + 13] = 1;
      }

      /* декоративная пыль */
      let Dn = Math.round(clamp(s.density, 2000, 200000));
      if (s.form === "spheres") Dn = Math.min(Dn, 6000 + 2500 * model.clusters.length + 250 * N + model.edges.length * 70);
      const dd = new Float32Array(Dn * PS);
      const rnd = rand("dust:" + s.form + ":" + s.groupBy);
      const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 0.87;
      const E = model.edges.length;
      const F = s.form;
      let [shEdge, shHalo, shShell] = { brain: [0.24, 0.2, 0.5], anatomy: [0.08, 0.1, 0.78], spheres: [0.2, 0.12, 0.62], galaxy: [0.1, 0.76, 0.08] }[F] || [0.48, 0.45, 0];
      // выбор группы с весом по размеру: для разноцветной оболочки и сфер
      const CW = model.clusters.map((c) => Math.pow(c.nodes.length, F === "spheres" ? 0.667 : 1));
      let cwSum = 0;
      for (const w of CW) cwSum += w;
      const pickCluster = () => { let t = rnd() * cwSum; for (let i = 0; i < CW.length; i++) { t -= CW[i]; if (t <= 0) return i; } return CW.length - 1; };
      if (!N) { shEdge = 0; shHalo = 0; }
      const nAmb = Math.round(Dn * Math.max(0.04, 1 - shEdge - shHalo - shShell));
      // на одну связь и на одну заметку — не больше своей доли пыли: иначе при малом числе заметок
      // всё сбивается в несколько ярких комков. Остаток уходит в строение самой формы.
      let haloCap = 0;
      for (let i = 0; i < N; i++) haloCap += 60 * (1 + Math.sqrt(model.deg[i]));
      const nEdge = Math.min(Math.round(Dn * shEdge), E * 70), nHalo = Math.min(Math.round(Dn * shHalo), Math.round(haloCap));
      let nShell = Math.round(Dn * shShell), nStruct = Math.max(0, Dn - nAmb - nEdge - nHalo - nShell);
      if (!N) nStruct = 0;
      else if (F !== "organism" && F !== "galaxy") { nShell += nStruct; nStruct = 0; }
      // дендриты: от каждой заметки расходятся изогнутые ветви частиц, как отростки нейрона
      const hs = (a, b, c) => { const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return v - Math.floor(v); };
      const reach = clamp((0.42 * WORLD * 1.6) / Math.cbrt(Math.max(1, N)), 3 * us, 24);
      const dv = [0, 0, 0];
      const branch = (i, b, t, out) => {
        const y = hs(i, b, 1) * 2 - 1, a = hs(i, b, 2) * 6.2832, q = Math.sqrt(1 - y * y);
        const dx = Math.cos(a) * q, dy = y, dz = Math.sin(a) * q;
        let ex, ey, ez;
        if (Math.abs(dy) < 0.9) { ex = dz; ey = 0; ez = -dx; } else { ex = 0; ey = -dz; ez = dy; }
        const l = Math.hypot(ex, ey, ez) || 1; ex /= l; ey /= l; ez /= l;
        const fx = dy * ez - dz * ey, fy = dz * ex - dx * ez, fz = dx * ey - dy * ex;
        const w1 = 0.24 * t * Math.sin(t * 4.4 + hs(i, b, 3) * 6.2832), w2 = 0.24 * t * Math.sin(t * 3.1 + hs(i, b, 4) * 6.2832);
        out[0] = dx * t + ex * w1 + fx * w2; out[1] = dy * t + ey * w1 + fy * w2; out[2] = dz * t + ez * w1 + fz * w2;
      };
      // веса заметок для ореолов: у связанных пыли больше
      let cum = null;
      if (N) { cum = new Float32Array(N); let a = 0; for (let i = 0; i < N; i++) { a += 1 + Math.sqrt(model.deg[i]); cum[i] = a; } }
      const pickNode = () => {
        const t = rnd() * cum[N - 1];
        let lo = 0, hi = N - 1;
        while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < t) lo = m + 1; else hi = m; }
        return lo;
      };
      const bp = [0, 0, 0];
      const neutral = toLin([150, 165, 190]);
      for (let k = 0; k < Dn; k++) {
        const o = k * PS;
        let x, y, z, r, g, b, inten, size, cl = -1;
        if (k < nEdge) {
          // вдоль связи: веретено из частиц
          const ed = model.edges[(rnd() * E) | 0], a = ed[0], bn = ed[1], t = rnd();
          const sp = us * (0.1 + 0.34 * Math.sin(t * Math.PI));
          x = P[a * 3] + (P[bn * 3] - P[a * 3]) * t + gauss() * sp;
          y = P[a * 3 + 1] + (P[bn * 3 + 1] - P[a * 3 + 1]) * t + gauss() * sp;
          z = P[a * 3 + 2] + (P[bn * 3 + 2] - P[a * 3 + 2]) * t + gauss() * sp;
          const ca = model.clusters[model.cof[a]].lin, cb = model.clusters[model.cof[bn]].lin;
          r = ca[0] + (cb[0] - ca[0]) * t; g = ca[1] + (cb[1] - ca[1]) * t; b = ca[2] + (cb[2] - ca[2]) * t;
          cl = model.cof[t < 0.5 ? a : bn];
          inten = 0.2 + 0.34 * rnd(); size = nb * (0.45 + 0.6 * rnd());
        } else if (k < nEdge + nHalo) {
          const i = pickNode(), sp = F === "galaxy" ? 1.2 + 5 * rnd() * rnd() : us * (0.35 + 1.25 * rnd() * rnd());
          x = P[i * 3] + gauss() * sp; y = P[i * 3 + 1] + gauss() * (F === "galaxy" ? 1.3 : sp); z = P[i * 3 + 2] + gauss() * sp;
          const c = model.clusters[model.cof[i]].lin, wk = rnd() * 0.35;
          r = c[0] + (1 - c[0]) * wk; g = c[1] + (1 - c[1]) * wk; b = c[2] + (1 - c[2]) * wk;
          cl = model.cof[i];
          inten = 0.18 + 0.36 * rnd(); size = nb * (0.4 + 0.7 * rnd());
        } else if (k < nEdge + nHalo + nShell) {
          let c = neutral, tint = 0;
          inten = 0.2 + 0.24 * rnd(); size = 0.75 + 0.75 * rnd();
          const NC = model.clusters.length;
          if (F === "spheres" && NC) {
            // оболочка шара группы
            const ci = pickCluster(), cc = model.clusters[ci], R = cc.rs * unit * (0.96 + 0.08 * rnd());
            const yy = rnd() * 2 - 1, a = rnd() * 6.2832, q = Math.sqrt(1 - yy * yy);
            x = cc.x + Math.cos(a) * q * R; y = cc.y + yy * R; z = cc.z + Math.sin(a) * q * R;
            c = cc.lin; tint = 0.55 + 0.4 * rnd(); cl = ci; size = 0.6 + 0.6 * rnd(); inten *= 0.75;
          } else if (F === "galaxy") {
            // светлое ядро
            { const bw = 3 + 9 * rnd() * rnd(); x = gauss() * bw; y = gauss() * bw * 0.5; z = gauss() * bw; size = 0.5 + 0.5 * rnd(); }
            c = toLin([255, 236, 205]); tint = 0.8; inten = 0.16 + 0.3 * rnd();
          } else if (F === "anatomy" && rnd() > 0.42) {
            const pk = rnd(), vi = (rnd() * NV) | 0, tv = (vi + 0.5) / NV;
            if (pk < 0.2) {
              // позвонок: плотный диск
              spinePt(tv, bp);
              const a = rnd() * 6.2832, R = (3.4 - 1.5 * tv) * Math.sqrt(rnd());
              x = bp[0] + Math.cos(a) * R; y = bp[1] + (rnd() - 0.5) * 1.1; z = bp[2] + Math.sin(a) * R;
              inten = 0.4 + 0.4 * rnd(); tint = 0.75;
            } else if (pk < 0.32) {
              // спинной мозг между позвонками
              spinePt(rnd(), bp);
              x = bp[0] + gauss() * 0.7; y = bp[1]; z = bp[2] + gauss() * 0.7;
              inten = 0.3 + 0.3 * rnd(); tint = 0.5;
            } else {
              // нервы и рёбра, вокруг них — лёгкая дымка
              const u = Math.pow(rnd(), 0.8), fz = rnd() < 0.22 ? 2.6 : 0.45;
              nervePt(vi, rnd() < 0.5 ? -1 : 1, u, bp);
              x = bp[0] + gauss() * fz; y = bp[1] + gauss() * fz; z = bp[2] + gauss() * fz;
              inten = (0.3 - 0.16 * u) * (fz > 1 ? 0.5 : 1) + 0.16 * rnd(); tint = 0.6; size = 0.6 + 0.6 * rnd();
            }
            if (NC) c = model.clusters[Math.min(NC - 1, (tv * Math.min(NC, 8)) | 0)].lin;   // цвета групп идут вниз по позвоночнику
          } else {
            // мозг: кора, мозжечок, ствол; часть точек окрашена цветами групп
            const part = brainPoint(rnd, bp), k = F === "anatomy" ? 0.36 : 1;
            x = bp[0] * 94 * k; y = bp[1] * 94 * k + (F === "anatomy" ? 58 : 0); z = bp[2] * 94 * k;
            if (NC && rnd() < 0.5) { c = model.clusters[pickCluster()].lin; tint = 0.7; } else if (NC) { c = model.clusters[0].lin; tint = part === 0 ? 0.25 : 0.12; }
            inten = (part === 0 ? 0.3 : part === 3 ? 0.12 : 0.18) + 0.24 * rnd();
            if (F === "anatomy") { size = 0.5 + 0.5 * rnd(); inten *= 1.25; }
          }
          r = neutral[0] + (c[0] - neutral[0]) * tint; g = neutral[1] + (c[1] - neutral[1]) * tint; b = neutral[2] + (c[2] - neutral[2]) * tint;
        } else if (k < nEdge + nHalo + nShell + nStruct) {
          if (F === "galaxy") {
            // рукава галактики: спирали из частиц, которые есть при любом числе заметок
            const NC = model.clusters.length, A = clamp(NC, 2, 5), arm = (rnd() * A) | 0, t = rnd();
            const rr = 9 + 84 * Math.sqrt(t), th = (arm * 6.2832) / A + 2.1 * Math.log(1 + rr / 9);
            const w = gauss() * (2.2 + 0.1 * rr), dr = gauss() * (1.5 + 0.05 * rr);
            x = Math.cos(th) * (rr + dr) - Math.sin(th) * w; z = Math.sin(th) * (rr + dr) + Math.cos(th) * w;
            y = gauss() * 2.4 * Math.max(0.3, 1 - rr / 110);
            const ci = arm + A * ((rnd() * Math.ceil((NC - arm) / A)) | 0), c = ci < NC ? model.clusters[ci].lin : neutral, tint = 0.5 * rnd();
            r = neutral[0] + (c[0] - neutral[0]) * tint; g = neutral[1] + (c[1] - neutral[1]) * tint; b = neutral[2] + (c[2] - neutral[2]) * tint;
            inten = 0.1 + 0.2 * rnd(); size = 0.6 + 0.6 * rnd();
          } else {
            const i = pickNode(), B = 5 + ((hs(i, 0, 9) * 5) | 0), bi = (rnd() * B) | 0, t = Math.pow(rnd(), 1.35);
            let px, py, pz, far = t;
            if (rnd() < 0.5) { branch(i, bi, t, dv); px = dv[0]; py = dv[1]; pz = dv[2]; }
            else {
              // боковая веточка: отходит от основной и тянется в свою сторону
              const kk = (rnd() * 3) | 0, t0 = 0.22 + 0.55 * hs(i, bi, 10 + kk);
              branch(i, bi, t0, dv); px = dv[0]; py = dv[1]; pz = dv[2];
              branch(i, bi * 7 + kk + 11, t, dv);
              px += dv[0] * 0.5; py += dv[1] * 0.5; pz += dv[2] * 0.5; far = t0 + t * 0.5;
            }
            const jit = reach * 0.012 * (1 + 2 * far);
            x = P[i * 3] + px * reach + gauss() * jit; y = P[i * 3 + 1] + py * reach + gauss() * jit; z = P[i * 3 + 2] + pz * reach + gauss() * jit;
            const c = model.clusters[model.cof[i]].lin, wk = 0.25 * rnd();
            r = c[0] + (1 - c[0]) * wk; g = c[1] + (1 - c[1]) * wk; b = c[2] + (1 - c[2]) * wk;
            cl = model.cof[i];
            inten = Math.max(0.06, 0.36 - 0.24 * far) + 0.14 * rnd(); size = nb * (0.4 + 0.5 * rnd());
          }
        } else {
          // редкая далёкая пыль: даёт ощущение пространства
          const yy = rnd() * 2 - 1, a = rnd() * 6.2832, q = Math.sqrt(1 - yy * yy), d = WORLD * (0.5 + 1.5 * Math.cbrt(rnd()));
          x = Math.cos(a) * q * d; y = yy * d; z = Math.sin(a) * q * d;
          r = neutral[0]; g = neutral[1]; b = neutral[2];
          inten = 0.06 + 0.12 * rnd(); size = 0.7 + 0.8 * rnd();
        }
        if (rnd() < 0.018) { inten *= 3.2; size *= 1.6; }       // редкие яркие «синапсы»
        let fx = x * 0.04, fy = y * 0.04, fz = z * 0.04;
        if (prev && morph && this.dustData && k * PS < this.dustData.length) {
          const a = this.dustData;
          fx = a[o] + (a[o + 3] - a[o]) * e; fy = a[o + 1] + (a[o + 4] - a[o + 1]) * e; fz = a[o + 2] + (a[o + 5] - a[o + 2]) * e;
        } else if (prev) { fx = x; fy = y; fz = z; }
        dd[o] = fx; dd[o + 1] = fy; dd[o + 2] = fz; dd[o + 3] = x; dd[o + 4] = y; dd[o + 5] = z;
        dd[o + 6] = r; dd[o + 7] = g; dd[o + 8] = b; dd[o + 9] = inten;
        dd[o + 10] = size; dd[o + 11] = rnd(); dd[o + 12] = cl; dd[o + 13] = 0;
      }
      // перемешиваем, чтобы любая первая часть была равномерной выборкой (для снижения качества на слабом железе)
      const sh = rand("shuffle"), tmp = new Float32Array(PS);
      for (let k = Dn - 1; k > 0; k--) {
        const j = (sh() * (k + 1)) | 0;
        if (j === k) continue;
        tmp.set(dd.subarray(k * PS, k * PS + PS)); dd.copyWithin(k * PS, j * PS, j * PS + PS); dd.set(tmp, j * PS);
      }

      /* связи */
      let edges = model.edges;
      if (edges.length > MAX_LINES) edges = edges.slice().sort((p, q) => q[2] - p[2] || model.deg[q[0]] + model.deg[q[1]] - model.deg[p[0]] - model.deg[p[1]]).slice(0, MAX_LINES);
      // нервная система: позвоночник и нервы тонкими линиями (украшение, не связи заметок)
      const deco = [];
      if (F === "anatomy") {
        const a = [0, 0, 0], b = [0, 0, 0], NC = model.clusters.length;
        const seg = (tv, al) => {
          const c = NC ? model.clusters[Math.min(NC - 1, (tv * Math.min(NC, 8)) | 0)].lin : neutral;
          deco.push(a[0], a[1], a[2], b[0], b[1], b[2], neutral[0] + (c[0] - neutral[0]) * 0.6, neutral[1] + (c[1] - neutral[1]) * 0.6, neutral[2] + (c[2] - neutral[2]) * 0.6, al);
        };
        for (let k = 0; k < 70; k++) { spinePt(k / 70, a); spinePt((k + 1) / 70, b); seg(k / 70, 0.8); }
        for (let vi = 0; vi < NV; vi++) for (let side = -1; side <= 1; side += 2) for (let k = 0; k < 16; k++) {
          nervePt(vi, side, k / 16, a); nervePt(vi, side, (k + 1) / 16, b); seg((vi + 0.5) / NV, 0.42 * (1 - (k / 16) * 0.7));
        }
      }
      const DL = deco.length / 10;
      const ld = new Float32Array((edges.length + DL) * 2 * LS);
      const thin = clamp(Math.sqrt(1400 / Math.max(1, edges.length)), 0.22, 1);
      for (let k = 0; k < DL; k++) for (let v = 0; v < 2; v++) {
        const o = (edges.length + k) * 2 * LS + v * LS, q = k * 10 + v * 3;
        ld[o] = ld[o + 3] = deco[q]; ld[o + 1] = ld[o + 4] = deco[q + 1]; ld[o + 2] = ld[o + 5] = deco[q + 2];
        ld[o + 6] = deco[k * 10 + 6]; ld[o + 7] = deco[k * 10 + 7]; ld[o + 8] = deco[k * 10 + 8]; ld[o + 9] = deco[k * 10 + 9];
        ld[o + 10] = v + 2 * ((k * 7) % 64); ld[o + 11] = -1;
      }
      for (let k = 0; k < edges.length; k++) {
        const ed = edges[k], same = model.cof[ed[0]] === model.cof[ed[1]];
        for (let v = 0; v < 2; v++) {
          const i = ed[v], o = (k * 2 + v) * LS, q = i * PS;
          ld[o] = nd[q]; ld[o + 1] = nd[q + 1]; ld[o + 2] = nd[q + 2];
          ld[o + 3] = nd[q + 3]; ld[o + 4] = nd[q + 4]; ld[o + 5] = nd[q + 5];
          const c = model.clusters[model.cof[i]].lin;
          ld[o + 6] = c[0]; ld[o + 7] = c[1]; ld[o + 8] = c[2]; ld[o + 9] = (same ? 0.5 : 0.24) * thin * (F === "galaxy" ? 0.4 : 1);
          ld[o + 10] = v + 2 * ((k * 37) % 97); ld[o + 11] = model.cof[i];
        }
      }

      this.model = model;
      this.nodeData = nd; this.dustData = dd;
      this.nodeN = N; this.dustN = Dn; this.lineN = (edges.length + DL) * 2;
      // старые вспышки остались бы на прежних местах
      for (let i = 0; i < this.fanData.length; i += FS) this.fanData[i + 9] = -1e6;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.gFan.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.fanData);
      this.fanQueue.length = 0;
      this.hlData = new Float32Array(N).fill(1);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.gNode.buf); gl.bufferData(gl.ARRAY_BUFFER, nd, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.gNode.hl); gl.bufferData(gl.ARRAY_BUFFER, this.hlData, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.gDust.buf); gl.bufferData(gl.ARRAY_BUFFER, dd, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.gLine.buf); gl.bufferData(gl.ARRAY_BUFFER, ld, gl.STATIC_DRAW);
      this.mixT = !prev || morph ? 0 : 1;
      this.reveal = !prev;
      this.cur = null;
      this.streamN = 0; this.hiN = 0;
      this.hover = -1; this.hoverC = -1;
      if (this.isolate >= model.clusters.length) this.isolate = -1;
      this._legend();
      this.dirty = true;
    }

    // текущие координаты заметок (во время перелёта — промежуточные)
    _pos() {
      const m = this.model;
      if (this.mixT >= 1) return m.P;
      const e = ease(this.mixT), a = this.nodeData, N = m.N;
      const c = this.cur && this.cur.length === 3 * N ? this.cur : (this.cur = new Float32Array(3 * N));
      for (let i = 0; i < N; i++) { const o = i * PS; c[i * 3] = a[o] + (a[o + 3] - a[o]) * e; c[i * 3 + 1] = a[o + 1] + (a[o + 4] - a[o + 1]) * e; c[i * 3 + 2] = a[o + 2] + (a[o + 5] - a[o + 2]) * e; }
      return c;
    }

    /* ---------- легенда, карточка, поиск ---------- */
    _legend() {
      const m = this.model, el = this.legend;
      el.textContent = "";
      el.hidden = !m || !m.N;
      if (!m || !m.N) return;
      const head = this._el("div", "f3d-legend-head", el);
      const E = m.edges.length;
      head.textContent = floraNum(m.N) + " " + plural(m.N, ["заметка", "заметки", "заметок"], ["note", "notes"]) + " · " +
        floraNum(E) + " " + plural(E, ["связь", "связи", "связей"], ["link", "links"]);
      const list = this._el("div", "f3d-legend-list", el);
      this.legendRows = [];
      m.clusters.slice(0, 40).forEach((c) => {
        const row = this._el("button", "f3d-legend-row", list);
        row.type = "button";
        const dot = this._el("span", "f3d-legend-dot", row);
        dot.style.setProperty("--f3d-c", c.hex);
        this._el("span", "f3d-legend-name", row, c.name);
        this._el("span", "f3d-legend-count", row, floraNum(c.nodes.length));
        row.title = L("Показать только эту группу", "Show only this group");
        row.onclick = () => this.focusCluster(this.isolate === c.i ? -1 : c.i);
        row.onpointerenter = () => { this.hoverC = c.i; this.dirty = true; };
        row.onpointerleave = () => { this.hoverC = -1; this.dirty = true; };
        this.legendRows.push(row);
      });
      if (m.clusters.length > 40) this._el("div", "f3d-legend-more", list, L("и ещё ", "and ") + floraNum(m.clusters.length - 40) + L("", " more"));
      this._syncLegend();
    }
    _syncLegend() { (this.legendRows || []).forEach((r, i) => r.classList.toggle("is-on", this.isolate === i)); }

    focusCluster(ci) {
      this.isolate = ci;
      this._syncLegend();
      if (ci >= 0) {
        const c = this.model.clusters[ci];
        this.select(-1);
        this.camTo.x = c.x; this.camTo.y = c.y; this.camTo.z = c.z;
        this.camTo.dist = clamp((c.r * 1.9) / Math.sin(FOV / 2), 30, 600);
      }
      this._hl();
    }

    _card() {
      const m = this.model, el = this.card, i = this.sel;
      el.textContent = "";
      el.hidden = i < 0 || !m;
      if (el.hidden) return;
      const n = m.nodes[i], c = m.clusters[m.cof[i]];
      const head = this._el("div", "f3d-card-head", el);
      const dot = this._el("span", "f3d-legend-dot", head);
      dot.style.setProperty("--f3d-c", c.hex);
      this._el("div", "f3d-card-title", head, n.title);
      const x = this._el("button", "f3d-card-x", head);
      x.type = "button"; x.setAttribute("aria-label", L("Снять выделение", "Clear selection"));
      this._ico(x, "x");
      x.onclick = () => this.select(-1);
      const d = m.deg[i];
      this._el("div", "f3d-card-meta", el, (n.folder || L("Корень хранилища", "Vault root")) + " · " + floraNum(d) + " " + plural(d, ["связь", "связи", "связей"], ["link", "links"]));
      if (n.tags && n.tags.length) {
        const tags = this._el("div", "f3d-card-tags", el);
        n.tags.slice(0, 6).forEach((t) => {
          const b = this._el("button", "f3d-chip", tags, "#" + t);
          b.type = "button";
          b.onclick = () => { this.q.value = "#" + t; this.search(this.q.value); };
        });
      }
      const open = this._el("button", "f3d-open", el, L("Открыть заметку", "Open note"));
      open.type = "button";
      open.onclick = (ev) => this._open(i, ev);
      const nb = m.adj[i];
      if (nb.length) {
        this._el("div", "f3d-card-sub", el, L("Связанные заметки", "Linked notes"));
        const list = this._el("div", "f3d-card-list", el);
        nb.slice(0, 8).forEach((j) => {
          const b = this._el("button", "f3d-card-link", list);
          b.type = "button";
          const dt = this._el("span", "f3d-legend-dot", b);
          dt.style.setProperty("--f3d-c", m.clusters[m.cof[j]].hex);
          this._el("span", "", b, m.nodes[j].title);
          b.onclick = () => this.select(j);
        });
        if (nb.length > 8) this._el("div", "f3d-legend-more", list, L("и ещё ", "and ") + floraNum(nb.length - 8) + L("", " more"));
      }
    }

    _open(i, ev) { if (this.opts.onOpen && this.model) this.opts.onOpen(this.model.nodes[i], ev); }

    search(text) {
      const m = this.model;
      if (!m) return;
      const tokens = String(text || "").toLowerCase().split(/\s+/).filter(Boolean);
      if (!tokens.length) { this.found = null; this.qCount.textContent = ""; this._hl(); return; }
      const hit = new Uint8Array(m.N);
      let count = 0, best = -1;
      for (let i = 0; i < m.N; i++) {
        const n = m.nodes[i];
        if (!n._lc) n._lc = (n.title + " " + n.id).toLowerCase();
        let ok = true;
        for (const t of tokens) {
          if (t[0] === "#" && t.length > 1) { const tag = t.slice(1); if (!(n.tags || []).some((x) => x.toLowerCase().startsWith(tag))) { ok = false; break; } }
          else if (n._lc.indexOf(t) < 0) { ok = false; break; }
        }
        if (!ok) continue;
        hit[i] = 1; count++;
        if (best < 0 || m.deg[i] > m.deg[best]) best = i;
      }
      this.found = { hit, count, best };
      this.qCount.textContent = count ? floraNum(count) : L("ничего", "none");
      this._hl();
    }

    // яркость каждой заметки: поиск, выделение, соседи
    _hl() {
      const m = this.model;
      if (!m || this.dead) return;
      const h = this.hlData, f = this.found, s = this.sel;
      for (let i = 0; i < m.N; i++) h[i] = f ? (f.hit[i] ? 1.3 : 0.05) : 1;
      if (s >= 0) {
        if (!f) for (let i = 0; i < m.N; i++) h[i] = 0.2;
        for (const j of m.adj[s]) h[j] = Math.max(h[j], 1.2);
        h[s] = 2.4;
      }
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.gNode.hl);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, h);
      this.dirty = true;
    }

    select(i, keepCam) {
      const m = this.model;
      if (!m) return;
      this.sel = i;
      this.streamN = 0; this.hiN = 0;
      if (i >= 0) {
        const P = this._pos(), gl = this.gl, nb = m.adj[i], k = nb.length;
        if (!keepCam) {
          this.camTo.x = P[i * 3]; this.camTo.y = P[i * 3 + 1]; this.camTo.z = P[i * 3 + 2];
          let far = m.unit * 3;
          for (const j of nb) far = Math.max(far, Math.hypot(P[j * 3] - P[i * 3], P[j * 3 + 1] - P[i * 3 + 1], P[j * 3 + 2] - P[i * 3 + 2]));
          this.camTo.dist = clamp((far * 1.5) / Math.sin(FOV / 2), 26, Math.max(26, this.cam.dist));
        }
        if (k) {
          // световые потоки: частицы текут от выбранной заметки к каждой связанной
          const per = clamp(Math.round(1600 / k), 8, 90), S = per * k;
          const sd = new Float32Array(S * PS), hd = new Float32Array(k * 2 * LS);
          const rnd = rand("stream:" + m.nodes[i].id);
          const g = () => (rnd() + rnd() + rnd() - 1.5) * 1.2;
          const ci = m.clusters[m.cof[i]].lin;
          let q = 0;
          nb.forEach((j, n) => {
            const cj = m.clusters[m.cof[j]].lin;
            for (let p = 0; p < per; p++, q += PS) {
              const j1 = m.nb * 0.25, j2 = m.nb * 0.9;
              sd[q] = P[i * 3] + g() * j1; sd[q + 1] = P[i * 3 + 1] + g() * j1; sd[q + 2] = P[i * 3 + 2] + g() * j1;
              sd[q + 3] = P[j * 3] + g() * j2; sd[q + 4] = P[j * 3 + 1] + g() * j2; sd[q + 5] = P[j * 3 + 2] + g() * j2;
              sd[q + 6] = cj[0] * 0.6 + 0.4; sd[q + 7] = cj[1] * 0.6 + 0.4; sd[q + 8] = cj[2] * 0.6 + 0.4; sd[q + 9] = 0.5 + 0.7 * rnd();
              sd[q + 10] = m.nb * (0.8 + 1.0 * rnd()); sd[q + 11] = rnd(); sd[q + 12] = -1; sd[q + 13] = 0;
            }
            for (let v = 0; v < 2; v++) {
              const o = (n * 2 + v) * LS, a = v ? j : i, c = v ? cj : ci;
              hd[o] = hd[o + 3] = P[a * 3]; hd[o + 1] = hd[o + 4] = P[a * 3 + 1]; hd[o + 2] = hd[o + 5] = P[a * 3 + 2];
              hd[o + 6] = c[0] * 0.5 + 0.5; hd[o + 7] = c[1] * 0.5 + 0.5; hd[o + 8] = c[2] * 0.5 + 0.5; hd[o + 9] = 1;
              hd[o + 10] = v; hd[o + 11] = -1;
            }
          });
          gl.bindBuffer(gl.ARRAY_BUFFER, this.gStream.buf); gl.bufferData(gl.ARRAY_BUFFER, sd, gl.DYNAMIC_DRAW);
          gl.bindBuffer(gl.ARRAY_BUFFER, this.gHi.buf); gl.bufferData(gl.ARRAY_BUFFER, hd, gl.DYNAMIC_DRAW);
          this.streamN = S; this.hiN = k * 2;
        }
      }
      this._card();
      this._hl();
    }

    // вспышка: веер лучей из заметки i в сторону связанной заметки; иногда импульс идёт дальше по цепочке
    _fire(i, depth) {
      const m = this.model, P = m.P, nb = m.adj[i], gl = this.gl;
      let ax, ay, az, len, j = -1;
      if (nb.length) {
        j = nb[(Math.random() * nb.length) | 0];
        ax = P[j * 3] - P[i * 3]; ay = P[j * 3 + 1] - P[i * 3 + 1]; az = P[j * 3 + 2] - P[i * 3 + 2];
        len = Math.hypot(ax, ay, az) || 1;
        ax /= len; ay /= len; az /= len;
        len = clamp(len, 5 * m.nb, 34);
      } else {
        const y = Math.random() * 2 - 1, a = Math.random() * 6.2832, q = Math.sqrt(1 - y * y);
        ax = Math.cos(a) * q; ay = y; az = Math.sin(a) * q; len = 9 * m.nb;
      }
      let ux, uy, uz;
      if (Math.abs(ay) < 0.9) { ux = az; uy = 0; uz = -ax; } else { ux = 0; uy = -az; uz = ay; }
      const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
      const vx = ay * uz - az * uy, vy = az * ux - ax * uz, vz = ax * uy - ay * ux;
      const cone = 0.2 + 0.26 * Math.random(), c = m.clusters[m.cof[i]].lin, cj = j >= 0 ? m.clusters[m.cof[j]].lin : c;
      const slot = this.fanNext, base = slot * FAN_L * 2 * FS, f = this.fanData;
      this.fanNext = (slot + 1) % FAN_B;
      for (let k = 0; k < FAN_L; k++) {
        const th = cone * Math.sqrt(Math.random()), ph = Math.random() * 6.2832, st = Math.sin(th), ct = Math.cos(th);
        const l = len * (k < 3 ? 1 : 0.45 + 0.55 * Math.random()), ca = Math.cos(ph) * st, sa = Math.sin(ph) * st;
        const dx = (ax * ct + ux * ca + vx * sa) * l, dy = (ay * ct + uy * ca + vy * sa) * l, dz = (az * ct + uz * ca + vz * sa) * l;
        const sd = Math.random();
        for (let v = 0; v < 2; v++) {
          const o = base + (k * 2 + v) * FS, cc = v ? cj : c;
          f[o] = P[i * 3]; f[o + 1] = P[i * 3 + 1]; f[o + 2] = P[i * 3 + 2];
          f[o + 3] = dx; f[o + 4] = dy; f[o + 5] = dz;
          f[o + 6] = cc[0]; f[o + 7] = cc[1]; f[o + 8] = cc[2]; f[o + 9] = this.time;
          f[o + 10] = v; f[o + 11] = sd;
        }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.gFan.buf);
      gl.bufferSubData(gl.ARRAY_BUFFER, base * 4, f, base, FAN_L * 2 * FS);
      if (j >= 0 && depth < 3 && Math.random() < 0.6) this.fanQueue.push({ t: this.time + FAN_DUR * 0.3, i: j, d: depth + 1 });
    }

    _fires(dt) {
      const m = this.model, s = this.s;
      if (!m || !m.N || this.mixT < 1 || !(s.fires > 0)) return;
      const q = this.fanQueue;
      for (let k = q.length - 1; k >= 0; k--) if (q[k].t <= this.time) { const e = q[k]; q.splice(k, 1); if (e.i < m.N) this._fire(e.i, e.d); }
      this.fanClock -= dt * s.speed * s.fires;
      if (this.fanClock > 0) return;
      this.fanClock = 0.35 + 0.75 * Math.random();
      // вспыхивают видимые заметки, охотнее — связанные
      for (let tries = 0; tries < 8; tries++) {
        const i = (Math.random() * m.N) | 0;
        if (this.hlData[i] < 0.1 || (this.isolate >= 0 && m.cof[i] !== this.isolate)) continue;
        if (!m.deg[i] && tries < 6) continue;
        this._fire(i, 0);
        break;
      }
    }

    fit(instant) {
      const aspect = this.w / Math.max(1, this.h);
      const half = aspect >= 1 ? FOV / 2 : Math.atan(Math.tan(FOV / 2) * aspect);
      Object.assign(this.camTo, { x: 0, y: 0, z: 0, dist: ((this.model ? this.model.fitR : WORLD) * 1.08) / Math.sin(half) });
      if (this.isolate >= 0) { this.isolate = -1; this._syncLegend(); }
      if (instant) Object.assign(this.cam, this.camTo, { dist: this.camTo.dist * 1.35 });
      this.dirty = true;
    }

    /* ---------- управление ---------- */
    _bind() {
      const c = this.c, on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); (this._off = this._off || []).push(() => el.removeEventListener(ev, fn, o)); };
      on(c, "pointerdown", (ev) => {
        c.setPointerCapture(ev.pointerId);
        this.host.focus({ preventScroll: true });
        this.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        this.down = { x: ev.clientX, y: ev.clientY, t: ev.timeStamp, moved: false, pan: ev.button !== 0 || ev.shiftKey || ev.altKey };
        this.pinch = null;
        this._tip(-1);
      });
      on(c, "pointermove", (ev) => {
        const p = this.pointers.get(ev.pointerId);
        if (!p) { this._hover(ev); return; }
        const dx = ev.clientX - p.x, dy = ev.clientY - p.y;
        p.x = ev.clientX; p.y = ev.clientY;
        const d = this.down;
        if (d && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 4) d.moved = true;
        const T = this.camTo;
        if (this.pointers.size >= 2) {
          // два пальца: щипок — масштаб, сдвиг — панорама
          const pts = [...this.pointers.values()];
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2;
          if (this.pinch) { T.dist = clamp(T.dist * (this.pinch.d / Math.max(1, dist)), 6, 900); this._pan(cx - this.pinch.x, cy - this.pinch.y); }
          this.pinch = { d: dist, x: cx, y: cy };
          if (d) d.moved = true;
        } else if (d && d.moved) {
          if (d.pan) this._pan(dx, dy);
          else { T.yaw -= dx * 0.0052; T.pitch = clamp(T.pitch + dy * 0.0052, -1.5, 1.5); }
        }
        this.dirty = true;
      });
      const up = (ev) => {
        if (!this.pointers.has(ev.pointerId)) return;
        this.pointers.delete(ev.pointerId);
        this.pinch = null;
        const d = this.down;
        if (this.pointers.size) return;
        this.down = null;
        if (!d || d.moved || ev.type === "pointercancel" || ev.button !== 0) return;
        const i = this._pick(ev);
        if (i >= 0) {
          const mod = ev.ctrlKey || ev.metaKey;
          if (this.s.clickOpens || mod) this._open(i, ev);
          this.select(i);
        } else if (this.sel >= 0) this.select(-1);
        else if (this.isolate >= 0) this.focusCluster(-1);
      };
      on(c, "pointerup", up);
      on(c, "pointercancel", up);
      on(c, "pointerleave", () => { this._tip(-1); });
      on(c, "dblclick", (ev) => { const i = this._pick(ev); if (i >= 0) this._open(i, ev); else this.fit(); });
      on(c, "contextmenu", (ev) => ev.preventDefault());
      on(c, "wheel", (ev) => {
        ev.preventDefault();
        const k = ev.deltaMode === 1 ? 30 : 1;
        this.camTo.dist = clamp(this.camTo.dist * Math.exp(ev.deltaY * k * 0.0011), 6, 900);
        this.dirty = true;
      }, { passive: false });
      on(this.host, "keydown", (ev) => {
        if (ev.target === this.q) {
          if (ev.key === "Escape") { this.q.value = ""; this.search(""); this.host.focus(); }
          else if (ev.key === "Enter" && this.found && this.found.best >= 0) this.select(this.found.best);
          return;
        }
        if (ev.target !== this.host && ev.target.tagName !== "CANVAS") return;
        if (ev.key === "Escape") { if (this.sel >= 0) this.select(-1); else if (this.isolate >= 0) this.focusCluster(-1); else this._togglePanel(false); }
        else if (ev.key === "f" || ev.key === "F" || ev.key === "а" || ev.key === "А") this.fit();
        else if (ev.key === " ") this.setMotion(!this.motionOn, true);
        else if (ev.key === "/") this.q.focus();
        else return;
        ev.preventDefault();
      });
      on(this.q, "input", () => this.search(this.q.value));
      if (typeof ResizeObserver !== "undefined") { this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(this.host); }
      on(c, "webglcontextlost", (ev) => { ev.preventDefault(); this.lost = true; });
      on(c, "webglcontextrestored", () => {
        this.lost = false;
        try { this._initGL(); this.resize(); if (this.graph) { this.model = null; this._rebuild(false); this.mixT = 1; } } catch (e) { this._fail(e); }
      });
    }

    _pan(dx, dy) {
      const C = this.cam, T = this.camTo;
      const k = (2 * Math.tan(FOV / 2) * C.dist) / Math.max(1, this.h);
      const cy = Math.cos(C.yaw), sy = Math.sin(C.yaw), cp = Math.cos(C.pitch), sp = Math.sin(C.pitch);
      // сцена едет за указателем: цель камеры сдвигается против «вправо» и по «вверх» экрана
      T.x += (-cy * dx - sp * sy * dy) * k; T.y += cp * dy * k; T.z += (sy * dx - sp * cy * dy) * k;
    }

    _pick(ev) {
      const m = this.model;
      if (!m || !m.N) return -1;
      const rc = this.c.getBoundingClientRect(), px = ev.clientX - rc.left, py = ev.clientY - rc.top;
      const P = this._pos(), vp = this.VP, h = this.hlData, w = this.w, hh = this.h;
      const scale = this.s.pointSize * this.pxScale / this.dpr;
      let best = -1, bs = 1e9;
      for (let i = 0; i < m.N; i++) {
        if (h[i] < 0.1 || (this.isolate >= 0 && m.cof[i] !== this.isolate)) continue;
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
        const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
        if (cw <= 0.5) continue;
        const sx = ((vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / cw * 0.5 + 0.5) * w;
        const sy = (0.5 - (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / cw * 0.5) * hh;
        const d = Math.hypot(sx - px, sy - py), r = ((m.size[i] * scale) / cw) * (0.26 / m.sk);
        if (d > Math.max(9, r + 5)) continue;
        const score = d + cw * 0.02;
        if (score < bs) { bs = score; best = i; }
      }
      return best;
    }

    _hover(ev) {
      if (ev.pointerType === "touch") return;
      const i = this._pick(ev);
      if (i !== this.hover) { this.hover = i; this.dirty = true; this.c.classList.toggle("is-hot", i >= 0); }
      this._tip(i, ev);
    }
    _tip(i, ev) {
      const t = this.tip;
      if (i < 0 || !ev) { t.classList.remove("is-on"); return; }
      const m = this.model, n = m.nodes[i];
      if (t._i !== i) {
        t._i = i;
        t.textContent = "";
        this._el("div", "f3d-tip-title", t, n.title);
        this._el("div", "f3d-tip-meta", t, m.clusters[m.cof[i]].name + " · " + floraNum(m.deg[i]) + " " + plural(m.deg[i], ["связь", "связи", "связей"], ["link", "links"]));
      }
      const rc = this.host.getBoundingClientRect();
      const x = ev.clientX - rc.left, y = ev.clientY - rc.top;
      t.style.setProperty("--x", Math.min(x + 14, this.w - 250) + "px");
      t.style.setProperty("--y", (y > this.h - 80 ? y - 56 : y + 16) + "px");
      t.classList.add("is-on");
    }

    /* ---------- подписи ---------- */
    _label(k) {
      let l = this.labelPool[k];
      if (!l) {
        l = this.labelPool[k] = this._el("button", "f3d-label", this.labels);
        l.type = "button";
        l.onclick = () => { if (l._kind === "c") this.focusCluster(this.isolate === l._i ? -1 : l._i); else this.select(l._i); };
      }
      return l;
    }
    _labels() {
      const m = this.model, mode = this.s.labels;
      let used = 0;
      if (m && m.N && this.mixT >= 1) {
        const vp = this.VP, w = this.w, h = this.h, boxes = [];
        const put = (kind, i, text, x, y, z, lift, liftPx, strong) => {
          const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
          if (cw <= 1) return;
          const sx = ((vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / cw * 0.5 + 0.5) * w;
          const sy = (0.5 - (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / cw * 0.5) * h - lift / cw - liftPx;
          if (sx < 8 || sx > w - 8 || sy < 44 || sy > h - 12) return;
          const bw = Math.min(190, text.length * 7 + 22), bx = sx - bw / 2, by = sy - 11;
          for (const b of boxes) if (bx < b[0] + b[2] && bx + bw > b[0] && by < b[1] + 24 && by + 24 > b[1]) return;
          boxes.push([bx, by, bw]);
          const l = this._label(used++);
          if (l._text !== text) { l._text = text; l.textContent = text; }
          l._kind = kind; l._i = i;
          l.className = "f3d-label" + (kind === "c" ? " is-group" : "") + (strong ? " is-strong" : "");
          const fog = clamp((this.fog1 - cw) / (this.fog1 - this.fog0), 0, 1);
          l.style.setProperty("--x", sx.toFixed(1) + "px");
          l.style.setProperty("--y", sy.toFixed(1) + "px");
          l.style.setProperty("--o", strong ? "1" : (0.35 + 0.65 * fog).toFixed(2));
          l.style.setProperty("--f3d-c", kind === "c" ? m.clusters[i].hex : m.clusters[m.cof[i]].hex);
          l.hidden = false;
        };
        const P = m.P, lift = this.pxScale / this.dpr;
        if (this.sel >= 0) {
          const s = this.sel;
          put("n", s, m.nodes[s].title, P[s * 3], P[s * 3 + 1], P[s * 3 + 2], m.size[s] * lift * (0.36 / m.sk), 12, true);
          m.adj[s].slice(0, 10).forEach((j) => put("n", j, m.nodes[j].title, P[j * 3], P[j * 3 + 1], P[j * 3 + 2], m.size[j] * lift * (0.36 / m.sk), 8, false));
        }
        if (mode !== "off") {
          const cs = m.clusters;
          for (let i = 0; i < cs.length && i < 16; i++) {
            const c = cs[i];
            if (this.isolate >= 0 && this.isolate !== i) continue;
            if (c.nodes.length < 2 && cs.length > 6) continue;
            put("c", i, c.name, c.x, c.y + c.r * (this.s.form === "galaxy" ? 0.2 : this.s.form === "spheres" ? 0.75 : 0.9), c.z, 0, this.s.form === "galaxy" ? 14 : 0, this.isolate === i);
          }
        }
        if (mode === "hubs" && this.sel < 0) {
          if (!m.hubs) m.hubs = [...Array(m.N).keys()].filter((i) => m.deg[i] > 2).sort((p, q) => m.deg[q] - m.deg[p]).slice(0, 28);
          for (const i of m.hubs) {
            if (this.isolate >= 0 && m.cof[i] !== this.isolate) continue;
            if (this.found && !this.found.hit[i]) continue;
            put("n", i, m.nodes[i].title, P[i * 3], P[i * 3 + 1], P[i * 3 + 2], m.size[i] * lift * (0.36 / m.sk), 8, false);
          }
        }
      }
      for (let k = used; k < this.labelPool.length; k++) this.labelPool[k].hidden = true;
    }

    /* ---------- кадр ---------- */
    _frame(now) {
      if (this.destroyed) return;
      this.raf = this.win.requestAnimationFrame(this._tick);
      if (this.dead || this.lost || !this.targets || !this.c.isConnected || this.c.offsetParent === null) { this._last = now; return; }
      const C = this.cam, T = this.camTo;
      const camMoving = Math.abs(C.yaw - T.yaw) + Math.abs(C.pitch - T.pitch) > 2e-4 || Math.abs(C.dist - T.dist) > 0.001 * C.dist ||
        Math.abs(C.x - T.x) + Math.abs(C.y - T.y) + Math.abs(C.z - T.z) > 0.02;
      const focusGoal = this.isolate >= 0 ? this.isolate : this.hoverC >= 0 ? this.hoverC : this.hover >= 0 && this.sel < 0 && !this.found ? this.model.cof[this.hover] : -1;
      const dimGoal = this.isolate >= 0 ? 0.04 : focusGoal >= 0 ? 0.42 : 1;
      const dustGoal = this.sel >= 0 || this.found ? 0.28 : 1;
      const easing = Math.abs(this.dimCur - dimGoal) > 0.004 || Math.abs(this.dustDimCur - dustGoal) > 0.004;
      const busy = this.pointers.size > 0 || camMoving || this.mixT < 1 || easing;
      if (!busy && !this.motionOn && !this.dirty) { this._last = now; return; }
      let fps = busy ? 60 : 40;
      if (typeof this.doc.hasFocus === "function" && !this.doc.hasFocus()) fps = Math.min(fps, 15);
      if (now - (this._lastDraw || 0) < 1000 / fps - 3) return;
      const real = (now - (this._lastDraw || now)) / 1000, dt = Math.min(0.05, real);
      // слабое железо: сначала снижаем разрешение, потом количество пыли
      if (busy && this._lastDraw && now - this._lastDraw > 45) {
        if (++this.slow > 40) {
          this.slow = 0;
          if (this.quality > 0.5) { this.quality *= 0.75; this.resize(); } else if (this.dustCut > 0.3) this.dustCut *= 0.7;
        }
      } else if (this.slow > 0) this.slow--;
      this._lastDraw = now;
      this.dirty = false;

      if (this.motionOn) {
        this.time += dt * this.s.speed;
        if (this.s.turning && !this.pointers.size && this.sel < 0) { T.yaw += dt * 0.045 * this.s.speed; }
        this._fires(dt);
      }
      const k = 1 - Math.exp(-dt * 7);
      C.yaw += (T.yaw - C.yaw) * k; C.pitch += (T.pitch - C.pitch) * k; C.dist += (T.dist - C.dist) * k;
      C.x += (T.x - C.x) * k; C.y += (T.y - C.y) * k; C.z += (T.z - C.z) * k;
      if (this.mixT < 1) this.mixT = Math.min(1, this.mixT + Math.min(0.25, real) / 1.9);
      const kd = 1 - Math.exp(-dt * 9);
      if (focusGoal >= 0) this.focusC = focusGoal; else if (this.dimCur > 0.985) this.focusC = -1;
      this.dimCur += (dimGoal - this.dimCur) * kd;
      this.dustDimCur += (dustGoal - this.dustDimCur) * kd;
      this._render();
      this._labels();
    }

    _render() {
      const gl = this.gl, T = this.targets, C = this.cam, s = this.s;
      const cp = Math.cos(C.pitch);
      const ex = C.x + C.dist * cp * Math.sin(C.yaw), ey = C.y + C.dist * Math.sin(C.pitch), ez = C.z + C.dist * cp * Math.cos(C.yaw);
      lookAt(this.V, ex, ey, ez, C.x, C.y, C.z);
      persp(this.Pm, FOV, T.scene.w / T.scene.h, Math.max(0.5, C.dist * 0.02), C.dist + WORLD * 6);
      mul(this.VP, this.Pm, this.V);
      this.pxScale = (T.scene.h * 0.5) / Math.tan(FOV / 2);
      const center = Math.hypot(ex, ey, ez);
      this.fog0 = Math.max(1, center - WORLD * 0.9); this.fog1 = center + WORLD * 1.35;
      const mix = ease(this.mixT), motion = this.motionOn ? 1 : 0;

      gl.bindFramebuffer(gl.FRAMEBUFFER, T.scene.fbo);
      gl.viewport(0, 0, T.scene.w, T.scene.h);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);

      // связи
      const pl = this.pLine;
      gl.useProgram(pl.p);
      gl.uniformMatrix4fv(pl.u.u_vp, false, this.VP);
      gl.uniform1f(pl.u.u_mix, mix); gl.uniform1f(pl.u.u_time, this.time); gl.uniform1f(pl.u.u_motion, motion);
      gl.uniform1f(pl.u.u_fog0, this.fog0); gl.uniform1f(pl.u.u_fog1, this.fog1);
      if (this.lineN && s.links > 0) {
        gl.uniform1f(pl.u.u_focusC, this.focusC); gl.uniform1f(pl.u.u_dim, this.dimCur);
        gl.uniform1f(pl.u.u_k, s.links * 0.9 * (0.35 + 0.65 * this.dustDimCur));
        gl.uniform1f(pl.u.u_pulse, motion * Math.min(1, s.fires)); gl.uniform1f(pl.u.u_freq, 3.1); gl.uniform1f(pl.u.u_spd, 1.1);
        gl.bindVertexArray(this.gLine.vao);
        gl.drawArrays(gl.LINES, 0, this.lineN);
      }
      if (this.hiN) {
        gl.uniform1f(pl.u.u_focusC, -1); gl.uniform1f(pl.u.u_dim, 1);
        gl.uniform1f(pl.u.u_k, 1.2); gl.uniform1f(pl.u.u_pulse, motion * 0.6); gl.uniform1f(pl.u.u_freq, 9.0); gl.uniform1f(pl.u.u_spd, 2.2);
        gl.bindVertexArray(this.gHi.vao);
        gl.drawArrays(gl.LINES, 0, this.hiN);
      }

      // вспышки нейронов
      if (motion && s.fires > 0) {
        const pf = this.pFan;
        gl.useProgram(pf.p);
        gl.uniformMatrix4fv(pf.u.u_vp, false, this.VP);
        gl.uniform1f(pf.u.u_time, this.time); gl.uniform1f(pf.u.u_motion, motion); gl.uniform1f(pf.u.u_dur, FAN_DUR);
        gl.uniform1f(pf.u.u_fog0, this.fog0); gl.uniform1f(pf.u.u_fog1, this.fog1); gl.uniform1f(pf.u.u_dpr, this.dpr);
        gl.bindVertexArray(this.gFan.vao);
        gl.uniform1f(pf.u.u_pt, 0); gl.drawArrays(gl.LINES, 0, FAN_B * FAN_L * 2);
        gl.uniform1f(pf.u.u_pt, 1); gl.drawArrays(gl.POINTS, 0, FAN_B * FAN_L * 2);
      }

      // пыль, потоки и заметки
      const pp = this.pPoint;
      gl.useProgram(pp.p);
      gl.uniformMatrix4fv(pp.u.u_vp, false, this.VP);
      gl.uniform1f(pp.u.u_mix, mix); gl.uniform1f(pp.u.u_time, this.time); gl.uniform1f(pp.u.u_motion, motion);
      gl.uniform1f(pp.u.u_px, this.pxScale); gl.uniform1f(pp.u.u_size, s.pointSize);
      gl.uniform1f(pp.u.u_fog0, this.fog0); gl.uniform1f(pp.u.u_fog1, this.fog1);
      gl.uniform1f(pp.u.u_dpr, this.dpr); gl.uniform1f(pp.u.u_maxPt, Math.min(this.maxPt, 120 * this.dpr));
      gl.uniform1f(pp.u.u_focusC, this.focusC); gl.uniform1f(pp.u.u_dim, this.dimCur);
      gl.uniform1f(pp.u.u_dustDim, this.dustDimCur); gl.uniform1f(pp.u.u_stream, 0);
      gl.uniform1f(pp.u.u_fade, this.reveal ? 0.12 + 0.88 * mix * mix : 1);
      gl.uniform1f(pp.u.u_wave, s.wave); gl.uniform1f(pp.u.u_focus, Math.max(1, center));
      // чем меньше заметок, тем крупнее каждая на экране: нейрон всегда читается как клетка, а не как точка
      gl.uniform1f(pp.u.u_minNode, clamp(46 - 10 * Math.log10(this.nodeN + 1), 14, 40));
      gl.vertexAttrib1f(4, 1);
      if (this.dustN) { gl.bindVertexArray(this.gDust.vao); gl.drawArrays(gl.POINTS, 0, Math.round(this.dustN * this.dustCut)); }
      if (this.streamN) {
        gl.uniform1f(pp.u.u_stream, 1); gl.uniform1f(pp.u.u_dustDim, 1); gl.uniform1f(pp.u.u_focusC, -1);
        gl.bindVertexArray(this.gStream.vao); gl.drawArrays(gl.POINTS, 0, this.streamN);
        gl.uniform1f(pp.u.u_stream, 0); gl.uniform1f(pp.u.u_focusC, this.focusC);
      }
      if (this.nodeN) { gl.bindVertexArray(this.gNode.vao); gl.drawArrays(gl.POINTS, 0, this.nodeN); }

      // свечение: цепочка уменьшений и сложение обратно
      gl.bindVertexArray(this.vaoFs);
      gl.disable(gl.BLEND);
      gl.useProgram(this.pDown.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(this.pDown.u.u_src, 0);
      let src = T.scene;
      T.mips.forEach((m, i) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, m.fbo);
        gl.viewport(0, 0, m.w, m.h);
        gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.uniform2f(this.pDown.u.u_texel, 1 / src.w, 1 / src.h);
        gl.uniform1f(this.pDown.u.u_thresh, i === 0 ? 0.07 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        src = m;
      });
      gl.useProgram(this.pUp.p);
      gl.uniform1i(this.pUp.u.u_src, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = T.mips.length - 2; i >= 0; i--) {
        const dst = T.mips[i], from = T.mips[i + 1];
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
        gl.viewport(0, 0, dst.w, dst.h);
        gl.bindTexture(gl.TEXTURE_2D, from.tex);
        gl.uniform2f(this.pUp.u.u_texel, 1 / from.w, 1 / from.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.c.width, this.c.height);
      const pc = this.pComp;
      gl.useProgram(pc.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.scene.tex);
      gl.uniform1i(pc.u.u_scene, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.mips.length ? T.mips[0].tex : T.scene.tex);
      gl.uniform1i(pc.u.u_bloom, 1);
      gl.uniform1f(pc.u.u_bloomK, T.mips.length ? 0.15 * s.glow : 0);
      gl.uniform1f(pc.u.u_exp, 1.05);
      const bg = this.bg || [0, 0, 0];
      gl.uniform3f(pc.u.u_bg, bg[0], bg[1], bg[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindVertexArray(null);
    }

    destroy() {
      this.destroyed = true;
      this.win.cancelAnimationFrame(this.raf);
      if (this._ro) this._ro.disconnect();
      for (const off of this._off || []) off();
      if (this.gl) {
        this._free();
        const ext = this.gl.getExtension("WEBGL_lose_context");
        if (ext) ext.loseContext();
      }
      this.host.textContent = "";
      this.host.classList.remove("f3d");
    }
  }

  return { Flora3D, buildModel, PALETTES, DEFAULTS };
})();

/* ------------------------------------------------------------------ */
/* Вкладка Obsidian                                                    */
/* ------------------------------------------------------------------ */
const FLORA3D_VIEW = "flora-3d";

class Flora3DView extends obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.scene = null;
    this._timer = null;
  }
  getViewType() { return FLORA3D_VIEW; }
  getDisplayText() { return "Flora 3D"; }
  getIcon() { return "atom"; }

  async onOpen() {
    const el = this.contentEl;
    el.empty();
    el.addClass("ng-view", "f3d-view");
    const wrap = el.createDiv({ cls: "ng-wrap" });
    const stage = wrap.createDiv({ cls: "f3d-stage" });
    const loader = floraLoader(wrap);
    loader.set(L("Собираю заметки", "Gathering notes"));
    this._loader = loader;
    const shownAt = performance.now();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.setTimeout(() => { loader.done(); stage.addClass("is-ready"); }, Math.max(0, 900 - (performance.now() - shownAt)));
    };
    this.scene = new F3D.Flora3D(stage, {
      settings: this.plugin.settings.f3d,
      icon: (e, name) => { if (typeof obsidian.setIcon === "function") obsidian.setIcon(e, name); },
      onOpen: (n, ev) => this.openNode(n, ev),
      onSave: (s) => {
        this.plugin.settings.f3d = Object.assign({}, s);
        window.clearTimeout(this._saveT);
        this._saveT = window.setTimeout(() => this.plugin.saveSettings(), 400);
      },
      onProgress: (p) => { if (!finished) loader.set(L("Выращиваю организм", "Growing the organism") + "  " + Math.round(p * 100) + "%", p); },
      onReady: finish,
    });
    await this.refresh();

    const later = () => { window.clearTimeout(this._timer); this._timer = window.setTimeout(() => this.refresh(), 1500); };
    this.registerEvent(this.app.metadataCache.on("resolved", later));
    this.registerEvent(this.app.vault.on("create", later));
    this.registerEvent(this.app.vault.on("delete", later));
    this.registerEvent(this.app.vault.on("rename", later));
  }

  async onClose() {
    window.clearTimeout(this._timer);
    window.clearTimeout(this._saveT);
    if (this._loader) { this._loader.remove(); this._loader = null; }
    if (this.scene) this.scene.destroy();
    this.scene = null;
  }

  onResize() { if (this.scene) this.scene.resize(); }

  // заметки и настоящие ссылки между ними; ничего не выдумываем
  collect() {
    const app = this.app;
    const files = app.vault.getMarkdownFiles();
    const known = new Set(files.map((f) => f.path));
    const nodes = files.map((f) => {
      const cache = app.metadataCache.getFileCache(f);
      const raw = cache && typeof obsidian.getAllTags === "function" ? obsidian.getAllTags(cache) || [] : [];
      const folder = f.parent && f.parent.path !== "/" ? f.parent.path : "";
      return { id: f.path, title: f.basename, folder, tags: [...new Set(raw.map((t) => t.replace(/^#/, "")))] };
    });
    const edges = [], seen = new Map();
    const rl = app.metadataCache.resolvedLinks || {};
    for (const src in rl) {
      if (!known.has(src)) continue;
      for (const dst in rl[src]) {
        if (!known.has(dst) || dst === src) continue;
        const k = src < dst ? src + "\u0000" + dst : dst + "\u0000" + src;
        const e = seen.get(k);
        if (e) e.w += rl[src][dst]; else { const ne = { a: src, b: dst, w: rl[src][dst] }; seen.set(k, ne); edges.push(ne); }
      }
    }
    return { nodes, edges };
  }

  async refresh() {
    if (!this.scene) return;
    try {
      const g = this.collect();
      // обновление, которое ничего не меняет, сцену не трогает
      const sig = g.nodes.length + "|" + g.edges.length + "|" + g.nodes.map((n) => n.id + "#" + n.tags.join(",")).join("\n") + "|" + g.edges.map((e) => e.a + ">" + e.b).join("\n");
      if (sig === this._sig) return;
      this._sig = sig;
      await this.scene.setData(g);
    } catch (e) {
      console.error("Flora 3D:", e);
    }
  }

  async openNode(n, ev) {
    const f = this.app.vault.getAbstractFileByPath(n.id);
    if (!(f instanceof obsidian.TFile)) return;
    let target = null;
    if (!obsidian.Keymap.isModEvent(ev)) {
      this.app.workspace.iterateRootLeaves((l) => {
        if (!target && l !== this.leaf && l.view && l.view.getViewType() === "markdown") target = l;
      });
    }
    if (!target) target = this.app.workspace.getLeaf("tab");
    await target.openFile(f);
    this.app.workspace.setActiveLeaf(target, { focus: true });
  }
}
