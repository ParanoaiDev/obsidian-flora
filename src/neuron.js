/* ------------------------------------------------------------------ */
/* Нейрон — хранилище как одна живая нервная клетка. Заметка — шипик на   */
/* дендрите, тема — ветка, незакрытое дело — огонёк на окончании аксона.   */
/* Линзы: нейрон, синапс (дела переходят в сделанные), время, связи.       */
/* ------------------------------------------------------------------ */
const FNeuron = (function () {
  "use strict";
  const U = FSpace.util, persp = U.persp, lookAt = U.lookAt, mul = U.mul, gauss = U.gauss, clamp = U.clamp, lin = U.lin, SSH = U.SH, HEAD = U.HEAD, NOISE = U.NOISE;
  const DAY = 864e5;
  const PRESETS = [
    { id: "aurora", name: () => L("Аврора", "Aurora"), dend: null, spine: "#ffffff", axon: "#ffbf5e", soma: "#ffffff" },
    { id: "ice", name: () => L("Лёд", "Ice"), dend: "#8cc2ff", spine: "#eaf4ff", axon: "#ffc46b", soma: "#cfe6ff" },
    { id: "rose", name: () => L("Роза", "Rose"), dend: "#ff6fb4", spine: "#ffe3f1", axon: "#ffd36b", soma: "#ff9fd2" },
    { id: "ember", name: () => L("Угли", "Ember"), dend: "#ff9442", spine: "#fff0dc", axon: "#86d8ff", soma: "#ffc27c" },
    { id: "fluo", name: () => L("Флуоресценция", "Fluorescence"), dend: "#48f59a", spine: "#dcffe9", axon: "#ffe36b", soma: "#9dffc8" },
    { id: "mono", name: () => L("Моно", "Mono"), dend: "#d6dbe4", spine: "#ffffff", axon: "#ffffff", soma: "#ffffff" },
  ];
  const TOPIC_COLORS = ["#7ab8ff", "#ff7ab8", "#ffb45e", "#6fe3a8", "#c49bff", "#ff8a70", "#5fd7e6", "#e6d45f", "#9fb7ff", "#ff9fe0", "#8fe36f", "#ffcf9f", "#b0b8c8", "#7fffd4"];
  const LENSES = ["neuron", "synapse", "time", "links"];
  const DEFAULTS = {
    lens: "neuron", branch: "folder", preset: "aurora", dendW: 1, spine: 1, axon: 0.75, persp: 0.5, fade: 0.55,
    rotate: true, anim: true, labelSize: 12, fresh: 24, minNotes: 1, panel: true,
  };
  const v3 = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sc: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  };
  const notesN = (n) => floraNum(n) + " " + plural(n, ["заметка", "заметки", "заметок"], ["note", "notes"]);
  const tasksN = (n) => floraNum(n) + " " + plural(n, ["дело", "дела", "дел"], ["task", "tasks"]);
  const fmtDay = (t) => new Date(t).toLocaleDateString(FLORA_LANG === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "short" });
  const fmtTime = (t) => { const d = new Date(t); return (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes(); };
  const dayKey = (t) => { const d = new Date(t); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };

  /* ---------- модель: темы, заметки, дела, связи ---------- */
  // g: { nodes: [{ id, title, folder, tags, mtime, ctime }], edges: [{ a, b }], tasks: [{ id, path, line, text, done, due, doneAt }] }
  function buildModel(g, s) {
    const notes = g.nodes.map((n) => Object.assign({}, n)), index = new Map(notes.map((n, i) => [n.id, i]));
    const keyOf = (n) => {
      if (s.branch === "tag" && n.tags && n.tags.length) return "#" + n.tags[0].split("/")[0];
      return n.folder ? n.folder.split("/")[0] : "\x01root";
    };
    const cnt = new Map();
    for (const n of notes) { const k = keyOf(n); cnt.set(k, (cnt.get(k) || 0) + 1); }
    const keys = [...cnt.keys()].filter((k) => cnt.get(k) >= Math.max(1, s.minNotes)).sort((a, b) => cnt.get(b) - cnt.get(a));
    const MAX = 13, main = new Set(keys.slice(0, keys.length > MAX ? MAX - 1 : MAX));
    const topics = [], tix = new Map();
    const topicOf = (k) => {
      const kk = main.has(k) ? k : "\x01other";
      if (!tix.has(kk)) {
        tix.set(kk, topics.length);
        topics.push({ key: kk, name: kk === "\x01root" ? L("Корень", "Root") : kk === "\x01other" ? L("Другое", "Other") : kk, notes: [], tasks: [], last: 0 });
      }
      return tix.get(kk);
    };
    for (let i = 0; i < notes.length; i++) { const t = topicOf(keyOf(notes[i])); notes[i].topic = t; topics[t].notes.push(i); topics[t].last = Math.max(topics[t].last, notes[i].mtime || 0, notes[i].ctime || 0); }
    topics.sort((a, b) => (a.key === "\x01other") - (b.key === "\x01other") || b.notes.length - a.notes.length);
    topics.forEach((t, i) => { t.color = TOPIC_COLORS[i % TOPIC_COLORS.length]; for (const n of t.notes) notes[n].topic = i; });
    for (const t of topics) t.notes.sort((a, b) => (notes[a].ctime || 0) - (notes[b].ctime || 0));
    const deg = new Array(notes.length).fill(0), edges = [], seen = new Set();
    for (const e of g.edges) {
      const a = index.get(e.a), b = index.get(e.b);
      if (a == null || b == null || a === b) continue;
      const k = a < b ? a + ":" + b : b + ":" + a;
      if (seen.has(k)) continue;
      seen.add(k); edges.push([a, b]); deg[a]++; deg[b]++;
    }
    const tasks = (g.tasks || []).map((t) => Object.assign({}, t));
    for (const t of tasks) { const ni = index.get(t.path); t.note = ni == null ? -1 : ni; t.topic = ni == null ? -1 : notes[ni].topic; if (t.topic >= 0) topics[t.topic].tasks.push(t); }
    return { notes, index, topics, edges, deg, tasks, open: tasks.filter((t) => !t.done) };
  }

  /* ---------- рост клетки ---------- */
  function rotAround(v, axis, ang) {
    const c = Math.cos(ang), s = Math.sin(ang), d = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2], cr = v3.cross(axis, v);
    return [v[0] * c + cr[0] * s + axis[0] * d * (1 - c), v[1] * c + cr[1] * s + axis[1] * d * (1 - c), v[2] * c + cr[2] * s + axis[2] * d * (1 - c)];
  }
  function perpOf(d, rnd) { const r = v3.norm([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]); return v3.norm(v3.cross(d, r)); }
  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t, o = [0, 0, 0];
    for (let k = 0; k < 3; k++) o[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
    return o;
  }
  // ветка: опорные точки со случайным изгибом, сглаженные кривой; боковые отростки растут из опорных точек
  function branch(o, rnd, start, dir, len, w0, depth, dist, topic, pB, maxD, kind) {
    const step = 5, K = Math.max(2, Math.round(len / step));
    const ctl = [start], ds = [dir], ws = [w0], kids = [];
    let p = start, d = dir;
    for (let k = 0; k < K; k++) {
      d = v3.norm(v3.add(d, v3.sc([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], 0.22)));
      const np = v3.add(p, v3.sc(d, step));
      ctl.push(np); ds.push(d); ws.push(w0 * (1 - ((k + 1) / K) * 0.74));
      if (depth < maxD && k > 0 && k < K - 1 && rnd() < pB) kids.push([k + 1, d]);
      p = np;
    }
    const sub = o.smooth ? (depth <= 1 ? 3 : 2) : 1;
    for (let i = 0; i < K; i++) {
      const p0 = ctl[Math.max(0, i - 1)], p1 = ctl[i], p2 = ctl[i + 1], p3 = ctl[Math.min(K, i + 2)];
      let prev = p1, mid = -1;
      for (let j = 1; j <= sub; j++) {
        const t = j / sub, q = j === sub ? p2 : catmull(p0, p1, p2, p3, t);
        const wa = ws[i] + (ws[i + 1] - ws[i]) * ((j - 1) / sub), wb = ws[i] + (ws[i + 1] - ws[i]) * t;
        o.segs.push({ a: prev, b: q, wa, wb, topic, kind: kind || 0, depth, d0: dist + (i + (j - 1) / sub) * step, d1: dist + (i + t) * step });
        if (j === Math.ceil(sub / 2)) mid = o.segs.length - 1;
        prev = q;
      }
      if (!kind) o.slots.push({ p: catmull(p0, p1, p2, p3, 0.5), d: ds[i + 1], dist: dist + (i + 0.5) * step, topic, w: (ws[i] + ws[i + 1]) / 2, seg: mid, depth });
    }
    for (const [ci, cd0] of kids) {
      const ax = perpOf(cd0, rnd), cd = v3.norm(rotAround(cd0, ax, (0.5 + rnd() * 0.6) * (rnd() < 0.5 ? -1 : 1)));
      branch(o, rnd, ctl[ci], cd, (K - ci) * step * (0.5 + rnd() * 0.35) + 10, ws[ci] * 0.75, depth + 1, dist + ci * step, topic, pB * 0.8, maxD, kind);
    }
    if (!kind) o.tips.push({ p, topic, dist: dist + K * step });
  }
  // тонкие веточки без заметок: густота живой ткани
  function twigs(o, rnd, slots, topic, budget) {
    let made = 0;
    for (const sl of slots) {
      if (made >= budget) break;
      if (rnd() > 0.42) continue;
      const pd = perpOf(sl.d, rnd), dd = v3.norm(v3.add(v3.sc(sl.d, 0.55 + rnd() * 0.4), v3.sc(pd, 0.8)));
      let p = v3.add(sl.p, v3.sc(pd, sl.w * 0.3)), d = dd;
      const L = 5 + rnd() * 13, n = 3, w = Math.max(0.16, sl.w * 0.32);
      for (let k = 0; k < n; k++) {
        d = v3.norm(v3.add(d, v3.sc([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], 0.5)));
        const np = v3.add(p, v3.sc(d, L / n));
        o.segs.push({ a: p, b: np, wa: w * (1 - k / n * 0.7), wb: w * (1 - (k + 1) / n * 0.7), topic, kind: 2, depth: 4, d0: sl.dist + (k * L) / n, d1: sl.dist + ((k + 1) * L) / n });
        p = np;
      }
      made++;
    }
    return made;
  }
  // аксон вниз и ветвление окончаний: по окончанию на дело; ствол покрыт миелином
  function arbor(o, rnd, p, d, len, w, level, need, dist) {
    const K = Math.max(1, Math.round(len / 4));
    let q = p, dd = d;
    for (let k = 0; k < K; k++) {
      dd = v3.norm(v3.add(dd, v3.sc([rnd() - 0.5, rnd() * 0.2 - 0.1, rnd() - 0.5], 0.12)));
      const nq = v3.add(q, v3.sc(dd, len / K));
      const hill = level === 0 ? 1 + 1.6 * Math.exp(-k * 0.55) : 1;
      o.segs.push({ a: q, b: nq, wa: w * hill, wb: w * 0.95 * (level === 0 ? 1 + 1.6 * Math.exp(-(k + 1) * 0.55) : 1), topic: -1, kind: 1, depth: level, d0: dist + (k * len) / K, d1: dist + ((k + 1) * len) / K, my: level <= 1 && (level > 0 || k > 2) ? 1 : 0 });
      q = nq;
    }
    dist += len;
    if (need <= 1 || level > 11) { o.terms.push(q); o.termSeg.push(o.segs.length - 1); o.termD.push(dist); return; }
    const left = Math.ceil(need / 2), right = need - left;
    const ax = perpOf(d, rnd);
    const spread = 0.32 + rnd() * 0.25;
    const d1 = v3.norm(v3.add(rotAround(d, ax, spread), [0, -0.25, 0])), d2 = v3.norm(v3.add(rotAround(d, ax, -spread), [0, -0.25, 0]));
    const k1 = level === 0 ? 0.42 : 0.68;
    arbor(o, rnd, q, d1, len * (k1 + rnd() * 0.1), w * 0.8, level + 1, left, dist);
    if (right > 0) arbor(o, rnd, q, d2, len * (k1 + rnd() * 0.1), w * 0.8, level + 1, right, dist);
  }
  // соседние клетки вдалеке: только силуэт, без данных
  // соседние клетки вдалеке: только силуэт, без данных. type: 0 — пирамидная, 1 — звёздчатая, 2 — глия
  function ghostCell(rnd, center, scale, rot, type) {
    const g = { segs: [], slots: [], tips: [], terms: [], termSeg: [], termD: [], smooth: true };
    if (type === 2) {
      // астроцит: много коротких ветвистых отростков во все стороны
      const nd = 9 + ((rnd() * 6) | 0);
      for (let i = 0; i < nd; i++) {
        const y = rnd() * 2 - 1, a = rnd() * 6.283, rr = Math.sqrt(1 - y * y), dir = v3.norm([Math.cos(a) * rr, y, Math.sin(a) * rr]);
        branch(g, rnd, v3.sc(dir, 5), dir, 28 + rnd() * 34, 0.9, 0, 0, -2, 0.42, 2, 3);
      }
    } else {
      const nd = type === 1 ? 6 + ((rnd() * 4) | 0) : 4 + ((rnd() * 4) | 0);
      for (let i = 0; i < nd; i++) {
        const a = rnd() * 6.283, y = type === 1 ? rnd() * 2 - 1 : i === 0 ? 1 : rnd() * 1.4 - 0.4;
        const dir = v3.norm(type !== 1 && i === 0 ? [0.1, 1, 0.05] : [Math.cos(a), y, Math.sin(a)]);
        branch(g, rnd, v3.sc(dir, 8), dir, (type !== 1 && i === 0 ? 150 : 55) + rnd() * (type === 1 ? 60 : 90), 1.4, 0, 0, -2, 0.24, 2, 3);
      }
      const ad = v3.norm([rnd() - 0.5, -1, rnd() - 0.5]);
      arbor(g, rnd, v3.sc(ad, 7), ad, 70 + rnd() * 60, 1.2, 0, 5 + ((rnd() * 9) | 0), 0);
    }
    const seen = new Set(), c = Math.cos(rot), s = Math.sin(rot), tilt = (rnd() - 0.5) * 0.7, ct = Math.cos(tilt), st = Math.sin(tilt);
    const tf = (p) => { if (seen.has(p)) return; seen.add(p); let x = p[0] * scale, y = p[1] * scale, z = p[2] * scale; const y2 = y * ct - z * st, z2 = y * st + z * ct; y = y2; z = z2; p[0] = center[0] + c * x + s * z; p[1] = center[1] + y; p[2] = center[2] - s * x + c * z; };
    for (const sg of g.segs) { tf(sg.a); tf(sg.b); sg.kind = 3; sg.wa *= scale; sg.wb *= scale; sg.d0 *= scale; sg.d1 *= scale; sg.my = 0; }
    return { segs: g.segs, soma: center.slice(), r: (type === 2 ? 5 : 9) * scale, type };
  }
  // длинный пучок волокон через всю ткань
  function tract(rnd, S, C) {
    const pts = [], y0 = (rnd() - 0.5) * 2.2 * S, z0 = -(0.9 + rnd() * 1.6) * S, a = rnd() * 6.283;
    for (let i = 0; i <= 6; i++) {
      const u = i / 6 - 0.5;
      pts.push([C[0] + Math.cos(a) * u * 5 * S + (rnd() - 0.5) * 0.4 * S, C[1] + y0 + Math.sin(a) * u * 2 * S + (rnd() - 0.5) * 0.4 * S, C[2] + z0 + (rnd() - 0.5) * 0.6 * S]);
    }
    const segs = [], n = 6 * 10;
    let prev = pts[0];
    for (let k = 1; k <= n; k++) {
      const f = (k / n) * 6, i = Math.min(5, Math.floor(f)), t = f - i;
      const q = catmull(pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(6, i + 2)], t);
      segs.push({ a: prev, b: q, wa: 1.6 + rnd() * 1.4, wb: 1.6 + rnd() * 1.4, topic: -2, kind: 3, depth: 0, d0: 0, d1: 0, my: 0 });
      prev = q;
    }
    return { segs, soma: null, r: 0, type: 3 };
  }
  function grow(m, seed) {
    const big = m.notes.length > 1500;
    const o = { segs: [], slots: [], tips: [], terms: [], termSeg: [], termD: [], spines: new Array(m.notes.length), anchors: [], bouts: [], smooth: !big };
    const T = m.topics.length, RS = 11;
    let twigBudget = clamp(9000 - m.notes.length * 2, 1500, 9000);
    m.topics.forEach((t, i) => {
      const rnd = NG.rand("dend|" + t.key);
      const n = t.notes.length;
      // самая большая тема — верхушечный дендрит, остальные — вокруг тела
      let dir;
      if (i === 0) dir = [0.05, 1, 0.08];
      else { const a = i * 2.399963 + 0.4, y = 0.7 - ((i - 1) / Math.max(1, T - 1)) * 1.05; dir = [Math.cos(a), y, Math.sin(a)]; }
      dir = v3.norm(dir);
      const len = (55 + 21 * Math.sqrt(n)) * (i === 0 ? 1.3 : 1);
      const start = v3.sc(dir, RS * 0.8);
      const before = o.slots.length, segBefore = o.segs.length;
      branch(o, rnd, start, dir, len, 1.7 + Math.min(1.4, Math.sqrt(n) * 0.1), 0, 0, i, clamp(0.09 + n / 520, 0.1, 0.3), n > 50 ? 3 : 2);
      const slots = o.slots.slice(before).sort((a, b) => a.dist - b.dist);
      twigBudget -= twigs(o, NG.rand("twig|" + t.key), slots, i, Math.max(0, Math.round(twigBudget / Math.max(1, T - i))));
      // старые заметки ближе к телу, новые — у кончиков
      for (let k = 0; k < n; k++) {
        const sl = slots[Math.min(slots.length - 1, Math.floor(((k + 0.5) / n) * slots.length))];
        const ni = t.notes[k], r2 = NG.rand(m.notes[ni].id + "#sp");
        const along = v3.add(sl.p, v3.sc(sl.d, (r2() - 0.5) * 3.6));
        const pd = perpOf(sl.d, r2), L2 = 2.2 + r2() * 2.6 + 0.45 * Math.log2(1 + m.deg[ni]);
        const base = v3.add(along, v3.sc(pd, sl.w * 0.35)), head = v3.add(base, v3.sc(pd, L2));
        o.spines[ni] = { base, head, topic: i, seg: sl.seg, dist: sl.dist };
      }
      // подпись — у дальнего конца главного ствола
      const trunk = o.segs.slice(segBefore).filter((sg) => sg.depth === 0 && sg.kind === 0);
      const tip = trunk.length ? trunk[Math.floor(trunk.length * 0.92)].b : v3.sc(dir, len);
      o.anchors.push(v3.add(tip, v3.sc(dir, 8)));
    });
    // аксон
    const nT = Math.min(480, m.open.length + Math.min(120, m.tasks.length - m.open.length));
    const rnd = NG.rand("axon|" + seed);
    const axLen = 60 + Math.sqrt(Math.max(1, nT)) * 4;
    arbor(o, rnd, [0, -RS * 0.75, 0], [0.04, -1, 0.02], axLen, 1.7, 0, Math.max(6, nT), 0);
    // дела — на окончаниях, сначала открытые
    const list = m.open.concat(m.tasks.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0))).slice(0, o.terms.length);
    list.forEach((t, i) => { o.bouts.push({ p: o.terms[i], task: t, dist: o.termD[i] }); });
    for (let i = list.length; i < o.terms.length; i++) o.bouts.push({ p: o.terms[i], task: null, dist: o.termD[i] });
    // рамка для камеры
    let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], maxD = 0;
    for (const sg of o.segs) { maxD = Math.max(maxD, sg.d1); for (const q of [sg.a, sg.b]) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); } }
    if (!o.segs.length) { lo = [-40, -40, -40]; hi = [40, 40, 40]; }
    o.center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    o.size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 60);
    o.height = hi[1] - lo[1];
    o.rs = RS;
    o.maxD = maxD + 20;
    // родитель каждого отрезка: тот, чей конец совпадает с началом
    const byEnd = new Map();
    o.segs.forEach((sg, i) => byEnd.set(sg.b, i));
    o.parent = o.segs.map((sg) => (byEnd.has(sg.a) ? byEnd.get(sg.a) : -1));
    // фон: соседние клетки позади и по сторонам, частицы в толще ткани
    const S = o.size, gr = NG.rand("ghost|" + seed);
    o.ghosts = [];
    // ткань мозга вокруг: клетки на разной глубине, ближние — сильнее размыты
    const nG = o.segs.length > 120000 ? 10 : o.segs.length > 50000 ? 22 : 40;
    for (let i = 0; i < nG; i++) {
      const y = 1 - (2 * (i + 0.5)) / nG, rr = Math.sqrt(1 - y * y), th = i * 2.399963 + gr() * 0.6;
      const dist = 0.85 + Math.pow(gr(), 0.7) * 1.9;
      const pos = [o.center[0] + Math.cos(th) * rr * dist * S, o.center[1] + y * dist * S * 0.7, o.center[2] + Math.sin(th) * rr * dist * S];
      const type = gr() < 0.28 ? 2 : gr() < 0.35 ? 1 : 0;
      const cell = ghostCell(gr, pos, (S / 420) * (0.55 + gr() * 0.6) * (type === 2 ? 1.3 : 1), gr() * 6.28, type);
      cell.blur = Math.min(1.6, Math.max(0, (dist - 1.1) * 0.9) + gr() * 0.25);
      cell.hue = gr();
      o.ghosts.push(cell);
    }
    for (let i = 0; i < 7; i++) { const t = tract(gr, S, o.center); t.blur = 1.1 + gr() * 0.6; t.hue = gr(); o.ghosts.push(t); }
    for (const g of o.ghosts) {
      if (!g.soma) continue;
      const be = new Map(), st = new Set();
      g.segs.forEach((sg, i) => { be.set(sg.b, i); st.add(sg.a); });
      g.parent = g.segs.map((sg) => (be.has(sg.a) ? be.get(sg.a) : -1));
      g.leaves = g.segs.map((sg, i) => (st.has(sg.b) ? -1 : i)).filter((i) => i >= 0 && g.segs[i].kind === 3);
    }
    o.dust = [];
    for (let i = 0; i < 1400; i++) {
      const r = S * (0.25 + Math.pow(gr(), 0.6) * 0.95), th = gr() * 6.283, y = gr() * 2 - 1, rr = Math.sqrt(1 - y * y);
      o.dust.push([o.center[0] + Math.cos(th) * rr * r, o.center[1] + y * r * 0.8, o.center[2] + Math.sin(th) * rr * r, gr(), gr()]);
    }
    return o;
  }

  /* ---------- шейдеры клетки ---------- */
  // ветки медленно покачиваются в «жидкости»: чем дальше от тела клетки, тем сильнее
  const SWAY = "vec3 sway(vec3 p,float d){float k=smoothstep(8.0,u_reach,d)*u_amp;return p+k*vec3(sin(u_time*0.55+p.y*0.035+p.z*0.02),0.55*sin(u_time*0.47+p.x*0.03+1.7),cos(u_time*0.5+p.y*0.03+p.x*0.015));}\n";
  const SH = {
    // a_w: толщина в начале и в конце, вид начала и конца (0 — стык с соседним отрезком, 1 — круглый конец, 2 — плавно выходит из тела клетки)
    dendV: HEAD + "layout(location=0) in vec3 a_a;layout(location=1) in vec3 a_b;layout(location=2) in vec4 a_c;layout(location=3) in vec4 a_w;layout(location=4) in vec4 a_s;\n" +
      "uniform mat4 u_vp,u_m;uniform vec2 u_res;uniform float u_px,u_wk,u_alpha,u_fade,u_fd,u_fr,u_grow,u_time,u_amp,u_reach,u_dof;out vec4 v_c;out float v_d;out float v_w;out float v_s;out float v_my;out vec4 v_l;out float v_kd;\n" + SWAY +
      "void main(){v_kd=a_s.z;int k=gl_VertexID;float tt=(k==1||k==4||k==5)?1.0:0.0;float sd=(k==2||k==3||k==5)?1.0:-1.0;\n" +
      " float vis=clamp((u_grow-a_s.x)/max(a_s.y-a_s.x,1e-3),0.0,1.0);\n" +
      " if(vis<=0.0){gl_Position=vec4(2.0,2.0,2.0,1.0);v_c=vec4(0.0);v_d=0.0;v_w=1.0;v_s=0.0;v_my=0.0;v_l=vec4(0.0);return;}\n" +
      " vec3 bb=sway(mix(a_a,a_b,vis),mix(a_s.x,a_s.y,vis));vec4 ca=u_vp*(u_m*vec4(sway(a_a,a_s.x),1.0));vec4 cb=u_vp*(u_m*vec4(bb,1.0));vec4 c0=mix(ca,cb,tt);\n" +
      " if(c0.w<0.5){gl_Position=vec4(2.0,2.0,2.0,1.0);v_c=vec4(0.0);v_d=0.0;v_w=1.0;v_s=0.0;v_my=0.0;v_l=vec4(0.0);return;}\n" +
      " vec2 sa=ca.xy/max(ca.w,0.01)*u_res*0.5;vec2 sb=cb.xy/max(cb.w,0.01)*u_res*0.5;vec2 dr=sb-sa;float dl=length(dr);dr=dl>1e-6?dr/dl:vec2(1.0,0.0);\n" +
      " float my=a_s.z==3.0?0.0:a_s.w;float gh=a_s.z==3.0?a_s.w:u_dof*0.75*smoothstep(u_fr*0.7,u_fr*2.0,abs(c0.w-u_fd));float ww=min(mix(a_w.x,a_w.y,tt)*u_wk*(1.0+my*1.1)*(1.0+gh*2.2)*u_px/c0.w,14.0+gh*26.0);float wd=max(ww,1.0);float hf=wd*0.5+1.0;\n" +
      " float capS=a_w.z==1.0?1.0:0.0;float capE=(a_w.w==1.0||vis<1.0)?1.0:0.0;float ext=tt<0.5?capS*hf:capE*hf;\n" +
      " c0.xy+=(vec2(-dr.y,dr.x)*sd*hf+dr*(tt*2.0-1.0)*ext)/(u_res*0.5)*c0.w;gl_Position=c0;v_d=sd*hf;v_w=wd;v_s=mix(a_s.x,a_s.x+(a_s.y-a_s.x)*vis,tt);v_my=my*step(3.0,ww);\n" +
      " v_l=vec4(mix(-capS*hf,dl+capE*hf,tt),dl,a_w.z==2.0?1.0:0.0,gh);\n" +
      " float fog=1.0-u_fade*smoothstep(-u_fr,u_fr,c0.w-u_fd);v_c=vec4(a_c.rgb,a_c.a*u_alpha*fog*(ww/wd));}",
    // объём ветки: светлая середина, мягкий край, круглые концы, миелин с перехватами, огонёк на растущем кончике
    dendF: HEAD + "in vec4 v_c;in float v_d;in float v_w;in float v_s;in float v_my;in vec4 v_l;in float v_kd;out vec4 o;uniform float u_grow;\n" +
      "void main(){float hw=v_w*0.5;float lim=hw;float br=1.0;float sh=1.0;\n" +
      " if((v_kd==0.0||v_kd==2.0)&&hw<3.2){float bead=pow(0.5+0.5*sin(v_s*1.15+v_kd),12.0);lim*=1.0+0.55*bead;br*=1.0+0.35*bead;}\n" +
      " if(v_my>0.5){float m=fract(v_s/10.0);sh=smoothstep(0.0,0.07,m)*(1.0-smoothstep(0.88,0.95,m));lim=hw*mix(0.34,1.0,sh);br=mix(2.2,1.0,sh);}\n" +
      " float dx=max(max(-v_l.x,v_l.x-v_l.y),0.0);float r=length(vec2(dx,v_d));\n" +
      " float a=clamp(lim+0.5-r,0.0,1.0);float x=clamp(r/max(lim,0.5),0.0,1.0);\n" +
      " if(v_l.z>0.5)a*=smoothstep(0.0,max(v_l.y*0.9,2.0),v_l.x);\n" +
      " if(v_l.w>0.0){a=exp(-r*r/max(lim*lim,0.3)*2.2)*step(r,lim+1.0);}\n" +
      " float tube=v_l.w>0.0?1.0:hw>1.1?(0.42+0.85*pow(1.0-x*x,1.3)+(v_my>0.5?0.55*pow(x,5.0)*sh:0.0)):1.0;\n" +
      " float front=u_grow<1e8?exp(-max(0.0,u_grow-v_s)*0.16)*3.0:0.0;\n" +
      " o=vec4(v_c.rgb*v_c.a*a*tube*br*(1.0+front),0.0);}",
    npV: HEAD + "layout(location=0) in vec3 a_p;layout(location=1) in vec4 a_c;layout(location=2) in vec4 a_m;layout(location=3) in float a_g;\n" +
      "uniform mat4 u_vp,u_m;uniform float u_px,u_size,u_time,u_min,u_fade,u_fd,u_fr,u_dim,u_grow,u_amp,u_reach;out vec4 v_c;out float v_k;out float v_s;\n" + SWAY +
      "void main(){float ap=u_grow>1e8?1.0:clamp((u_grow-a_g)/10.0,0.0,1.0);if(ap<=0.0){gl_Position=vec4(2.0,2.0,2.0,1.0);gl_PointSize=0.0;v_c=vec4(0.0);v_k=1.0;v_s=0.0;return;}\n" +
      " vec4 w=u_m*vec4(sway(a_p,a_g),1.0);gl_Position=u_vp*w;float pop=ap*(1.0+1.4*(1.0-ap));float px=a_c.a*u_size*pop*u_px/max(gl_Position.w,0.5);float sz=clamp(px,u_min,90.0);\n" +
      " float sp=min(sz*(1.9+a_m.z*2.4),240.0);gl_PointSize=sp;v_k=sz/sp;v_s=a_m.w;\n" +
      " float pulse=1.0+a_m.z*0.55*sin(u_time*3.0+a_m.x*20.0);float b=a_m.y>1.5?2.4:(a_m.y<0.5?u_dim:(a_m.y>1.2?1.5:1.0));\n" +
      " float fog=1.0-u_fade*smoothstep(-u_fr,u_fr,gl_Position.w-u_fd);v_c=vec4(a_c.rgb,b*pulse*fog*ap*min(1.0,px/u_min));}",
    comp: HEAD + "in vec2 v_uv;out vec4 o;uniform sampler2D u_s,u_b;uniform float u_bk,u_time;\n" +
      "vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}\n" +
      "float hsh(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}\n" +
      "void main(){vec2 q=v_uv-0.5;vec2 ab=q*0.0016*dot(q,q)*4.0;\n" +
      " vec3 c=vec3(texture(u_s,v_uv+ab).r,texture(u_s,v_uv).g,texture(u_s,v_uv-ab).b)+texture(u_b,v_uv).rgb*u_bk;\n" +
      " c=aces(c*1.12);c*=1.0-dot(q,q)*0.6;c=pow(c,vec3(1.0/2.2));\n" +
      " float g=hsh(gl_FragCoord.xy+fract(u_time*7.13)*917.0)-0.5;float l=dot(c,vec3(0.3,0.59,0.11));c+=g*0.035*(0.35+l);\n" +
      " o=vec4(c,1.0);}",
    // тело клетки: объёмная мембрана, ядро, ядрышко, вспышка от пришедших сигналов
    somaV: HEAD + "layout(location=0) in vec2 a_c;uniform mat4 u_vp;uniform vec3 u_r,u_u;uniform float u_size;out vec2 v_q;\n" +
      "void main(){vec3 w=(a_c.x*u_r+a_c.y*u_u)*u_size;v_q=a_c;gl_Position=u_vp*vec4(w,1.0);}",
    somaF: HEAD + NOISE + "in vec2 v_q;out vec4 o;uniform vec3 u_col,u_rim;uniform float u_time,u_flash,u_grow;\n" +
      "void main(){float r=length(v_q);float an=atan(v_q.y,v_q.x);float gk=clamp(u_grow/18.0,0.0,1.0);\n" +
      " float R=0.36*gk*(1.0+0.07*sin(an*3.0+1.3)+0.05*sin(an*5.0-u_time*0.3)+0.05*(n3(vec3(cos(an)*1.6,sin(an)*1.6,u_time*0.12))-0.5));\n" +
      " float ins=smoothstep(R+0.012,R-0.012,r);float x=clamp(r/max(R,1e-3),0.0,1.0);float z=sqrt(max(0.0,1.0-x*x));\n" +
      " vec3 n=vec3(v_q/max(R,1e-3),z);vec3 Ld=normalize(vec3(-0.45,0.6,0.66));float dif=max(0.0,dot(n,Ld));float fres=pow(1.0-z,2.6);\n" +
      " float tex=fbm(vec3(v_q*8.0,u_time*0.04));vec2 nc=v_q-vec2(0.045,0.035)*gk;float rn=length(nc)/max(gk,1e-3);\n" +
      " float nuc=smoothstep(0.17,0.12,rn);float nl=smoothstep(0.055,0.02,length(nc-vec2(0.025,0.02)*gk)/max(gk,1e-3));\n" +
      " vec3 body=u_col*(0.035+0.3*dif*(0.55+0.9*tex))+u_rim*(fres*0.75+pow(fres,3.0)*0.6);body=mix(body,u_col*0.015+u_rim*0.05*fres,nuc*0.85)+u_rim*nl*0.55;\n" +
      " float fl=u_flash;float halo=exp(-max(0.0,r-R)*12.0)*(1.0-ins)*0.3*gk+fl*exp(-r*5.0)*0.45;\n" +
      " vec3 c=body*ins*(1.0+fl*0.8)+u_rim*halo;o=vec4(c,ins*0.94);}",
    // фон: дымка и свет вокруг клетки
    bgF: HEAD + NOISE + "in vec2 v_uv;out vec4 o;uniform vec2 u_sp,u_asp;uniform vec3 u_glow,u_haze,u_haze2;uniform float u_time,u_sr;\n" +
      "float rid(vec3 p){return 1.0-abs(2.0*n3(p)-1.0);}\n" +
      "void main(){vec2 q=(v_uv-u_sp)*u_asp;float d=length(q);vec2 uv=v_uv*u_asp;vec3 c=vec3(0.004,0.004,0.009);\n" +
      " float tt=u_time*0.012;vec3 P=vec3(uv*1.6,tt);float w=fbm(P+vec3(0.0,0.0,0.0));float w2=fbm(P*1.9+vec3(w*1.4,3.1,tt));\n" +
      " float cloud=smoothstep(0.35,1.05,w*0.75+w2*0.5);float mixk=smoothstep(0.3,0.8,fbm(P*0.7+vec3(7.0,1.0,tt)));\n" +
      " c+=mix(u_haze,u_haze2,mixk)*cloud*0.055;\n" +
      " float v=pow(rid(vec3(uv*3.2+w*0.8,tt*2.0)),9.0)*0.6+pow(rid(vec3(uv*7.5+w2,5.0+tt)),14.0)*0.4;\n" +
      " c+=mix(u_haze2,u_haze,0.5)*v*0.045*(0.4+cloud);\n" +
      " c+=u_glow*exp(-d/u_sr)*0.05+u_glow*exp(-d*d/(u_sr*u_sr*18.0))*0.016;\n" +
      " vec2 vq=v_uv-0.5;c*=1.0-dot(vq,vq)*1.1;o=vec4(c,1.0);}",
    // частицы в толще ткани: вне фокуса расплываются в мягкие круги
    dustV: HEAD + "layout(location=0) in vec3 a_p;layout(location=1) in vec4 a_c;layout(location=2) in vec2 a_m;\n" +
      "uniform mat4 u_vp,u_m;uniform float u_px,u_time,u_fd,u_bok;out vec4 v_c;out float v_r;\n" +
      "void main(){vec3 p=a_p+vec3(sin(u_time*0.13+a_m.x*40.0),cos(u_time*0.11+a_m.x*23.0),sin(u_time*0.09+a_m.x*61.0))*(2.0+a_m.y*6.0);\n" +
      " vec4 w=u_m*vec4(p,1.0);gl_Position=u_vp*w;float px=a_c.a*u_px/max(gl_Position.w,1.0);\n" +
      " float coc=abs(gl_Position.w-u_fd)/max(u_fd,1.0)*u_bok;float sz=clamp(max(px,coc),1.0,70.0);gl_PointSize=sz;\n" +
      " float spark=a_m.y>0.86?(0.4+3.2*pow(max(0.0,sin(u_time*(0.6+a_m.x*1.7)+a_m.x*60.0)),14.0)):1.0;\n" +
      " v_c=vec4(a_c.rgb*spark,clamp((px*px)/(sz*sz),0.004,1.0)*smoothstep(2.0,0.2,coc/max(px,1.0)*0.1+0.0));v_r=sz;}",
    dustF: HEAD + "in vec4 v_c;in float v_r;out vec4 o;\n" +
      "void main(){vec2 q=gl_PointCoord*2.0-1.0;float r=length(q);if(r>1.0)discard;\n" +
      " float disc=smoothstep(1.0,0.82,r)*(0.7+0.3*smoothstep(0.55,0.95,r));float core=v_r<3.0?exp(-r*r*3.0):disc;o=vec4(v_c.rgb*v_c.a*core,0.0);}",
  };

  /* ------------------------------------------------------------------ */
  class Scene {
    constructor(host, opts) {
      this.host = host; this.opts = opts || {};
      this.doc = host.ownerDocument; this.win = this.doc.defaultView || window;
      this.s = Object.assign({}, DEFAULTS, this.opts.settings || {});
      if (LENSES.indexOf(this.s.lens) < 0) this.s.lens = "neuron";
      if (!PRESETS.some((p) => p.id === this.s.preset)) this.s.preset = DEFAULTS.preset;
      this.reduced = !!(this.win.matchMedia && this.win.matchMedia("(prefers-reduced-motion: reduce)").matches);
      this.time = 0; this.ease = 6;
      this.cam = { yaw: 0.5, pitch: 0.08, dist: 300, x: 0, y: 0, z: 0 };
      this.camTo = Object.assign({}, this.cam);
      this.m = null; this.geo = null; this.sel = -1; this.focusT = -1; this.hover = null;
      this.V = new Float32Array(16); this.Pm = new Float32Array(16); this.VP = new Float32Array(16); this.M = new Float32Array(16);
      this.M[0] = this.M[5] = this.M[10] = this.M[15] = 1;
      this.pointers = new Map(); this.labelPool = []; this.flights = [];
      this.fps = 60; this._fpsN = 0; this._fpsT = 0;
      this._build();
      try { this._initGL(); } catch (e) { console.error("Neuron:", e); this.glFailed = true; }
      this._bind();
      this.resize();
      this._tick = (now) => this._frame(now);
      this.raf = this.win.requestAnimationFrame(this._tick);
    }

    _el(tag, cls, parent, text) {
      const e = this.doc.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      if (parent) parent.appendChild(e);
      return e;
    }
    _ico(el, name) { if (el && this.opts.icon) { el.textContent = ""; this.opts.icon(el, name); } return el; }
    _btn(parent, icon, label, title, cls) {
      const b = this._el("button", "ng-ctl-btn" + (cls ? " " + cls : ""), parent);
      b.type = "button";
      b.setAttribute("aria-label", title || label);
      if (title) b.title = title;
      if (icon) this._ico(this._el("span", "ng-ctl-ico", b), icon);
      if (label) this._el("span", "ng-ctl-text", b, label); else b.classList.add("is-icon");
      return b;
    }
    _save() { if (this.opts.onSave) this.opts.onSave(Object.assign({}, this.s)); }
    preset() { return PRESETS.find((p) => p.id === this.s.preset) || PRESETS[0]; }

    _build() {
      const host = this.host;
      host.classList.add("fnr");
      host.tabIndex = 0;
      const main = (this.main = this._el("div", "fnr-main", host));
      this.c = this._el("canvas", "fnr-gl", main);
      this.c2 = this._el("canvas", "fnr-2d", main);
      this.timeEl = this._el("div", "fnr-time", main);
      this.linksEl = this._el("div", "fnr-links", main);
      this.labels = this._el("div", "fnr-labels", main);
      this.tip = this._el("div", "fnr-tip", main);
      const head = this._el("div", "fnr-head", main);
      this.title = this._el("div", "fnr-title", head);
      this.counts = this._el("div", "fnr-counts", head);
      this.guide = this._el("div", "fnr-guide ng-glass-dark", main);
      const lens = this._el("div", "ng-ctl fnr-lenses", main);
      const lg = this._el("div", "ng-ctl-group", lens);
      this.lensBtns = [["neuron", "brain-circuit", L("Нейрон", "Neuron")], ["synapse", "git-merge", L("Синапс", "Synapse")], ["time", "calendar-days", L("Время", "Time")], ["links", "circle-dot", L("Связи", "Links")]].map(([id, ic, label]) => {
        const b = this._btn(lg, ic, label, label);
        b.onclick = () => this.setLens(id);
        return [id, b];
      });
      const ctl = this._el("div", "ng-ctl fnr-ctl", main);
      const cg = this._el("div", "ng-ctl-group", ctl);
      this.bHelp = this._btn(cg, "info", "", L("Что здесь показано", "What am I looking at"));
      this.bHelp.onclick = () => { const hg = (this.s.hideGuide = Object.assign({}, this.s.hideGuide)); hg[this.s.lens] = !hg[this.s.lens]; this._save(); this._renderGuide(); };
      this.bFit = this._btn(cg, "scan", "", L("Показать всё (F)", "Fit all (F)"));
      this.bFit.onclick = () => this.fit();
      this.bPanel = this._btn(cg, "panel-right", "", L("Панель «Сегодня»", "Today panel"));
      this.bPanel.onclick = () => { this.s.panel = !this.s.panel; this._save(); this._syncPanel(); };
      this.left = this._el("div", "fnr-left ng-glass-dark", main);
      this.left.hidden = true;
      this.foot = this._el("div", "fnr-foot", main);
      this.legend = this._el("div", "fnr-legend", main);
      const quick = this._el("div", "fnr-quick", main);
      this.qIn = this._el("input", "fnr-quick-in", quick);
      this.qIn.type = "text"; this.qIn.spellcheck = true;
      this.qIn.placeholder = L("Записать мысль в журнал дня…", "Write a thought into today's journal…");
      this.qIn.setAttribute("aria-label", this.qIn.placeholder);
      this.qBtn = this._el("button", "fnr-quick-btn", quick, L("Сохранить", "Save"));
      this.qBtn.type = "button";
      this.qMsg = this._el("div", "fnr-quick-msg", quick);
      const send = async () => {
        const t = this.qIn.value.trim();
        if (!t || !this.opts.onQuick) return;
        this.qBtn.disabled = true;
        try { const where = await this.opts.onQuick(t); this.qIn.value = ""; this._flash(this.qMsg, L("сохранено", "saved") + (where ? " · " + where : "")); }
        catch (e) { console.error(e); this._flash(this.qMsg, L("не удалось сохранить", "could not save")); }
        this.qBtn.disabled = false;
      };
      this.qBtn.onclick = send;
      this.qIn.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); send(); } e.stopPropagation(); };
      this.side = this._el("div", "fnr-side", host);
      this._buildSide();
      this._syncPanel();
      this._syncLens();
    }
    _flash(el, text) { el.textContent = text; el.classList.add("is-on"); this.win.clearTimeout(el._t); el._t = this.win.setTimeout(() => el.classList.remove("is-on"), 2600); }
    _syncPanel() { this.host.classList.toggle("has-side", !!this.s.panel); this.bPanel.classList.toggle("is-on", !!this.s.panel); this.win.setTimeout(() => this.resize(), 0); }
    setLens(id) {
      if (LENSES.indexOf(id) < 0) return;
      this.s.lens = id; this._save(); this._syncLens();
    }
    _syncLens() {
      const id = this.s.lens;
      for (const [k, b] of this.lensBtns) { b.classList.toggle("is-on", k === id); b.setAttribute("aria-pressed", String(k === id)); }
      this.host.dataset.lens = id;
      this.host.classList.toggle("no-guide", !!(this.s.hideGuide || {})[id]);
      this.c.hidden = id !== "neuron"; this.c2.hidden = id !== "synapse";
      this.timeEl.hidden = id !== "time"; this.linksEl.hidden = id !== "links";
      this.bFit.hidden = id !== "neuron";
      this.labels.hidden = id !== "neuron";
      this.tip.classList.remove("is-on");
      this._renderGuide();
      if (id === "time") this._renderTime();
      if (id === "links") this._renderLinks();
      this._caption();
      this.dirty = true;
      this.resize();
    }

    /* ---------- WebGL ---------- */
    _prog(vs, fs) {
      const gl = this.gl;
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader"); return s; };
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
      const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
      return { p, u };
    }
    _initGL() {
      const gl = this.c.getContext("webgl2", { antialias: false, alpha: false, depth: false, premultipliedAlpha: false, powerPreference: "high-performance" });
      if (!gl) throw new Error("no webgl2");
      this.gl = gl;
      this.hdr = !!gl.getExtension("EXT_color_buffer_float");
      gl.getExtension("OES_texture_float_linear");
      this.P = {
        dend: this._prog(SH.dendV, SH.dendF), pt: this._prog(SH.npV, SSH.pointF), soma: this._prog(SH.somaV, SH.somaF),
        bg: this._prog(SSH.full, SH.bgF), dust: this._prog(SH.dustV, SH.dustF),
        bright: this._prog(SSH.full, SSH.bright), down: this._prog(SSH.full, SSH.down), up: this._prog(SSH.full, SSH.up), comp: this._prog(SSH.full, SH.comp),
      };
      this.vEmpty = gl.createVertexArray();
      this.vQuad = gl.createVertexArray();
      gl.bindVertexArray(this.vQuad);
      const qb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, qb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      this.B = {};
    }
    _vao(name, layout, data, inst) {
      const gl = this.gl;
      let o = this.B[name];
      if (!o) o = this.B[name] = { vao: gl.createVertexArray(), buf: gl.createBuffer(), n: 0, cap: -1 };
      gl.bindVertexArray(o.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, o.buf);
      if (o.cap === data.length) gl.bufferSubData(gl.ARRAY_BUFFER, 0, data); else { gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW); o.cap = data.length; }
      const stride = layout.reduce((a, b) => a + b, 0) * 4;
      let off = 0;
      layout.forEach((sz, i) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, sz, gl.FLOAT, false, stride, off); gl.vertexAttribDivisor(i, inst ? 1 : 0); off += sz * 4; });
      gl.bindVertexArray(null);
      o.n = data.length / (stride / 4);
      return o;
    }
    _target(w, h) {
      const gl = this.gl, tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (this.hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fb, w, h };
    }
    _freeTargets() { const gl = this.gl; for (const t of this.T || []) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } this.T = null; }
    resize() {
      const r = this.main.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      const dpr = Math.min(this.win.devicePixelRatio || 1, 2);
      this.w = w; this.h = h; this.dpr = dpr;
      if (this.c2.width !== Math.round(w * dpr) || this.c2.height !== Math.round(h * dpr)) { this.c2.width = Math.round(w * dpr); this.c2.height = Math.round(h * dpr); }
      this.dirty = true;
      if (!this.gl) return;
      const k = Math.min(dpr, 1.5) * (this.slow ? 0.7 : 1);
      const W = Math.max(1, Math.round(w * k)), H = Math.max(1, Math.round(h * k));
      if (this.T && this.T[0].w === W && this.T[0].h === H) return;
      this.c.width = Math.round(w * Math.min(dpr, 1.5)); this.c.height = Math.round(h * Math.min(dpr, 1.5));
      this._freeTargets();
      const T = [this._target(W, H)];
      let bw = W >> 1, bh = H >> 1;
      for (let i = 0; i < 5 && bw > 2 && bh > 2; i++) { T.push(this._target(bw, bh)); bw >>= 1; bh >>= 1; }
      this.T = T;
    }

    /* ---------- данные ---------- */
    setData(g) {
      const oldSel = this.m && this.sel >= 0 ? this.m.notes[this.sel].id : null;
      const oldTopic = this.m && this.focusT >= 0 ? this.m.topics[this.focusT].key : null;
      this.g = g;
      this.m = buildModel(g, this.s);
      this.geo = grow(this.m, this.opts.vaultName || "");
      this.sel = oldSel != null && this.m.index.has(oldSel) ? this.m.index.get(oldSel) : -1;
      this.focusT = oldTopic != null ? this.m.topics.findIndex((t) => t.key === oldTopic) : -1;
      this._upload();
      const first = !this._ready;
      if (first) {
        this.fit(true);
        if (!this.reduced) { this.cam.dist *= 1.7; this.cam.yaw -= 0.8; this.cam.pitch = 0.4; this.ease = 0.6; }
        this.growT = this.reduced || !this.s.anim ? null : -1.0;   // ждём, пока уйдёт заставка
      }
      this._counts();
      this._renderGuide();
      this._caption();
      this._renderSide();
      if (this.s.lens === "time") this._renderTime();
      if (this.s.lens === "links") this._renderLinks();
      if (this.leftKind === "topic" && this.focusT >= 0) this.showTopic(this.focusT, false); else if (this.sel >= 0) this._noteCard(this.sel);
      if (first) { this._ready = true; if (this.opts.onReady) this.win.setTimeout(() => this.opts.onReady(), 60); }
      this.dirty = true;
    }
    fresh(n) { const lim = Date.now() - this.s.fresh * 3600e3; return Math.max(n.ctime || 0, n.mtime || 0) > lim; }
    _counts() {
      const m = this.m;
      if (!m) return;
      this.title.textContent = "";
      this.counts.textContent = notesN(m.notes.length) + " · " + floraNum(m.topics.length) + " " + plural(m.topics.length, ["ветка", "ветки", "веток"], ["branch", "branches"]) + " · " + tasksN(m.open.length) + " " + L("открыто", "open");
    }
    // короткая подсказка: что показано в этой линзе и как читать
    _renderGuide() {
      const g = this.guide, lens = this.s.lens, hide = (this.s.hideGuide || {})[lens];
      if (this.bHelp) this.bHelp.classList.toggle("is-on", !hide);
      g.hidden = !!hide;
      this.host.classList.toggle("no-guide", !!hide);
      g.classList.toggle("is-inline", lens === "time" || lens === "links");
      this.syn = null;
      if (hide) { this.main.style.setProperty("--guide-h", "0px"); return; }
      g.textContent = "";
      const p = this.preset(), dc = p.dend || "#7ab8ff";
      const sw = (cls, style) => { const e = this._el("span", "fnr-sw " + cls); if (style) e.setAttribute("style", style); return e; };
      const G = {
        neuron: [L("Ваше хранилище — одна живая клетка", "Your vault as one living cell"), [
          [sw("is-line", "--a:#7ab8ff;--b:#ff7ab8"), L("Ветки — ваши папки. Чем больше в папке заметок, тем длиннее ветка.", "Branches are your folders. The more notes, the longer the branch.")],
          [sw("is-dot", "--c:#ffffff"), L("Точки на ветках — заметки. Старые ближе к центру, новые на концах.", "Dots on the branches are notes: older ones near the centre, new ones at the tips.")],
          [sw("is-dot is-glow", "--c:#ffffff"), L("Яркие точки — заметки за последние сутки.", "Bright dots are notes from the last day.")],
          [sw("is-dot is-glow", "--c:" + p.axon), L("Огоньки внизу, на корнях, — ваши открытые дела.", "The lights on the roots below are your open tasks.")],
        ], L("Нажмите на название ветки, чтобы увидеть её заметки. Двойной клик по точке открывает заметку.", "Click a branch name to see its notes. Double-click a dot to open the note.")],
        synapse: [L("Дела: осталось и сделано", "Tasks: to do and done"), [
          [sw("is-dot", "--c:#ff6b6b"), L("просрочено", "overdue")],
          [sw("is-dot", "--c:#ffc34d"), L("срок сегодня или завтра", "due today or tomorrow")],
          [sw("is-dot", "--c:" + p.axon), L("открыто, без срочности", "open, not urgent")],
          [sw("is-dot", "--c:#e8ecf4"), L("сделано за последние 45 дней", "done in the last 45 days")],
        ], L("Слева — дела из ваших заметок (строки «- [ ]»), справа — сделанные. Нажмите «Готово» в списке справа: дело перелетит направо, а в заметке появится галочка.", "Left: tasks from your notes (lines like “- [ ]”); right: done. Press Done in the list on the right and the task crosses over, and the note gets its tick.")],
        time: [L("Когда вы пишете", "When you write"), [
          [sw("is-cell", "--c:" + dc), L("Чем ярче клетка календаря, тем больше заметок в тот день.", "The brighter a calendar cell, the more notes that day.")],
        ], L("Ниже — в какое время суток вы пишете чаще и какие папки давно не пополнялись. Клик по дню показывает его заметки.", "Below: what time of day you write most and which folders have gone quiet. Click a day to see its notes.")],
        links: [L("Как связаны папки", "How your folders connect"), [
          [sw("is-arc", "--c:" + "#7ab8ff"), L("Дуга по кругу — папка.", "Each arc around the circle is a folder.")],
          [sw("is-band", "--c:" + "#ff7ab8"), L("Лента между дугами — ссылки между заметками этих папок. Чем шире, тем больше ссылок.", "A band between arcs is links between their notes: the wider, the more links.")],
        ], L("Наведите на папку, чтобы оставить только её связи. Клик переносит к ней в нейроне.", "Hover a folder to see only its links; click to jump to it in the neuron.")],
      }[lens];
      if (!G) { g.hidden = true; return; }
      const x = this._el("button", "fnr-guide-x", g); x.type = "button"; x.setAttribute("aria-label", L("Скрыть", "Hide")); this._ico(x, "x");
      x.onclick = () => { this.s.hideGuide = Object.assign({}, this.s.hideGuide, { [lens]: true }); this._save(); this._renderGuide(); };
      this._el("div", "fnr-guide-t", g, G[0]);
      for (const [s0, text] of G[1]) { const r = this._el("div", "fnr-guide-row", g); r.appendChild(s0); this._el("span", "", r, text); }
      this._el("div", "fnr-guide-hint", g, G[2]);
      this.win.requestAnimationFrame(() => { this.main.style.setProperty("--guide-h", (g.classList.contains("is-inline") ? g.offsetHeight + 12 : 0) + "px"); if (this.s.lens === "links") this._drawChord(); });
    }
    _caption() {
      const m = this.m;
      this.foot.textContent = "";
      this.legend.textContent = "";
      if (!m) return;
      const lens = this.s.lens;
      if (lens === "neuron") {
        let best = -1;
        for (let i = 0; i < m.notes.length; i++) if (best < 0 || (m.notes[i].ctime || 0) > (m.notes[best].ctime || 0)) best = i;
        if (best >= 0) {
          const n = m.notes[best];
          this._el("div", "fnr-foot-k", this.foot, L("последняя заметка · ", "latest note · ") + fmtDay(n.ctime || n.mtime) + ", " + fmtTime(n.ctime || n.mtime));
          this._el("div", "fnr-foot-t", this.foot, n.title);
        }
        this.legend.textContent = L("Тяните мышью — повернуть · колесо — приблизить · F — показать всё", "Drag to turn · scroll to zoom · F to fit");
      } else if (lens === "synapse") this.legend.textContent = L("Наведите на точку — увидите дело · клик — открыть карточку", "Hover a dot to see the task · click for its card");
    }

    /* ---------- буферы клетки ---------- */
    _upload() {
      if (!this.gl || !this.m) return;
      const m = this.m, o = this.geo, p = this.preset(), s = this.s;
      const tc = m.topics.map((t) => lin(p.dend || t.color)), ax = lin(p.axon), sp = lin(p.spine), so = lin(p.soma);
      const ft = this.focusT, selT = this.sel >= 0 ? m.notes[this.sel].topic : -1;
      const segA = (topic) => (ft >= 0 ? (topic === ft ? 1 : 0.14) : selT >= 0 ? (topic === selT ? 1 : 0.3) : 1);
      const ghostC = lin(p.dend || "#8fa8d8");
      let gn = 0;
      for (const g of o.ghosts) gn += g.segs.length;
      const segs = o.segs, ns = segs.length + m.notes.length + gn;
      const D = new Float32Array(Math.max(1, ns) * 18);
      let q = 0;
      const put = (a, b, c, al, wa, wb, d0, d1, kind, my, cs, ce) => { D.set([a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], al, wa, wb, cs || 0, ce || 0, d0, d1, kind, my], q); q += 18; };
      // у каких отрезков есть продолжение: там стык, на свободных концах — скругление
      const ends = (list) => {
        const starts = new Set(), finishes = new Set();
        for (const sg of list) { starts.add(sg.a); finishes.add(sg.b); }
        return list.map((sg) => [finishes.has(sg.a) ? 0 : 1, starts.has(sg.b) ? 0 : 1]);
      };
      if (!o._ends) o._ends = ends(segs);
      const nearSoma = (p) => Math.hypot(p[0], p[1], p[2]) < o.rs * 1.2;
      for (let si = 0; si < segs.length; si++) {
        const sg = segs[si];
        let c, al;
        if (sg.kind === 1) { c = ax; al = s.axon * 0.55 * (ft >= 0 || selT >= 0 ? 0.4 : 1); }
        else {
          // у тела клетки ветки светлее и переходят в цвет темы
          const base = tc[sg.topic] || sp, k = Math.min(1, sg.d0 / 45), w = 0.35 * (1 - k);
          c = [base[0] * (1 - w) + so[0] * w, base[1] * (1 - w) + so[1] * w, base[2] * (1 - w) + so[2] * w];
          al = (sg.kind === 2 ? 0.28 : 0.52 - sg.depth * 0.07) * segA(sg.topic);
        }
        const [cs, ce] = o._ends[si];
        put(sg.a, sg.b, c, al, sg.wa, sg.wb, sg.d0, sg.d1, sg.kind, sg.my || 0, cs && nearSoma(sg.a) ? 2 : cs, ce);
      }
      for (let i = 0; i < m.notes.length; i++) {
        const spn = o.spines[i];
        if (!spn) continue;
        put(spn.base, spn.head, tc[spn.topic] || sp, 0.34 * segA(spn.topic), 0.32, 0.2, spn.dist, spn.dist + 4, 4, 0, 1, 1);
      }
      const pal = p.dend ? [lin(p.dend), lin(p.soma)] : ["#8fa8ff", "#c49bff", "#ff8fc8", "#6fd6e0", "#ffb47a"].map(lin);
      for (const g of o.ghosts) {
        if (!g._ends) g._ends = ends(g.segs);
        const gc = pal[Math.floor(g.hue * pal.length) % pal.length], mixc = [gc[0] * 0.7 + ghostC[0] * 0.3, gc[1] * 0.7 + ghostC[1] * 0.3, gc[2] * 0.7 + ghostC[2] * 0.3];
        g.col = gc;
        const ga = (g.type === 3 ? 0.06 : g.type === 2 ? 0.1 : 0.13) / (1 + g.blur * 1.4);
        g.segs.forEach((sg, gi) => { const [cs, ce] = g._ends[gi]; put(sg.a, sg.b, mixc, ga * (1 - Math.min(0.5, sg.depth * 0.12)), sg.wa, sg.wb, sg.d0, sg.d1, 3, g.blur, cs ? 2 : 0, ce); });
      }
      this._vao("dend", [3, 3, 4, 4, 4], D.subarray(0, q), true);
      // точки: головки шипиков, окончания аксона с делами, тела дальних клеток
      const P = [];
      const hl = this.sel >= 0 ? new Set([this.sel].concat(m.edges.filter((e) => e[0] === this.sel || e[1] === this.sel).map((e) => (e[0] === this.sel ? e[1] : e[0])))) : null;
      const now = Date.now();
      for (let i = 0; i < m.notes.length; i++) {
        const spn = o.spines[i];
        if (!spn) continue;
        const n = m.notes[i], c = tc[spn.topic] || sp, mix = p.dend ? 0.3 : 0.45;
        const col = [sp[0] * (1 - mix) + c[0] * mix, sp[1] * (1 - mix) + c[1] * mix, sp[2] * (1 - mix) + c[2] * mix];
        const fr = this.fresh(n) ? 1 : 0;
        const h = hl ? (i === this.sel ? 2 : hl.has(i) ? 1.3 : 0) : ft >= 0 ? (spn.topic === ft ? 1 : 0) : 1;
        const r = NG.rand(n.id + "#c")();
        P.push(spn.head[0], spn.head[1], spn.head[2], col[0], col[1], col[2], (1.0 + 0.32 * Math.log2(1 + m.deg[i])) * (0.75 + 0.5 * r) * s.spine, r, h, fr, 0, spn.dist + 3);
      }
      for (const b of o.bouts) {
        const t = b.task, open = t && !t.done, soon = open && t.due && t.due - now < 2 * DAY;
        const col = open ? ax : t ? [0.75, 0.78, 0.85] : [0.4, 0.42, 0.5];
        const k = open ? 1 : t ? 0.4 : 0.16;
        const h = ft >= 0 && t ? (t.topic === ft ? 1.3 : 0) : 1;
        P.push(b.p[0], b.p[1], b.p[2], col[0] * k, col[1] * k, col[2] * k, open ? 1.7 : t ? 1.05 : 0.7, NG.rand((t && t.id) || String(b.p[0]))(), h, soon ? 1 : 0, 0, b.dist || 0);
      }
      for (const g of o.ghosts) if (g.soma) { const gc = pal[Math.floor(g.hue * pal.length) % pal.length], k = 0.32 / (1 + g.blur); P.push(g.soma[0], g.soma[1], g.soma[2], gc[0] * k + so[0] * 0.05, gc[1] * k + so[1] * 0.05, gc[2] * k + so[2] * 0.05, g.r * (1.4 + g.blur * 0.8), g.hue, 1, 0.7, 0, 0); }
      this._vao("pts", [3, 4, 4, 1], new Float32Array(P));
      // частицы в толще ткани
      const dc = lin(p.dend || "#9fb8ff"), DD = new Float32Array(o.dust.length * 9);
      o.dust.forEach((d, i) => { const k = 0.05 + d[3] * 0.12, w = d[4]; DD.set([d[0], d[1], d[2], (dc[0] * 0.6 + 0.4) * k, (dc[1] * 0.6 + 0.4) * k, (dc[2] * 0.6 + 0.4) * k, 0.6 + w * 1.8, d[3], w], i * 9); });
      this._vao("dust", [3, 4, 2], DD);
      this.dirty = true;
    }

    // сигнал: от шипика по ветке к телу и дальше по аксону к окончанию
    _spawnSignal() {
      const m = this.m, o = this.geo;
      if (!m || !o || !m.notes.length) return;
      const rnd = Math.random;
      let ni = -1;
      const fresh = [];
      for (let i = 0; i < m.notes.length && fresh.length < 40; i++) if (this.fresh(m.notes[i])) fresh.push(i);
      if (fresh.length && rnd() < 0.35) ni = fresh[(rnd() * fresh.length) | 0];
      else ni = (rnd() * m.notes.length) | 0;
      if (this.focusT >= 0 && rnd() < 0.8) { const tn = m.topics[this.focusT].notes; ni = tn[(rnd() * tn.length) | 0]; }
      const spn = o.spines[ni];
      if (!spn) return;
      const pts = [spn.head, spn.base], dd = [spn.dist + 3, spn.dist];
      let sgi = spn.seg;
      while (sgi >= 0) { pts.push(o.segs[sgi].a); dd.push(o.segs[sgi].d0); sgi = o.parent[sgi]; }
      const somaIdx = pts.length;
      pts.push([0, 0, 0]); dd.push(0);
      if (o.termSeg.length) {
        const ti = (rnd() * o.termSeg.length) | 0, chain = [];
        let a = o.termSeg[ti];
        while (a >= 0) { chain.push(o.segs[a]); a = o.parent[a]; }
        chain.reverse();
        for (const sg of chain) { pts.push(sg.b); dd.push(sg.d1); }
      }
      const L = [0];
      for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + v3.len(v3.add(pts[i], v3.sc(pts[i - 1], -1))));
      const tcol = lin(this.preset().dend || (this.m.topics[spn.topic] || {}).color || "#ffffff");
      this.flights.push({ pts, dd, L, x: 0, v: 70 + rnd() * 40, topic: spn.topic, somaL: L[somaIdx], hitSoma: false, col: tcol });
    }
    // сигнал в соседней клетке: от кончика ветки к её телу
    _spawnGhostSignal() {
      const o = this.geo;
      if (!o || !o.ghosts) return;
      const cells = o.ghosts.filter((g) => g.soma && g.leaves && g.leaves.length);
      if (!cells.length) return;
      const g = cells[(Math.random() * cells.length) | 0];
      let si = g.leaves[(Math.random() * g.leaves.length) | 0];
      const pts = [g.segs[si].b], dd = [g.segs[si].d1];
      while (si >= 0) { pts.push(g.segs[si].a); dd.push(g.segs[si].d0); si = g.parent[si]; }
      pts.push(g.soma); dd.push(0);
      const L = [0];
      for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + v3.len(v3.add(pts[i], v3.sc(pts[i - 1], -1))));
      if (L[L.length - 1] < 5) return;
      this.flights.push({ pts, dd, L, x: 0, v: 45 + Math.random() * 35, ghost: true, k: 0.55 / (1 + (g.blur || 0)), somaL: 1e9, hitSoma: true, col: g.col || [0.7, 0.75, 1] });
    }
    _sigPoints(dt) {
      const out = [], p = this.preset(), ax = lin(p.axon);
      for (const f of this.flights) {
        f.x += f.v * dt;
        if (!f.hitSoma && f.x >= f.somaL) { f.hitSoma = true; this.somaGlow = Math.min(2.5, (this.somaGlow || 0) + 0.5); }
        const N = f.ghost ? 10 : 16;
        for (let k = 0; k < N; k++) {
          const x = f.x - k * 1.15;
          if (x < 0 || x > f.L[f.L.length - 1]) continue;
          let i = 1;
          while (i < f.L.length - 1 && f.L[i] < x) i++;
          const a = f.pts[i - 1], b = f.pts[i], seg = f.L[i] - f.L[i - 1] || 1, t = (x - f.L[i - 1]) / seg, d = f.dd[i - 1] + (f.dd[i] - f.dd[i - 1]) * t;
          const tail = x > f.somaL ? ax : f.col, h = k / N, al = (k ? Math.pow(1 - h, 1.6) * 0.75 : 1.6) * (f.ghost ? f.k : 1);
          const c = [1 - (1 - tail[0]) * Math.min(1, h * 3), 1 - (1 - tail[1]) * Math.min(1, h * 3), 1 - (1 - tail[2]) * Math.min(1, h * 3)];
          out.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, c[0] * al, c[1] * al, c[2] * al, (k ? 0.6 * (1 - h * 0.5) : 1.15) * (f.ghost ? 0.8 : 1), 0, 1, 0, 0, d);
        }
      }
      this.flights = this.flights.filter((f) => f.x - 20 < f.L[f.L.length - 1]);
      return out;
    }
    // время от времени — вспышка активности: много сигналов сразу
    _burst() {
      for (let i = 0; i < 9; i++) this._spawnSignal();
      for (let i = 0; i < 6; i++) this._spawnGhostSignal();
      this.somaGlow = Math.min(2.5, (this.somaGlow || 0) + 0.8);
    }

    /* ---------- камера ---------- */
    fov() { return ((24 + 36 * this.s.persp) * Math.PI) / 180; }
    fit(instant) {
      const o = this.geo;
      if (!o) return;
      const fv = this.fov(), asp = this.w / this.h;
      const need = Math.max(o.height * 0.55, (o.size * 0.5) / Math.max(0.6, Math.min(asp, 1.6)));
      const dist = clamp((need / Math.tan(fv / 2)) * 1.18, 40, 5000);
      // центр чуть ниже середины: сверху линзы, снизу строка для мыслей
      Object.assign(this.camTo, { x: o.center[0] * 0.3, y: o.center[1] - dist * Math.tan(fv / 2) * 0.05, z: o.center[2] * 0.3, dist, pitch: 0.08 });
      if (instant) Object.assign(this.cam, this.camTo);
      this.ease = 6;
      if (this.focusT >= 0 || this.sel >= 0) { this.focusT = -1; this.sel = -1; this.left.hidden = true; this.leftKind = null; this._upload(); }
    }
    _rot(p) { const a = this.spinA || 0, c = Math.cos(a), s = Math.sin(a); return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]]; }
    _proj(w) {
      const M = this.VP, x = w[0], y = w[1], z = w[2];
      const cw = M[3] * x + M[7] * y + M[11] * z + M[15];
      if (cw <= 0.5) return null;
      return [((M[0] * x + M[4] * y + M[8] * z + M[12]) / cw * 0.5 + 0.5) * this.w, (0.5 - ((M[1] * x + M[5] * y + M[9] * z + M[13]) / cw) * 0.5) * this.h, cw];
    }
    // полёт к точке; если слева открыта карточка, точка встаёт правее середины
    flyTo(w, dist, keep) {
      const d = keep ? dist : Math.min(this.camTo.dist, dist), B = this.basis;
      const sh = B && this.w > 760 ? d * Math.tan(this.fov() / 2) * (this.w / this.h) * 0.22 : 0;
      Object.assign(this.camTo, { x: w[0] - (B ? B.r[0] : 0) * sh, y: w[1] - (B ? B.r[1] : 0) * sh, z: w[2] - (B ? B.r[2] : 0) * sh, dist: d });
      this.ease = 4;
    }
    _topicFrame(ti) {
      const o = this.geo, pts = [];
      for (const sg of o.segs) if (sg.topic === ti && sg.kind === 0) pts.push(sg.b);
      if (!pts.length) return null;
      const c = [0, 0, 0];
      for (const p of pts) { c[0] += p[0] / pts.length; c[1] += p[1] / pts.length; c[2] += p[2] / pts.length; }
      let r = 10;
      for (const p of pts) r = Math.max(r, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]));
      return { c, r };
    }

    /* ---------- выбор ---------- */
    _pick(e) {
      const m = this.m, o = this.geo;
      if (!m || !o || !this.basis) return null;
      const r = this.c.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      let best = null, bd = 1e9;
      const test = (w, size, hit) => {
        const p = this._proj(this._rot(w));
        if (!p) return;
        const px = size * this.pxCss / p[2], lim = Math.max(7, px), d = Math.hypot(p[0] - mx, p[1] - my);
        if (d < lim) { const sc = d / lim + p[2] * 1e-5; if (sc < bd) { bd = sc; best = hit; } }
      };
      for (let i = 0; i < m.notes.length; i++) if (o.spines[i] && (this.focusT < 0 || o.spines[i].topic === this.focusT)) test(o.spines[i].head, 1.2 * this.s.spine, { kind: "note", i });
      for (const b of o.bouts) if (b.task) test(b.p, 1.6, { kind: "task", t: b.task });
      return best;
    }
    selectNote(i, fly) {
      const m = this.m;
      this.sel = i;
      if (i >= 0) { this.focusT = -1; this._noteCard(i); if (fly && this.geo.spines[i]) this.flyTo(this._rot(this.geo.spines[i].head), 150); }
      else if (this.leftKind === "note") { this.left.hidden = true; this.leftKind = null; }
      this._upload();
      void m;
    }
    showTopic(ti, fly) {
      const m = this.m, t = m.topics[ti];
      if (!t) return;
      this.focusT = ti; this.sel = -1;
      const fr = this._topicFrame(ti);
      if (fly !== false && fr) this.flyTo(this._rot(fr.c), (fr.r / Math.tan(this.fov() / 2)) * 1.05, true);
      const c = this._leftOpen("topic");
      this._el("div", "fnr-card-kicker", c, L("ветка", "branch") + " · " + notesN(t.notes.length) + (t.tasks.length ? " · " + tasksN(t.tasks.filter((x) => !x.done).length) + " " + L("открыто", "open") : ""));
      this._el("div", "fnr-card-title", c, t.name);
      const list = this._el("div", "fnr-list", c);
      t.notes.slice().reverse().slice(0, 80).forEach((ni) => {
        const n = m.notes[ni];
        const b = this._el("button", "fnr-row", list);
        b.type = "button";
        this._el("span", "fnr-row-d", b, fmtDay(n.ctime || n.mtime));
        this._el("span", "fnr-row-t", b, n.title);
        b.onclick = () => this.selectNote(ni, true);
        b.ondblclick = (ev) => this.opts.onOpen && this.opts.onOpen(n, ev);
      });
      if (t.notes.length > 80) this._el("div", "fnr-more", c, L("и ещё ", "and ") + floraNum(t.notes.length - 80));
      this._upload();
    }
    _leftOpen(kind) {
      const c = this.left;
      c.textContent = ""; c.hidden = false; this.leftKind = kind;
      const x = this._el("button", "fnr-x", c);
      x.type = "button"; x.setAttribute("aria-label", L("Закрыть", "Close"));
      this._ico(x, "x");
      x.onclick = () => { c.hidden = true; this.leftKind = null; if (this.focusT >= 0 || this.sel >= 0) { this.focusT = -1; this.sel = -1; this._upload(); } };
      return c;
    }
    _noteCard(i) {
      const m = this.m, n = m.notes[i], c = this._leftOpen("note");
      const t = m.topics[n.topic];
      this._el("div", "fnr-card-kicker", c, (t ? t.name : "") + (this.fresh(n) ? " · " + L("новый шипик", "new spine") : ""));
      this._el("div", "fnr-card-title", c, n.title);
      if (n.folder) this._el("div", "fnr-card-path", c, n.folder);
      this._el("div", "fnr-card-meta", c, L("создана ", "created ") + fmtDay(n.ctime || n.mtime) + " · " + floraNum(m.deg[i]) + " " + plural(m.deg[i], ["связь", "связи", "связей"], ["link", "links"]));
      const own = m.tasks.filter((x) => x.note === i && !x.done);
      if (own.length) {
        this._el("div", "fnr-card-h", c, L("дела в заметке", "tasks in this note"));
        for (const tk of own.slice(0, 6)) this._taskRow(c, tk, true);
      }
      const nb = m.edges.filter((e) => e[0] === i || e[1] === i).map((e) => (e[0] === i ? e[1] : e[0])).slice(0, 8);
      if (nb.length) {
        this._el("div", "fnr-card-h", c, L("связана с", "linked to"));
        const list = this._el("div", "fnr-list", c);
        for (const j of nb) { const b = this._el("button", "fnr-row", list); b.type = "button"; this._el("span", "fnr-row-t", b, m.notes[j].title); b.onclick = () => this.selectNote(j, true); }
      }
      const act = this._el("div", "fnr-actions", c);
      const open = this._el("button", "fnr-btn is-main", act, L("Открыть заметку", "Open note"));
      open.type = "button";
      open.onclick = (ev) => this.opts.onOpen && this.opts.onOpen(n, ev);
    }

    /* ---------- ввод ---------- */
    _bind() {
      const off = (this._off = []);
      const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); off.push(() => el.removeEventListener(ev, fn, o)); };
      const c = this.c;
      on(c, "contextmenu", (e) => e.preventDefault());
      on(c, "pointerdown", (e) => {
        try { c.setPointerCapture(e.pointerId); } catch (err) { /* ничего */ }
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey });
        this._moved = 0; this.ease = 6; this._touch = performance.now();
        this.host.focus({ preventScroll: true });
      });
      on(c, "pointermove", (e) => {
        const p = this.pointers.get(e.pointerId);
        if (!p) { this._hoverAt(e); return; }
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        this._moved += Math.abs(dx) + Math.abs(dy);
        const T = this.camTo;
        if (this.pointers.size >= 2) {
          const pts = [...this.pointers.values()], d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          if (this._pinch) T.dist = clamp(T.dist * (this._pinch / Math.max(1, d)), 20, 5000);
          this._pinch = d; return;
        }
        if (p.b === 2 || p.b === 1 || p.shift) {
          const k = T.dist * 0.0016, B = this.basis;
          if (B) { T.x += (-dx * B.r[0] + dy * B.u[0]) * k; T.y += (-dx * B.r[1] + dy * B.u[1]) * k; T.z += (-dx * B.r[2] + dy * B.u[2]) * k; }
        } else { T.yaw -= dx * 0.006; T.pitch = clamp(T.pitch + dy * 0.005, -1.45, 1.45); }
        this._touch = performance.now(); this.dirty = true;
      });
      const up = (e) => {
        const p = this.pointers.get(e.pointerId);
        this.pointers.delete(e.pointerId);
        if (this.pointers.size < 2) this._pinch = 0;
        if (!p || this._moved >= 5 || p.b !== 0 || e.type === "pointercancel") return;
        const hit = this._pick(e), now = performance.now(), lc = this._lastClick;
        const same = lc && now - lc.t < 380 && ((!hit && !lc.hit) || (hit && lc.hit && hit.kind === lc.hit.kind && (hit.i === lc.hit.i && hit.t === lc.hit.t)));
        if (same) {
          this._lastClick = null;
          if (hit && hit.kind === "note") this.opts.onOpen && this.opts.onOpen(this.m.notes[hit.i], e);
          else if (hit && hit.kind === "task") this.opts.onOpenTask && this.opts.onOpenTask(hit.t);
          else if (!hit) this.fit();
          return;
        }
        this._lastClick = { hit, t: now };
        if (!hit) { if (this.sel >= 0) this.selectNote(-1); return; }
        if (hit.kind === "note") this.selectNote(hit.i);
        else this._taskCard(hit.t);
      };
      on(c, "pointerup", up); on(c, "pointercancel", up);
      on(c, "pointerleave", () => { this.tip.classList.remove("is-on"); });
      on(c, "wheel", (e) => { e.preventDefault(); this.ease = 6; this.camTo.dist = clamp(this.camTo.dist * Math.exp(clamp(e.deltaY, -120, 120) * 0.0022), 20, 5000); this._touch = performance.now(); }, { passive: false });
      on(this.host, "keydown", (e) => {
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if ((e.key === "f" || e.key === "F" || e.key === "а" || e.key === "А") && this.s.lens === "neuron") this.fit();
        else if (e.key === "Escape") { if (!this.left.hidden) { this.left.hidden = true; this.leftKind = null; this.focusT = -1; this.sel = -1; this._upload(); } }
        else if (e.key === "1" || e.key === "2" || e.key === "3" || e.key === "4") this.setLens(LENSES[+e.key - 1]);
      });
      this._bind2d(on);
      if (typeof ResizeObserver !== "undefined") { this._ro = new ResizeObserver(() => { this.resize(); if (this.s.lens === "time" || this.s.lens === "links") { this.win.clearTimeout(this._rt); this._rt = this.win.setTimeout(() => this.s.lens === "time" ? this._renderTime() : this._renderLinks(), 120); } }); this._ro.observe(this.main); }
    }
    _hoverAt(e) {
      this._hoverE = e;
      if (this._hoverT) return;
      this._hoverT = this.win.requestAnimationFrame(() => {
        this._hoverT = 0;
        const ev = this._hoverE, hit = this._pick(ev), t = this.tip;
        this.c.classList.toggle("is-hot", !!hit);
        if (!hit) { t.classList.remove("is-on"); return; }
        t.textContent = "";
        if (hit.kind === "note") {
          const n = this.m.notes[hit.i], tp = this.m.topics[n.topic];
          this._el("div", "fnr-tip-t", t, n.title);
          this._el("div", "fnr-tip-m", t, (tp ? tp.name : "") + " · " + fmtDay(n.ctime || n.mtime));
        } else {
          this._el("div", "fnr-tip-t", t, hit.t.text);
          this._el("div", "fnr-tip-m", t, (hit.t.done ? L("сделано", "done") : L("открыто", "open")) + (hit.t.due ? " · " + fmtDay(hit.t.due) : ""));
        }
        this._tipAt(ev);
      });
    }
    _tipAt(ev) {
      const r = this.main.getBoundingClientRect(), t = this.tip;
      t.style.setProperty("--x", Math.min(ev.clientX - r.left + 14, this.w - 260) + "px");
      t.style.setProperty("--y", ev.clientY - r.top + 14 + "px");
      t.classList.add("is-on");
    }

    _labels() {
      const m = this.m, o = this.geo, pool = this.labelPool;
      let used = 0;
      const put = (x, y, cls, text, sub, fn, color) => {
        let l = pool[used];
        if (!l) { l = pool[used] = this._el("button", "fnr-label", this.labels); l.type = "button"; l._t = this._el("span", "fnr-label-t", l); l._s = this._el("span", "fnr-label-s", l); l.onclick = () => l._fn && l._fn(); }
        used++;
        const k = "fnr-label " + cls;
        if (l.className !== k) l.className = k;
        if (l._t.textContent !== text) l._t.textContent = text;
        if (l._s.textContent !== (sub || "")) l._s.textContent = sub || "";
        l._fn = fn;
        l.style.setProperty("--x", x.toFixed(1) + "px"); l.style.setProperty("--y", y.toFixed(1) + "px");
        if (color) l.style.setProperty("--c", color);
        l.hidden = false;
      };
      if (m && o && this.growT == null) {
        const now = Date.now(), p = this.preset();
        // крупные ветки первыми; подпись, которая налезает на уже поставленную, пропускаем
        const boxes = [], fs = this.s.labelSize;
        m.topics.map((t, i) => i).sort((a, b) => m.topics[b].notes.length - m.topics[a].notes.length).forEach((i) => {
          const t = m.topics[i];
          if (this.focusT >= 0 && this.focusT !== i) return;
          if (this.sel >= 0) return;
          const a = o.anchors[i];
          if (!a) return;
          const q = this._proj(this._rot(a));
          if (!q || q[0] < 40 || q[0] > this.w - 40 || q[1] < 70 || q[1] > this.h - 110) return;
          const w = (t.name.length + String(t.notes.length).length) * fs * 0.6 + 44, h = fs + 16;
          const bx = [q[0] - w / 2, q[1] - h / 2, q[0] + w / 2, q[1] + h / 2];
          if (boxes.some((b) => bx[0] < b[2] + 6 && bx[2] > b[0] - 6 && bx[1] < b[3] + 4 && bx[3] > b[1] - 4)) return;
          boxes.push(bx);
          put(q[0], q[1], "is-topic", t.name, floraNum(t.notes.length), () => this.showTopic(i), p.dend || t.color);
        });
        void now;
        if (this.sel >= 0 && o.spines[this.sel]) {
          const q = this._proj(this._rot(o.spines[this.sel].head));
          if (q) put(q[0], q[1] - 20, "is-sel", m.notes[this.sel].title, "", () => this.selectNote(this.sel, true));
        }
      }
      for (let i = used; i < pool.length; i++) if (!pool[i].hidden) pool[i].hidden = true;
      this.labels.style.setProperty("--fs", this.s.labelSize + "px");
      this.guide.classList.toggle("is-under", !this.left.hidden);
    }

    /* ---------- кадр ---------- */
    _frame(now) {
      if (this.destroyed) return;
      this.raf = this.win.requestAnimationFrame(this._tick);
      const bg = this.doc.hidden || (this.doc.hasFocus && !this.doc.hasFocus());
      if (bg && this._last && now - this._last < 95) return;
      const dt = this._last ? Math.min(0.1, (now - this._last) / 1000) : 0.016;
      this._last = now;
      if (!this.m) return;
      const live = !this.reduced && this.s.anim;
      if (live) this.time += dt;
      this._fpsN++;
      if (now - this._fpsT > 1000) { this.fps = Math.round((this._fpsN * 1000) / (now - this._fpsT)); this._fpsN = 0; this._fpsT = now; }
      if (this.s.lens === "neuron" && this.gl && this.T) {
        const C = this.cam, T = this.camTo, k = 1 - Math.exp(-dt * this.ease);
        this.ease = Math.min(6, this.ease + dt * (this.ease < 6 ? 0.5 : 0));
        for (const key of ["yaw", "pitch", "dist", "x", "y", "z"]) { const d = T[key] - C[key]; if (Math.abs(d) > (key === "dist" ? 0.05 : 1e-4)) C[key] += d * k; else C[key] = T[key]; }
        const idle = !this.pointers.size && performance.now() - (this._touch || 0) > 2500 && this.focusT < 0 && this.sel < 0;
        if (this.s.rotate && !this.reduced && idle) this.spinA = (this.spinA || 0) + dt * 0.07;
        if (this.growT != null) { this.growT += dt; if (this.growT > 3.4) this.growT = null; }
        if (live && this.growT == null) {
          this._sigClock = (this._sigClock || 0) - dt;
          if (this._sigClock <= 0 && this.flights.filter((f) => !f.ghost).length < 30) { this._spawnSignal(); this._sigClock = 0.1 + Math.random() * 0.22; }
          this._ghClock = (this._ghClock || 0) - dt;
          if (this._ghClock <= 0 && this.flights.filter((f) => f.ghost).length < 18) { this._spawnGhostSignal(); this._ghClock = 0.12 + Math.random() * 0.3; }
          this._burstClock = (this._burstClock == null ? 5 : this._burstClock) - dt;
          if (this._burstClock <= 0) { this._burst(); this._burstClock = 7 + Math.random() * 6; }
        }
        this.somaGlow = Math.max(0, (this.somaGlow || 0) - dt * 1.6);
        this._drawNeuron(live ? dt : 0);
        this._labels();
      } else if (this.s.lens === "synapse") this._drawSynapse(dt, live);
    }

    _drawNeuron(dt) {
      const gl = this.gl, T = this.T, P = this.P, s = this.s, C = this.cam, o = this.geo;
      const W = T[0].w, H = T[0].h, fv = this.fov();
      const cp = Math.cos(C.pitch), eye = [C.x + C.dist * cp * Math.sin(C.yaw), C.y + C.dist * Math.sin(C.pitch), C.z + C.dist * cp * Math.cos(C.yaw)];
      const B = (this.basis = lookAt(this.V, eye, [C.x, C.y, C.z]));
      persp(this.Pm, fv, this.w / this.h, 0.5, 12000);
      mul(this.VP, this.Pm, this.V);
      const a = this.spinA || 0, ca = Math.cos(a), sa = Math.sin(a), M = this.M;
      M.fill(0); M[0] = ca; M[2] = -sa; M[5] = 1; M[8] = sa; M[10] = ca; M[15] = 1;
      const px = H / (2 * Math.tan(fv / 2));
      this.pxCss = this.h / (2 * Math.tan(fv / 2));
      const fd = C.dist, fr = Math.max(40, o.size * 0.45), grow = this.growT != null ? this._growD() : 1e9;
      const p = this.preset(), so = lin(p.soma), dc = lin(p.dend || "#7ab8ff");
      gl.bindFramebuffer(gl.FRAMEBUFFER, T[0].fb);
      gl.viewport(0, 0, W, H);
      gl.disable(gl.BLEND);
      // фон: дымка и свет вокруг тела клетки
      let u = P.bg.u;
      gl.useProgram(P.bg.p);
      gl.bindVertexArray(this.vEmpty);
      const sp = this._proj([0, 0, 0]);
      gl.uniform2f(u.u_sp, sp ? sp[0] / this.w : 0.5, sp ? 1 - sp[1] / this.h : 0.5);
      gl.uniform2f(u.u_asp, this.w / this.h, 1);
      gl.uniform1f(u.u_sr, clamp((o.rs * 9) / Math.max(1, C.dist), 0.05, 0.6));
      gl.uniform3fv(u.u_glow, so.map((x, i) => x * 0.6 + dc[i] * 0.4)); gl.uniform3fv(u.u_haze, dc); gl.uniform3fv(u.u_haze2, p.dend ? lin(p.soma) : lin("#c06cff")); gl.uniform1f(u.u_time, this.time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      // частицы ткани
      if (this.B.dust) {
        u = P.dust.u;
        gl.useProgram(P.dust.p);
        gl.uniformMatrix4fv(u.u_vp, false, this.VP); gl.uniformMatrix4fv(u.u_m, false, M);
        gl.uniform1f(u.u_px, px); gl.uniform1f(u.u_time, this.time); gl.uniform1f(u.u_fd, fd); gl.uniform1f(u.u_bok, H * 0.045);
        gl.bindVertexArray(this.B.dust.vao); gl.drawArrays(gl.POINTS, 0, this.B.dust.n);
      }
      // тело клетки — под ветками, чтобы они выходили из него
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      u = P.soma.u;
      gl.useProgram(P.soma.p);
      gl.uniformMatrix4fv(u.u_vp, false, this.VP); gl.uniform3fv(u.u_r, B.r); gl.uniform3fv(u.u_u, B.u);
      gl.uniform1f(u.u_size, o.rs * 3.0); gl.uniform1f(u.u_time, this.time); gl.uniform1f(u.u_flash, Math.min(1, (this.somaGlow || 0) * 0.45)); gl.uniform1f(u.u_grow, grow);
      gl.uniform3fv(u.u_col, so.map((x, i) => x * 0.75 + dc[i] * 0.25)); gl.uniform3fv(u.u_rim, so.map((x, i) => x * 0.55 + dc[i] * 0.45));
      gl.bindVertexArray(this.vQuad); gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.blendFunc(gl.ONE, gl.ONE);
      // дендриты, аксон, ножки шипиков, дальние клетки
      u = P.dend.u;
      gl.useProgram(P.dend.p);
      gl.uniformMatrix4fv(u.u_vp, false, this.VP); gl.uniformMatrix4fv(u.u_m, false, M);
      gl.uniform2f(u.u_res, W, H); gl.uniform1f(u.u_px, px); gl.uniform1f(u.u_wk, s.dendW); gl.uniform1f(u.u_alpha, 1);
      gl.uniform1f(u.u_fade, s.fade); gl.uniform1f(u.u_fd, fd); gl.uniform1f(u.u_fr, fr); gl.uniform1f(u.u_grow, grow);
      const amp = s.anim && !this.reduced ? 1.5 : 0;
      gl.uniform1f(u.u_time, this.time); gl.uniform1f(u.u_amp, amp); gl.uniform1f(u.u_reach, o.maxD * 0.7); gl.uniform1f(u.u_dof, 1);
      if (this.B.dend) { gl.bindVertexArray(this.B.dend.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.B.dend.n); }
      const pts = (buf, size, min, halo, dim, g) => {
        u = P.pt.u;
        gl.useProgram(P.pt.p);
        gl.uniformMatrix4fv(u.u_vp, false, this.VP); gl.uniformMatrix4fv(u.u_m, false, M);
        gl.uniform1f(u.u_px, px); gl.uniform1f(u.u_size, size); gl.uniform1f(u.u_time, this.time); gl.uniform1f(u.u_min, min);
        gl.uniform1f(u.u_fade, s.fade); gl.uniform1f(u.u_fd, fd); gl.uniform1f(u.u_fr, fr); gl.uniform1f(u.u_dim, dim); gl.uniform1f(u.u_halo, halo); gl.uniform1f(u.u_grow, g); gl.uniform1f(u.u_amp, amp); gl.uniform1f(u.u_reach, o.maxD * 0.7);
        gl.bindVertexArray(buf.vao); gl.drawArrays(gl.POINTS, 0, buf.n);
      };
      if (this.B.pts) pts(this.B.pts, 1.6, 1.6, 0.45, 0.16, grow);
      // сигналы
      const sig = this._sigPoints(dt);
      if (sig.length) { const b = this._vao("sig", [3, 4, 4, 1], new Float32Array(sig)); pts(b, 1, 1.3, 0.7, 1, 1e9); }
      // свечение
      gl.disable(gl.BLEND);
      gl.bindVertexArray(this.vEmpty);
      const full = (prog, src, dst, pw, ph) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb); gl.viewport(0, 0, dst.w, dst.h);
        gl.useProgram(prog.p);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex); gl.uniform1i(prog.u.u_t, 0);
        if (prog.u.u_px) gl.uniform2f(prog.u.u_px, pw, ph);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
      if (T.length > 1) {
        full(P.bright, T[0], T[1], 0, 0);
        for (let i = 2; i < T.length; i++) full(P.down, T[i - 1], T[i], 1 / T[i - 1].w, 1 / T[i - 1].h);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        for (let i = T.length - 1; i > 1; i--) full(P.up, T[i], T[i - 1], 1 / T[i].w, 1 / T[i].h);
        gl.disable(gl.BLEND);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.c.width, this.c.height);
      u = P.comp.u;
      gl.useProgram(P.comp.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T[0].tex); gl.uniform1i(u.u_s, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, (T[1] || T[0]).tex); gl.uniform1i(u.u_b, 1);
      gl.uniform1f(u.u_bk, T.length > 1 ? 0.5 : 0); gl.uniform1f(u.u_time, this.time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindVertexArray(null);
    }
    // рост при открытии: фронт идёт от тела клетки к кончикам
    _growD() { const t = clamp(this.growT / 3.2, 0, 1), e = 1 - Math.pow(1 - t, 2.2); return e * (this.geo ? this.geo.maxD : 400); }

    /* ---------- синапс: открытые дела слева, сделанные справа ---------- */
    _synLayout() {
      const m = this.m, W = this.w, H = this.h, now = Date.now();
      const gOn = this.guide && !this.guide.hidden, shift = gOn ? Math.min(170, Math.max(0, 370 - (W * 0.5 - Math.min(W * 0.3, 500)))) : 0;
      const cx = W * 0.5 + shift, cy = H * 0.46, bw = Math.min(W * (gOn ? 0.28 : 0.33), 500), bh = Math.min(H * 0.27, 250);
      const L0 = cx - bw - 10, R0 = cx + 10;
      const open = m.open.slice(0, 220), done = m.tasks.filter((t) => t.done && (!t.doneAt || now - t.doneAt < 45 * DAY)).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 220);
      const place = (t, left) => {
        const r = NG.rand(t.id);
        // точка внутри «колбы»: по x от узкого края к широкому, по y в пределах огибающей
        const u = 0.12 + 0.8 * r(), env = Math.pow(Math.sin(Math.PI * u), 0.85) * 0.82;
        const x = left ? L0 + u * bw : R0 + (1 - u) * bw, y = cy + (r() * 2 - 1) * bh * env;
        return { t, x, y, ph: r() * 6.28, sp: 0.4 + r() * 0.8 };
      };
      this.syn = { cx, cy, bw, bh, L0, R0, open: open.map((t) => place(t, true)), done: done.map((t) => place(t, false)) };
    }
    _drawSynapse(dt, live) {
      const c = this.c2, g = c.getContext("2d"), m = this.m;
      if (!m) return;
      if (!this.syn || this.syn.w !== this.w || this.syn.h !== this.h || this.syn.v !== this.m) { this._synLayout(); this.syn.w = this.w; this.syn.h = this.h; this.syn.v = this.m; }
      const S = this.syn, p = this.preset(), dpr = this.dpr, t = this.time;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.fillStyle = "#020306"; g.fillRect(0, 0, this.w, this.h);
      g.globalCompositeOperation = "lighter";
      const colL = p.dend || "#6f9dff", colR = "#e8ecf4", warm = p.axon;
      // волокна колб
      const bulb = (x0, flip, col) => {
        for (let k = 0; k < 34; k++) {
          const f = (k / 33) * 2 - 1, wob = Math.sin(t * 0.6 + k * 1.7) * 0.03;
          g.beginPath();
          for (let i = 0; i <= 60; i++) {
            const u = i / 60, env = Math.pow(Math.sin(Math.PI * u), 0.85) * (0.82 + wob), x = flip ? x0 + (1 - u) * S.bw : x0 + u * S.bw;
            const y = S.cy + f * S.bh * env + Math.sin(u * 9 + k + t * 0.8) * 1.5;
            if (i) g.lineTo(x, y); else g.moveTo(x, y);
          }
          g.strokeStyle = col; g.globalAlpha = Math.abs(f) > 0.92 ? 0.5 : 0.07 + 0.05 * (1 - Math.abs(f)); g.lineWidth = Math.abs(f) > 0.92 ? 1.4 : 0.8; g.stroke();
        }
        // хвост-аксон наружу
        g.globalAlpha = 0.5; g.strokeStyle = col; g.lineWidth = 1.2;
        g.beginPath(); const xe = flip ? x0 + S.bw : x0; g.moveTo(xe, S.cy); g.lineTo(flip ? xe + 80 : xe - 80, S.cy); g.stroke();
      };
      bulb(S.L0, false, colL); bulb(S.R0, true, colR);
      // вспышка в щели
      const flash = (this.synFlash || 0);
      const grd = g.createRadialGradient(S.cx, S.cy, 0, S.cx, S.cy, 60 + flash * 80);
      grd.addColorStop(0, "rgba(255,255,255," + (0.55 + flash * 0.45).toFixed(3) + ")"); grd.addColorStop(1, "rgba(255,255,255,0)");
      g.globalAlpha = 1; g.fillStyle = grd; g.beginPath(); g.arc(S.cx, S.cy, 60 + flash * 80, 0, 6.29); g.fill();
      this.synFlash = Math.max(0, flash - dt * 1.5);
      // частицы-дела
      const dot = (q, col, r) => {
        const x = q.x + Math.sin(t * q.sp + q.ph) * 3, y = q.y + Math.cos(t * q.sp * 0.8 + q.ph) * 3;
        q.sx = x; q.sy = y;
        const gr = g.createRadialGradient(x, y, 0, x, y, r * 3.2);
        gr.addColorStop(0, col); gr.addColorStop(0.25, col); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.globalAlpha = q === this.synHover ? 1 : 0.85; g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 3.2, 0, 6.29); g.fill();
      };
      const d0 = new Date(); d0.setHours(0, 0, 0, 0);
      const urg = (t) => (!t.due ? 0 : t.due < d0.getTime() ? 2 : t.due < d0.getTime() + 2 * DAY ? 1 : 0);
      for (const q of S.open) { const u = urg(q.t); dot(q, u === 2 ? "#ff6b6b" : u === 1 ? "#ffc34d" : warm, u ? 3.3 : 2.4); }
      for (const q of S.done) dot(q, colR, 2);
      // перелёты через синапс
      for (const f of this.crossing || []) {
        f.k = Math.min(1, f.k + dt * 0.7);
        const e = f.k < 0.5 ? 2 * f.k * f.k : 1 - Math.pow(-2 * f.k + 2, 2) / 2;
        const x = f.k < 0.5 ? f.x0 + (S.cx - f.x0) * (e * 2) : S.cx + (f.x1 - S.cx) * ((e - 0.5) * 2);
        const y = f.k < 0.5 ? f.y0 + (S.cy - f.y0) * (e * 2) : S.cy + (f.y1 - S.cy) * ((e - 0.5) * 2);
        if (!f.flashed && f.k >= 0.5) { f.flashed = true; this.synFlash = 1; }
        const gr = g.createRadialGradient(x, y, 0, x, y, 16);
        gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.3, warm); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.globalAlpha = 1; g.fillStyle = gr; g.beginPath(); g.arc(x, y, 16, 0, 6.29); g.fill();
      }
      this.crossing = (this.crossing || []).filter((f) => f.k < 1);
      // подписи
      g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
      g.textAlign = "center";
      const head = (x, n, label) => {
        g.fillStyle = "#fff"; g.font = "700 40px " + this._ff(); g.fillText(floraNum(n), x, S.cy - S.bh - 44);
        g.fillStyle = "rgba(235,235,245,0.62)"; g.font = "500 14px " + this._ff(); g.fillText(label, x, S.cy - S.bh - 20);
      };
      head(S.L0 + S.bw / 2, m.open.length, L("осталось сделать", "still to do"));
      head(S.R0 + S.bw / 2, S.done.length, L("сделано за 45 дней", "done in 45 days"));
      // по три дела под каждой половиной
      const list = (x, items, col) => {
        g.font = "500 13px " + this._ff();
        items.slice(0, 3).forEach((t, i) => {
          const s = t.text.length > 42 ? t.text.slice(0, 41) + "…" : t.text;
          g.fillStyle = col; g.globalAlpha = 1 - i * 0.22; g.fillText(s, x, S.cy + S.bh + 34 + i * 20);
        });
        g.globalAlpha = 1;
      };
      const openSorted = m.open.slice().sort((a, b) => (a.due || 9e15) - (b.due || 9e15));
      list(S.L0 + S.bw / 2, openSorted, "rgba(255,226,190,0.9)");
      list(S.R0 + S.bw / 2, S.done.map((q) => q.t), "rgba(235,235,245,0.7)");
      if (this.synLast) {
        g.fillStyle = "rgba(235,235,245,0.5)"; g.font = "500 11px " + this._ff();
        g.fillText(L("только что сделано", "just done"), S.cx, S.cy + S.bh + 112);
        g.fillStyle = "#fff"; g.font = "600 13px " + this._ff();
        g.fillText(this.synLast.length > 70 ? this.synLast.slice(0, 69) + "…" : this.synLast, S.cx, S.cy + S.bh + 131);
      }
      if (!m.tasks.length) { g.fillStyle = "rgba(235,235,245,0.6)"; g.font = "500 13px " + this._ff(); g.fillText(L("Дел пока нет. Напишите в заметке строку вида  - [ ] купить билеты", "No tasks yet. Write a line like  - [ ] buy tickets  in a note"), S.cx, S.cy - S.bh - 30); }
      void live;
    }
    _bind2d(on) {
      const c = this.c2;
      const near = (e) => {
        const S = this.syn;
        if (!S) return null;
        const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        let best = null, bd = 12;
        for (const q of S.open.concat(S.done)) { const d = Math.hypot((q.sx || q.x) - x, (q.sy || q.y) - y); if (d < bd) { bd = d; best = q; } }
        return best;
      };
      on(c, "pointermove", (e) => {
        const q = near(e);
        this.synHover = q;
        c.classList.toggle("is-hot", !!q);
        if (!q) { this.tip.classList.remove("is-on"); return; }
        this.tip.textContent = "";
        this._el("div", "fnr-tip-t", this.tip, q.t.text);
        const tp = this.m.topics[q.t.topic];
        this._el("div", "fnr-tip-m", this.tip, (q.t.done ? L("сделано", "done") : L("открыто", "open")) + (tp ? " · " + tp.name : "") + (q.t.due ? " · " + fmtDay(q.t.due) : ""));
        this._tipAt(e);
      });
      on(c, "pointerleave", () => { this.synHover = null; this.tip.classList.remove("is-on"); });
      on(c, "click", (e) => { const q = near(e); if (q) this._taskCard(q.t); });
    }
    // дело только что сделано: частица летит через щель
    crossOver(task) {
      this.synLast = task.text;
      const S = this.syn;
      if (!S) return;
      const q = S.open.find((x) => x.t.id === task.id);
      const r = NG.rand(task.id + "#done"), u = 0.15 + 0.7 * r(), env = Math.pow(Math.sin(Math.PI * u), 0.85) * 0.8;
      const x1 = S.R0 + (1 - u) * S.bw, y1 = S.cy + (r() * 2 - 1) * S.bh * env;
      (this.crossing = this.crossing || []).push({ x0: q ? q.sx || q.x : S.L0 + S.bw * 0.5, y0: q ? q.sy || q.y : S.cy, x1, y1, k: 0 });
    }

    _ff() { if (!this._ffv) this._ffv = getComputedStyle(this.host).fontFamily || "sans-serif"; return this._ffv; }
    _col(hex, a) { const c = NG.hexRgb(hex); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }

    /* ---------- время: календарь, часы суток, живые и затихшие ветки ---------- */
    _renderTime() {
      const el = this.timeEl, m = this.m;
      el.textContent = "";
      if (!m) return;
      const p = this.preset(), base = p.dend || "#8cc2ff", now = Date.now();
      const notes = m.notes.filter((n) => n.ctime || n.mtime), when = (n) => n.ctime || n.mtime;
      const card = (cls, title, sub, parent) => { const c = this._el("div", "fnr-tcard " + cls, parent || el); const h = this._el("div", "fnr-th", c); this._el("div", "fnr-th-t", h, title); if (sub) this._el("div", "fnr-th-s", h, sub); return c; };
      // календарь
      const today = new Date(now); today.setHours(0, 0, 0, 0);
      const wd = (today.getDay() + 6) % 7, weeks = clamp(Math.floor((this.w - 110) / 30), 8, 26);
      const start = today.getTime() - (wd + (weeks - 1) * 7) * DAY;
      const byDay = new Map();
      for (const n of notes) { if (when(n) < start) continue; const k = dayKey(when(n)); byDay.set(k, (byDay.get(k) || []).concat([n])); }
      let mx = 1, best = null, tot = 0;
      for (const [k, v] of byDay) { tot += v.length; if (v.length > mx) { mx = v.length; best = v[0]; } }
      const cal = card("is-cal", L("Сколько заметок вы писали по дням", "Notes you wrote each day"),
        L("За " + weeks + " недель — ", "Last " + weeks + " weeks: ") + notesN(tot) + (best ? L(". Самый активный день — ", ". Busiest day: ") + fmtDay(when(best)) + " (" + mx + ")" : ""));
      const grid = this._el("div", "fnr-cal", cal);
      grid.style.setProperty("--weeks", String(weeks));
      const days = [L("Пн", "Mon"), L("Вт", "Tue"), L("Ср", "Wed"), L("Чт", "Thu"), L("Пт", "Fri"), L("Сб", "Sat"), L("Вс", "Sun")];
      this._el("span", "fnr-cal-corner", grid);
      let lastM = -1;
      for (let w = 0; w < weeks; w++) {
        const d = new Date(start + w * 7 * DAY), mo = d.getMonth();
        this._el("span", "fnr-cal-mon", grid, mo !== lastM ? d.toLocaleDateString(FLORA_LANG === "ru" ? "ru-RU" : "en-US", { month: "short" }) : "");
        lastM = mo;
      }
      for (let r = 0; r < 7; r++) {
        this._el("span", "fnr-cal-day", grid, r % 2 === 0 ? days[r] : "");
        for (let w = 0; w < weeks; w++) {
          const t = start + (w * 7 + r) * DAY, list = byDay.get(dayKey(t)) || [];
          const b = this._el("button", "fnr-cal-cell" + (t > now ? " is-future" : ""), grid);
          b.type = "button";
          b.style.setProperty("--bg", list.length ? this._col(base, (0.18 + 0.82 * Math.sqrt(list.length / mx)).toFixed(3)) : "rgba(255,255,255,0.04)");
          b.title = new Date(t).toLocaleDateString() + " — " + notesN(list.length);
          if (list.length) b.onclick = () => this._dayList(t, list);
          if (dayKey(t) === dayKey(now)) b.classList.add("is-today");
        }
      }
      const lg = this._el("div", "fnr-scale", cal);
      this._el("span", "", lg, L("меньше", "less"));
      for (const a of [0.04, 0.3, 0.55, 0.8, 1]) this._el("i", "", lg).style.setProperty("--bg", a < 0.1 ? "rgba(255,255,255,0.05)" : this._col(base, a));
      this._el("span", "", lg, L("больше", "more"));
      const row = this._el("div", "fnr-trow", el);
      // часы суток
      const H = new Array(24).fill(0);
      for (const n of notes) { const d = new Date(n.mtime && new Date(n.mtime).getHours() + new Date(n.mtime).getMinutes() ? n.mtime : when(n)); if (d.getHours() + d.getMinutes() + d.getSeconds() === 0) continue; H[d.getHours()]++; }
      const hm = Math.max(1, ...H);
      const parts = [[L("ночью", "at night"), 0, 6, L("ночь", "night")], [L("утром", "in the morning"), 6, 12, L("утро", "morning")], [L("днём", "in the afternoon"), 12, 18, L("день", "afternoon")], [L("вечером", "in the evening"), 18, 24, L("вечер", "evening")]];
      const sums = parts.map(([, a, b]) => H.slice(a, b).reduce((x, y) => x + y, 0)), top = sums.indexOf(Math.max(...sums));
      const peak = H.indexOf(hm);
      const hc = card("is-hours", L("В какое время вы пишете", "What time you write"), H.some((x) => x) ? L("Чаще всего — ", "Mostly ") + parts[top][0] + L(", пик около ", ", peaking around ") + String(peak).padStart(2, "0") + ":00" : "", row);
      const bars = this._el("div", "fnr-hbars", hc);
      for (let h = 0; h < 24; h++) {
        const b = this._el("div", "fnr-hbar" + (h === peak ? " is-peak" : ""), bars);
        b.style.setProperty("--h", Math.max(3, (H[h] / hm) * 100) + "%");
        b.style.setProperty("--bg", base);
        b.title = String(h).padStart(2, "0") + ":00 — " + notesN(H[h]);
      }
      const ax = this._el("div", "fnr-haxis", hc);
      for (const [, a, , short] of parts) { const s0 = this._el("span", "", ax); this._el("b", "", s0, String(a).padStart(2, "0") + ":00"); this._el("em", "", s0, short); }
      // ветки: где жизнь, а где тишина
      const bc = card("is-branches", L("Какие папки живые, а какие затихли", "Which folders are alive and which went quiet"), L("Столбики — заметки по неделям за последние 3 месяца", "Bars: notes per week over the last 3 months"), row);
      const W12 = 13, wk0 = today.getTime() + DAY - W12 * 7 * DAY;
      const rows = m.topics.map((t, i) => {
        const wk = new Array(W12).fill(0); let last = 0;
        for (const ni of t.notes) { const tt = when(m.notes[ni]) || 0; last = Math.max(last, tt); const k = Math.floor((tt - wk0) / (7 * DAY)); if (k >= 0 && k < W12) wk[k]++; }
        return { t, i, wk, last };
      }).sort((a, b) => b.last - a.last);
      const wmx = Math.max(1, ...rows.flatMap((r) => r.wk));
      for (const r of rows) {
        const b = this._el("button", "fnr-brow", bc);
        b.type = "button";
        const ago = now - r.last, alive = ago < 7 * DAY;
        const dot = this._el("i", "fnr-brow-dot", b); dot.style.setProperty("--c", p.dend || r.t.color);
        this._el("span", "fnr-brow-n", b, r.t.name);
        const sp = this._el("span", "fnr-brow-sp", b);
        for (const v of r.wk) { const e = this._el("i", "", sp); e.style.setProperty("--h", Math.max(8, (v / wmx) * 100) + "%"); e.style.setProperty("--c", v ? (p.dend || r.t.color) : "rgba(255,255,255,0.12)"); }
        this._el("span", "fnr-brow-a", b, !r.last ? "—" : ago < DAY ? L("сегодня", "today") : FSpace.ago(r.last));
        this._el("span", "fnr-brow-s " + (alive ? "is-live" : "is-quiet"), b, alive ? L("живая", "active") : L("затихла", "quiet"));
        b.onclick = () => { this.setLens("neuron"); this.showTopic(r.i); };
      }
    }
    _dayList(t, list) {
      const c = this._leftOpen("day");
      this._el("div", "fnr-card-kicker", c, notesN(list.length));
      this._el("div", "fnr-card-title", c, new Date(t).toLocaleDateString(FLORA_LANG === "ru" ? "ru-RU" : "en-US", { weekday: "long", day: "numeric", month: "long" }));
      const box = this._el("div", "fnr-list", c);
      for (const n of list) {
        const b = this._el("button", "fnr-row", box);
        b.type = "button";
        this._el("span", "fnr-row-d", b, fmtTime(n.ctime || n.mtime));
        this._el("span", "fnr-row-t", b, n.title);
        b.onclick = (ev) => this.opts.onOpen && this.opts.onOpen(n, ev);
      }
    }

    /* ---------- связи: хорды между темами и матрица ---------- */
    _cross() {
      const m = this.m, T = m.topics.length, X = Array.from({ length: T }, () => new Array(T).fill(0));
      for (const [a, b] of m.edges) { const ta = m.notes[a].topic, tb = m.notes[b].topic; if (ta !== tb) { X[ta][tb]++; X[tb][ta]++; } else X[ta][ta]++; }
      return X;
    }
    _renderLinks() {
      const el = this.linksEl, m = this.m;
      el.textContent = "";
      if (!m) return;
      this.cross = this._cross();
      const X = this.cross, pairs = [];
      for (let i = 0; i < X.length; i++) for (let j = i + 1; j < X.length; j++) if (X[i][j]) pairs.push([i, j, X[i][j]]);
      pairs.sort((a, b) => b[2] - a[2]);
      const linksN = (n) => floraNum(n) + " " + plural(n, ["ссылка", "ссылки", "ссылок"], ["link", "links"]);
      const card = this._el("div", "fnr-tcard is-chord", el);
      const ch = this._el("div", "fnr-th", card);
      this._el("div", "fnr-th-t", ch, L("Ссылки между папками", "Links between folders"));
      this._el("div", "fnr-th-s", ch, pairs.length ? L("Сильнее всего связаны ", "Most connected: ") + m.topics[pairs[0][0]].name + L(" и ", " and ") + m.topics[pairs[0][1]].name + " — " + linksN(pairs[0][2]) : L("Пока заметки из разных папок не ссылаются друг на друга", "No links between folders yet"));
      const cv = (this.chordCv = this._el("canvas", "fnr-chord", card));
      cv.onmousemove = (e) => { const i = this._chordHit(e); if (i !== this.chordHi) { this.chordHi = i; this._drawChord(); this._pairHi(); } cv.classList.toggle("is-hot", i >= 0); };
      cv.onmouseleave = () => { this.chordHi = -1; this._drawChord(); this._pairHi(); };
      cv.onclick = (e) => { const i = this._chordHit(e); if (i >= 0) { this.setLens("neuron"); this.showTopic(i); } };
      const side = this._el("div", "fnr-tcard is-pairs", el);
      const sh = this._el("div", "fnr-th", side);
      this._el("div", "fnr-th-t", sh, L("Какие пары связаны сильнее", "Strongest pairs"));
      this._el("div", "fnr-th-s", sh, L("Сколько ссылок идёт из заметок одной папки в другую", "How many links go from one folder's notes to another's"));
      if (!pairs.length) this._el("div", "fnr-empty", side, L("Связи появятся, когда заметки из разных папок начнут ссылаться друг на друга.", "Links appear once notes in different folders link to each other."));
      const mx = pairs.length ? pairs[0][2] : 1, p = this.preset();
      this.pairRows = [];
      for (const [i, j, v] of pairs.slice(0, 12)) {
        const r = this._el("div", "fnr-pair", side);
        const t = this._el("div", "fnr-pair-t", r);
        const a = this._el("span", "fnr-pair-n", t); this._el("i", "", a).style.setProperty("--c", p.dend || m.topics[i].color); a.appendChild(this.doc.createTextNode(m.topics[i].name));
        this._el("span", "fnr-pair-x", t, "⟷");
        const b = this._el("span", "fnr-pair-n", t); this._el("i", "", b).style.setProperty("--c", p.dend || m.topics[j].color); b.appendChild(this.doc.createTextNode(m.topics[j].name));
        this._el("span", "fnr-pair-v", t, linksN(v));
        this._el("div", "fnr-pair-fill", this._el("div", "fnr-pair-track", r)).style.setProperty("--w", (v / mx) * 100 + "%");
        this.pairRows.push([r, i, j]);
      }
      this.chordHi = -1;
      this.win.requestAnimationFrame(() => this._drawChord());
    }
    _pairHi() { for (const [r, i, j] of this.pairRows || []) r.classList.toggle("is-dim", this.chordHi >= 0 && this.chordHi !== i && this.chordHi !== j); }
    _chordGeo() {
      const m = this.m, X = this.cross, T = m.topics.length;
      const tot = X.map((row, i) => row.reduce((a, b, j) => a + (i === j ? 0 : b), 0) + m.topics[i].notes.length * 0.15 + 1);
      const sum = tot.reduce((a, b) => a + b, 0), gapA = 0.035, avail = Math.PI * 2 - gapA * T;
      const arcs = [];
      let a = -Math.PI / 2;
      for (let i = 0; i < T; i++) { const w = (tot[i] / sum) * avail; arcs.push([a, a + w]); a += w + gapA; }
      return arcs;
    }
    _chordHit(e) {
      const cv = this.chordCv, r = cv.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
      const R = Math.max(40, Math.min(r.width / 2 - 110, r.height / 2 - 46)), d = Math.hypot(x, y);
      if (d < R * 0.9 || d > R * 1.25) return -1;
      let an = Math.atan2(y, x);
      const arcs = this._chordGeo();
      for (let i = 0; i < arcs.length; i++) { for (const k of [0, 1, -1]) { const t = an + k * Math.PI * 2; if (t >= arcs[i][0] && t <= arcs[i][1]) return i; } }
      return -1;
    }
    _drawChord() {
      const cv = this.chordCv, m = this.m;
      if (!cv || !cv.isConnected || !m) return;
      const r = cv.getBoundingClientRect(), dpr = this.dpr || 1, W = Math.max(10, r.width), H = Math.max(10, r.height);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      const g = cv.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2, R = Math.max(40, Math.min(W / 2 - 110, H / 2 - 46)), X = this.cross, arcs = this._chordGeo(), T = arcs.length, hi = this.chordHi;
      const used = arcs.map((a) => a[0]);
      const per = arcs.map((a, i) => { const tot = X[i].reduce((s, v, j) => s + (i === j ? 0 : v), 0) || 1; return (a[1] - a[0]) / tot; });
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < T; i++) for (let j = i + 1; j < T; j++) {
        const v = X[i][j];
        if (!v) continue;
        const a0 = used[i], a1 = a0 + v * per[i]; used[i] = a1;
        const b0 = used[j], b1 = b0 + v * per[j]; used[j] = b1;
        const on = hi < 0 || hi === i || hi === j;
        const col = this.preset().dend || m.topics[hi === j ? j : i].color;
        g.fillStyle = this._col(col, hi < 0 ? 0.26 : on ? 0.5 : 0.04);
        g.beginPath();
        g.arc(cx, cy, R, a0, a1);
        g.quadraticCurveTo(cx, cy, cx + Math.cos(b0) * R, cy + Math.sin(b0) * R);
        g.arc(cx, cy, R, b0, b1);
        g.quadraticCurveTo(cx, cy, cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
        g.fill();
      }
      g.globalCompositeOperation = "source-over";
      g.textAlign = "center";
      if (hi >= 0) {
        const tot = X[hi].reduce((s0, v, j) => s0 + (j === hi ? 0 : v), 0);
        g.fillStyle = "#fff"; g.font = "700 22px " + this._ff(); g.fillText(m.topics[hi].name, cx, cy - 4);
        g.fillStyle = "rgba(235,235,245,0.7)"; g.font = "500 13px " + this._ff(); g.fillText(floraNum(tot) + " " + plural(tot, ["ссылка", "ссылки", "ссылок"], ["link", "links"]) + L(" в другие папки", " to other folders"), cx, cy + 18);
      }
      g.font = "500 12px " + this._ff();
      for (let i = 0; i < T; i++) {
        const [a0, a1] = arcs[i], tp = m.topics[i];
        g.strokeStyle = tp.color; g.lineWidth = hi === i ? 6 : 4; g.globalAlpha = hi < 0 || hi === i ? 1 : 0.4;
        g.beginPath(); g.arc(cx, cy, R * 1.05, a0, a1); g.stroke();
        const am = (a0 + a1) / 2, lx = cx + Math.cos(am) * R * 1.13, ly = cy + Math.sin(am) * R * 1.13;
        if (a1 - a0 > 0.07 || hi === i) { g.fillStyle = "rgba(235,235,245,0.85)"; g.textAlign = Math.cos(am) > 0.15 ? "left" : Math.cos(am) < -0.15 ? "right" : "center"; g.fillText(tp.name + " " + tp.notes.length, lx, ly + 4); }
      }
      g.globalAlpha = 1;
    }

    /* ---------- панель справа: «Сегодня» и «Вид» ---------- */
    _buildSide() {
      const s = this.side;
      s.textContent = "";
      const tabs = this._el("div", "fnr-tabs", s);
      this.sideTab = this.sideTab || "today";
      const mk = (id, label) => { const b = this._el("button", "fnr-tab", tabs, label); b.type = "button"; b.onclick = () => { this.sideTab = id; this._renderSide(); }; return [id, b]; };
      this.tabBtns = [mk("today", L("Сегодня", "Today")), mk("look", L("Вид", "Look"))];
      this.sideBody = this._el("div", "fnr-side-body", s);
    }
    _renderSide() {
      for (const [id, b] of this.tabBtns) b.classList.toggle("is-on", id === this.sideTab);
      const box = this.sideBody;
      box.textContent = "";
      if (this.sideTab === "look") { this._renderLook(box); return; }
      const m = this.m;
      if (!m) return;
      const now = Date.now();
      const fan = this._el("canvas", "fnr-fan", box);
      const dated = m.open.filter((t) => t.due), weekDone = m.tasks.filter((t) => t.done && t.doneAt && now - t.doneAt < 7 * DAY).length + (this.sessionDone || []).filter((t) => t.done && !t.doneAt).length;
      this._el("div", "fnr-fan-t", box, m.open.length ? L(tasksN(m.open.length) + " открыто, " + floraNum(dated.length) + " с датой. Сделаем?", floraNum(m.open.length) + " things you meant to do, " + floraNum(dated.length) + " with a date. Done?") : L("Открытых дел нет.", "Nothing open."));
      this._el("div", "fnr-fan-s", box, L("за неделю сделано: ", "done this week: ") + floraNum(weekDone));
      this.win.requestAnimationFrame(() => this._drawFan(fan));
      const sess = (this.sessionDone || []).filter((t) => t.done);
      if (sess.length) {
        this._el("div", "fnr-sh", box, L("Только что сделано", "Just done"));
        for (const t of sess.slice(-4).reverse()) this._taskRow(box, t, false);
      }
      const soon = dated.slice().sort((a, b) => a.due - b.due).slice(0, 12);
      if (soon.length) {
        this._el("div", "fnr-sh", box, L("Скоро срок", "Coming up"));
        for (const t of soon) this._taskRow(box, t, false);
      }
      const rest = m.open.filter((t) => !t.due).sort((a, b) => (m.notes[b.note] ? m.notes[b.note].mtime || 0 : 0) - (m.notes[a.note] ? m.notes[a.note].mtime || 0 : 0));
      if (rest.length) {
        this._el("div", "fnr-sh", box, L("Без срока", "No date"));
        const lim = this.showAll ? 80 : 10;
        for (const t of rest.slice(0, lim)) this._taskRow(box, t, false);
        if (rest.length > lim) { const b = this._el("button", "fnr-more-btn", box, L("ещё ", "more: ") + floraNum(rest.length - lim)); b.type = "button"; b.onclick = () => { this.showAll = true; this._renderSide(); }; }
      }
      if (!m.tasks.length) this._el("div", "fnr-empty", box, L("Дела берутся из заметок: строки вида «- [ ] позвонить врачу». Дату можно добавить так: 📅 2026-11-20.", "Tasks come from your notes: lines like “- [ ] call the doctor”. Add a date like 📅 2026-11-20."));
    }
    _drawFan(cv) {
      const m = this.m, r = cv.getBoundingClientRect(), dpr = this.dpr || 1, W = Math.max(10, r.width), H = Math.max(10, r.height);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      const g = cv.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const ox = W / 2, oy = H - 8, R = Math.min(W * 0.46, H - 16), now = Date.now();
      const open = m.open.slice(0, 140), done = m.tasks.filter((t) => t.done && t.doneAt && now - t.doneAt < 7 * DAY).slice(0, 40).concat((this.sessionDone || []).filter((t) => t.done));
      const all = open.map((t) => [t, false]).concat(done.map((t) => [t, true]));
      g.globalCompositeOperation = "lighter";
      all.forEach(([t, isDone], i) => {
        const a = Math.PI + (Math.PI * (i + 0.5)) / Math.max(1, all.length), rr = NG.rand(t.id)();
        const len = R * (isDone ? 0.55 : 0.7 + 0.3 * rr);
        const tp = m.topics[t.topic], col = isDone ? "#ffffff" : this.preset().dend || (tp ? tp.color : "#8cc2ff");
        const x = ox + Math.cos(a) * len, y = oy + Math.sin(a) * len;
        const gr = g.createLinearGradient(ox, oy, x, y);
        gr.addColorStop(0, this._col(col, 0.05)); gr.addColorStop(1, this._col(col, isDone ? 0.5 : 0.75));
        g.strokeStyle = gr; g.lineWidth = 1; g.beginPath(); g.moveTo(ox, oy); g.lineTo(x, y); g.stroke();
        g.fillStyle = this._col(col, 0.95); g.beginPath(); g.arc(x, y, t.due && !isDone ? 2.4 : 1.6, 0, 6.29); g.fill();
      });
      const gr = g.createRadialGradient(ox, oy, 0, ox, oy, 14);
      gr.addColorStop(0, "rgba(255,255,255,0.95)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(ox, oy, 14, 0, 6.29); g.fill();
    }
    _dueText(t) {
      if (!t.due) return "";
      const d0 = new Date(); d0.setHours(0, 0, 0, 0);
      const days = Math.round((t.due - d0.getTime()) / DAY);
      if (days < 0) return L("просрочено · ", "overdue · ") + fmtDay(t.due);
      if (days === 0) return L("сегодня", "today");
      if (days === 1) return L("завтра", "tomorrow");
      return fmtDay(t.due);
    }
    _taskRow(parent, t, compact) {
      const m = this.m, row = this._el("div", "fnr-task" + (t.done ? " is-done" : ""), parent);
      const ck = this._el("button", "fnr-check", row);
      ck.type = "button";
      ck.setAttribute("aria-label", t.done ? L("Вернуть в открытые", "Mark as not done") : L("Отметить сделанным", "Mark as done"));
      ck.title = ck.getAttribute("aria-label");
      this._ico(ck, "check");
      ck.onclick = () => this.toggleTask(t, !t.done);
      const body = this._el("div", "fnr-task-body", row);
      const tx = this._el("button", "fnr-task-text", body, t.text);
      tx.type = "button";
      tx.title = L("Открыть заметку на этой строке", "Open the note at this line");
      tx.onclick = () => this.opts.onOpenTask && this.opts.onOpenTask(t);
      const due = this._dueText(t), tp = m.topics[t.topic], note = m.notes[t.note];
      const meta = this._el("div", "fnr-task-meta", body);
      if (due) this._el("span", "fnr-task-when" + (due.indexOf(L("просрочено", "overdue")) === 0 ? " is-late" : due === L("сегодня", "today") || due === L("завтра", "tomorrow") ? " is-soon" : ""), meta, due);
      if (note && !compact) this._el("span", "fnr-task-note", meta, note.title);
      else if (tp && !compact) this._el("span", "fnr-task-note", meta, tp.name);
    }
    _taskCard(t) {
      const m = this.m, c = this._leftOpen("task");
      const tp = m.topics[t.topic], note = m.notes[t.note];
      this._el("div", "fnr-card-kicker", c, (t.done ? L("сделано", "done") : L("открытое дело", "open task")) + (tp ? " · " + tp.name : ""));
      this._el("div", "fnr-card-title", c, t.text);
      if (note) this._el("div", "fnr-card-path", c, note.title);
      if (t.due) this._el("div", "fnr-card-meta", c, this._dueText(t));
      const act = this._el("div", "fnr-actions", c);
      const b = this._el("button", "fnr-btn is-main", act, t.done ? L("Отменить", "Undo") : L("Готово", "Done"));
      b.type = "button";
      b.onclick = async () => { await this.toggleTask(t, !t.done); this._taskCard(t); };
      const o = this._el("button", "fnr-btn", act, L("Открыть заметку", "Open note"));
      o.type = "button";
      o.onclick = () => this.opts.onOpenTask && this.opts.onOpenTask(t);
    }
    async toggleTask(t, done) {
      if (!this.opts.onDone || t._busy) return;
      t._busy = true;
      let ok = false;
      try { ok = await this.opts.onDone(t, done); } catch (e) { console.error("Neuron:", e); }
      t._busy = false;
      if (!ok) return;
      t.done = done;
      t.doneAt = done ? Date.now() : 0;
      // дело живёт и в модели, и в списке сделанного за сеанс
      if (this.m) {
        const mt = this.m.tasks.find((x) => x.id === t.id);
        if (mt && mt !== t) { mt.done = done; mt.doneAt = t.doneAt; }
        this.m.open = this.m.tasks.filter((x) => !x.done);
      }
      this.sessionDone = (this.sessionDone || []).filter((x) => x.id !== t.id);
      if (done) { this.sessionDone.push(t); this.crossOver(t); }
      this.syn = null;
      if (done && this.s.lens === "synapse") this._synPending = t;
      this._counts();
      this._renderSide();
      this._upload();
    }
    _renderLook(box) {
      const s = this.s;
      const sec = (t) => this._el("div", "fnr-sh", box, t);
      const seg = (key, items, after) => {
        const r = this._el("div", "fnr-seg", box);
        const bs = items.map(([v, label]) => { const b = this._el("button", "fnr-seg-btn", r, label); b.type = "button"; b.onclick = () => { s[key] = v; sync(); this._save(); after(); }; return [v, b]; });
        const sync = () => bs.forEach(([v, b]) => b.classList.toggle("is-on", s[key] === v));
        sync();
      };
      const slider = (label, key, min, max, step, fmt, after) => {
        const r = this._el("label", "fnr-srow", box);
        this._el("span", "fnr-srow-n", r, label);
        const inp = this._el("input", "fnr-range", r);
        inp.type = "range"; inp.min = min; inp.max = max; inp.step = step; inp.value = s[key];
        const v = this._el("span", "fnr-srow-v", r, fmt(s[key]));
        inp.oninput = () => { s[key] = Number(inp.value); v.textContent = fmt(s[key]); this.dirty = true; if (after) after(false); };
        inp.onchange = () => { this._save(); if (after) after(true); };
      };
      const toggle = (label, key, after) => {
        const r = this._el("div", "fnr-srow", box);
        this._el("span", "fnr-srow-n", r, label);
        const b = this._el("button", "fnr-tg", r);
        b.type = "button";
        const sync = () => { b.textContent = s[key] ? L("Вкл", "On") : L("Выкл", "Off"); b.classList.toggle("is-on", !!s[key]); };
        b.onclick = () => { s[key] = !s[key]; sync(); this._save(); if (after) after(); };
        sync();
      };
      const rebuild = () => { if (this.g) this.setData(this.g); };
      sec(L("ветки", "branches"));
      seg("branch", [["folder", L("Папки", "Folders")], ["tag", L("Теги", "Tags")]], rebuild);
      sec(L("цвет", "colour"));
      const pr = this._el("div", "fnr-presets", box);
      for (const P of PRESETS) {
        const b = this._el("button", "fnr-preset" + (s.preset === P.id ? " is-on" : ""), pr);
        b.type = "button";
        const sw = this._el("span", "fnr-preset-sw", b);
        sw.style.setProperty("--a", P.dend || "#7ab8ff"); sw.style.setProperty("--b", P.dend ? P.axon : "#ff7ab8");
        this._el("span", "", b, P.name());
        b.onclick = () => { s.preset = P.id; this._save(); this._upload(); this._renderSide(); if (s.lens === "time") this._renderTime(); if (s.lens === "links") this._renderLinks(); };
      }
      sec(L("форма", "geometry"));
      const f2 = (v) => Number(v).toFixed(2);
      slider(L("Толщина дендритов", "Dendrite width"), "dendW", 0.3, 2.5, 0.05, f2);
      slider(L("Размер шипиков", "Spine size"), "spine", 0.4, 2.5, 0.05, f2, (done) => { if (done) this._upload(); });
      slider(L("Яркость аксона", "Axon opacity"), "axon", 0, 1.5, 0.05, f2, (done) => { if (done) this._upload(); });
      sec(L("камера", "camera"));
      slider(L("Перспектива", "Perspective"), "persp", 0, 1, 0.05, f2);
      slider(L("Туман глубины", "Depth fade"), "fade", 0, 1, 0.05, f2);
      toggle(L("Автоповорот", "Auto rotate"), "rotate");
      toggle(L("Сигналы по веткам", "Signals"), "anim");
      sec(L("подписи и время", "labels and time"));
      slider(L("Размер подписей", "Label size"), "labelSize", 9, 16, 1, (v) => String(v));
      slider(L("Новые — за последние часы", "New = last hours"), "fresh", 1, 168, 1, (v) => String(v), (done) => { if (done) this._upload(); });
      slider(L("Мин. заметок в ветке", "Min notes per branch"), "minNotes", 1, 20, 1, (v) => String(v), (done) => { if (done) rebuild(); });
      const reset = this._el("button", "fnr-reset", box, L("Вернуть как было", "Reset to default"));
      reset.type = "button";
      reset.onclick = () => { const keep = { lens: s.lens, panel: s.panel }; Object.assign(s, DEFAULTS, keep); this._save(); rebuild(); this._renderSide(); };
    }

    destroy() {
      this.destroyed = true;
      this.win.cancelAnimationFrame(this.raf);
      if (this._hoverT) this.win.cancelAnimationFrame(this._hoverT);
      if (this._ro) this._ro.disconnect();
      for (const off of this._off || []) off();
      if (this.gl) { this._freeTargets(); const ext = this.gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); }
      this.host.textContent = "";
      this.host.classList.remove("fnr");
    }
  }

  // строка дела: текст без служебных значков, срок и дата выполнения
  const DUE_RE = /(?:📅|🗓️?|⏳)\s*(\d{4}-\d{2}-\d{2})|\[(?:due|scheduled)::\s*(\d{4}-\d{2}-\d{2})\]|(?:^|\s)due:\s*(\d{4}-\d{2}-\d{2})/u;
  const DONE_RE = /✅\s*(\d{4}-\d{2}-\d{2})|\[completion::\s*(\d{4}-\d{2}-\d{2})\]/u;
  function parseTask(line) {
    const mm = /^\s*(?:[-*+]|\d+[.)])\s+\[(.)\]\s*(.*)$/.exec(line);
    if (!mm) return null;
    const raw = mm[2];
    const dm = DUE_RE.exec(raw), cm = DONE_RE.exec(raw);
    const d = dm ? dm[1] || dm[2] || dm[3] : null, c = cm ? cm[1] || cm[2] : null;
    const toT = (s) => { const p = s.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]).getTime(); };
    const text = raw.replace(/(?:📅|🗓️?|⏳|✅|🛫|➕|🔁)\s*\d{4}-\d{2}-\d{2}/gu, "").replace(/\[(?:due|scheduled|completion|created)::[^\]]*\]/g, "").replace(/(?:^|\s)due:\s*\d{4}-\d{2}-\d{2}/, "").replace(/[⏫🔼🔽⏬🔺]/gu, "").replace(/\s+/g, " ").trim();
    return { mark: mm[1], done: /[xX-]/.test(mm[1]), text: text || raw.trim(), due: d ? toT(d) : 0, doneAt: c ? toT(c) : 0 };
  }

  return { Scene, DEFAULTS, parseTask };
})();

/* ------------------------------------------------------------------ */
/* Вкладка Obsidian                                                    */
/* ------------------------------------------------------------------ */
const NEURON_VIEW = "flora-neuron";

class NeuronView extends obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.scene = null;
  }
  getViewType() { return NEURON_VIEW; }
  getDisplayText() { return L("Нейрон", "Neuron"); }
  getIcon() { return "brain-circuit"; }

  async onOpen() {
    const el = this.contentEl;
    el.empty();
    el.addClass("ng-view"); el.addClass("fnr-view");
    const wrap = el.createDiv({ cls: "ng-wrap" });
    const stage = wrap.createDiv({ cls: "fnr-stage" });
    const loader = floraLoader(wrap);
    loader.set(L("Выращиваю нейрон", "Growing the neuron"));
    this._loader = loader;
    const shownAt = performance.now();
    this.scene = new FNeuron.Scene(stage, {
      settings: this.plugin.settings.neuron,
      icon: (e, name) => { if (typeof obsidian.setIcon === "function") obsidian.setIcon(e, name); },
      vaultName: typeof this.app.vault.getName === "function" ? this.app.vault.getName() : "",
      onSave: (s) => {
        this.plugin.settings.neuron = Object.assign({}, s);
        window.clearTimeout(this._saveT);
        this._saveT = window.setTimeout(() => this.plugin.saveSettings(), 400);
      },
      onOpen: (n, ev) => this.openNote(n, ev),
      onOpenTask: (t) => this.openTask(t),
      onDone: (t, done) => this.setTaskDone(t, done),
      onQuick: (text) => this.quickNote(text),
      onReady: () => window.setTimeout(() => { loader.done(); stage.addClass("is-ready"); }, Math.max(0, 900 - (performance.now() - shownAt))),
    });
    await this.refresh(true);
    const later = () => { window.clearTimeout(this._timer); this._timer = window.setTimeout(() => this.refresh(false), 1200); };
    this.registerEvent(this.app.metadataCache.on("resolved", later));
    this.registerEvent(this.app.metadataCache.on("changed", later));
    this.registerEvent(this.app.vault.on("create", later));
    this.registerEvent(this.app.vault.on("delete", later));
    this.registerEvent(this.app.vault.on("rename", later));
  }
  async onClose() {
    window.clearTimeout(this._timer); window.clearTimeout(this._saveT);
    if (this._loader) { this._loader.remove(); this._loader = null; }
    if (this.scene) this.scene.destroy();
    this.scene = null;
  }
  onResize() { if (this.scene) this.scene.resize(); }

  // дела из заметок: строки «- [ ]» и «- [x]», найденные кэшем Obsidian
  async collectTasks() {
    const app = this.app, out = [];
    const files = app.vault.getMarkdownFiles().filter((f) => { const c = app.metadataCache.getFileCache(f); return c && c.listItems && c.listItems.some((li) => li.task !== undefined); });
    for (let i = 0; i < files.length; i += 40) {
      await Promise.all(files.slice(i, i + 40).map(async (f) => {
        const c = app.metadataCache.getFileCache(f);
        let text = "";
        try { text = await app.vault.cachedRead(f); } catch (e) { return; }
        const lines = text.split("\n"), seen = new Map();
        for (const li of c.listItems) {
          if (li.task === undefined || !li.position) continue;
          const ln = li.position.start.line, t = FNeuron.parseTask(lines[ln] || "");
          if (!t) continue;
          const k = t.text, n = (seen.get(k) || 0) + 1;
          seen.set(k, n);
          out.push({ id: f.path + "::" + k + "::" + n, path: f.path, line: ln, text: t.text, done: t.done, due: t.due, doneAt: t.doneAt || (t.done ? f.stat.mtime : 0) });
        }
      }));
    }
    return out;
  }
  async refresh(force) {
    if (!this.scene) return;
    try {
      const g = SpaceNeuronsView.prototype.collect.call(this);
      g.tasks = await this.collectTasks();
      if (!this.scene) return;
      const sig = g.nodes.length + "|" + g.edges.length + "|" + g.nodes.map((n) => n.id + "#" + n.folder + "#" + (n.tags || []).join(",")).join("\n") + "|" + g.edges.map((e) => e.a + ">" + e.b).join("\n") + "|" + g.tasks.map((t) => t.id + (t.done ? "x" : "o") + t.due).join("\n");
      if (!force && sig === this._sig) return;
      this._sig = sig;
      this.scene.setData(g);
    } catch (e) { console.error("Neuron:", e); }
  }
  // «Готово»: меняем только квадратные скобки этой строки
  async setTaskDone(t, done) {
    const f = this.app.vault.getAbstractFileByPath(t.path);
    if (!(f instanceof obsidian.TFile)) { new obsidian.Notice(L("Заметка с этим делом не найдена.", "The note with this task is gone.")); return false; }
    let found = false;
    await this.app.vault.process(f, (data) => {
      const lines = data.split("\n");
      const ok = (i) => { const p = FNeuron.parseTask(lines[i] || ""); return p && p.text === t.text && p.done !== done; };
      let idx = ok(t.line) ? t.line : -1;
      if (idx < 0) for (let i = 0; i < lines.length; i++) if (ok(i)) { idx = i; break; }
      if (idx < 0) return data;
      found = true;
      lines[idx] = lines[idx].replace(/\[(.)\]/, done ? "[x]" : "[ ]");
      return lines.join("\n");
    });
    if (!found) new obsidian.Notice(L("Не нашёл это дело в заметке: похоже, строку уже изменили.", "Could not find this task in the note; the line seems to have changed."));
    return found;
  }
  // быстрая мысль — строкой в журнал сегодняшнего дня
  async quickNote(text) {
    const daily = this.plugin.daily;
    const f = daily && typeof daily.ensureDay === "function" ? await daily.ensureDay(new Date()) : null;
    if (!(f instanceof obsidian.TFile)) throw new Error("no daily note");
    const d = new Date(), hm = (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes();
    await this.app.vault.process(f, (data) => data.replace(/\s*$/, "") + (data.trim() ? "\n" : "") + "- " + hm + " " + text + "\n");
    return f.basename;
  }
  async openNote(n, ev) { return SpaceNeuronsView.prototype.openNode.call(this, n, ev); }
  async openTask(t) {
    const f = this.app.vault.getAbstractFileByPath(t.path);
    if (!(f instanceof obsidian.TFile)) return;
    let target = null;
    this.app.workspace.iterateRootLeaves((l) => { if (!target && l !== this.leaf && l.view && l.view.getViewType() === "markdown") target = l; });
    if (!target) target = this.app.workspace.getLeaf("tab");
    await target.openFile(f, { eState: { line: t.line } });
    this.app.workspace.setActiveLeaf(target, { focus: true });
  }
}
