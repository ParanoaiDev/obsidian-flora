
/* ------------------------------------------------------------------ */
/* Паук Flora                                                          */
/* Ходит по графу, читает заметки и находит связи, которых ещё нет:     */
/* упоминания без ссылки, общие редкие теги, похожие названия.          */
/* Всё считается на этом компьютере. Заметки паук не меняет: он только  */
/* показывает находки, а ссылку ставит человек.                         */
/* ------------------------------------------------------------------ */
const FloraSpider = (function () {
  "use strict";
  const TAU = 6.283185307179586;
  const KINDS = {
    mention: { color: "#7fd6ff", name: () => L("Упоминания", "Mentions") },
    tags: { color: "#e59be0", name: () => L("Общие теги", "Shared tags") },
    title: { color: "#f2c56b", name: () => L("Похожие названия", "Similar titles") },
  };
  const words = (s) => String(s).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

  /* ---------- поиск недостающих связей ---------- */
  /**
   * app — приложение Obsidian. onProgress(done, total, stage). alive() — false, если поиск отменили.
   * Возвращает [{ kind, a, b, why, snippet, score }]: a — заметка, в которой стоит поставить ссылку на b.
   */
  async function scan(app, onProgress, alive) {
    const files = app.vault.getMarkdownFiles(), N = files.length, rl = app.metadataCache.resolvedLinks || {};
    const linked = (a, b) => !!((rl[a] && rl[a][b]) || (rl[b] && rl[b][a]));
    const found = [], seen = new Set();
    const add = (kind, a, b, why, score, snippet) => {
      const k = a < b ? a + "\u0000" + b : b + "\u0000" + a;
      if (a === b || seen.has(k) || linked(a, b)) return;
      seen.add(k); found.push({ kind, a, b, why, score, snippet: snippet || "" });
    };
    // названия и псевдонимы заметок, по которым ищем упоминания
    const titles = new Map(), tagFiles = new Map(), tokFiles = new Map(), tokOf = new Map();
    let maxW = 1;
    for (const f of files) {
      const cache = app.metadataCache.getFileCache(f) || {}, names = [f.basename];
      const al = cache.frontmatter && (cache.frontmatter.aliases || cache.frontmatter.alias);
      if (Array.isArray(al)) names.push(...al); else if (typeof al === "string") names.push(al);
      for (const nm of names) {
        const w = words(nm), key = w.join(" ");
        if (key.length < 4 || w.length > 6 || /^[\d ]+$/.test(key)) continue;       // слишком короткое или просто дата
        if (!titles.has(key)) titles.set(key, { path: f.path, name: String(nm) });
        if (w.length > maxW) maxW = w.length;
      }
      const tags = typeof obsidian.getAllTags === "function" ? obsidian.getAllTags(cache) || [] : [];
      for (const t of new Set(tags)) { const l = tagFiles.get(t); if (l) l.push(f.path); else tagFiles.set(t, [f.path]); }
      const tk = new Set(words(f.basename).filter((x) => x.length >= 3 && !/^\d+$/.test(x)));
      tokOf.set(f.path, tk);
      for (const t of tk) { const l = tokFiles.get(t); if (l) l.push(f.path); else tokFiles.set(t, [f.path]); }
    }
    // 1. упоминания без ссылки: читаем текст и ищем в нём названия других заметок
    const hits = new Map();
    for (let i = 0; i < N; i++) {
      if (alive && !alive()) return null;
      const f = files[i];
      let text;
      try { text = await app.vault.cachedRead(f); } catch { continue; }
      text = text.slice(0, 200000)
        .replace(/^---\n[\s\S]*?\n---\n?/, " ").replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]*`/g, " ")
        .replace(/!?\[\[[^\]]*\]\]/g, " ").replace(/!?\[[^\]]*\]\([^)]*\)/g, " ").replace(/https?:\/\/\S+/g, " ");
      const ms = [...text.matchAll(/[\p{L}\p{N}]+/gu)], lw = ms.map((m) => m[0].toLowerCase());
      for (let p = 0; p < lw.length; p++) {
        let key = "";
        for (let n = 0; n < maxW && p + n < lw.length; n++) {
          key = n ? key + " " + lw[p + n] : lw[p];
          const t = titles.get(key);
          if (!t || t.path === f.path) continue;
          const st = ms[p].index, en = ms[p + n].index + ms[p + n][0].length;
          const sn = (st > 40 ? "…" : "") + text.slice(Math.max(0, st - 40), Math.min(text.length, en + 40)).replace(/\s+/g, " ").trim() + (en + 40 < text.length ? "…" : "");
          add("mention", f.path, t.path, L("В тексте есть «", "The text says “") + t.name + L("», а ссылки нет", "” but there is no link"), 3 + n * 0.3, sn);
          hits.set(t.path, (hits.get(t.path) || 0) + 1);
        }
      }
      if (i % 12 === 0) { onProgress && onProgress(i + 1, N, 0); await new Promise((r) => setTimeout(r, 0)); }
    }
    onProgress && onProgress(N, N, 1);
    // слишком общее слово (упомянуто в трети хранилища) связью не считаем
    const generic = new Set([...hits].filter(([, c]) => N > 12 && c > N * 0.3).map(([p]) => p));
    let out = found.filter((x) => !generic.has(x.b));
    found.length = 0;
    // 2. общие редкие теги
    const pair = new Map();
    for (const [tag, list] of tagFiles) {
      if (list.length < 2 || list.length > 15) continue;
      const w = 1 / Math.log2(1 + list.length);
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const k = list[i] < list[j] ? list[i] + "\u0000" + list[j] : list[j] + "\u0000" + list[i], e = pair.get(k);
        if (e) { e.s += w; e.t.push(tag); } else pair.set(k, { s: w, t: [tag] });
      }
    }
    for (const [k, e] of [...pair].filter(([, e]) => e.s >= 0.6).sort((p, q) => q[1].s - p[1].s).slice(0, 80)) {
      const [a, b] = k.split("\u0000");
      add("tags", a, b, L("Общие теги: ", "Shared tags: ") + e.t.slice(0, 4).join(" "), 1 + e.s);
    }
    // 3. похожие названия
    const tp = new Map();
    for (const [, list] of tokFiles) {
      if (list.length < 2 || list.length > 20) continue;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const k = list[i] < list[j] ? list[i] + "\u0000" + list[j] : list[j] + "\u0000" + list[i]; tp.set(k, (tp.get(k) || 0) + 1); }
    }
    const sim = [];
    for (const [k, c] of tp) {
      if (c < 2) continue;
      const [a, b] = k.split("\u0000"), ja = c / (tokOf.get(a).size + tokOf.get(b).size - c);
      if (ja >= 0.5) sim.push([a, b, ja]);
    }
    for (const [a, b, ja] of sim.sort((p, q) => q[2] - p[2]).slice(0, 60)) add("title", a, b, L("Похожие названия", "Similar titles"), ja);
    out = out.concat(found).sort((p, q) => q.score - p.score).slice(0, 300);
    onProgress && onProgress(N, N, 2);
    return out;
  }

  /* ---------- паук: тело из нейронов и восемь шагающих лап ---------- */
  const REST = [[38, 64], [72, 58], [106, 58], [142, 68]];         // угол от направления хода и вылет лапы
  const LEGC = ["#7fd6ff", "#a6f5bb", "#ffdf8a", "#ffb0a3", "#ebbcff", "#7ab8ff", "#f2c56b", "#e59be0"];
  class Walker {
    constructor() {
      this.x = 0; this.y = 0; this.h = -Math.PI / 2; this.vx = 0; this.vy = 0; this.s = 1; this.t = 0;
      this.legs = [];
      for (let i = 0; i < 8; i++) this.legs.push({ side: i % 2 ? -1 : 1, k: i >> 1, x: 0, y: 0, fx: 0, fy: 0, tx: 0, ty: 0, st: 1, placed: false });
    }
    rest(l, out) {
      const [deg, R] = REST[l.k], a = this.h + l.side * deg * Math.PI / 180, lead = 0.11;
      out[0] = this.x + Math.cos(a) * R * this.s + this.vx * lead; out[1] = this.y + Math.sin(a) * R * this.s + this.vy * lead;
    }
    place(x, y) { this.x = x; this.y = y; const o = [0, 0]; for (const l of this.legs) { this.rest(l, o); l.x = o[0]; l.y = o[1]; l.st = 1; } }
    // цель — точка на экране; паук идёт к ней, лапы переставляются по две пары накрест
    step(dt, tx, ty) {
      this.t += dt;
      const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy), sp = Math.min(520 * this.s, d * 3.4 + 8);
      const k = 1 - Math.exp(-dt * 7), wx = d > 1.5 ? dx / d * sp : 0, wy = d > 1.5 ? dy / d * sp : 0;
      this.vx += (wx - this.vx) * k; this.vy += (wy - this.vy) * k;
      this.x += this.vx * dt; this.y += this.vy * dt;
      const v = Math.hypot(this.vx, this.vy);
      if (v > 12) { let da = Math.atan2(this.vy, this.vx) - this.h; da = Math.atan2(Math.sin(da), Math.cos(da)); this.h += da * (1 - Math.exp(-dt * 6)); }
      // лапы ходят двумя четвёрками накрест: пока одна четвёрка в воздухе, другая стоит
      const o = [0, 0], need = [0, 0];
      let moving = false;
      for (const l of this.legs) {
        l.g = (l.k + (l.side > 0 ? 0 : 1)) % 2;
        if (l.st < 1) {
          moving = true;
          l.st = Math.min(1, l.st + dt / 0.13);
          const e = l.st * l.st * (3 - 2 * l.st);
          this.rest(l, o); l.tx += (o[0] - l.tx) * 0.5; l.ty += (o[1] - l.ty) * 0.5;       // цель шага догоняет тело
          l.x = l.fx + (l.tx - l.fx) * e; l.y = l.fy + (l.ty - l.fy) * e;
        } else { this.rest(l, o); l.dv = Math.hypot(o[0] - l.x, o[1] - l.y); if (l.dv > need[l.g]) need[l.g] = l.dv; }
      }
      if (!moving) {
        const g = need[0] >= need[1] ? 0 : 1;
        if (need[g] > 20 * this.s) for (const l of this.legs) if (l.g === g && l.dv > 8 * this.s) { this.rest(l, o); l.fx = l.x; l.fy = l.y; l.tx = o[0]; l.ty = o[1]; l.st = 0; }
      }
      for (const l of this.legs) if (Math.hypot(l.x - this.x, l.y - this.y) > 130 * this.s) { this.rest(l, o); l.x = o[0]; l.y = o[1]; l.st = 1; }       // отставшая лапа сразу встаёт на место
      return d;
    }
    // свечение — заранее нарисованные пятна: размытые тени на большом холсте стоят слишком дорого
    glow(doc, col) {
      const k = this.sp || (this.sp = new Map());
      let c = k.get(col);
      if (!c) {
        c = doc.createElement("canvas"); c.width = c.height = 48;
        const x = c.getContext("2d"), gr = x.createRadialGradient(24, 24, 0, 24, 24, 24);
        gr.addColorStop(0, "#fff"); gr.addColorStop(0.18, col); gr.addColorStop(0.5, col + "55"); gr.addColorStop(1, col + "00");
        x.fillStyle = gr; x.fillRect(0, 0, 48, 48);
        k.set(col, c);
      }
      return c;
    }
    // тело рисуется один раз в отдельный холст и потом только поворачивается
    body(doc) {
      const q = Math.round(this.s * 20) / 20;
      if (this.bd && this.bq === q) return this.bd;
      const c = doc.createElement("canvas"), W = 132, H = 84, k = 2 * q;
      c.width = Math.ceil(W * k); c.height = Math.ceil(H * k);
      const x = c.getContext("2d");
      x.scale(k, k); x.translate(82, H / 2);
      const sh = x.createRadialGradient(-14, 0, 6, -14, 0, 64);
      sh.addColorStop(0, "rgba(2,4,10,0.75)"); sh.addColorStop(0.6, "rgba(2,4,10,0.4)"); sh.addColorStop(1, "rgba(2,4,10,0)");
      x.fillStyle = sh; x.fillRect(-82, -H / 2, W, H);
      const glass = (lx, rx, ry, tint) => {
        x.save(); x.translate(lx, 0); x.scale(rx, ry);
        const gr = x.createRadialGradient(-0.25, -0.3, 0.05, 0, 0, 1);
        gr.addColorStop(0, "rgba(255,255,255,0.55)"); gr.addColorStop(0.45, tint); gr.addColorStop(1, "rgba(20,30,60,0.6)");
        x.fillStyle = gr; x.beginPath(); x.arc(0, 0, 1, 0, TAU); x.fill(); x.restore();
        x.strokeStyle = "rgba(255,255,255,0.6)"; x.lineWidth = 1.1; x.beginPath(); x.ellipse(lx, 0, rx, ry, 0, 0, TAU); x.stroke();
      };
      glass(-27, 22, 18, "rgba(138,90,255,0.45)"); glass(4, 13, 11, "rgba(80,150,255,0.48)");
      for (let i = 0; i < 16; i++) { const a = i * 2.4, rr = 0.25 + 0.6 * ((i * 0.618) % 1); x.drawImage(this.glow(doc, LEGC[i % 8]), -27 + Math.cos(a) * 20 * rr - 4, Math.sin(a) * 16 * rr - 4, 8, 8); }
      for (let i = 0; i < 5; i++) { const a = i * TAU / 5; x.fillStyle = ["#7fd6ff", "#ffdf8a", "#ebbcff", "#ffb0a3", "#a6f5bb"][i]; x.beginPath(); x.ellipse(-27 + Math.cos(a) * 5.5, Math.sin(a) * 5.5, 4.2, 2.2, a, 0, TAU); x.fill(); }
      for (const e of [-3.5, 3.5]) x.drawImage(this.glow(doc, "#ffffff"), 13 - 5, e - 5, 10, 10);
      this.bd = c; this.bq = q;
      return c;
    }
    draw(g, doc) {
      const s = this.s, c = Math.cos(this.h), sn = Math.sin(this.h), br = 1 + 0.03 * Math.sin(this.t * 2.2);
      const P = (lx, ly) => [this.x + (c * lx - sn * ly) * s, this.y + (sn * lx + c * ly) * s];
      const white = this.glow(doc, "#ffffff");
      g.lineCap = "round"; g.lineJoin = "round";
      // тело с тёмной подложкой: паук читается и поверх ярких нейронов
      const bd = this.body(doc), bw = 132 * s * br, bh = 84 * s * br;
      g.globalCompositeOperation = "source-over";
      g.save(); g.translate(this.x, this.y); g.rotate(this.h); g.drawImage(bd, -82 * s * br, -bh / 2, bw, bh); g.restore();
      g.globalCompositeOperation = "lighter";
      // лапы: бедро и голень с коленом, на суставах — нейроны
      for (let i = 0; i < 8; i++) {
        const l = this.legs[i], deg = REST[l.k][0], ha = l.side * deg * Math.PI / 180, hip = P(Math.cos(ha) * 11, Math.sin(ha) * 11);
        const dx = l.x - hip[0], dy = l.y - hip[1], d = Math.min(Math.hypot(dx, dy), 78 * s), Lh = 40 * s, lift = l.st < 1 ? Math.sin(Math.PI * l.st) : 0;
        const hgt = Math.sqrt(Math.max(4, Lh * Lh - d * d / 4)) * (0.75 + 0.5 * lift), mx = hip[0] + dx * 0.5, my = hip[1] + dy * 0.5;
        let px = -dy, py = dx; const pl = Math.hypot(px, py) || 1; px /= pl; py /= pl;
        if ((mx + px - this.x) ** 2 + (my + py - this.y) ** 2 < (mx - px - this.x) ** 2 + (my - py - this.y) ** 2) { px = -px; py = -py; }
        const kx = mx + px * hgt * 0.55, ky = my + py * hgt * 0.55;
        g.strokeStyle = LEGC[i];
        g.beginPath(); g.moveTo(hip[0], hip[1]); g.lineTo(kx, ky); g.lineTo(l.x, l.y);
        g.globalAlpha = 0.2; g.lineWidth = 7 * s; g.stroke();          // широкий слабый штрих вместо размытой тени
        g.globalAlpha = 0.95; g.lineWidth = 2.3 * s; g.stroke();
        g.globalAlpha = 1;
        const kr = 5 * s, fr = (4 + 3 * (1 - lift)) * s;
        g.drawImage(white, kx - kr, ky - kr, kr * 2, kr * 2); g.drawImage(white, l.x - fr, l.y - fr, fr * 2, fr * 2);
      }
      return P(15, 0);
    }
  }

  /* ---------- слой поверх графа: паук, луч чтения, нити найденных связей ---------- */
  class Web {
    /**
     * R — рендер графа (Нейрограф или скин обычного графа), host — элемент, в котором он живёт.
     * opts: { app, open(path, ev), icon(el, name), onClose() }
     */
    constructor(R, host, opts) {
      this.R = R; this.host = host; this.opts = opts;
      const doc = (this.doc = host.ownerDocument); this.win = doc.defaultView || window;
      this.cv = doc.createElement("canvas"); this.cv.className = "fsp-canvas"; host.appendChild(this.cv);
      this.g = this.cv.getContext("2d");
      this.w = new Walker();
      this.threads = []; this.queue = []; this.found = []; this.shown = 0; this.focus = null; this.target = null; this.dwell = 0; this.stage = 0; this.done = false;
      this._panel();
      this.alive = true; this.started = false; this.last = 0;
      this._tick = (now) => this._frame(now);
      this.raf = this.win.requestAnimationFrame(this._tick);
      this._run();
    }
    _el(tag, cls, parent, text) { const e = this.doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; }
    _panel() {
      const p = (this.panel = this._el("div", "fsp-panel ng-glass-dark", this.host));
      const head = this._el("div", "fsp-head", p);
      this._el("div", "fsp-title", head, L("Паук", "Spider"));
      this.pct = this._el("div", "fsp-pct", head, "0%");
      const x = this._el("button", "fsp-x", head); x.type = "button"; x.setAttribute("aria-label", L("Закрыть", "Close"));
      if (this.opts.icon) this.opts.icon(x, "x"); else x.textContent = "×";
      x.onclick = () => { this.destroy(); if (this.opts.onClose) this.opts.onClose(); };
      const bar = this._el("div", "fsp-bar", p); this.fill = this._el("div", "fsp-fill", bar);
      this.steps = [L("Читаю заметки", "Reading notes"), L("Сверяю теги и названия", "Comparing tags and titles"), L("Плету связи", "Weaving links")].map((t) => { const r = this._el("div", "fsp-step", p); this._el("span", "fsp-dot", r); r._t = this._el("span", "", r, t); return r; });
      this.sum = this._el("div", "fsp-sum", p);
      this.list = this._el("div", "fsp-list", p);
      this._el("div", "fsp-note", p, L("Паук ничего не меняет в заметках. Нажмите на находку, чтобы открыть заметку и поставить ссылку самому.", "The spider never changes your notes. Click a finding to open the note and add the link yourself."));
      this._stage(0);
    }
    _stage(n) { this.stage = n; this.steps.forEach((r, i) => { r.classList.toggle("is-done", i < n); r.classList.toggle("is-on", i === n); }); }
    _name(path) { const i = path.lastIndexOf("/"); return path.slice(i + 1).replace(/\.md$/i, ""); }
    _row(f) {
      const row = this._el("button", "fsp-row", this.list); row.type = "button";
      const dot = this._el("span", "fsp-kind", row); dot.style.setProperty("--fsp-c", KINDS[f.kind].color);
      const tx = this._el("span", "fsp-tx", row);
      const top = this._el("span", "fsp-pair", tx); this._el("b", "", top, this._name(f.a)); this._el("i", "", top, " → "); this._el("b", "", top, this._name(f.b));
      this._el("span", "fsp-why", tx, f.snippet || f.why);
      row.title = f.why;
      row.onclick = (ev) => this.opts.open && this.opts.open(f.a, ev);
      row.onpointerenter = () => { this.focus = f; this.queue = [{ id: f.a, f, show: true }]; };
      row.onpointerleave = () => { if (this.focus === f) this.focus = null; };
    }
    _summary() {
      const n = this.found.length, c = {};
      for (const f of this.found) c[f.kind] = (c[f.kind] || 0) + 1;
      this.sum.textContent = n ? L("Нашёл ", "Found ") + floraNum(n) + " " + plural(n, ["возможную связь", "возможные связи", "возможных связей"], ["possible link", "possible links"]) + ": " +
        Object.keys(c).map((k) => KINDS[k].name().toLowerCase() + " " + c[k]).join(", ") : L("Недостающих связей не нашёл: всё, что упомянуто, уже связано.", "No missing links found: everything that is mentioned is already linked.");
    }
    async _run() {
      const t0 = this.win.performance.now();
      let res = null;
      try {
        res = await scan(this.opts.app, (d, n, st) => { if (!this.alive) return; const p = n ? d / n : 1; this.readP = st ? 1 : p; this.steps[0]._t.textContent = L("Читаю заметки", "Reading notes") + "  " + floraNum(d) + " / " + floraNum(n); if (st >= 1 && this.stage < 1) this._stage(1); }, () => this.alive);
      } catch (e) { console.error("Flora spider:", e); res = []; }
      if (!this.alive || !res) return;
      // чтение быстрое, а пауку нужно время пройтись: не показываем итог раньше, чем он обойдёт несколько узлов
      const wait = Math.max(0, 2400 - (this.win.performance.now() - t0));
      this.win.setTimeout(() => {
        if (!this.alive) return;
        this.found = res; this._stage(2);
        const live = res.filter((f) => this.R.byId.get(f.a) && this.R.byId.get(f.b)).slice(0, 14);
        this.queue = live.map((f) => ({ id: f.a, f, show: true }));
        this.rest = res.filter((f) => live.indexOf(f) < 0);
        if (!this.queue.length) this._finish();
      }, wait);
    }
    _finish() {
      if (this.done) return;
      this.done = true;
      for (const f of this.rest || []) this._row(f);
      this._stage(3); this.pct.textContent = "100%"; this.fill.style.setProperty("--p", "1");
      this._summary();
      this.panel.classList.add("is-done");
    }
    _xy(id, o) {
      const n = this.R.byId.get(id), R = this.R;
      if (!n) return false;
      o[0] = (n.x - R.cam.x) * R.cam.z + R.w / 2; o[1] = (n.y - R.cam.y) * R.cam.z + R.h / 2;
      return true;
    }
    _frame(now) {
      if (!this.alive) return;
      this.raf = this.win.requestAnimationFrame(this._tick);
      const R = this.R, g = this.g, dt = Math.min(0.05, (now - (this.last || now)) / 1000);
      this.last = now;
      if (!this.cv.isConnected || this.cv.offsetParent === null || !R.w) return;
      // в покое (поиск окончен, паук стоит, курсор не на находке) хватает нескольких кадров в секунду
      const idle = this.done && !this.focus && !this.target && Math.hypot(this.w.vx, this.w.vy) < 3;
      if (idle && now - (this.drawn || 0) < 110) return;
      this.drawn = now;
      const dpr = Math.min(this.win.devicePixelRatio || 1, 1.5), W = Math.round(R.w * dpr), H = Math.round(R.h * dpr);
      if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, R.w, R.h);
      this.w.s = Math.max(0.7, Math.min(1.35, Math.min(R.w, R.h) / 520));
      if (!this.started) { this.started = true; this.w.place(R.w * 0.5, R.h + 90); }
      const a = [0, 0], b = [0, 0];
      // куда идти: к заметке из очереди, а пока читает — по самым связанным узлам графа
      if (!this.target) {
        const q = this.queue.shift();
        if (q) { this.target = q; this.dwell = 0; }
        else if (!this.done && this.stage < 2 && R.nodes.length) {
          if (!this.tour) this.tour = R.nodes.filter((n) => n.kind !== "branch").sort((p, q2) => (q2.deg || 0) - (p.deg || 0)).slice(0, 40);
          const n = this.tour[(Math.random() * this.tour.length) | 0];
          if (n) { this.target = { id: n.id, read: true }; this.dwell = 0; }
        } else if (this.stage === 2 && !this.done) this._finish();
      }
      let tx = this.w.x, ty = this.w.y, onNode = false;
      if (this.target && this._xy(this.target.id, a)) { tx = a[0] - 34 * this.w.s; ty = a[1] + 30 * this.w.s; onNode = true; }
      else if (this.target) this.target = null;
      else if (this.done && !this.focus) { tx = Math.max(70, R.w * 0.16); ty = R.h - 80; }
      const d = this.w.step(dt, tx, ty);
      // прогресс: чтение заметок — первые 60%, плетение — остальное
      if (!this.done) { const p = this.stage < 2 ? 0.6 * (this.readP || 0) : 0.6 + 0.4 * (this.shown / Math.max(1, this.shown + this.queue.length + (this.target ? 1 : 0))), pc = Math.round(p * 100); if (pc !== this.pc) { this.pc = pc; this.pct.textContent = pc + "%"; this.fill.style.setProperty("--p", String(p)); } }
      g.globalCompositeOperation = "lighter";
      // нити найденных связей
      for (const t of this.threads) {
        if (!this._xy(t.f.a, a) || !this._xy(t.f.b, b)) continue;
        t.p = Math.min(1, t.p + dt / 0.5);
        const hot = this.focus === t.f, col = KINDS[t.f.kind].color;
        const al = hot ? 1 : this.focus ? 0.18 : 0.6, ex = a[0] + (b[0] - a[0]) * t.p, ey = a[1] + (b[1] - a[1]) * t.p;
        g.strokeStyle = col;
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(ex, ey);
        g.globalAlpha = al * 0.22; g.lineWidth = hot ? 7 : 5; g.stroke();
        g.globalAlpha = al; g.lineWidth = hot ? 2.2 : 1.3;
        g.setLineDash([7, 6]); g.lineDashOffset = -now / 40; g.stroke();
        g.setLineDash([]);
        for (const q of [a, b]) { g.beginPath(); g.arc(q[0], q[1], (hot ? 9 : 6) + 2 * Math.sin(now / 300), 0, TAU); g.stroke(); }
      }
      g.globalAlpha = 1;
      const head = this.w.draw(g, this.doc);
      g.globalCompositeOperation = "lighter";
      // луч: паук читает заметку, на которой стоит
      if (this.target && onNode && d < 60 * this.w.s && this._xy(this.target.id, a)) {
        this.dwell += dt;
        const gr = g.createLinearGradient(head[0], head[1], a[0], a[1]);
        gr.addColorStop(0, "rgba(160,220,255,0.75)"); gr.addColorStop(1, "rgba(160,220,255,0)");
        const dx = a[0] - head[0], dy = a[1] - head[1], l = Math.hypot(dx, dy) || 1, px = -dy / l * 13, py = dx / l * 13;
        g.fillStyle = gr; g.beginPath(); g.moveTo(head[0], head[1]); g.lineTo(a[0] + px, a[1] + py); g.lineTo(a[0] - px, a[1] - py); g.closePath(); g.fill();
        g.strokeStyle = "rgba(200,235,255,0.9)"; g.lineWidth = 1.4; g.beginPath(); g.arc(a[0], a[1], 8 + 14 * ((this.dwell * 1.6) % 1), 0, TAU); g.globalAlpha = 1 - ((this.dwell * 1.6) % 1); g.stroke(); g.globalAlpha = 1;
        if (this.target.f && this.target.show && !this.target.woven) {
          this.target.woven = true;
          if (!this.threads.some((t) => t.f === this.target.f)) { this.threads.push({ f: this.target.f, p: 0 }); if (!this.done) { this._row(this.target.f); this.shown++; this.sum.textContent = L("Найдено: ", "Found: ") + floraNum(this.shown); } }
          if (typeof R.fire === "function") { const n = R.byId.get(this.target.f.b); if (n) try { R.fire(n, null, true); } catch { /* вспышка — украшение */ } }
        }
        if (this.dwell > (this.target.read ? 0.45 : 0.5) && this.focus !== this.target.f) this.target = null;
      }
      g.globalCompositeOperation = "source-over";
    }
    destroy() {
      this.alive = false;
      this.win.cancelAnimationFrame(this.raf);
      this.cv.remove(); this.panel.remove();
    }
  }
  return { scan, Web, Walker, KINDS };
})();
