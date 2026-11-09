/* Язык интерфейса Flora: английский по умолчанию, русский — если Obsidian на русском.
   Глобальные помощники видны во всех файлах сборки (core.js идёт первым). */
function floraDetectLang() {
  try {
    const pick = (v) => (String(v || "").toLowerCase().startsWith("ru") ? "ru" : "en");
    if (typeof window !== "undefined" && window.FLORA_LANG_OVERRIDE) return pick(window.FLORA_LANG_OVERRIDE);
    return pick(window.localStorage.getItem("language")); // null/"" — английский Obsidian
  } catch (e) {
    return "en";
  }
}
let FLORA_LANG = floraDetectLang();
function L(ru, en) { return FLORA_LANG === "ru" ? ru : en; }
// plural(n, ["нейрон", "нейрона", "нейронов"], ["neuron", "neurons"])
function plural(n, ru, en) {
  if (FLORA_LANG !== "ru" && en) return Math.abs(n) === 1 ? en[0] : en[en.length - 1];
  const m10 = Math.abs(n) % 10, m100 = Math.abs(n) % 100;
  return ru[m10 === 1 && m100 !== 11 ? 0 : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? 1 : 2];
}
function floraNum(n) { return Number(n).toLocaleString(FLORA_LANG === "ru" ? "ru-RU" : "en-US"); }
// значение, зависящее от языка: строится при первом обращении и заново после смены языка
function floraLazy(build) {
  let v, lang = null;
  return function () { if (lang !== FLORA_LANG) { v = build(); lang = FLORA_LANG; } return v; };
}

/* Нейрограф — ядро: сборка графа + живой рендер (Canvas 2D).
   Без зависимостей. Используется и в плагине Obsidian, и в тестовой странице. */
const NG = (function () {
  "use strict";

  // Палитра флуоресцентных белков (приглушённая), как в микроскопии Brainbow
  const PALETTE = ["#8fe3a1", "#f2c56b", "#ff8a70", "#7ab8ff", "#e59be0", "#9fe6dc", "#d9b38c", "#c6e07a"];
  const ROOT_COLOR = "#d8d2c4";
  const UNRESOLVED_COLOR = "#59584f";
  const BG = "#050605";

  const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;

  /* ------------------------------------------------------------------ */
  /* Сборка графа                                                        */
  /* ------------------------------------------------------------------ */
  function dirname(p) { const i = p.lastIndexOf("/"); return i < 0 ? "" : p.slice(0, i); }
  function basename(p) { const i = p.lastIndexOf("/"); return i < 0 ? p : p.slice(i + 1); }
  function stripExt(p) { return p.replace(/\.(md|canvas)$/i, ""); }
  function cardLabel(text) {
    const line = (text || "").split("\n").map((s) => s.trim()).find((s) => s && !/^-{3,}$/.test(s)) || "";
    const clean = line.replace(/!?\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, "$1").replace(/[#*_`>~\[\]]/g, "").trim();
    return clean.length > 34 ? clean.slice(0, 33) + "…" : clean || "…";
  }

  /**
   * opts: {
   *   files: string[]                    — все пути хранилища
   *   links: {src: {dst: count}}         — ссылки из заметок (dst "?имя" = несуществующая)
   *   canvases: {path: object}           — распарсенные .canvas
   *   resolve(link, fromPath) → path|null
   *   cards, unresolved, orphans: boolean
   * }
   */
  function buildGraph(o) {
    const nodes = new Map();
    const edges = new Map();
    const fileSet = new Set(o.files);
    const addNode = (id, kind, extra) => {
      if (nodes.has(id)) return nodes.get(id);
      let label, group;
      if (kind === "unresolved") { label = id.slice(1); group = "?"; }
      else { label = stripExt(basename(id)); group = dirname(id); }
      const n = Object.assign({ id, kind, label, group, path: kind === "unresolved" || kind === "card" ? null : id }, extra || {});
      nodes.set(id, n);
      return n;
    };
    const kindOf = (p) => (p.endsWith(".md") ? "note" : p.endsWith(".canvas") ? "canvas" : "attachment");
    const ekey = (a, b) => (a < b ? a + "\u0000" + b : b + "\u0000" + a);
    const addEdge = (a, b, w) => {
      if (!a || !b || a === b) return;
      const k = ekey(a, b);
      const e = edges.get(k);
      if (e) e.w += w || 1; else edges.set(k, { a, b, w: w || 1 });
    };
    const ensure = (p) => {
      if (!p) return null;
      if (p.startsWith("?")) { if (!o.unresolved) return null; addNode(p, "unresolved"); return p; }
      if (!fileSet.has(p)) return null;
      addNode(p, kindOf(p));
      return p;
    };

    for (const p of o.files) if (p.endsWith(".md") || p.endsWith(".canvas")) addNode(p, kindOf(p));

    for (const src in o.links) {
      if (!ensure(src)) continue;
      for (const dst in o.links[src]) addEdge(src, ensure(dst), o.links[src][dst]);
    }

    for (const cpath in o.canvases || {}) {
      const c = o.canvases[cpath];
      if (!c || !Array.isArray(c.nodes) || !fileSet.has(cpath)) continue;
      const idMap = {};
      for (const cn of c.nodes) {
        if (cn.type === "file" && cn.file) {
          const p = ensure(cn.file);
          if (p) { idMap[cn.id] = p; addEdge(cpath, p, 1); }
        } else if ((cn.type === "text" || cn.type === "link") && o.cards) {
          const id = cpath + "#" + cn.id;
          addNode(id, "card", { label: cn.type === "link" ? (cn.url || "").replace(/^https?:\/\//, "").slice(0, 34) : cardLabel(cn.text), group: dirname(cpath), parent: cpath });
          idMap[cn.id] = id;
          if (cn.text) for (const m of cn.text.matchAll(/\[\[([^\]|#]+)/g)) addEdge(id, ensure(o.resolve(m[1], cpath)), 1);
        }
      }
      // связи внутри холста
      const parent = {};
      const find = (x) => (parent[x] === undefined || parent[x] === x ? (parent[x] = x) : (parent[x] = find(parent[x])));
      const deg = {};
      for (const ce of c.edges || []) {
        const a = idMap[ce.fromNode], b = idMap[ce.toNode];
        if (!a || !b) continue;
        addEdge(a, b, 1);
        parent[find(a)] = find(b);
        deg[a] = (deg[a] || 0) + 1; deg[b] = (deg[b] || 0) + 1;
      }
      if (o.cards) {
        // каждую «островную» группу карточек цепляем к холсту одной связью
        const best = {};
        for (const k in idMap) {
          const id = idMap[k];
          if (!nodes.get(id) || nodes.get(id).kind !== "card") continue;
          const r = find(id);
          if (!best[r] || (deg[id] || 0) > (deg[best[r]] || 0)) best[r] = id;
        }
        const hasFile = {};
        for (const k in idMap) { const id = idMap[k]; if (nodes.get(id).kind !== "card") hasFile[find(id)] = true; }
        for (const r in best) if (!hasFile[r]) addEdge(cpath, best[r], 1);
      }
    }

    // степени
    const degOf = () => { const d = {}; for (const e of edges.values()) { d[e.a] = (d[e.a] || 0) + 1; d[e.b] = (d[e.b] || 0) + 1; } return d; };
    let deg = degOf();

    // Дендритное дерево: у «хабов» листья (картинки, карточки) собираются
    // на общих отростках по папкам — получается крона нейрона, а не ёжик.
    const arborize = (hubId, leafIds, level) => {
      const leaves = leafIds.slice().sort((p, q) => (nodes.get(p).group || "").localeCompare(nodes.get(q).group || "") || p.localeCompare(q));
      const CH = level === 0 ? 8 : 5;
      if (leaves.length <= CH + 3) return;
      const made = [];
      for (let i = 0; i < leaves.length; i += CH) {
        const chunk = leaves.slice(i, i + CH);
        if (chunk.length < 3 && made.length) { // хвост — к последней ветке
          const last = made[made.length - 1];
          for (const l of chunk) { const old = edges.get(ekey(hubId, l)); edges.delete(ekey(hubId, l)); addEdge(last, l, old ? old.w : 1); }
          continue;
        }
        const bid = hubId + "::" + level + ":" + i;
        addNode(bid, "branch", { label: "", group: nodes.get(chunk[0]).group, path: null });
        let w = 0;
        for (const l of chunk) { const old = edges.get(ekey(hubId, l)); edges.delete(ekey(hubId, l)); addEdge(bid, l, old ? old.w : 1); w += old ? old.w : 1; }
        addEdge(hubId, bid, w);
        made.push(bid);
      }
      if (made.length > 7) arborize(hubId, made, level + 1);
    };
    for (const n of [...nodes.values()]) {
      if (n.kind === "branch" || n.kind === "attachment") continue;
      const leaves = [];
      for (const e of edges.values()) {
        const other = e.a === n.id ? e.b : e.b === n.id ? e.a : null;
        if (other && deg[other] === 1) leaves.push(other);
      }
      if (leaves.length > 11) arborize(n.id, leaves, 0);
    }
    deg = degOf();
    let list = [...nodes.values()];
    if (!o.orphans) list = list.filter((n) => deg[n.id]);
    // убираем пустые холсты без связей — они просто шум
    list = list.filter((n) => !(n.kind === "canvas" && !deg[n.id] && !o.orphans));
    const keep = new Set(list.map((n) => n.id));
    for (const n of list) n.deg = deg[n.id] || 0;

    // цвета по папкам: самые большие группы получают первые цвета палитры
    const gcount = {};
    for (const n of list) if (n.group && n.group !== "?" && n.kind !== "branch") gcount[n.group] = (gcount[n.group] || 0) + 1;
    const groups = Object.keys(gcount).sort((a, b) => gcount[b] - gcount[a] || a.localeCompare(b));
    const gcolor = {};
    groups.forEach((g, i) => (gcolor[g] = PALETTE[i % PALETTE.length]));
    for (const n of list) n.color = n.kind === "unresolved" ? UNRESOLVED_COLOR : n.group ? gcolor[n.group] : ROOT_COLOR;

    return {
      nodes: list,
      edges: [...edges.values()].filter((e) => keep.has(e.a) && keep.has(e.b)),
      groups: groups.map((g) => ({ name: g, color: gcolor[g], count: gcount[g] })),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Утилиты                                                             */
  /* ------------------------------------------------------------------ */
  function hexRgb(h) { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  function rgbHex(c) { return "#" + ((1 << 24) | ((c[0] | 0) << 16) | ((c[1] | 0) << 8) | (c[2] | 0)).toString(16).slice(1); }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgba(c, a) { return "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + a + ")"; }
  function rand(seed) { // детерминированный генератор, чтобы нейроны не «перерождались» при обновлении
    let s = 2166136261;
    for (let i = 0; i < seed.length; i++) s = Math.imul(s ^ seed.charCodeAt(i), 16777619);
    return function () { s = Math.imul(s ^ (s >>> 15), 2246822507); s = Math.imul(s ^ (s >>> 13), 3266489909); s ^= s >>> 16; return (s >>> 0) / 4294967296; };
  }

  /* ------------------------------------------------------------------ */
  /* Рендер                                                              */
  /* ------------------------------------------------------------------ */

  // сколько кадров рисовать: в покое — экономно, при взаимодействии — плавно
  function frameGate(self, now, busy, maxFps, doc) {
    let fps = busy ? 60 : (maxFps || 30);
    if (doc && typeof doc.hasFocus === "function" && !doc.hasFocus()) fps = Math.min(fps, 12);
    if (now - (self._lastFrame || 0) < 1000 / fps - 2) return false;
    self._lastFrame = now;
    return true;
  }

  class NeuralRenderer {
    constructor(canvas, opts) {
      this.c = canvas;
      this.ctx = canvas.getContext("2d");
      this.opts = Object.assign({ onOpen: null, onHover: null, labels: true, activity: 1, hud: true }, opts || {});
      this.nodes = []; this.edges = []; this.signals = [];
      this.byId = new Map();
      this.cam = { x: 0, y: 0, z: 1 };
      this.time = 0; this.alpha = 1; this.fade = 0;
      this.hover = null; this.hoverMix = 0; this.drag = null;
      this.sprites = new Map();
      this.fireLog = []; this.hz = 0;
      this.dpr = 1; this.w = 1; this.h = 1;
      this.frameMs = 8; this.lod = 2;
      this.rings = [];
      this._grain = this._makeGrain();
      // основной режим — WebGL2 (свечение, сглаживание); 2D-холст становится слоем подписей
      this.scene = null; this.glc = null;
      if (!this.opts.forceCanvas && canvas.parentElement) {
        const glc = (canvas.ownerDocument || document).createElement("canvas");
        glc.className = "ng-gl";
        glc.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;";
        canvas.parentElement.insertBefore(glc, canvas);
        try {
          this.scene = new GLScene(glc);
          this.glc = glc;
          glc.addEventListener("webglcontextlost", (e) => { e.preventDefault(); this.scene = null; glc.remove(); this.glc = null; });
        } catch (err) {
          console.warn(L("Нейрограф: WebGL2 недоступен, включаю простой режим", "Neurograph: WebGL2 is not available, using the simple mode"), err);
          glc.remove();
        }
      }
      canvas.style.position = "absolute"; canvas.style.left = "0"; canvas.style.top = "0";
      this._bind();
      this.resize();
      this._last = performance.now();
      this._loop = this._loop.bind(this);
      this.raf = requestAnimationFrame(this._loop);
    }

    /* ---------- данные ---------- */
    setData(g) {
      const old = this.byId;
      this.byId = new Map();
      const groupsSeen = {};
      let gi = 0;
      for (const n of g.nodes) {
        const o = old.get(n.id);
        const R = rand(n.id);
        const node = Object.assign(n, {
          rgb: hexRgb(n.color),
          r: this._radius(n),
          x: o ? o.x : n.x || 0, y: o ? o.y : n.y || 0, vx: 0, vy: 0,
          phase: R() * Math.PI * 2,
          v: 0, flash: o ? o.flash : 0, refr: 0,
          rate: n.kind === "branch" ? 0 : 0.012 + 0.012 * Math.sqrt(n.deg),
          q: n.kind === "branch" ? 0.3 : (n.kind === "card" || n.kind === "attachment" || n.kind === "unresolved") ? (n.deg <= 1 ? 0.28 : 0.55) : 1 + 0.18 * Math.sqrt(n.deg),
          adj: [],
          seeded: !!o,
        });
        node.r0 = node.r;
        node.dend = this._dendrites(node, R);
        if (!(n.group in groupsSeen)) groupsSeen[n.group] = gi++;
        node.gi = groupsSeen[n.group];
        this.byId.set(n.id, node);
      }
      this.nodes = g.nodes;
      this.groups = g.groups || [];
      this.edges = [];
      for (const e of g.edges) {
        const a = this.byId.get(e.a), b = this.byId.get(e.b);
        if (!a || !b) continue;
        const R = rand(e.a + "|" + e.b);
        const edge = { a, b, w: e.w, phase: R() * 6.283, bend: (R() - 0.5) * 0.5, cx: 0, cy: 0, len: 1, idx: this.edges.length };
        // длина «отростка» чуть разная — кроны получаются неровными, живыми
        edge.lv = a.deg <= 1 || b.deg <= 1 ? 0.5 + R() * 1.3 : 0.85 + R() * 0.4;
        // толстый конец — у более крупного тела
        const big = a.kind === "branch" ? b : b.kind === "branch" ? a : a.r >= b.r ? a : b;
        edge.big = big;
        edge.taper = e.w >= 2 || a.kind === "branch" || b.kind === "branch" || Math.max(a.r, b.r) >= 7;
        edge.fromA = big === a;
        edge.w0 = Math.min(Math.max(big.r * 0.5, 0.9), 0.9 + 0.5 * Math.sqrt(e.w));
        edge.w1 = Math.max(0.45, edge.w0 * (b.kind === "branch" || a.kind === "branch" ? 0.55 : 0.3));
        this.edges.push(edge);
        a.adj.push(edge); b.adj.push(edge);
      }
      // засев позиций: группы по кругу, листья — рядом с соседом
      const ng = Math.max(1, gi);
      const ring = 110 * Math.sqrt(ng);
      const fresh = this.opts.external ? [] : this.nodes.filter((n) => !n.seeded);
      for (const n of fresh) {
        const R = rand("seed" + n.id);
        const ga = (n.gi / ng) * Math.PI * 2;
        const rr = 60 + R() * 220;
        const a = R() * Math.PI * 2;
        n.x = Math.cos(ga) * ring + Math.cos(a) * rr;
        n.y = Math.sin(ga) * ring + Math.sin(a) * rr;
      }
      const sorted = fresh.slice().sort((p, q) => p.deg - q.deg);
      for (const n of sorted) {
        if (n.deg > 2 || !n.adj.length) continue;
        const e = n.adj[0], o = e.a === n ? e.b : e.a;
        const R = rand("leaf" + n.id), a = R() * Math.PI * 2, d = 30 + R() * 60;
        n.x = o.x + Math.cos(a) * d; n.y = o.y + Math.sin(a) * d;
      }
      this.signals = this.signals.filter((s) => this.edges.includes(s.e));
      this.alpha = fresh.length ? 1 : Math.max(this.alpha, 0.3);
      if (!this.opts.external && fresh.length === this.nodes.length) {
        for (let i = 0; i < 420; i++) this._physics(1 / 60);
        this.fade = 0;
        this._needFit = true;
        this.fit(true);
      }
      this._edgeBuckets();
    }

    _radius(n) {
      const d = n.deg;
      switch (n.kind) {
        case "canvas": return Math.min(26, 4.5 + 1.15 * Math.sqrt(d));
        case "note": return Math.min(22, 3.2 + 1.35 * Math.sqrt(d));
        case "attachment": return 1.5 + 0.35 * Math.sqrt(d);
        case "card": return 1.7 + 0.45 * Math.sqrt(d);
        case "branch": return 1.1;
        case "tag": return 3 + 0.9 * Math.sqrt(d);
        default: return 1.6;
      }
    }

    _dendrites(n, R) {
      let count;
      if (n.kind === "note" || n.kind === "canvas") count = 4 + Math.min(7, Math.floor(Math.sqrt(n.deg) * 1.5));
      else if (n.kind === "card" || n.kind === "tag") count = R() < 0.5 ? 2 : 3;
      else if (n.kind === "attachment") count = R() < 0.6 ? 1 : 2;
      else count = 0;
      const out = [];
      const base = R() * Math.PI * 2;
      for (let i = 0; i < count; i++) {
        const ang = base + (i / count) * Math.PI * 2 + (R() - 0.5) * 1.1;
        const len = n.r * (2.2 + R() * 3.4) + (n.kind === "attachment" ? 3 : 0);
        out.push({
          ang, len, curl: (R() - 0.5) * 1.2, ph: R() * 6.283,
          fork: R() < 0.65 ? { at: 0.4 + R() * 0.35, da: (R() < 0.5 ? -1 : 1) * (0.35 + R() * 0.55), len: len * (0.3 + R() * 0.35) } : null,
          fork2: R() < 0.35 ? { at: 0.7 + R() * 0.2, da: (R() < 0.5 ? -1 : 1) * (0.3 + R() * 0.4), len: len * (0.2 + R() * 0.2) } : null,
        });
      }
      return out;
    }

    _edgeBuckets() {
      // связи группируем по цвету и толщине: толстые «стволы» к веткам, тонкие — к листьям
      const b = new Map();
      for (const e of this.edges) {
        const src = e.a.kind === "branch" && e.b.kind !== "branch" ? e.b : e.a;
        const wc = e.w <= 1 ? 0 : e.w <= 4 ? 1 : e.w <= 12 ? 2 : 3;
        const key = src.color + "|" + wc;
        if (!b.has(key)) b.set(key, { rgb: hexRgb(src.color), W: [0.7, 1.1, 1.8, 2.8][wc], list: [] });
        b.get(key).list.push(e);
      }
      this.buckets = b;
    }

    // сужающийся отросток вдоль кривой Безье: от толстого тела к тонкому концу
    _taper(ctx, e, px) {
      const A = e.fromA ? e.a : e.b, B = e.fromA ? e.b : e.a;
      const cx = e.cx, cy = e.cy;
      const N = e.len * this.cam.z > 60 ? 10 : 5;
      const minW = 0.45 * px;
      const L = [], Rr = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N, iu = 1 - u;
        const x = iu * iu * A.x + 2 * iu * u * cx + u * u * B.x;
        const y = iu * iu * A.y + 2 * iu * u * cy + u * u * B.y;
        let tx = 2 * iu * (cx - A.x) + 2 * u * (B.x - cx), ty = 2 * iu * (cy - A.y) + 2 * u * (B.y - cy);
        const tl = Math.sqrt(tx * tx + ty * ty) || 1;
        tx /= tl; ty /= tl;
        // быстро сужается у тела, потом почти ровный
        const k = Math.pow(u, 0.6);
        const hw = Math.max(minW, e.w0 + (e.w1 - e.w0) * k) / 2;
        L.push(x - ty * hw, y + tx * hw); Rr.push(x + ty * hw, y - tx * hw);
      }
      ctx.moveTo(L[0], L[1]);
      for (let i = 2; i < L.length; i += 2) ctx.lineTo(L[i], L[i + 1]);
      for (let i = Rr.length - 2; i >= 0; i -= 2) ctx.lineTo(Rr[i], Rr[i + 1]);
      ctx.closePath();
    }

    /* ---------- физика (как d3-force, с Barnes–Hut) ---------- */
    _physics(dt) {
      const nodes = this.nodes, alpha = this.alpha;
      if (!nodes.length) return;
      // квадродерево
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of nodes) { if (n.x < minX) minX = n.x; if (n.y < minY) minY = n.y; if (n.x > maxX) maxX = n.x; if (n.y > maxY) maxY = n.y; }
      const size = Math.max(maxX - minX, maxY - minY) + 1;
      const root = { x: minX, y: minY, s: size, n: null, k: null, m: 0, cx: 0, cy: 0 };
      const insert = (cell, n, depth) => {
        for (;;) {
          if (!cell.k) {
            if (!cell.n) { cell.n = n; return; }
            if (depth > 18) { (cell.extra = cell.extra || []).push(n); return; }
            const old = cell.n; cell.n = null;
            const h = cell.s / 2;
            cell.k = [
              { x: cell.x, y: cell.y, s: h, n: null, k: null, m: 0, cx: 0, cy: 0 },
              { x: cell.x + h, y: cell.y, s: h, n: null, k: null, m: 0, cx: 0, cy: 0 },
              { x: cell.x, y: cell.y + h, s: h, n: null, k: null, m: 0, cx: 0, cy: 0 },
              { x: cell.x + h, y: cell.y + h, s: h, n: null, k: null, m: 0, cx: 0, cy: 0 },
            ];
            const oi = (old.x >= cell.x + h ? 1 : 0) + (old.y >= cell.y + h ? 2 : 0);
            insert(cell.k[oi], old, depth + 1);
          }
          const h = cell.s / 2;
          cell = cell.k[(n.x >= cell.x + h ? 1 : 0) + (n.y >= cell.y + h ? 2 : 0)];
          depth++;
        }
      };
      for (const n of nodes) insert(root, n, 0);
      const mass = (cell) => {
        if (cell.k) {
          let m = 0, cx = 0, cy = 0;
          for (const k of cell.k) { mass(k); m += k.m; cx += k.cx * k.m; cy += k.cy * k.m; }
          cell.m = m; cell.cx = m ? cx / m : 0; cell.cy = m ? cy / m : 0;
        } else if (cell.n) {
          let m = cell.n.q, cx = cell.n.x * cell.n.q, cy = cell.n.y * cell.n.q;
          if (cell.extra) for (const e of cell.extra) { m += e.q; cx += e.x * e.q; cy += e.y * e.q; }
          cell.m = m; cell.cx = cx / m; cell.cy = cy / m;
        }
      };
      mass(root);
      const STR = -32, theta2 = 0.81, maxD2 = 900 * 900;
      for (const n of nodes) {
        const stack = [root];
        while (stack.length) {
          const c = stack.pop();
          if (!c.m) continue;
          let dx = c.cx - n.x, dy = c.cy - n.y, d2 = dx * dx + dy * dy;
          if (d2 > maxD2) continue;
          if (c.k && (c.s * c.s) / d2 > theta2) { stack.push(c.k[0], c.k[1], c.k[2], c.k[3]); continue; }
          if (!c.k && c.n === n && !c.extra) continue;
          if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
          if (d2 < 25) d2 = Math.sqrt(25 * d2);
          const m = c.n === n ? c.m - n.q : c.m;
          const f = (STR * m * n.q * alpha) / d2;
          n.vx += dx * f; n.vy += dy * f;
        }
      }
      // пружины
      for (const e of this.edges) {
        const a = e.a, b = e.b;
        const L = (16 + 3.2 * (a.r + b.r) + (a.kind === "card" || b.kind === "card" ? 4 : 0)) * e.lv;
        let dx = b.x + b.vx - a.x - a.vx, dy = b.y + b.vy - a.y - a.vy;
        let l = Math.sqrt(dx * dx + dy * dy) || 1;
        const s = a.kind === "branch" || b.kind === "branch" ? 0.75 : 0.9 / Math.min(a.deg || 1, b.deg || 1);
        l = ((l - L) / l) * alpha * s;
        dx *= l; dy *= l;
        const bias = (a.deg || 1) / ((a.deg || 1) + (b.deg || 1));
        b.vx -= dx * bias; b.vy -= dy * bias;
        a.vx += dx * (1 - bias); a.vy += dy * (1 - bias);
      }
      // гравитация к центру + «дыхание»
      const t = this.time;
      for (const n of nodes) {
        const g = n.deg ? 0.02 : 0.045;
        n.vx -= n.x * g * alpha; n.vy -= n.y * g * alpha;
        n.vx += Math.sin(t * 0.37 + n.phase) * 0.012;
        n.vy += Math.cos(t * 0.31 + n.phase * 1.3) * 0.012;
      }
      for (const n of nodes) {
        if (this.drag && this.drag.node === n) { n.vx = n.vy = 0; continue; }
        n.vx *= 0.6; n.vy *= 0.6;
        const sp = n.vx * n.vx + n.vy * n.vy;
        if (sp > 400) { const k = 20 / Math.sqrt(sp); n.vx *= k; n.vy *= k; }
        n.x += n.vx; n.y += n.vy;
      }
      this.alpha += (0.035 - this.alpha) * 0.007;
    }

    /* ---------- нервная активность ---------- */
    fire(n, from, strong) {
      if (n.refr > 0 && !strong) return;
      n.flash = 1; n.v = 0;
      n.refr = 1.4 + Math.random() * 1.2;
      this.fireLog.push(this.time);
      if (n.r >= 3 && this.rings.length < 60) this.rings.push({ n, t: 0 });
      if (this.signals.length > 420) return;
      const out = n.adj.filter((e) => e !== from);
      if (!out.length) return;
      const want = n.kind === "branch" ? out.length * 0.75 : strong ? Math.min(out.length, 6 + Math.sqrt(out.length) * 1.5) : Math.min(out.length, 1 + Math.sqrt(out.length) * 0.9);
      const p = want / out.length;
      for (const e of out) {
        if (Math.random() > p) continue;
        const forward = e.a === n;
        this.signals.push({ e, fwd: forward, t: 0, sp: 110 + Math.random() * 90, src: n });
      }
    }

    _activity(dt) {
      const act = this.opts.activity;
      for (const n of this.nodes) {
        n.flash *= Math.exp(-dt * 2.6);
        n.v *= Math.exp(-dt * 1.1);
        if (n.refr > 0) n.refr -= dt;
        if (act > 0 && Math.random() < n.rate * act * dt) this.fire(n, null);
      }
      for (let i = this.signals.length - 1; i >= 0; i--) {
        const s = this.signals[i];
        s.t += (s.sp * dt) / s.e.len;
        if (s.t >= 1) {
          this.signals.splice(i, 1);
          const tgt = s.fwd ? s.e.b : s.e.a;
          tgt.v += 0.62 + 0.08 * Math.min(4, s.e.w) + (tgt.deg <= 2 ? 0.4 : 0);
          tgt.flash = Math.max(tgt.flash, 0.35);
          if (tgt.v >= 1) this.fire(tgt, s.e);
        }
      }
      for (const r of this.rings) r.t += dt;
      this.rings = this.rings.filter((r) => r.t < 1.3);
      while (this.fireLog.length && this.fireLog[0] < this.time - 2) this.fireLog.shift();
      this.hz += (this.fireLog.length / 2 - this.hz) * Math.min(1, dt * 2);
    }

    /* ---------- камера ---------- */
    fit(instant) {
      if (!this.nodes.length) return;
      if (this.w < 60 || this.h < 60) { this._needFit = true; return; }
      this._needFit = false;
      const xs = this.nodes.map((n) => n.x).sort((a, b) => a - b);
      const ys = this.nodes.map((n) => n.y).sort((a, b) => a - b);
      const q = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * p)))];
      const x0 = q(xs, 0.04), x1 = q(xs, 0.96), y0 = q(ys, 0.04), y1 = q(ys, 0.96);
      const availW = this.w * (1 - Math.abs(this.opts.fitShift || 0) * 2);
      const z = Math.min(availW / (x1 - x0 + 160), this.h / (y1 - y0 + 160), 2.5);
      const target = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: Math.max(0.05, Math.min(this.opts.maxFitZoom || 2.5, z)) };
      // сдвиг кадра: граф правее, слева место под текст (используется в шапке дня)
      if (this.opts.fitShift) target.x -= (this.w * this.opts.fitShift) / target.z;
      if (instant) this.cam = target; else this.camTarget = target;
    }
    toWorld(sx, sy) { return { x: (sx - this.w / 2) / this.cam.z + this.cam.x, y: (sy - this.h / 2) / this.cam.z + this.cam.y }; }

    /* ---------- ввод ---------- */
    _bind() {
      const c = this.c;
      this._h = {
        down: (ev) => {
          c.setPointerCapture && c.setPointerCapture(ev.pointerId);
          const p = this._pt(ev), n = this._hit(p.x, p.y);
          this.drag = { node: n, sx: p.x, sy: p.y, cx: this.cam.x, cy: this.cam.y, moved: false };
          this.camTarget = null;
          if (n) this.alpha = Math.max(this.alpha, 0.25);
        },
        move: (ev) => {
          const p = this._pt(ev);
          if (this.drag) {
            const dx = p.x - this.drag.sx, dy = p.y - this.drag.sy;
            if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true;
            if (this.drag.node) {
              const w = this.toWorld(p.x, p.y);
              this.drag.node.x = w.x; this.drag.node.y = w.y;
              this.alpha = Math.max(this.alpha, 0.2);
            } else {
              this.cam.x = this.drag.cx - dx / this.cam.z;
              this.cam.y = this.drag.cy - dy / this.cam.z;
            }
            return;
          }
          const n = this._hit(p.x, p.y);
          if (n !== this.hover) {
            this.hover = n;
            c.style.cursor = n ? "pointer" : "grab";
            if (n) this.fire(n, null, true);
            this.opts.onHover && this.opts.onHover(n, ev);
          }
        },
        up: (ev) => {
          const d = this.drag;
          this.drag = null;
          if (d && !d.moved && d.node) {
            if (d.node.path && this.opts.onOpen) this.opts.onOpen(d.node, ev);
            else this.fire(d.node, null, true);
          }
        },
        leave: () => { if (!this.drag) { this.hover = null; this.opts.onHover && this.opts.onHover(null); } },
        wheel: (ev) => {
          ev.preventDefault();
          this.camTarget = null;
          const p = this._pt(ev);
          const before = this.toWorld(p.x, p.y);
          const k = Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015));
          this.cam.z = Math.min(8, Math.max(0.03, this.cam.z * k));
          const after = this.toWorld(p.x, p.y);
          this.cam.x += before.x - after.x; this.cam.y += before.y - after.y;
        },
        dbl: () => this.fit(false),
      };
      if (this.opts.external) {
        c.style.pointerEvents = "none"; // ввод остаётся у обычного графа Obsidian
      } else {
        c.addEventListener("pointerdown", this._h.down);
        c.addEventListener("pointermove", this._h.move);
        c.addEventListener("pointerup", this._h.up);
        c.addEventListener("pointerleave", this._h.leave);
        if (!this.opts.noWheel) c.addEventListener("wheel", this._h.wheel, { passive: false });
        c.addEventListener("dblclick", this._h.dbl);
        c.style.cursor = "grab";
        c.style.touchAction = "none";
      }
      if (typeof ResizeObserver !== "undefined") { this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(c.parentElement || c); }
    }
    _pt(ev) { const r = this.c.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
    _hit(sx, sy) {
      const w = this.toWorld(sx, sy);
      let best = null, bd = Infinity;
      const minR = 7 / this.cam.z;
      for (const n of this.nodes) {
        if (n.kind === "branch") continue;
        const dx = n.x - w.x, dy = n.y - w.y, d = Math.sqrt(dx * dx + dy * dy);
        const lim = Math.max(n.r * 1.4, minR);
        if (d < lim && d - lim < bd) { bd = d - lim; best = n; }
      }
      return best;
    }
    resize() {
      const p = this.c.parentElement || this.c;
      const w = Math.max(1, p.clientWidth), h = Math.max(1, p.clientHeight);
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = w; this.h = h;
      this.c.width = Math.round(w * this.dpr); this.c.height = Math.round(h * this.dpr);
      this.c.style.width = w + "px"; this.c.style.height = h + "px";
      if (this.scene) this.scene.resize(w, h, Math.min(this.opts.renderScale || 1.5, window.devicePixelRatio || 1));
      this._vig = null;
      if (this._needFit) this.fit(true);
    }
    destroy() {
      this._destroyed = true;
      cancelAnimationFrame(this.raf);
      const c = this.c, h = this._h;
      c.removeEventListener("pointerdown", h.down); c.removeEventListener("pointermove", h.move);
      c.removeEventListener("pointerup", h.up); c.removeEventListener("pointerleave", h.leave);
      c.removeEventListener("wheel", h.wheel); c.removeEventListener("dblclick", h.dbl);
      this._ro && this._ro.disconnect();
      if (this.scene) { this.scene.dispose(); this.scene = null; }
      if (this.glc) { this.glc.remove(); this.glc = null; }
    }

    /* ---------- спрайты ---------- */
    _sprite(color, kind) {
      const key = color + kind;
      let s = this.sprites.get(key);
      if (s) return s;
      const S = 64;
      s = document.createElement("canvas"); s.width = s.height = S;
      const g = s.getContext("2d");
      const c = typeof color === "string" ? hexRgb(color) : color;
      const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      if (kind === "halo") {
        gr.addColorStop(0, rgba(c, 1)); gr.addColorStop(0.25, rgba(c, 0.45)); gr.addColorStop(0.6, rgba(c, 0.1)); gr.addColorStop(1, rgba(c, 0));
      } else { // мягкое облако ткани
        gr.addColorStop(0, rgba(c, 0.6)); gr.addColorStop(0.5, rgba(c, 0.18)); gr.addColorStop(1, rgba(c, 0));
      }
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
      this.sprites.set(key, s);
      return s;
    }
    _makeGrain() {
      const S = 160, c = document.createElement("canvas");
      c.width = c.height = S;
      const g = c.getContext("2d"), d = g.createImageData(S, S);
      for (let i = 0; i < d.data.length; i += 4) {
        const v = Math.random() * 255;
        d.data[i] = v; d.data[i + 1] = v; d.data[i + 2] = v; d.data[i + 3] = 255;
      }
      g.putImageData(d, 0, 0);
      return c;
    }

    /* ---------- кадр ---------- */
    _loop(now) {
      if (this._destroyed) return;
      this.raf = requestAnimationFrame(this._loop);
      if (!this.c.isConnected || this.c.offsetParent === null) { this._last = now; return; }
      if (this.opts.pauseOffscreen) { // встроенная полоса: не рисуем, когда уехала за экран
        const rc = this.c.getBoundingClientRect(), vh = (this.c.ownerDocument.defaultView || window).innerHeight;
        if (rc.bottom < 0 || rc.top > vh) { this._last = now; return; }
      }
      if (this.opts.external) {
        this.opts.sync(this);
        if (this._destroyed) return;
      }
      const cam = this.cam;
      const moved = cam.x !== this._pcx || cam.y !== this._pcy || cam.z !== this._pcz;
      this._pcx = cam.x; this._pcy = cam.y; this._pcz = cam.z;
      const busy = moved || !!this.drag || !!this.hover || !!this.camTarget;
      if (!frameGate(this, now, busy, this.opts.maxFps, this.c.ownerDocument)) return;
      const dt = Math.min(0.05, (now - this._last) / 1000);
      this._last = now;
      this.time += dt;
      const t0 = performance.now();
      const n = this.nodes.length;
      if (!this.opts.external && (n < 1600 || (this._tick = (this._tick || 0) + 1) % 2 === 0)) this._physics(dt);
      this._activity(dt);
      if (this.camTarget) {
        const k = 1 - Math.exp(-dt * 6);
        this.cam.x += (this.camTarget.x - this.cam.x) * k;
        this.cam.y += (this.camTarget.y - this.cam.y) * k;
        this.cam.z += (this.camTarget.z - this.cam.z) * k;
        if (Math.abs(this.camTarget.z - this.cam.z) < 0.001) this.camTarget = null;
      }
      this.fade = Math.min(1, this.fade + dt * 1.6);
      this.hoverMix += ((this.hover ? 1 : 0) - this.hoverMix) * Math.min(1, dt * 8);
      if (this.scene) this._drawGL(); else this._draw();
      this.frameMs = this.frameMs * 0.95 + (performance.now() - t0) * 0.05;
      this.lod = this.frameMs > 22 ? 0 : this.frameMs > 14 ? 1 : 2;
    }

    // изгиб и покачивание связей (общая часть для обоих режимов)
    _curves() {
      const t = this.time;
      for (const e of this.edges) {
        const a = e.a, b = e.b;
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        e.len = len;
        const sway = e.bend + Math.sin(t * 0.55 + e.phase) * 0.07;
        e.cx = (a.x + b.x) / 2 - dy * sway * 0.5;
        e.cy = (a.y + b.y) / 2 + dx * sway * 0.5;
      }
    }

    _drawGL() {
      this._curves();
      const hv = this.hover;
      this._related = hv ? new Set(hv.adj.map((e) => (e.a === hv ? e.b : e.a)).concat([hv])) : null;
      this.scene.render(this);
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.c.width, this.c.height);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      if (this.opts.labels) this._labels(ctx, this._related);
      this._overlay(ctx, true);
    }

    _draw() {
      const ctx = this.ctx, dpr = this.dpr, cam = this.cam, z = cam.z, t = this.time;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, this.c.width, this.c.height);

      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (this.w / 2 - cam.x * z), dpr * (this.h / 2 - cam.y * z));
      const hv = this.hover, hm = this.hoverMix;
      const related = hv ? new Set(hv.adj.map((e) => (e.a === hv ? e.b : e.a)).concat([hv])) : null;
      const dimOf = (nd) => (related && !related.has(nd) ? 1 - 0.75 * hm : 1);
      const fade = this.fade;
      const px = 1 / z; // 1 экранный пиксель в мировых единицах
      // видимая область
      const vw = this.w / z / 2 + 60, vh = this.h / z / 2 + 60;
      const vis = (x, y, m) => Math.abs(x - cam.x) < vw + m && Math.abs(y - cam.y) < vh + m;

      ctx.globalCompositeOperation = "lighter";

      // 1. «ткань» — мягкое свечение, которое сливается в плотных скоплениях
      if (this.lod > 0) {
        for (const n of this.nodes) {
          if (n.kind === "branch") continue;
          const R = n.kind === "attachment" || n.kind === "card" ? 22 : 38 + 7 * Math.sqrt(n.deg);
          if (!vis(n.x, n.y, R)) continue;
          ctx.globalAlpha = (0.075 + 0.1 * n.flash) * fade * dimOf(n);
          ctx.drawImage(this._sprite(n.color, "tissue"), n.x - R, n.y - R, R * 2, R * 2);
        }
      }

      // 2. аксоны/связи — изогнутые, медленно колышутся
      ctx.globalAlpha = 1;
      for (const e of this.edges) {
        const a = e.a, b = e.b;
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        e.len = len;
        const sway = e.bend + Math.sin(t * 0.55 + e.phase) * 0.07;
        e.cx = (a.x + b.x) / 2 - (dy / len) * len * sway * 0.5;
        e.cy = (a.y + b.y) / 2 + (dx / len) * len * sway * 0.5;
      }
      ctx.lineCap = "round";
      const dimE = related ? 1 - 0.8 * hm : 1;
      const skipE = (e) => (hv && (e.a === hv || e.b === hv)) || !vis((e.a.x + e.b.x) / 2, (e.a.y + e.b.y) / 2, e.len / 2);
      for (const bucket of this.buckets.values()) {
        const c = bucket.rgb, list = bucket.list, W = bucket.W;
        // толстые отростки — сужающиеся «дендриты» (заливка)
        ctx.beginPath();
        let anyT = false;
        for (const e of list) {
          if (!e.taper || skipE(e)) continue;
          this._taper(ctx, e, px);
          anyT = true;
        }
        if (anyT) { ctx.fillStyle = rgba(c, 0.4 * fade * dimE); ctx.fill(); }
        // тонкие связи — линии + мягкий ореол
        for (let pass = 0; pass < (this.lod > 1 ? 2 : 1); pass++) {
          ctx.beginPath();
          let any = false;
          for (const e of list) {
            if (e.taper || skipE(e)) continue;
            ctx.moveTo(e.a.x, e.a.y);
            ctx.quadraticCurveTo(e.cx, e.cy, e.b.x, e.b.y);
            any = true;
          }
          if (!any) continue;
          if (pass === 0) { ctx.lineWidth = Math.max(W, 0.8 * px); ctx.strokeStyle = rgba(c, 0.55 * fade * dimE); }
          else { ctx.lineWidth = Math.max(W * 4, 3 * px); ctx.strokeStyle = rgba(c, 0.06 * fade * dimE); }
          ctx.stroke();
        }
      }
      if (hv) {
        for (const e of hv.adj) {
          ctx.beginPath();
          ctx.moveTo(e.a.x, e.a.y);
          ctx.quadraticCurveTo(e.cx, e.cy, e.b.x, e.b.y);
          ctx.lineWidth = Math.max(1.4, 1.2 * px);
          ctx.strokeStyle = rgba(mix(hv.rgb, [255, 248, 230], 0.3), 0.75 * hm);
          ctx.stroke();
        }
      }

      // 3. дендриты
      ctx.globalAlpha = 1;
      if (this.lod > 0) {
        const byColor = new Map();
        for (const n of this.nodes) {
          if (!n.dend.length || n.r * z < 1.2) continue;
          if (!vis(n.x, n.y, n.r * 8)) continue;
          if (!byColor.has(n.color)) byColor.set(n.color, []);
          byColor.get(n.color).push(n);
        }
        for (const [color, list] of byColor) {
          const c = hexRgb(color);
          ctx.beginPath();
          for (const n of list) {
            for (const d of n.dend) {
              const a = d.ang + Math.sin(t * 0.8 + d.ph) * 0.09;
              const L = d.len * (1 + 0.06 * Math.sin(t * 1.1 + d.ph));
              const sx = n.x + Math.cos(a) * n.r * 0.9, sy = n.y + Math.sin(a) * n.r * 0.9;
              const ex = n.x + Math.cos(a + d.curl * 0.35) * (n.r + L), ey = n.y + Math.sin(a + d.curl * 0.35) * (n.r + L);
              const mx = n.x + Math.cos(a + d.curl) * (n.r + L * 0.55), my = n.y + Math.sin(a + d.curl) * (n.r + L * 0.55);
              ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, ex, ey);
              for (const f of [d.fork, d.fork2]) {
                if (!f) continue;
                const u = f.at, iu = 1 - u;
                const fx = iu * iu * sx + 2 * iu * u * mx + u * u * ex, fy = iu * iu * sy + 2 * iu * u * my + u * u * ey;
                const fa = a + d.curl * 0.5 + f.da + Math.sin(t * 0.9 + d.ph + 1) * 0.12;
                ctx.moveTo(fx, fy);
                ctx.quadraticCurveTo(fx + Math.cos(fa - f.da * 0.4) * f.len * 0.5, fy + Math.sin(fa - f.da * 0.4) * f.len * 0.5, fx + Math.cos(fa) * f.len, fy + Math.sin(fa) * f.len);
              }
            }
          }
          ctx.lineWidth = Math.max(0.55, 0.7 * px);
          ctx.strokeStyle = rgba(c, 0.5 * fade * (related ? 1 - 0.7 * hm : 1));
          ctx.stroke();
        }
      }

      // 4. сигналы (потенциалы действия)
      const white = [255, 246, 226];
      for (const s of this.signals) {
        const e = s.e;
        if (!vis(e.cx, e.cy, e.len)) continue;
        const A = s.fwd ? e.a : e.b, B = s.fwd ? e.b : e.a;
        const spr = this._sprite(A.sigHex || (A.sigHex = rgbHex(mix(A.rgb, white, 0.55))), "halo");
        for (let k = 0; k < 7; k++) {
          const u = s.t - k * 0.022 * (120 / Math.max(40, e.len)) * 1.6;
          if (u < 0) break;
          const iu = 1 - u;
          const x = iu * iu * A.x + 2 * iu * u * e.cx + u * u * B.x;
          const y = iu * iu * A.y + 2 * iu * u * e.cy + u * u * B.y;
          const size = Math.max(2.2 * px, 2.6) * (1 - k * 0.11) * 2.2;
          ctx.globalAlpha = (k === 0 ? 0.95 : 0.5 * (1 - k / 7)) * fade * dimOf(B);
          ctx.drawImage(spr, x - size, y - size, size * 2, size * 2);
        }
      }

      // 5. тела нейронов
      for (const n of this.nodes) {
        if (!vis(n.x, n.y, n.r * 6)) continue;
        const dim = dimOf(n) * fade;
        const fl = n.flash;
        if (n.kind === "branch") { // точка ветвления — маленькое утолщение
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = (0.35 + 0.6 * fl) * dim;
          const hr = 4 + 6 * fl;
          ctx.drawImage(this._sprite(n.color, "halo"), n.x - hr, n.y - hr, hr * 2, hr * 2);
          continue;
        }
        const hr = n.r * (3.2 + 2.5 * fl);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = (0.38 + 0.6 * fl) * dim;
        ctx.drawImage(this._sprite(n.color, "halo"), n.x - hr, n.y - hr, hr * 2, hr * 2);

        ctx.globalCompositeOperation = "source-over";
        const sr = n.r * z;
        const body = mix(n.rgb, [255, 250, 238], 0.15 + 0.7 * fl);
        ctx.fillStyle = rgba(body, (0.92) * dim);
        ctx.beginPath();
        if (sr > 4 && this.lod > 0) {
          const P = 14;
          for (let i = 0; i <= P; i++) {
            const a = (i / P) * Math.PI * 2;
            const rr = n.r * (1 + 0.07 * Math.sin(a * 3 + t * 1.3 + n.phase) + 0.05 * Math.sin(a * 5 - t * 0.9 + n.phase * 2));
            const x = n.x + Math.cos(a) * rr, y = n.y + Math.sin(a) * rr;
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
        } else ctx.arc(n.x, n.y, Math.max(n.r, 0.9 * px), 0, Math.PI * 2);
        ctx.fill();
        if (sr > 3.5) { // ядро
          ctx.fillStyle = rgba(mix(n.rgb, [5, 6, 5], 0.45 - 0.3 * fl), 0.7 * dim);
          ctx.beginPath();
          ctx.arc(n.x + Math.sin(t * 0.5 + n.phase) * n.r * 0.06, n.y + Math.cos(t * 0.4 + n.phase) * n.r * 0.06, n.r * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 6. экранный слой: подписи, HUD, виньетка, зерно
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      if (this.opts.labels) this._labels(ctx, related);
      this._overlay(ctx);
    }

    _labels(ctx, related) {
      const z = this.cam.z, rects = [];
      const cand = [];
      for (const n of this.nodes) {
        const sr = n.r * z;
        let a = 0;
        if (n.kind === "branch") continue;
        if (related && related.has(n)) a = n === this.hover ? 1 : 0.85 * this.hoverMix;
        else if (n.kind === "note" || n.kind === "canvas") a = Math.min(1, Math.max(0, (sr - 3.2) / 3)) * 0.75;
        else if (z > 2.2 && n.kind !== "branch") a = Math.min(0.55, (z - 2.2) * 0.4);
        if (related && !related.has(n)) a *= 1 - 0.8 * this.hoverMix;
        if (a < 0.04) continue;
        const sx = (n.x - this.cam.x) * z + this.w / 2, sy = (n.y - this.cam.y) * z + this.h / 2;
        if (sx < -100 || sx > this.w + 100 || sy < -30 || sy > this.h + 30) continue;
        cand.push({ n, a, sx, sy, pr: (n === this.hover ? 1e6 : 0) + (related && related.has(n) ? 1e5 : 0) + n.r });
      }
      cand.sort((p, q) => q.pr - p.pr);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const FONT = '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';
      let shown = 0;
      for (const c of cand) {
        if (shown > 70) break;
        const big = c.n === this.hover;
        ctx.font = (big ? "600 13px " : "500 12px ") + FONT;
        const text = c.n.label;
        const tw = ctx.measureText(text).width;
        const ph = big ? 22 : 19;
        const y = c.sy + c.n.r * z + 6 + ph / 2;
        const r = { x: c.sx - tw / 2 - 8, y: y - ph / 2, w: tw + 16, h: ph };
        if (!big && rects.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y)) continue;
        rects.push(r);
        ctx.globalAlpha = c.a * this.fade;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(r.x, r.y, r.w, r.h, ph / 2); else ctx.rect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = big ? "rgba(255, 255, 255, 0.92)" : "rgba(18, 18, 22, 0.66)";
        ctx.fill();
        if (!big) { ctx.strokeStyle = "rgba(255, 255, 255, 0.08)"; ctx.lineWidth = 1; ctx.stroke(); }
        ctx.fillStyle = big ? "#000000" : "rgba(255, 255, 255, 0.88)";
        ctx.fillText(text, c.sx, y + 0.5);
        shown++;
      }
      ctx.globalAlpha = 1;
    }

    _overlay(ctx, glMode) {
      const w = this.w, h = this.h;
      if (glMode) return this._hud(ctx);
      // виньетка как у окуляра
      if (!this._vig) {
        const v = document.createElement("canvas");
        v.width = Math.ceil(w); v.height = Math.ceil(h);
        const g = v.getContext("2d");
        const R = Math.hypot(w, h) / 2;
        const gr = g.createRadialGradient(w / 2, h / 2, R * 0.35, w / 2, h / 2, R);
        gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,0.78)");
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        this._vig = v;
      }
      ctx.drawImage(this._vig, 0, 0, w, h);
      this._hud(ctx);
    }

    _hud(ctx) {
      if (!this.opts.hud) return;
      // одна капсула: живая точка + «1 018 нейронов  1 214 связей  70 Гц»
      const parts = [
        [floraNum(this.nodes.length), plural(this.nodes.length, ["нейрон", "нейрона", "нейронов"], ["neuron", "neurons"])],
        [floraNum(this.edges.length), plural(this.edges.length, ["связь", "связи", "связей"], ["link", "links"])],
        [floraNum(Math.round(this.hz)), L("Гц", "Hz")],
      ];
      const FONT = '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';
      const boldF = "600 12.5px " + FONT, regF = "400 12.5px " + FONT;
      let w = 30;
      for (const [n, l] of parts) { ctx.font = boldF; w += ctx.measureText(n).width + 4; ctx.font = regF; w += ctx.measureText(l).width + 16; }
      w -= 4;
      const x = 14, y = 12, h = 30;
      ctx.save();
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, h / 2); else ctx.rect(x, y, w, h);
      ctx.fillStyle = "rgba(22, 22, 26, 0.72)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;
      ctx.stroke();
      // живая точка: пульсирует в такт активности
      const pulse = 0.5 + 0.5 * Math.sin(this.time * (2 + Math.min(8, this.hz / 10)));
      ctx.beginPath(); ctx.arc(x + 15, y + h / 2, 3.5 + pulse * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(48, 209, 88, " + (0.55 + 0.45 * pulse) + ")";
      ctx.shadowColor = "rgba(48, 209, 88, 0.8)"; ctx.shadowBlur = 8 * pulse;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.textBaseline = "middle"; ctx.textAlign = "left";
      let cx = x + 28;
      for (const [n, l] of parts) {
        ctx.font = boldF; ctx.fillStyle = "rgba(255, 255, 255, 0.95)"; ctx.fillText(n, cx, y + h / 2 + 0.5); cx += ctx.measureText(n).width + 4;
        ctx.font = regF; ctx.fillStyle = "rgba(235, 235, 245, 0.6)"; ctx.fillText(l, cx, y + h / 2 + 0.5); cx += ctx.measureText(l).width + 16;
      }
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------ */
  /* WebGL2-сцена: сглаженные живые отростки, тела клеток, свечение      */
  /* ------------------------------------------------------------------ */
  function toLin(c) { return [Math.pow(c[0] / 255, 2.2), Math.pow(c[1] / 255, 2.2), Math.pow(c[2] / 255, 2.2)]; }

  const VIEW_HEAD = `#version 300 es
  uniform vec3 u_cam; uniform vec2 u_view;
  vec4 toClip(vec2 w){ vec2 s=(w-u_cam.xy)*u_cam.z; return vec4(s.x/(u_view.x*0.5), -s.y/(u_view.y*0.5), 0.0, 1.0); }
  `;
  const SHADERS = {
    lineV: VIEW_HEAD + `
    layout(location=0) in vec2 a_pos; layout(location=1) in vec3 a_w; layout(location=2) in vec4 a_c;
    out float v_side; out float v_hw; out float v_ext; out vec3 v_col; out float v_int;
    void main(){ gl_Position=toClip(a_pos); v_side=a_w.x; v_hw=a_w.y; v_ext=a_w.z; v_col=a_c.rgb; v_int=a_c.a; }`,
    lineF: `#version 300 es
    precision highp float;
    in float v_side; in float v_hw; in float v_ext; in vec3 v_col; in float v_int;
    out vec4 o;
    void main(){
      float d = abs(v_side) * v_ext;
      float core = 1.0 - smoothstep(v_hw - 0.55, v_hw + 0.55, d);
      float inner = 1.0 - smoothstep(0.0, v_hw + 0.5, d);          // ярче по оси отростка
      float g = max(d - v_hw, 0.0) / max(v_ext - v_hw, 0.001);
      float halo = exp(-g * g * 6.0) * 0.2;
      o = vec4(v_col * v_int * (core * (0.75 + 0.45 * inner) + halo), 0.0);
    }`,
    pointV: VIEW_HEAD + `
    layout(location=0) in vec2 a_q; layout(location=1) in vec3 a_p; layout(location=2) in vec4 a_c; layout(location=3) in float a_k;
    out vec2 v_uv; out vec3 v_c; out float v_i; out float v_k;
    void main(){ gl_Position=toClip(a_p.xy + a_q * a_p.z); v_uv=a_q; v_c=a_c.rgb; v_i=a_c.a; v_k=a_k; }`,
    pointF: `#version 300 es
    precision highp float;
    in vec2 v_uv; in vec3 v_c; in float v_i; in float v_k; out vec4 o;
    void main(){
      float d = length(v_uv);
      if (d > 1.0) discard;
      float a;
      if (v_k < 0.5) a = exp(-d * d * 6.0);                                   // мягкая точка
      else if (v_k < 1.5) a = exp(-pow((d - 0.8) / 0.09, 2.0));               // кольцо (волна кальция)
      else if (v_k < 2.5) a = (1.0 - smoothstep(0.55, 1.0, d)) * (0.6 + 0.4 * smoothstep(0.3, 0.8, d)); // боке
      else a = exp(-d * d * 2.4) * (1.0 - smoothstep(0.72, 1.0, d));         // туманность: широкое мягкое облако
      o = vec4(v_c * v_i * a, 0.0);
    }`,
    somaV: VIEW_HEAD + `
    layout(location=0) in vec2 a_q; layout(location=1) in vec4 a_p; layout(location=2) in vec4 a_c; layout(location=3) in vec2 a_m;
    out vec2 v_uv; out float v_r; out float v_q; out vec3 v_col; out float v_fl; out float v_ph; out float v_dim;
    void main(){ gl_Position=toClip(a_p.xy + a_q * a_p.z * a_p.w); v_uv=a_q; v_r=a_p.z; v_q=a_p.w; v_col=a_c.rgb; v_fl=a_c.a; v_ph=a_m.x; v_dim=a_m.y; }`,
    somaF: `#version 300 es
    precision highp float;
    in vec2 v_uv; in float v_r; in float v_q; in vec3 v_col; in float v_fl; in float v_ph; in float v_dim;
    uniform float u_time; uniform float u_px;
    out vec4 o;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
    void main(){
      float qd = length(v_uv);
      if (qd > 1.0) discard;
      float win = 1.0 - smoothstep(0.55, 1.0, qd);   // плавное затухание к краю заготовки
      vec2 p = v_uv * v_r * v_q;
      float d = length(p);
      float a = atan(p.y, p.x);
      float t = u_time;
      // живая мембрана: несколько медленных волн по контуру
      float wob = 1.0 + 0.075*sin(3.0*a + t*1.1 + v_ph) + 0.045*sin(5.0*a - t*0.8 + v_ph*2.0)
                + 0.03*sin(2.0*a + t*0.55 + v_ph*3.0) + 0.02*sin(8.0*a - t*1.7 + v_ph);
      float R = v_r * wob;
      float aa = u_px * 1.1;
      float body = 1.0 - smoothstep(R - aa, R + aa, d);
      float x = clamp(d / R, 0.0, 1.0);
      float rim = smoothstep(0.5, 1.0, x);
      float gran = noise(p / v_r * 4.5 + v_ph * 7.0 + t * 0.12) * 0.6 + noise(p / v_r * 11.0 - v_ph * 3.0 - t * 0.07) * 0.4;
      vec2 nc = vec2(sin(t*0.45+v_ph), cos(t*0.37+v_ph)) * v_r * 0.07 + vec2(0.1, -0.06) * v_r;
      float nr = v_r * 0.36;
      float dn = length(p - nc);
      float nuc = 1.0 - smoothstep(nr - aa, nr + aa, dn);
      float nucEdge = smoothstep(nr * 0.6, nr, dn) * nuc;
      float nucleolus = 1.0 - smoothstep(nr*0.3 - aa, nr*0.3 + aa, length(p - nc - vec2(0.32, -0.22) * nr));
      float bright = 0.5 + 0.8 * rim + 0.3 * (gran - 0.5);
      bright *= 1.0 - nuc * 0.62;
      bright += nucEdge * 0.25 + nucleolus * 0.55;
      vec3 col = v_col * bright * body;
      col += vec3(1.0, 0.96, 0.86) * v_fl * 2.6 * body * (0.55 + 0.45 * (1.0 - nuc));
      float outside = max(d - R, 0.0);
      float halo = exp(-outside / (v_r * 0.55 + 2.5 * u_px)) * (0.1 + 1.9 * v_fl);
      col += v_col * halo * (1.0 - body) * win;
      o = vec4(col * v_dim, body * 0.94 * v_dim);
    }`,
    fsV: `#version 300 es
    out vec2 v_uv;
    void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); v_uv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`,
    downF: `#version 300 es
    precision highp float;
    in vec2 v_uv; uniform sampler2D u_src; uniform vec2 u_texel; uniform float u_thresh; out vec4 o;
    vec3 s(vec2 off){ return texture(u_src, v_uv + u_texel * off).rgb; }
    void main(){
      vec3 r = s(vec2(0,0)) * 0.125
        + (s(vec2(-2,-2)) + s(vec2(2,-2)) + s(vec2(-2,2)) + s(vec2(2,2))) * 0.03125
        + (s(vec2(0,-2)) + s(vec2(-2,0)) + s(vec2(2,0)) + s(vec2(0,2))) * 0.0625
        + (s(vec2(-1,-1)) + s(vec2(1,-1)) + s(vec2(-1,1)) + s(vec2(1,1))) * 0.125;
      if (u_thresh > 0.0) { float l = max(r.r, max(r.g, r.b)); r *= max(l - u_thresh, 0.0) / max(l, 1e-4); }
      o = vec4(r, 1.0);
    }`,
    upF: `#version 300 es
    precision highp float;
    in vec2 v_uv; uniform sampler2D u_src; uniform vec2 u_texel; out vec4 o;
    vec3 s(vec2 off){ return texture(u_src, v_uv + u_texel * off).rgb; }
    void main(){
      vec3 r = s(vec2(0,0)) * 4.0
        + (s(vec2(-1,0)) + s(vec2(1,0)) + s(vec2(0,-1)) + s(vec2(0,1))) * 2.0
        + (s(vec2(-1,-1)) + s(vec2(1,-1)) + s(vec2(-1,1)) + s(vec2(1,1)));
      o = vec4(r / 16.0, 1.0);
    }`,
    compF: `#version 300 es
    precision highp float;
    in vec2 v_uv; uniform sampler2D u_scene; uniform sampler2D u_bloom; uniform vec2 u_res; uniform float u_time; uniform float u_bloomK; uniform float u_exp; uniform float u_ca;
    out vec4 o;
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = v_uv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * u_ca;                       // лёгкая хроматическая аберрация объектива
      vec3 col;
      col.r = texture(u_scene, v_uv - off).r;
      col.g = texture(u_scene, v_uv).g;
      col.b = texture(u_scene, v_uv + off).b;
      col += texture(u_bloom, v_uv).rgb * u_bloomK;
      col += vec3(0.0035, 0.0048, 0.004) * (1.0 - smoothstep(0.0, 0.45, r2));   // подсветка поля зрения
      col *= 1.0 - smoothstep(0.12, 0.7, r2) * 0.8;                               // виньетка окуляра
      col = aces(col * u_exp);
      col = pow(col, vec3(1.0 / 2.2));
      // неподвижный дизеринг: убирает ступеньки на плавных тёмных градиентах, не мерцает
      vec2 fp = gl_FragCoord.xy;
      col += (hash(fp) + hash(fp + vec2(17.31, 41.7)) - 1.0) / 255.0;
      o = vec4(col, 1.0);
    }`,
  };

  class PointBatch {
    constructor(gl, quad) {
      this.gl = gl; this.n = 0; this.data = new Float32Array(8 * 2048);
      this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW); this.cap = this.data.byteLength;
      const S = 32;
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 0); gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, S, 12); gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, S, 28); gl.vertexAttribDivisor(3, 1);
      gl.bindVertexArray(null);
    }
    add(x, y, size, c, inten, kind) {
      if ((this.n + 1) * 8 > this.data.length) { const d = new Float32Array(this.data.length * 2); d.set(this.data); this.data = d; }
      const f = this.data, o = this.n * 8;
      f[o] = x; f[o + 1] = y; f[o + 2] = size; f[o + 3] = c[0]; f[o + 4] = c[1]; f[o + 5] = c[2]; f[o + 6] = inten; f[o + 7] = kind;
      this.n++;
    }
    draw() {
      if (!this.n) return;
      const gl = this.gl;
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      if (this.data.byteLength > this.cap) { gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW); this.cap = this.data.byteLength; }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.n * 8);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.n);
    }
  }

  class GLScene {
    constructor(canvas) {
      const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: "high-performance" });
      if (!gl) throw new Error(L("WebGL2 недоступен", "WebGL2 is not available"));
      this.gl = gl; this.canvas = canvas;
      this.hdr = !!gl.getExtension("EXT_color_buffer_float");
      this.pLine = this._prog(SHADERS.lineV, SHADERS.lineF);
      this.pPoint = this._prog(SHADERS.pointV, SHADERS.pointF);
      this.pSoma = this._prog(SHADERS.somaV, SHADERS.somaF);
      this.pDown = this._prog(SHADERS.fsV, SHADERS.downF);
      this.pUp = this._prog(SHADERS.fsV, SHADERS.upF);
      this.pComp = this._prog(SHADERS.fsV, SHADERS.compF);

      this.quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

      // линии (полосы треугольников)
      this.lineData = new Float32Array(9 * 32768); this.lineN = 0;
      this.vaoLine = gl.createVertexArray(); gl.bindVertexArray(this.vaoLine);
      this.bLine = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.bLine);
      gl.bufferData(gl.ARRAY_BUFFER, this.lineData.byteLength, gl.DYNAMIC_DRAW); this.lineCap = this.lineData.byteLength;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 36, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 8);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 36, 20);

      // тела клеток
      this.somaData = new Float32Array(10 * 1024); this.somaN = 0;
      this.vaoSoma = gl.createVertexArray(); gl.bindVertexArray(this.vaoSoma);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.bSoma = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.bSoma);
      gl.bufferData(gl.ARRAY_BUFFER, this.somaData.byteLength, gl.DYNAMIC_DRAW); this.somaCap = this.somaData.byteLength;
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 40, 0); gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 16); gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 40, 32); gl.vertexAttribDivisor(3, 1);
      gl.bindVertexArray(null);

      this.back = new PointBatch(gl, this.quad);
      this.front = new PointBatch(gl, this.quad);
      this.vaoFs = gl.createVertexArray();

      // временные массивы для построения полос
      const M = 64;
      this.SX = new Float32Array(M); this.SY = new Float32Array(M); this.SW = new Float32Array(M);
      this.SR = new Float32Array(M); this.SG = new Float32Array(M); this.SB = new Float32Array(M); this.SI = new Float32Array(M);

      // частицы в жидкости и размытые клетки на других глубинах (боке)
      const R = rand("dust");
      this.dust = [];
      for (let i = 0; i < 260; i++) this.dust.push({ x: R(), y: R(), s: 0.6 + R() * 1.4, ph: R() * 6.28, par: 0.35 + R() * 0.4, b: 0.08 + R() * 0.2 });
      this.bokeh = [];
      for (let i = 0; i < 34; i++) this.bokeh.push({ x: R(), y: R(), s: 18 + R() * 60, ph: R() * 6.28, par: 0.06 + R() * 0.18, c: toLin(hexRgb(PALETTE[(R() * PALETTE.length) | 0])), b: 0.002 + R() * 0.005 });
      this.w = 1; this.h = 1; this.dpr = 1; this.targets = null;
    }

    _prog(vs, fs) {
      const gl = this.gl;
      const mk = (type, src) => {
        const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
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

    resize(w, h, dpr) {
      this.w = w; this.h = h; this.dpr = dpr;
      const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
      this.canvas.width = W; this.canvas.height = H;
      this.canvas.style.width = w + "px"; this.canvas.style.height = h + "px";
      this._free();
      const mips = [];
      let mw = W >> 1, mh = H >> 1;
      while (mips.length < 6 && mw >= 4 && mh >= 4) { mips.push(this._target(mw, mh)); mw >>= 1; mh >>= 1; }
      this.targets = { scene: this._target(W, H), mips };
    }

    dispose() { this._free(); const ext = this.gl.getExtension("WEBGL_lose_context"); ext && ext.loseContext(); }

    /* --- построение геометрии --- */
    _vert(x, y, side, hw, ext, r, g, b, i) {
      if ((this.lineN + 1) * 9 > this.lineData.length) { const d = new Float32Array(this.lineData.length * 2); d.set(this.lineData); this.lineData = d; }
      const f = this.lineData, o = this.lineN * 9;
      f[o] = x; f[o + 1] = y; f[o + 2] = side; f[o + 3] = hw; f[o + 4] = ext; f[o + 5] = r; f[o + 6] = g; f[o + 7] = b; f[o + 8] = i;
      this.lineN++;
    }
    _dupLast() {
      if (!this.lineN) return;
      const f = this.lineData, o = (this.lineN - 1) * 9;
      this._vert(f[o], f[o + 1], f[o + 2], f[o + 3], f[o + 4], f[o + 5], f[o + 6], f[o + 7], f[o + 8]);
    }
    // полоса по точкам SX/SY с полутолщиной SW (мир), цветом и яркостью
    _strip(n, z) {
      if (n < 2) return;
      const SX = this.SX, SY = this.SY, SW = this.SW, SR = this.SR, SG = this.SG, SB = this.SB, SI = this.SI;
      for (let i = 0; i < n; i++) {
        const i0 = i > 0 ? i - 1 : i, i1 = i < n - 1 ? i + 1 : i;
        let tx = SX[i1] - SX[i0], ty = SY[i1] - SY[i0];
        const tl = Math.sqrt(tx * tx + ty * ty) || 1;
        tx /= tl; ty /= tl;
        let hw = SW[i] * z, it = SI[i];
        if (hw < 0.55) { it *= Math.max(0.18, hw / 0.55); hw = 0.55; }
        const ext = hw + 1.8 + hw * 1.4;
        const ew = ext / z, nx = -ty * ew, ny = tx * ew;
        if (i === 0 && this.lineN) { this._dupLast(); this._vert(SX[0] + nx, SY[0] + ny, 1, hw, ext, SR[0], SG[0], SB[0], it); }
        this._vert(SX[i] + nx, SY[i] + ny, 1, hw, ext, SR[i], SG[i], SB[i], it);
        this._vert(SX[i] - nx, SY[i] - ny, -1, hw, ext, SR[i], SG[i], SB[i], it);
      }
    }
    _soma(x, y, r, q, c, inten, fl, ph, dim) {
      if ((this.somaN + 1) * 10 > this.somaData.length) { const d = new Float32Array(this.somaData.length * 2); d.set(this.somaData); this.somaData = d; }
      const f = this.somaData, o = this.somaN * 10;
      f[o] = x; f[o + 1] = y; f[o + 2] = r; f[o + 3] = q;
      f[o + 4] = c[0] * inten; f[o + 5] = c[1] * inten; f[o + 6] = c[2] * inten; f[o + 7] = fl;
      f[o + 8] = ph; f[o + 9] = dim;
      this.somaN++;
    }

    // точка на живом отростке: кривая Безье + бегущая волна вдоль неё
    static edgePoint(e, u, t, out) {
      const A = e.a, B = e.b, iu = 1 - u;
      let x = iu * iu * A.x + 2 * iu * u * e.cx + u * u * B.x;
      let y = iu * iu * A.y + 2 * iu * u * e.cy + u * u * B.y;
      let tx = 2 * iu * (e.cx - A.x) + 2 * u * (B.x - e.cx), ty = 2 * iu * (e.cy - A.y) + 2 * u * (B.y - e.cy);
      const tl = Math.sqrt(tx * tx + ty * ty) || 1;
      const amp = Math.min(4.5, e.len * 0.028) * Math.sin(Math.PI * u);
      const k = 2 + ((e.idx * 7) % 3);
      const wv = amp * Math.sin(u * k * Math.PI - t * 1.4 + e.phase);
      out[0] = x - (ty / tl) * wv; out[1] = y + (tx / tl) * wv;
    }

    // фон-глубина: размытые клетки (боке) и частицы в жидкости, с параллаксом
    _depth(Rn) {
      const cam = Rn.cam, z = cam.z, t = Rn.time, fade = Rn.fade, px = 1 / z;
      const span = Math.max(Rn.w, Rn.h) + 200;
      for (const b of this.bokeh) {
        const sx = (((b.x * span - cam.x * z * b.par + Math.sin(t * 0.05 + b.ph) * 30) % span) + span) % span - 100;
        const sy = (((b.y * span - cam.y * z * b.par + Math.cos(t * 0.04 + b.ph) * 30) % span) + span) % span - 100;
        this.back.add(cam.x + (sx - Rn.w / 2) * px, cam.y + (sy - Rn.h / 2) * px, b.s * px, b.c, b.b * fade, 2);
      }
      const dustC = [0.55, 0.6, 0.52];
      for (const d of this.dust) {
        const sx = (((d.x * span - cam.x * z * d.par + Math.sin(t * 0.21 + d.ph) * 14 + t * 2.5) % span) + span) % span - 100;
        const sy = (((d.y * span - cam.y * z * d.par + Math.cos(t * 0.17 + d.ph) * 14 - t * 1.2) % span) + span) % span - 100;
        this.back.add(cam.x + (sx - Rn.w / 2) * px, cam.y + (sy - Rn.h / 2) * px, d.s * 1.6 * px, dustC, d.b * fade * (0.6 + 0.4 * Math.sin(t * 0.9 + d.ph)), 0);
      }
    }

    _build(Rn) {
      this.lineN = 0; this.somaN = 0; this.back.n = 0; this.front.n = 0;
      const cam = Rn.cam, z = cam.z, t = Rn.time, fade = Rn.fade;
      const hv = Rn.hover, hm = Rn.hoverMix, related = Rn._related;
      const dimOf = (nd) => (related && !related.has(nd) ? 1 - 0.78 * hm : 1);
      const vw = Rn.w / z / 2 + 40, vh = Rn.h / z / 2 + 40;
      const vis = (x, y, m) => Math.abs(x - cam.x) < vw + m && Math.abs(y - cam.y) < vh + m;
      const px = 1 / z;
      const P = [0, 0];
      const SX = this.SX, SY = this.SY, SW = this.SW, SR = this.SR, SG = this.SG, SB = this.SB, SI = this.SI;
      const WHITE = [1, 0.95, 0.85];
      for (const n of Rn.nodes) if (!n.lin) n.lin = toLin(n.rgb);

      this._depth(Rn);
      // «ткань»: широкое мягкое свечение скоплений
      for (const n of Rn.nodes) {
        if (n.kind === "branch") continue;
        const big = n.kind === "note" || n.kind === "canvas";
        const R = big ? 34 + 7 * Math.sqrt(n.deg) : 18;
        if (!vis(n.x, n.y, R)) continue;
        this.back.add(n.x, n.y, R, n.lin, (big ? 0.035 : 0.012) * (1 + 1.5 * n.flash) * fade * dimOf(n), 0);
      }

      // --- аксоны: живые, сужающиеся, с переливом цвета от клетки к клетке ---
      const WCL = [0.7, 1.1, 1.8, 2.8];
      for (const e of Rn.edges) {
        const A = e.a, B = e.b;
        if (!vis((A.x + B.x) / 2, (A.y + B.y) / 2, e.len / 2 + 10)) continue;
        const hot = hv && (A === hv || B === hv);
        const dimE = hot ? 1 : related ? 1 - 0.82 * hm : 1;
        const base = (e.taper ? 0.22 : 0.28) * fade * dimE * (hot ? 1 + 2.2 * hm : 1);
        const W = WCL[e.w <= 1 ? 0 : e.w <= 4 ? 1 : e.w <= 12 ? 2 : 3] * 0.5;
        const N = Math.max(4, Math.min(30, Math.round((e.len * z) / 9)));
        const kE = e.big && e.big.r0 ? Math.min(3, e.big.r / e.big.r0) : 1;
        const ca = A.lin, cb = B.lin;
        for (let i = 0; i <= N; i++) {
          const u = i / N;
          GLScene.edgePoint(e, u, t, P);
          SX[i] = P[0]; SY[i] = P[1];
          if (e.taper) { const uu = e.fromA ? u : 1 - u; SW[i] = (e.w0 + (e.w1 - e.w0) * Math.pow(uu, 0.6)) * 0.5 * kE; }
          else SW[i] = W;
          let r = ca[0] + (cb[0] - ca[0]) * u, g = ca[1] + (cb[1] - ca[1]) * u, b = ca[2] + (cb[2] - ca[2]) * u;
          if (hot) { r += (WHITE[0] - r) * 0.3 * hm; g += (WHITE[1] - g) * 0.3 * hm; b += (WHITE[2] - b) * 0.3 * hm; }
          SR[i] = r; SG[i] = g; SB[i] = b;
          SI[i] = base * (0.85 + 0.15 * Math.sin(u * 9 + e.phase - t * 0.6));
        }
        this._strip(N + 1, z);
        // синаптическая бляшка у цели
        if (B.kind !== "branch" && e.len * z > 30 && Rn.lod > 0) {
          GLScene.edgePoint(e, 1 - Math.min(0.25, (B.r + 2) / e.len), t, P);
          this.front.add(P[0], P[1], Math.max(1.2, 1.6 * px), cb, 0.35 * fade * dimE, 0);
        }
      }

      // --- дендриты: ветвятся, колышутся, вспыхивают вместе с клеткой ---
      if (Rn.lod > 0) {
        for (const n of Rn.nodes) {
          if (!n.dend.length || n.r * z < 0.9) continue;
          if (!vis(n.x, n.y, n.r * 8)) continue;
          const dim = dimOf(n) * fade;
          const ks = n.r0 ? n.r / n.r0 : 1;
          const it = (0.3 + 1.2 * n.flash) * dim;
          const c = n.lin;
          for (const d of n.dend) {
            const M = n.r * z > 4 ? 10 : 5;
            const L = d.len * ks * (1 + 0.05 * Math.sin(t * 0.9 + d.ph));
            const w0 = Math.max(0.35, n.r * 0.17);
            let fx = 0, fy = 0, fth = 0, fw = 0, fx2 = 0, fy2 = 0, fth2 = 0, fw2 = 0;
            for (let i = 0; i <= M; i++) {
              const s = i / M;
              const th = d.ang + d.curl * s * s * 0.9 + 0.1 * Math.sin(t * 0.7 + d.ph + s * 2.6);
              const rho = n.r * 0.82 + L * s;
              SX[i] = n.x + Math.cos(th) * rho; SY[i] = n.y + Math.sin(th) * rho;
              SW[i] = w0 * Math.pow(1 - s, 0.85) + 0.1;
              SR[i] = c[0]; SG[i] = c[1]; SB[i] = c[2];
              SI[i] = it * (1 - 0.4 * s);
              if (d.fork && Math.abs(s - d.fork.at) < 0.5 / M) { fx = SX[i]; fy = SY[i]; fth = th; fw = SW[i]; }
              if (d.fork2 && Math.abs(s - d.fork2.at) < 0.5 / M) { fx2 = SX[i]; fy2 = SY[i]; fth2 = th; fw2 = SW[i]; }
            }
            const tipX = SX[M], tipY = SY[M];
            this._strip(M + 1, z);
            const forks = [[d.fork, fx, fy, fth, fw], [d.fork2, fx2, fy2, fth2, fw2]];
            for (const [f, bx, by, bth, bw] of forks) {
              if (!f || (!bx && !by)) continue;
              const K = 5;
              for (let i = 0; i <= K; i++) {
                const s = i / K;
                const th = bth + f.da + d.curl * 0.4 * s + 0.12 * Math.sin(t * 0.9 + d.ph + 1 + s * 2);
                SX[i] = bx + Math.cos(th) * f.len * ks * s; SY[i] = by + Math.sin(th) * f.len * ks * s;
                SW[i] = bw * 0.75 * Math.pow(1 - s, 0.8) + 0.08;
                SR[i] = c[0]; SG[i] = c[1]; SB[i] = c[2];
                SI[i] = it * 0.85 * (1 - 0.4 * s);
              }
              this._strip(K + 1, z);
            }
            if (n.r * z > 3) this.front.add(tipX, tipY, Math.max(0.9, 1.4 * px), c, 0.28 * it, 0);
          }
        }
      }

      // --- импульсы: яркая голова и светящийся след вдоль аксона ---
      for (const s of Rn.signals) {
        const e = s.e;
        if (!vis(e.cx, e.cy, e.len)) continue;
        const A = s.fwd ? e.a : e.b;
        const dir = s.fwd ? 1 : -1;
        const uh = s.fwd ? s.t : 1 - s.t;
        const tl = Math.min(0.45, 38 / Math.max(1, e.len));
        const K = 10;
        const c = A.lin;
        const cr = c[0] + (WHITE[0] - c[0]) * 0.5, cg = c[1] + (WHITE[1] - c[1]) * 0.5, cb2 = c[2] + (WHITE[2] - c[2]) * 0.5;
        const dimS = dimOf(s.fwd ? e.b : e.a) * fade;
        const hw = Math.max(0.5, (e.taper ? e.w1 : 0.7) * 0.75);
        for (let j = 0; j <= K; j++) {
          const k = j / K;
          let u = uh - dir * tl * (1 - k);
          u = Math.max(0, Math.min(1, u));
          GLScene.edgePoint(e, u, t, P);
          SX[j] = P[0]; SY[j] = P[1];
          SW[j] = hw * (0.4 + 0.6 * k);
          SR[j] = cr; SG[j] = cg; SB[j] = cb2;
          SI[j] = 2.4 * k * k * dimS;
        }
        this._strip(K + 1, z);
        GLScene.edgePoint(e, uh, t, P);
        this.front.add(P[0], P[1], Math.max(3.4, 4 * px), [cr, cg, cb2], 2.2 * dimS, 0);
        this.front.add(P[0], P[1], Math.max(1.1, 1.5 * px), WHITE, 5.5 * dimS, 0);
      }

      // --- волны кальция после вспышки ---
      for (const r of Rn.rings) {
        const k = r.t / 1.3;
        if (k >= 1 || !vis(r.n.x, r.n.y, r.n.r * 8)) continue;
        this.front.add(r.n.x, r.n.y, r.n.r * (1.3 + k * 5.5), r.n.lin, 0.55 * (1 - k) * (1 - k) * fade * dimOf(r.n), 1);
      }

      // --- тела клеток ---
      for (const n of Rn.nodes) {
        if (!vis(n.x, n.y, n.r * 5)) continue;
        const dim = dimOf(n) * fade;
        if (n.kind === "branch") {
          this.front.add(n.x, n.y, Math.max(1.6, 2.2 * px), n.lin, (0.45 + 1.8 * n.flash) * dim, 0);
          continue;
        }
        const r = Math.max(n.r, 0.85 * px);
        const inten = n.kind === "unresolved" ? 0.35 : n.kind === "note" || n.kind === "canvas" ? 0.62 : 0.5;
        const hl = n === hv ? 1 + 0.6 * hm : 1;
        const fall = r * 0.55 + 2.5 * px;                 // длина затухания ореола (как в шейдере)
        const q = Math.max(4.2, 1 + (6 * fall) / r);
        this._soma(n.x, n.y, r, q, n.lin, inten * hl, Math.min(1.4, n.flash), n.phase, dim);
      }
    }

    render(Rn) {
      if (!this.targets) return;
      const gl = this.gl, T = this.targets;
      this._build(Rn);
      const cam = Rn.cam;

      gl.bindFramebuffer(gl.FRAMEBUFFER, T.scene.fbo);
      gl.viewport(0, 0, T.scene.w, T.scene.h);
      gl.clearColor(0.0011, 0.0015, 0.0011, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);

      const setView = (pr) => {
        gl.useProgram(pr.p);
        gl.uniform3f(pr.u.u_cam, cam.x, cam.y, cam.z);
        gl.uniform2f(pr.u.u_view, this.w, this.h);
      };
      setView(this.pPoint);
      this.back.draw();

      if (this.lineN) {
        setView(this.pLine);
        gl.bindVertexArray(this.vaoLine);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bLine);
        if (this.lineData.byteLength > this.lineCap) { gl.bufferData(gl.ARRAY_BUFFER, this.lineData.byteLength, gl.DYNAMIC_DRAW); this.lineCap = this.lineData.byteLength; }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.lineData, 0, this.lineN * 9);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.lineN);
      }

      setView(this.pPoint);
      this.front.draw();

      if (this.somaN) {
        setView(this.pSoma);
        gl.uniform1f(this.pSoma.u.u_time, Rn.time);
        gl.uniform1f(this.pSoma.u.u_px, 1 / cam.z);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindVertexArray(this.vaoSoma);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bSoma);
        if (this.somaData.byteLength > this.somaCap) { gl.bufferData(gl.ARRAY_BUFFER, this.somaData.byteLength, gl.DYNAMIC_DRAW); this.somaCap = this.somaData.byteLength; }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.somaData, 0, this.somaN * 10);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.somaN);
      }

      // --- свечение (bloom): цепочка уменьшений и сложение обратно ---
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
        gl.uniform1f(this.pDown.u.u_thresh, i === 0 ? 0.035 : 0);
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

      // --- итог: тон, виньетка, аберрация, зерно ---
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.useProgram(this.pComp.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.scene.tex);
      gl.uniform1i(this.pComp.u.u_scene, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.mips.length ? T.mips[0].tex : T.scene.tex);
      gl.uniform1i(this.pComp.u.u_bloom, 1);
      gl.uniform2f(this.pComp.u.u_res, this.canvas.width, this.canvas.height);
      gl.uniform1f(this.pComp.u.u_time, Rn.time);
      gl.uniform1f(this.pComp.u.u_bloomK, T.mips.length ? 0.2 : 0);
      gl.uniform1f(this.pComp.u.u_exp, 0.95);
      gl.uniform1f(this.pComp.u.u_ca, this.ca == null ? 0.012 : this.ca);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindVertexArray(null);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Скин для обычного графа Obsidian                                    */
  /* Граф Obsidian сам считает раскладку, фильтры, группы, клики и drag;  */
  /* мы прячем его картинку и рисуем нейроны по его же данным.            */
  /* ------------------------------------------------------------------ */
  function fromCore(r) {
    const edges = new Map(), deg = {};
    for (const l of r.links || []) {
      const a = l.source && l.source.id, b = l.target && l.target.id;
      if (!a || !b || a === b) continue;
      const k = a < b ? a + "\u0000" + b : b + "\u0000" + a;
      const e = edges.get(k);
      if (e) { e.w++; continue; }
      edges.set(k, { a, b, w: 1 });
      deg[a] = (deg[a] || 0) + 1; deg[b] = (deg[b] || 0) + 1;
    }
    const gcount = {};
    const list = (r.nodes || []).map((cn) => {
      const id = cn.id, t = cn.type;
      const kind = t === "tag" ? "tag" : t === "unresolved" ? "unresolved" : t === "attachment" ? "attachment" : /\.canvas$/i.test(id) ? "canvas" : "note";
      const group = kind === "tag" ? "#" : kind === "unresolved" ? "?" : dirname(id);
      if (kind !== "tag" && kind !== "unresolved" && group) gcount[group] = (gcount[group] || 0) + 1;
      return {
        id, kind, group,
        label: kind === "tag" ? id : stripExt(basename(id)),
        path: kind === "tag" || kind === "unresolved" ? null : id,
        deg: deg[id] || 0, x: cn.x || 0, y: cn.y || 0, core: cn,
      };
    });
    const groups = Object.keys(gcount).sort((a, b) => gcount[b] - gcount[a] || a.localeCompare(b));
    const gcolor = {};
    groups.forEach((g, i) => (gcolor[g] = PALETTE[i % PALETTE.length]));
    for (const n of list) {
      const cc = n.core.color; // цвет из «Групп» в настройках графа важнее нашей палитры
      if (cc && cc.a > 0) n.color = "#" + ((cc.rgb | 0) & 0xffffff).toString(16).padStart(6, "0");
      else n.color = n.kind === "tag" ? "#f2c56b" : n.kind === "unresolved" ? UNRESOLVED_COLOR : n.group ? gcolor[n.group] : ROOT_COLOR;
    }
    // Виртуальные точки ветвления: листья большого узла собираются на общих отростках.
    // В раскладке Obsidian их нет — позицию считаем на лету (центр листьев, чуть к хабу).
    const byId = new Map(list.map((n) => [n.id, n]));
    const adj = {};
    for (const e of edges.values()) { (adj[e.a] = adj[e.a] || []).push(e.b); (adj[e.b] = adj[e.b] || []).push(e.a); }
    const ek = (a, b) => (a < b ? a + "\u0000" + b : b + "\u0000" + a);
    const branch = (hub, members, level) => {
      const CH = level === 0 ? 8 : 5;
      if (members.length <= CH + 3) return;
      members.sort((p, q) => (byId.get(p).group || "").localeCompare(byId.get(q).group || "") || p.localeCompare(q));
      const made = [];
      for (let i = 0; i < members.length; i += CH) {
        const chunk = members.slice(i, i + CH);
        if (chunk.length < 3 && made.length) { // хвост — к последней ветке
          const last = made[made.length - 1];
          for (const m of chunk) { edges.delete(ek(hub, m)); edges.set(ek(last.id, m), { a: last.id, b: m, w: 1 }); last.members.push(m); }
          continue;
        }
        const first = byId.get(chunk[0]);
        const b = { id: hub + "::b" + level + ":" + i, kind: "branch", label: "", group: first.group, color: first.color, path: null, deg: chunk.length + 1, members: chunk.slice(), hub, x: first.x, y: first.y };
        for (const m of chunk) { edges.delete(ek(hub, m)); edges.set(ek(b.id, m), { a: b.id, b: m, w: 1 }); }
        edges.set(ek(hub, b.id), { a: hub, b: b.id, w: chunk.length });
        byId.set(b.id, b); list.push(b); made.push(b);
      }
      if (made.length > 7) branch(hub, made.map((m) => m.id), level + 1);
    };
    for (const n of list.slice()) {
      if (n.kind === "attachment" || n.kind === "unresolved") continue;
      const leaves = (adj[n.id] || []).filter((m) => (deg[m] || 0) === 1);
      if (leaves.length > 11) branch(n.id, leaves, 0);
    }
    for (const n of list) n.deg = 0;
    for (const e of edges.values()) { byId.get(e.a).deg++; byId.get(e.b).deg++; }

    return { nodes: list, edges: [...edges.values()], groups: groups.map((g) => ({ name: g, color: gcolor[g], count: gcount[g] })) };
  }

  class CoreSkin {
    /** getRenderer() — возвращает текущий view.renderer обычного графа */
    constructor(getRenderer, opts) {
      opts = opts || {};
      this.getR = getRenderer;
      this.r = getRenderer();
      this.container = this.r.containerEl;
      this.onDead = opts.onDead;
      this.sizeK = opts.sizeK || 0.72;
      const doc = this.container.ownerDocument || document;
      this.ui = doc.createElement("canvas");
      this.ui.className = "ng-skin-ui";
      this.container.prepend(this.ui);
      this.container.classList.add("ng-skinned");
      this.frame = 0; this.sig = null; this.hash = ""; this.lastN = -1; this.lastL = -1;
      this.R = new NeuralRenderer(this.ui, {
        external: true, sync: (R) => this.sync(R),
        hud: !!opts.hud, labels: true, activity: opts.activity == null ? 1 : opts.activity,
      });
    }
    hidePixi(hide) {
      const r = this.r;
      for (const el of [r.px && r.px.view, r.iframeEl]) if (el && el.style) el.style.visibility = hide ? "hidden" : "";
    }
    _hash(nodes, links) {
      let h = links.length | 0;
      for (const n of nodes) {
        const id = n.id || "";
        h = (Math.imul(h, 31) + id.length + id.charCodeAt(0) + (id.charCodeAt(id.length - 1) | 0) * 7) | 0;
        h = (Math.imul(h, 17) + (n.color && n.color.a > 0 ? n.color.rgb | 0 : 3) + (n.type ? n.type.length : 0)) | 0;
      }
      return nodes.length + ":" + h;
    }
    sync(R) {
      const r = this.getR();
      if (!r || r !== this.r || r.destroyed || !this.container.isConnected) { if (this.onDead) this.onDead(); return; }
      this.frame++;
      if (this.frame % 30 === 1) this.hidePixi(true);
      const nodes = r.nodes || [], links = r.links || [];
      if (this.frame % 45 === 1 || nodes.length !== this.lastN || links.length !== this.lastL) {
        this.hash = this._hash(nodes, links);
        this.lastN = nodes.length; this.lastL = links.length;
      }
      if (this.hash !== this.sig) {
        this.sig = this.hash;
        R.setData(fromCore(r));
      }
      // позиции и размеры — прямо из раскладки Obsidian
      const ns = r.nodeScale || 1;
      for (const n of R.nodes) {
        const cn = n.core;
        if (!cn) {
          if (n.members) { // точка ветвления: центр своих листьев, подтянутый к хабу
            let sx = 0, sy = 0, k = 0;
            for (const id of n.members) { const m = R.byId.get(id); if (m) { sx += m.x; sy += m.y; k++; } }
            const hub = R.byId.get(n.hub);
            if (k && hub) { sx /= k; sy /= k; n.x = sx + (hub.x - sx) * 0.38; n.y = sy + (hub.y - sy) * 0.38; }
          }
          continue;
        }
        n.x = cn.x; n.y = cn.y;
        const size = typeof cn.getSize === "function" ? cn.getSize() : 8;
        n.r = Math.max(0.5, size * ns * this.sizeK * (n.kind === "attachment" || n.kind === "unresolved" ? 0.7 : 1));
      }
      // камера: у Obsidian экран = мир * scale + pan (в физических пикселях)
      const dpr = window.devicePixelRatio || 1;
      const sc = r.scale || 1;
      R.cam.z = sc / dpr;
      R.cam.x = ((r.width || R.w) * dpr / 2 - (r.panX || 0)) / sc;
      R.cam.y = ((r.height || R.h) * dpr / 2 - (r.panY || 0)) / sc;
      // наведение: тот же узел, что подсвечивает Obsidian
      const hn = typeof r.getHighlightNode === "function" ? r.getHighlightNode() : r.highlightNode;
      const ours = hn ? R.byId.get(hn.id) || null : null;
      if (ours !== R.hover) {
        R.hover = ours;
        if (ours) R.fire(ours, null, true);
      }
    }
    destroy() {
      this.R.destroy();
      this.ui.remove();
      this.hidePixi(false);
      this.container.classList.remove("ng-skinned");
    }
  }

  /* ------------------------------------------------------------------ */
  /* Скин для холстов (Canvas)                                           */
  /* Карточки остаются HTML Obsidian (их оформляет CSS плагина),         */
  /* а под ними видеокарта рисует ткань: фон, живые связи, импульсы.      */
  /* ------------------------------------------------------------------ */
  const CANVAS_PRESET = { 1: "#ff8a70", 2: "#f2a05a", 3: "#f2c56b", 4: "#8fe3a1", 5: "#7ab8ff", 6: "#e59be0" };
  const BONE = "#d8d2c4";
  function canvasColor(c, fallback) {
    c = String(c || "").trim();
    if (!c) return fallback;
    if (CANVAS_PRESET[c]) return CANVAS_PRESET[c];
    if (/^#[0-9a-f]{6}$/i.test(c)) return c;
    if (/^#[0-9a-f]{3}$/i.test(c)) return "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    return fallback;
  }
  // точка на стороне карточки (как у Obsidian)
  function sidePoint(bb, side) {
    switch (side) {
      case "top": return { x: (bb.minX + bb.maxX) / 2, y: bb.minY };
      case "right": return { x: bb.maxX, y: (bb.minY + bb.maxY) / 2 };
      case "bottom": return { x: (bb.minX + bb.maxX) / 2, y: bb.maxY };
      default: return { x: bb.minX, y: (bb.minY + bb.maxY) / 2 };
    }
  }
  function nodeBBox(n) {
    if (typeof n.getBBox === "function") return n.getBBox();
    return { minX: n.x, minY: n.y, maxX: n.x + n.width, maxY: n.y + n.height };
  }

  class CanvasScene extends GLScene {
    constructor(canvas) {
      super(canvas);
      const R = rand("cosmos");
      // туманности: большие мягкие облака цветов палитры, очень глубоко (почти не двигаются с камерой)
      this.nebula = [];
      for (let i = 0; i < 14; i++) {
        this.nebula.push({ x: R(), y: R(), s: 260 + R() * 520, ph: R() * 6.28, par: 0.03 + R() * 0.07,
          c: toLin(hexRgb(PALETTE[(R() * PALETTE.length) | 0])), b: 0.02 + R() * 0.035 });
      }
      // звёзды: мелкие и редкие крупные, мерцают, на разной глубине
      this.stars = [];
      for (let i = 0; i < 420; i++) {
        const big = R() < 0.06;
        const tint = R();
        this.stars.push({ x: R(), y: R(), s: big ? 1.6 + R() * 1.6 : 0.5 + R() * 0.9, ph: R() * 6.28, tw: 0.4 + R() * 2.2, par: 0.12 + R() * 0.45,
          b: big ? 0.5 + R() * 0.6 : 0.12 + R() * 0.3,
          c: tint < 0.15 ? [0.75, 0.85, 1.0] : tint < 0.28 ? [1.0, 0.86, 0.66] : [0.92, 0.94, 0.9] });
      }
    }
    // космос: туманности + звёзды с параллаксом (экранные координаты, бесшовный повтор)
    _cosmos(S) {
      const cam = S.cam, z = cam.z, t = S.time, fade = S.fade, px = 1 / z;
      const W = S.w, H = S.h;
      const wrap = (v, span) => ((v % span) + span) % span;
      const spanN = Math.max(W, H) + 1400;
      for (const n of this.nebula) {
        const sx = wrap(n.x * spanN - cam.x * z * n.par + Math.sin(t * 0.02 + n.ph) * 60, spanN) - 700;
        const sy = wrap(n.y * spanN - cam.y * z * n.par + Math.cos(t * 0.017 + n.ph) * 60, spanN) - 700;
        const pulse = 0.85 + 0.15 * Math.sin(t * 0.08 + n.ph);
        this.back.add(cam.x + (sx - W / 2) * px, cam.y + (sy - H / 2) * px, n.s * px, n.c, n.b * pulse * fade, 3);
      }
      const spanS = Math.max(W, H) + 200;
      for (const st of this.stars) {
        const sx = wrap(st.x * spanS - cam.x * z * st.par, spanS) - 100;
        const sy = wrap(st.y * spanS - cam.y * z * st.par, spanS) - 100;
        const tw = 0.55 + 0.45 * Math.sin(t * st.tw + st.ph);
        this.back.add(cam.x + (sx - W / 2) * px, cam.y + (sy - H / 2) * px, st.s * 1.8 * px, st.c, st.b * tw * fade, 0);
      }
    }

    _build(S) {
      this.lineN = 0; this.somaN = 0; this.back.n = 0; this.front.n = 0;
      const cam = S.cam, z = cam.z, t = S.time, fade = S.fade, px = 1 / z;
      const vw = S.w / z / 2 + 80, vh = S.h / z / 2 + 80;
      const vis = (x, y, m) => Math.abs(x - cam.x) < vw + m && Math.abs(y - cam.y) < vh + m;
      const SX = this.SX, SY = this.SY, SW = this.SW, SR = this.SR, SG = this.SG, SB = this.SB, SI = this.SI;
      const WHITE = [1, 0.95, 0.85], BONE_L = toLin(hexRgb(BONE));

      this._depth(S);

      this._cosmos(S);

      // свечение вокруг карточек (сами карточки — HTML поверх)
      for (const st of S.nodes) {
        const bb = st.bb;
        const cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
        const R = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) * (st.group ? 0.6 : 0.62) + 24;
        if (!vis(cx, cy, R)) continue;
        this.back.add(cx, cy, R, st.lin, ((st.group ? 0.008 : 0.022) + (st.group ? 0.02 : 0.09) * st.flash) * fade, 0);
      }

      // связи — живые аксоны по кривой Obsidian: толще у начала, бусины, ветвление, поток света
      const P = [0, 0];
      for (const es of S.edges) {
        if (!es.pts) continue;
        const n = es.n;
        let mx = 0, my = 0;
        for (let i = 0; i < n; i++) { mx += es.pts[i * 2]; my += es.pts[i * 2 + 1]; }
        mx /= n; my /= n;
        if (!vis(mx, my, es.len / 2 + 60)) continue;
        const sel = es.selected ? 1 : 0;
        const base = (0.32 + 0.75 * sel + 0.55 * es.glow) * fade;
        const ca = es.ca, cb = es.cb;
        const dir = es.dir == null ? 1 : es.dir;
        const amp = Math.min(6, es.len * 0.022);
        const hw0 = 1.05 + 0.45 * sel;
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1);
          const x = es.pts[i * 2], y = es.pts[i * 2 + 1];
          const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
          const tx = es.pts[i1 * 2] - es.pts[i0 * 2], ty = es.pts[i1 * 2 + 1] - es.pts[i0 * 2 + 1];
          const tl = Math.sqrt(tx * tx + ty * ty) || 1;
          // органичная волна: две бегущие гармоники, гаснут к концам
          const env = Math.sin(Math.PI * u);
          const wv = amp * env * (0.7 * Math.sin(u * 3 * Math.PI - t * 1.25 + es.phase) + 0.3 * Math.sin(u * 7 * Math.PI + t * 0.9 + es.phase * 2));
          SX[i] = x - (ty / tl) * wv; SY[i] = y + (tx / tl) * wv;
          // толщина: «холмик» у начала, тонкая середина, лёгкое утолщение у входа в цель
          const us = dir < 0 ? 1 - u : u;
          const hill = 1 + 1.1 * Math.exp(-us * 9);
          const tail = 1 + 0.35 * Math.exp(-(1 - us) * 14);
          SW[i] = hw0 * hill * tail * (1 - 0.3 * env) * (1 + 0.06 * Math.sin(t * 1.7 + u * 11 + es.phase));
          let r = ca[0] + (cb[0] - ca[0]) * u, g = ca[1] + (cb[1] - ca[1]) * u, bb = ca[2] + (cb[2] - ca[2]) * u;
          if (sel) { r += (WHITE[0] - r) * 0.25; g += (WHITE[1] - g) * 0.25; bb += (WHITE[2] - bb) * 0.25; }
          SR[i] = r; SG[i] = g; SB[i] = bb;
          // медленный поток света по направлению стрелки
          const flowPhase = dir === 0 ? Math.sin(u * 10 - t * 1.6 + es.phase) : Math.sin(us * 12 - t * 2.2 + es.phase);
          const flow = Math.pow(0.5 + 0.5 * flowPhase, 6);
          SI[i] = base * (0.8 + 0.2 * Math.sin(u * 8 + es.phase - t * 0.7) + 0.9 * flow);
        }
        es.wx = SX.slice(0, n); es.wy = SY.slice(0, n); // для импульсов — та же волна
        const cx = es.wx, cy = es.wy;
        this._strip(n, z);

        const at = (u) => { // точка и касательная на ломаной
          const f = Math.max(0, Math.min(1, u)) * (n - 1), i = Math.min(n - 2, Math.floor(f)), k = f - i;
          P[0] = cx[i] + (cx[i + 1] - cx[i]) * k; P[1] = cy[i] + (cy[i + 1] - cy[i]) * k;
          const dx = cx[i + 1] - cx[i], dy = cy[i + 1] - cy[i], l = Math.sqrt(dx * dx + dy * dy) || 1;
          return [dx / l, dy / l];
        };
        const colAt = (u) => [ca[0] + (cb[0] - ca[0]) * u, ca[1] + (cb[1] - ca[1]) * u, ca[2] + (cb[2] - ca[2]) * u];

        // бусины (варикозы) — пульсируют
        if (es.len * z > 60) {
          for (const bd of es.beads) {
            at(bd.u);
            const pulse = 0.7 + 0.3 * Math.sin(t * bd.sp + bd.ph);
            this.front.add(P[0], P[1], Math.max(2.4, 2.6 * px) * (0.8 + 0.4 * pulse), colAt(bd.u), (0.28 + 0.6 * sel + 0.5 * es.glow) * pulse * fade, 0);
          }
        }

        // боковые веточки — колышутся
        if (es.len * z > 90) {
          for (const sp of es.sprouts) {
            const tg = at(sp.u);
            const bx = P[0], by = P[1];
            const nx = -tg[1] * sp.side, ny = tg[0] * sp.side;
            const L = sp.len * (1 + 0.08 * Math.sin(t * 0.9 + sp.ph));
            if (L * z < 5) continue;
            const c = colAt(sp.u);
            const K = 6;
            for (let j = 0; j <= K; j++) {
              const k = j / K;
              const sw = Math.sin(t * 0.8 + sp.ph + k * 2.2) * 0.35 * k;
              const ang = sp.ang + sp.curl * k * k + sw; // наружу под углом вперёд по ходу аксона, с изгибом
              const ux = tg[0] * Math.cos(ang) + nx * Math.sin(ang), uy = tg[1] * Math.cos(ang) + ny * Math.sin(ang);
              SX[j] = bx + ux * L * k; SY[j] = by + uy * L * k;
              SW[j] = hw0 * 0.75 * Math.pow(1 - k, 0.8) + 0.08;
              SR[j] = c[0]; SG[j] = c[1]; SB[j] = c[2];
              SI[j] = base * 0.75 * (1 - 0.45 * k);
            }
            const fx = SX[Math.round((sp.fork ? sp.fork.at : 0.5) * K)], fy = SY[Math.round((sp.fork ? sp.fork.at : 0.5) * K)];
            this._strip(K + 1, z);
            if (sp.fork) {
              const fk = sp.fork, k0 = fk.at;
              const ang0 = sp.ang + sp.curl * k0 * k0 + fk.da;
              for (let j = 0; j <= 4; j++) {
                const k = j / 4;
                const ang = ang0 + Math.sin(t * 1.1 + sp.ph + 1 + k) * 0.25 * k;
                const ux = tg[0] * Math.cos(ang) + nx * Math.sin(ang), uy = tg[1] * Math.cos(ang) + ny * Math.sin(ang);
                SX[j] = fx + ux * L * fk.len * k; SY[j] = fy + uy * L * fk.len * k;
                SW[j] = hw0 * 0.45 * (1 - k) + 0.07;
                SR[j] = c[0]; SG[j] = c[1]; SB[j] = c[2];
                SI[j] = base * 0.6 * (1 - 0.4 * k);
              }
              this._strip(5, z);
            }
          }
        }

        // кисточка у входа в цель: несколько тонких волокон веером
        const endU = dir < 0 ? 0.04 : 0.96, endIdx = dir < 0 ? 0 : n - 1;
        if (es.len * z > 40) {
          const tg = at(endU);
          const ex = cx[endIdx], ey = cy[endIdx];
          const back = dir < 0 ? 1 : -1;
          const c = dir < 0 ? ca : cb;
          for (const tf of es.tuft) {
            const L = tf.len * (1 + 0.1 * Math.sin(t * 1.3 + tf.ph));
            if (L * z < 4) continue;
            const K = 4;
            for (let j = 0; j <= K; j++) {
              const k = j / K;
              const ang = tf.ang + Math.sin(t * 1.2 + tf.ph + k * 2) * 0.22 * k;
              const ux = back * tg[0] * Math.cos(ang) - tg[1] * Math.sin(ang), uy = back * tg[1] * Math.cos(ang) + tg[0] * Math.sin(ang);
              SX[j] = ex + ux * L * k; SY[j] = ey + uy * L * k;
              SW[j] = hw0 * 0.5 * (1 - k) + 0.07;
              SR[j] = c[0]; SG[j] = c[1]; SB[j] = c[2];
              SI[j] = base * 0.7 * (1 - 0.5 * k);
            }
            this._strip(K + 1, z);
            this.front.add(SX[K], SY[K], Math.max(1.3, 1.6 * px), c, (0.2 + 0.4 * sel + 0.4 * es.glow) * fade, 0);
          }
        }

        // синапс у цели и «холмик» у источника
        this.front.add(cx[endIdx], cy[endIdx], Math.max(2.4, 2.8 * px), dir < 0 ? ca : cb, (0.38 + sel + 0.6 * es.glow) * fade, 0);
        const sIdx = dir < 0 ? n - 1 : 0;
        this.front.add(cx[sIdx], cy[sIdx], Math.max(3, 3.4 * px), dir < 0 ? cb : ca, (0.22 + 0.5 * sel + 0.4 * es.glow) * fade, 0);
      }

      // импульсы: яркая голова и след по отростку
      for (const s of S.signals) {
        const es = s.es;
        if (!es.wx) continue;
        const n = es.n;
        const at = (u) => { // точка на ломаной по параметру 0..1
          const f = Math.max(0, Math.min(1, u)) * (n - 1), i = Math.min(n - 2, Math.floor(f)), k = f - i;
          P[0] = es.wx[i] + (es.wx[i + 1] - es.wx[i]) * k; P[1] = es.wy[i] + (es.wy[i + 1] - es.wy[i]) * k;
        };
        const uh = s.rev ? 1 - s.t : s.t, dir = s.rev ? -1 : 1;
        const tl = Math.min(0.4, 70 / Math.max(1, es.len));
        const c = s.rev ? es.cb : es.ca;
        const cr = c[0] + (WHITE[0] - c[0]) * 0.5, cg = c[1] + (WHITE[1] - c[1]) * 0.5, cbb = c[2] + (WHITE[2] - c[2]) * 0.5;
        const K = 12;
        for (let j = 0; j <= K; j++) {
          const k = j / K;
          at(uh - dir * tl * (1 - k));
          SX[j] = P[0]; SY[j] = P[1];
          SW[j] = 1.6 * (0.35 + 0.65 * k);
          SR[j] = cr; SG[j] = cg; SB[j] = cbb;
          SI[j] = 2.6 * k * k * fade;
        }
        this._strip(K + 1, z);
        at(uh);
        this.front.add(P[0], P[1], Math.max(6, 5 * px), [cr, cg, cbb], 2.2 * fade, 0);
        this.front.add(P[0], P[1], Math.max(2.2, 1.8 * px), WHITE, 5 * fade, 0);
      }
    }
  }

  class CanvasSkin {
    /** getCanvas() — возвращает текущий view.canvas холста Obsidian */
    constructor(getCanvas, opts) {
      this.getC = getCanvas;
      this.cv = getCanvas();
      this.wrap = this.cv.wrapperEl;
      this.opts = Object.assign({ activity: 1, onDead: null }, opts || {});
      const doc = this.wrap.ownerDocument || document;
      this.wrap.classList.add("ng-canvas");
      this.glc = doc.createElement("canvas");
      this.glc.className = "ng-canvas-gl";
      this.glc.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;";
      this.wrap.prepend(this.glc);
      try { this.scene = new CanvasScene(this.glc); this.scene.ca = 0.003; }
      catch (e) { this.scene = null; this.glc.remove(); this.wrap.classList.add("ng-canvas-nogl"); }
      this.S = { cam: { x: 0, y: 0, z: 1 }, time: 0, fade: 0, w: 1, h: 1, nodes: [], edges: [], signals: [] };
      this.nstate = new Map(); this.estate = new Map();
      this.hidden = new Set(); this.lastSel = new Set();
      this.resize();
      if (typeof ResizeObserver !== "undefined") { this._ro = new ResizeObserver(() => this.resize()); this._ro.observe(this.wrap); }
      this._last = performance.now();
      this._loop = this._loop.bind(this);
      if (this.scene) this.raf = requestAnimationFrame(this._loop);
    }
    resize() {
      const w = Math.max(1, this.wrap.clientWidth), h = Math.max(1, this.wrap.clientHeight);
      this.S.w = w; this.S.h = h;
      if (this.scene) this.scene.resize(w, h, Math.min(1.25, window.devicePixelRatio || 1));
    }
    _nodeState(node) {
      let st = this.nstate.get(node);
      if (!st) {
        st = { node, flash: 0, refr: Math.random(), cssF: -1, color: null, lin: null, group: false, bb: null };
        this.nstate.set(node, st);
      }
      const col = canvasColor(node.color, BONE);
      if (col !== st.color) { st.color = col; st.lin = toLin(hexRgb(col)); }
      st.group = !!(node.nodeEl && node.nodeEl.classList.contains("canvas-node-group"));
      st.bb = nodeBBox(node);
      return st;
    }
    _edgeState(edge) {
      let es = this.estate.get(edge);
      if (!es) {
        const R = rand(String(edge.id || Math.random()));
        es = { edge, phase: R() * 6.283, glow: 0, pts: null, n: 0, len: 1, dir: 1, beads: [], sprouts: [], tuft: [] };
        const nb = 2 + Math.floor(R() * 4);
        for (let i = 0; i < nb; i++) es.beads.push({ u: 0.15 + R() * 0.7, ph: R() * 6.28, sp: 0.8 + R() * 1.6 });
        const ns = 1 + Math.floor(R() * 3);
        for (let i = 0; i < ns; i++) es.sprouts.push({
          u: 0.18 + R() * 0.64, side: R() < 0.5 ? -1 : 1, len: 12 + R() * 26, ang: 0.6 + R() * 0.7, curl: (R() - 0.5) * 1.2, ph: R() * 6.28,
          fork: R() < 0.55 ? { at: 0.45 + R() * 0.3, da: (R() < 0.5 ? -1 : 1) * (0.4 + R() * 0.5), len: 0.35 + R() * 0.3 } : null,
        });
        const nt = 3 + Math.floor(R() * 3);
        for (let i = 0; i < nt; i++) es.tuft.push({ ang: (i / (nt - 1) - 0.5) * 2.4 + (R() - 0.5) * 0.4, len: 7 + R() * 9, ph: R() * 6.28 });
        this.estate.set(edge, es);
      }
      return es;
    }
    // геометрия связи: от стороны карточки → кривая Безье Obsidian → к стороне карточки
    _geom(es) {
      const e = es.edge, b = e.bezier;
      if (!b || !b.from || !b.to || !b.cp1 || !b.cp2) { es.pts = null; return; }
      const a0 = sidePoint(nodeBBox(e.from.node), e.from.side), a1 = sidePoint(nodeBBox(e.to.node), e.to.side);
      const chord = Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y) + 1;
      const N = Math.max(8, Math.min(46, Math.round((chord * this.S.cam.z) / 14)));
      const n = N + 3;
      if (!es.pts || es.pts.length < n * 2) es.pts = new Float32Array(n * 2 + 16);
      const p = es.pts;
      p[0] = a0.x; p[1] = a0.y;
      for (let i = 0; i <= N; i++) {
        const u = i / N, iu = 1 - u;
        const A = iu * iu * iu, B = 3 * u * iu * iu, C = 3 * u * u * iu, D = u * u * u;
        p[(i + 1) * 2] = A * b.from.x + B * b.cp1.x + C * b.cp2.x + D * b.to.x;
        p[(i + 1) * 2 + 1] = A * b.from.y + B * b.cp1.y + C * b.cp2.y + D * b.to.y;
      }
      p[(N + 2) * 2] = a1.x; p[(N + 2) * 2 + 1] = a1.y;
      es.n = n;
      let len = 0;
      for (let i = 1; i < n; i++) len += Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
      es.len = len;
    }
    _fire(st, outs, strong) {
      st.flash = 1;
      st.refr = 1.1 + Math.random() * 1.2;
      const list = outs.get(st.node);
      if (!list) return;
      for (const o of list) {
        if (this.S.signals.length > 320) break;
        if (!strong && Math.random() > 0.8) continue;
        this.S.signals.push({ es: o.es, rev: o.rev, t: 0, sp: 240 + Math.random() * 160, to: o.to });
      }
    }
    _loop(now) {
      if (this._destroyed) return;
      this.raf = requestAnimationFrame(this._loop);
      const cv = this.getC();
      if (!cv || cv !== this.cv || !this.wrap.isConnected) { if (this.opts.onDead) this.opts.onDead(); return; }
      if (this.wrap.offsetParent === null) { this._last = now; return; }
      const S = this.S;
      const nx = cv.x || 0, ny = cv.y || 0, nz = cv.scale || Math.pow(2, cv.zoom || 0);
      const moved = nx !== S.cam.x || ny !== S.cam.y || nz !== S.cam.z;
      const busy = moved || S.signals.length > 0 && (cv.selection && cv.selection.size > 0);
      if (!frameGate(this, now, busy, this.opts.maxFps, this.wrap.ownerDocument)) return;
      const dt = Math.min(0.05, (now - this._last) / 1000);
      this._last = now;
      S.time += dt;
      S.fade = Math.min(1, S.fade + dt * 1.5);
      S.cam.x = nx; S.cam.y = ny; S.cam.z = nz;
      if (Math.abs(this.wrap.clientWidth - S.w) > 1 || Math.abs(this.wrap.clientHeight - S.h) > 1) this.resize();

      // карточки
      const nodes = [];
      const nodeMap = cv.nodes instanceof Map ? cv.nodes : new Map();
      for (const node of nodeMap.values()) nodes.push(this._nodeState(node));
      if (this.nstate.size > nodes.length + 20) for (const k of [...this.nstate.keys()]) if (!nodeMap.has(k.id)) this.nstate.delete(k);
      S.nodes = nodes;

      // связи: прячем родную линию (стрелки, подписи и клики остаются у Obsidian)
      const sel = cv.selection instanceof Set ? cv.selection : new Set();
      const edgeMap = cv.edges instanceof Map ? cv.edges : new Map();
      const edges = [], outs = new Map();
      for (const edge of edgeMap.values()) {
        if (!edge.from || !edge.to || !edge.from.node || !edge.to.node) continue;
        const es = this._edgeState(edge);
        this._geom(es);
        if (!es.pts) continue;
        const disp = edge.path && edge.path.display;
        if (disp && !this.hidden.has(disp)) { disp.style.opacity = "0"; this.hidden.add(disp); }
        const sa = this._nodeState(edge.from.node), sb = this._nodeState(edge.to.node);
        const own = edge.color ? toLin(hexRgb(canvasColor(edge.color, BONE))) : null;
        es.ca = own || sa.lin; es.cb = own || sb.lin;
        es.selected = sel.has(edge);
        es.glow *= Math.exp(-dt * 2);
        edges.push(es);
        // направление импульсов — по стрелкам
        const fa = edge.from.end === "arrow", ta = edge.to.end !== "none";
        const fwd = ta || !fa, back = fa;
        es.dir = fwd && back ? 0 : back ? -1 : 1;
        if (fwd) { if (!outs.has(edge.from.node)) outs.set(edge.from.node, []); outs.get(edge.from.node).push({ es, rev: false, to: edge.to.node }); }
        if (back) { if (!outs.has(edge.to.node)) outs.set(edge.to.node, []); outs.get(edge.to.node).push({ es, rev: true, to: edge.from.node }); }
      }
      if (this.estate.size > edges.length + 20) for (const k of [...this.estate.keys()]) if (!edgeMap.has(k.id)) this.estate.delete(k);
      S.edges = edges;

      // активность: спонтанные вспышки, цепочки по схеме, отклик на выделение
      const act = this.opts.activity;
      for (const st of nodes) {
        st.flash *= Math.exp(-dt * 2.2);
        if (st.refr > 0) st.refr -= dt;
        if (act > 0 && st.refr <= 0 && outs.has(st.node) && Math.random() < 0.03 * act * dt * Math.sqrt(outs.get(st.node).length)) this._fire(st, outs, false);
      }
      for (const item of sel) {
        if (!this.lastSel.has(item) && this.nstate.has(item)) this._fire(this.nstate.get(item), outs, true);
      }
      this.lastSel = new Set(sel);
      for (let i = S.signals.length - 1; i >= 0; i--) {
        const s = S.signals[i];
        if (!edges.includes(s.es)) { S.signals.splice(i, 1); continue; }
        s.t += (s.sp * dt) / Math.max(30, s.es.len);
        s.es.glow = Math.max(s.es.glow, 0.6);
        if (s.t >= 1) {
          S.signals.splice(i, 1);
          const st = this.nstate.get(s.to);
          if (st) {
            st.flash = Math.max(st.flash, 0.9);
            if (st.refr <= 0 && Math.random() < 0.72) this._fire(st, outs, false);
          }
        }
      }

      this.scene.render(S);

      // вспышка карточки — через CSS-переменную (обводка и свечение в styles.css)
      for (const st of nodes) {
        const f = st.flash < 0.01 ? 0 : st.flash;
        if (Math.abs(f - st.cssF) > 0.03 || (f === 0 && st.cssF !== 0)) {
          st.cssF = f;
          if (st.node.nodeEl) st.node.nodeEl.style.setProperty("--ng-flash", f.toFixed(2));
        }
      }
    }
    destroy() {
      this._destroyed = true;
      cancelAnimationFrame(this.raf);
      this._ro && this._ro.disconnect();
      for (const el of this.hidden) el.style.opacity = "";
      this.hidden.clear();
      for (const st of this.nstate.values()) if (st.node.nodeEl) st.node.nodeEl.style.removeProperty("--ng-flash");
      if (this.scene) this.scene.dispose();
      this.glc.remove();
      this.wrap.classList.remove("ng-canvas", "ng-canvas-nogl");
    }
  }

  return { buildGraph, fromCore, NeuralRenderer, GLScene, CoreSkin, CanvasSkin, PALETTE, ROOT_COLOR };
})();
