
/* ------------------------------------------------------------------ */
/* Живые обои Flora                                                    */
/* Картинка складывается из клеточек-символов, как мозаика, и всё время */
/* тихо движется. Рисуется редко (около 12 кадров в секунду) на обычном */
/* холсте под интерфейсом, поэтому почти ничего не стоит.               */
/* ------------------------------------------------------------------ */
const FloraWalls = (function () {
  "use strict";
  const TAU = 6.283185307179586;
  const hash = (a, b) => { const v = Math.sin(a * 127.1 + (b || 0) * 311.7) * 43758.5453; return v - Math.floor(v); };
  const GLYPH = ["·", "+", "×", "*", "o", "#", "=", "~"];
  const FLORA = ["#5aa9ff", "#ffb347", "#b48cff", "#ff6f91", "#5fe0a0"];

  /* ---------- кисть: сетка клеток ---------- */
  class Brush {
    constructor(g, cell, cols, rows, dark) { this.g = g; this.c = cell; this.W = cols; this.H = rows; this.dark = dark; }
    // одна клетка: плитка и, если просили, символ внутри
    put(x, y, col, a, ch) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= this.W || y >= this.H || a <= 0.01) return;
      const g = this.g, c = this.c;
      g.globalAlpha = a > 1 ? 1 : a; g.fillStyle = col;
      g.fillRect(x * c + 1, y * c + 1, c - 2, c - 2);
      if (ch !== false && c >= 9) {
        g.globalAlpha = Math.min(1, a * 0.6); g.fillStyle = this.dark ? "#ffffff" : "#1b2440";
        g.fillText(ch || GLYPH[(hash(x, y) * GLYPH.length) | 0], x * c + c / 2, y * c + c / 2 + 0.5);
      }
    }
    // круг или овал из клеток; edge — насколько мягче к краю
    disc(cx, cy, rx, ry, col, a, edge) {
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d <= 1) this.put(x, y, col, a * (edge ? 1 - edge * d : 1));
      }
    }
    line(x0, y0, x1, y1, col, a, gap) {
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
      for (let i = 0; i <= n; i++) if (!gap || i % gap === 0) this.put(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, col, a, false);
    }
    stars(n, t, col, top) { for (let i = 0; i < n; i++) this.put(hash(i, 1) * this.W, hash(i, 2) * this.H * (top || 1), col, 0.25 + 0.6 * Math.max(0, Math.sin(t * (0.5 + hash(i, 3)) + i)), "·"); }
  }

  /* ---------- сцены ---------- */
  const LIST = [
    {
      id: "bloom", name: () => L("Цветение", "Bloom"),
      bg: (d) => (d ? ["#0a1024", "#12203a", "#0f2a2a"] : ["#eaf3ff", "#f3ecff", "#e6f7ee"]),
      draw(b, t) {
        const n = Math.max(5, Math.round(b.W / 18)), gr = b.dark ? "#3fae7a" : "#2f9c68";
        for (let i = 0; i < n; i++) {
          const x = (i + 0.5 + (hash(i, 9) - 0.5) * 0.6) * b.W / n, hgt = b.H * (0.28 + 0.34 * hash(i, 4)), open = 0.55 + 0.45 * Math.sin(t * 0.28 + i * 1.7), top = b.H - hgt;
          for (let y = b.H - 1; y > top; y--) b.put(x + Math.sin(y * 0.22 + i + t * 0.4) * 1.1, y, gr, 0.75, "|");
          b.disc(x + 2.2, top + hgt * 0.45, 2, 1, gr, 0.7); b.disc(x - 2.4, top + hgt * 0.62, 2, 1, gr, 0.7);
          const R = 1.4 + 1.9 * open, sway = Math.sin(t * 0.4 + i) * 1.1, col = FLORA[i % 5];
          for (let k = 0; k < 5; k++) { const a = k * TAU / 5 + t * 0.07 + i; b.disc(x + sway + Math.cos(a) * R * 1.15, top + Math.sin(a) * R * 1.15, R * 0.85, R * 0.85, k % 2 ? col : FLORA[(i + 2) % 5], 0.82, 0.35); }
          b.disc(x + sway, top, 1.1, 1.1, "#fff6c9", 0.95);
        }
        for (let i = 0; i < 46; i++) { const ph = (t * 0.035 * (0.5 + hash(i, 5)) + hash(i, 6)) % 1; b.put(hash(i, 7) * b.W + Math.sin(t * 0.5 + i) * 2, b.H * (1 - ph), FLORA[i % 5], 0.55 * Math.sin(Math.PI * ph), "·"); }
      },
    },
    {
      id: "neurons", name: () => L("Нейроны", "Neurons"),
      bg: (d) => (d ? ["#05070f", "#0b1226", "#12082a"] : ["#eef1ff", "#f4eeff", "#e9f4ff"]),
      draw(b, t) {
        const K = Math.max(9, Math.round(b.W * b.H / 620)), P = [];
        for (let i = 0; i < K; i++) P.push([(0.06 + 0.88 * hash(i, 11)) * b.W + Math.sin(t * 0.13 + i) * 1.5, (0.08 + 0.84 * hash(i, 12)) * b.H + Math.cos(t * 0.11 + i * 2) * 1.2]);
        for (let i = 0; i < K; i++) {
          // каждый нейрон тянется к двум ближайшим
          const near = P.map((p, j) => [j, (p[0] - P[i][0]) ** 2 + (p[1] - P[i][1]) ** 2 * 2]).filter((q) => q[0] !== i).sort((p, q) => p[1] - q[1]).slice(0, 2);
          for (const [j] of near) {
            const col = FLORA[(i + j) % 5];
            b.line(P[i][0], P[i][1], P[j][0], P[j][1], col, b.dark ? 0.2 : 0.3, 2);
            const ph = (t * (0.16 + 0.1 * hash(i, j)) + hash(j, i)) % 1;
            b.put(P[i][0] + (P[j][0] - P[i][0]) * ph, P[i][1] + (P[j][1] - P[i][1]) * ph, "#ffffff", 0.95, "*");
            b.put(P[i][0] + (P[j][0] - P[i][0]) * (ph - 0.04), P[i][1] + (P[j][1] - P[i][1]) * (ph - 0.04), col, 0.6, "+");
          }
        }
        for (let i = 0; i < K; i++) {
          const f = Math.max(0, Math.sin(t * (0.5 + hash(i, 14)) + i * 2.1)), col = FLORA[i % 5];
          b.disc(P[i][0], P[i][1], 2.6, 2.6, col, 0.25 + 0.3 * f, 0.7); b.disc(P[i][0], P[i][1], 1.2, 1.2, col, 0.9);
          b.put(P[i][0], P[i][1], "#ffffff", 0.5 + 0.5 * f, "o");
        }
      },
    },
    {
      id: "clouds", name: () => L("Облака", "Clouds"),
      bg: (d) => (d ? ["#0b1736", "#132a55", "#1c3f6e"] : ["#7cc4ff", "#a9dbff", "#d9f0ff"]),
      draw(b, t) {
        if (b.dark) b.stars(50, t, "#dfe9ff", 0.7);
        const n = Math.max(5, Math.round(b.W / 22)), col = b.dark ? "#9db6e6" : "#ffffff";
        for (let i = 0; i < n; i++) {
          const sp = 0.6 + 1.4 * hash(i, 21), w = 6 + 7 * hash(i, 22), x = ((hash(i, 23) * (b.W + 40) + t * sp) % (b.W + 40)) - 20, y = (0.08 + 0.72 * hash(i, 24)) * b.H;
          for (let k = 0; k < 4; k++) b.disc(x + (k - 1.5) * w * 0.42, y - (k === 1 || k === 2 ? 1.6 : 0) + Math.sin(t * 0.3 + i + k) * 0.4, w * 0.36, 2.2 + (k === 1 ? 1.2 : 0), col, b.dark ? 0.5 : 0.9, 0.3);
        }
      },
    },
    {
      id: "pond", name: () => L("Пруд", "Pond"),
      bg: (d) => (d ? ["#062a2a", "#0b3d3a", "#0a2f3f"] : ["#8fe0cf", "#b5ecd9", "#9fdcea"]),
      draw(b, t) {
        const pads = Math.max(5, Math.round(b.W / 20));
        for (let i = 0; i < pads; i++) {
          const x = hash(i, 31) * b.W, y = hash(i, 32) * b.H, r = 2.6 + 2.2 * hash(i, 33), a0 = hash(i, 34) * TAU + Math.sin(t * 0.2 + i) * 0.2;
          for (let yy = Math.floor(y - r); yy <= y + r; yy++) for (let xx = Math.floor(x - r * 1.3); xx <= x + r * 1.3; xx++) {
            const dx = (xx - x) / 1.3, dy = yy - y, d = Math.hypot(dx, dy);
            if (d > r) continue;
            let da = Math.atan2(dy, dx) - a0; da = Math.atan2(Math.sin(da), Math.cos(da));
            if (Math.abs(da) < 0.38 && d > r * 0.25) continue;        // вырез листа кувшинки
            b.put(xx, yy, d > r - 1 ? "#2f9c5a" : "#46c070", b.dark ? 0.75 : 0.9);
          }
          if (hash(i, 35) > 0.6) b.disc(x + r * 0.3, y - r * 0.2, 1.3, 1.3, "#ff9fc4", 0.95);
        }
        const fish = Math.max(3, Math.round(b.W / 34));
        for (let i = 0; i < fish; i++) {
          const sp = 0.22 + 0.2 * hash(i, 41), ph = t * sp + hash(i, 42) * 20, px = (0.5 + 0.46 * Math.sin(ph * 0.7 + i)) * b.W, py = (0.5 + 0.42 * Math.sin(ph * 1.1 + i * 2)) * b.H;
          const vx = Math.cos(ph * 0.7 + i) * 0.7 * 0.46 * b.W, vy = Math.cos(ph * 1.1 + i * 2) * 1.1 * 0.42 * b.H, vl = Math.hypot(vx, vy) || 1, dx = vx / vl, dy = vy / vl;
          const prof = [1.0, 1.7, 1.9, 1.7, 1.3, 0.9, 0.5, 1.2, 1.7];
          for (let s = 0; s < prof.length; s++) {
            const wig = Math.sin(t * 5 - s * 0.9 + i) * 0.16 * s, cx = px - dx * s * 1.25 - dy * wig, cy = py - dy * s * 1.25 + dx * wig, h = hash(i * 7 + s, 43);
            b.disc(cx, cy, prof[s] * 1.15, prof[s], h > 0.62 ? "#fff3e6" : h > 0.2 ? "#ff8a3d" : "#e2552a", 0.95, 0.2);
          }
          b.put(px + dx * 0.4 - dy * 0.8, py + dy * 0.4 + dx * 0.8, "#1b1b1b", 0.9, false);
        }
        for (let i = 0; i < 4; i++) { const ph = (t * 0.2 + hash(i, 51)) % 1, x = hash(i, 52 + Math.floor(t * 0.2 + hash(i, 51))) * b.W, y = hash(i, 53) * b.H, r = 1 + ph * 9; for (let k = 0; k < 26; k++) b.put(x + Math.cos(k / 26 * TAU) * r * 1.3, y + Math.sin(k / 26 * TAU) * r, "#ffffff", 0.3 * (1 - ph), "~"); }
      },
    },
    {
      id: "jelly", name: () => L("Медузы", "Jellyfish"),
      bg: (d) => (d ? ["#04122e", "#0a2350", "#0c1b3f"] : ["#bfe3ff", "#d4d9ff", "#c2f0f7"]),
      draw(b, t) {
        for (let i = 0; i < 60; i++) b.put(hash(i, 61) * b.W + Math.sin(t * 0.3 + i) * 2, (((hash(i, 62) * b.H - t * (0.3 + hash(i, 63))) % b.H) + b.H) % b.H, b.dark ? "#8fd3ff" : "#5a8ed6", 0.28, "·");
        const n = Math.max(4, Math.round(b.W / 17)), cols = ["#ff8fc8", "#c79bff", "#ffc49b", "#8fe9ff", "#ffa8a8"];
        for (let i = 0; i < n; i++) {
          const rx = 3.4 + 2.6 * hash(i, 71), ry = rx * 0.72, x = (0.08 + 0.84 * hash(i, 72)) * b.W + Math.sin(t * 0.25 + i) * 3;
          const span = b.H + 34, y = b.H + 14 - ((t * (0.8 + 0.8 * hash(i, 73)) + hash(i, 74) * span) % span), pulse = 0.5 + 0.5 * Math.sin(t * 1.6 + i * 2), col = cols[i % 5], w = rx * (0.86 + 0.16 * pulse);
          for (let yy = Math.floor(y - ry); yy <= y; yy++) for (let xx = Math.floor(x - w); xx <= x + w; xx++) { const d = ((xx - x) / w) ** 2 + ((yy - y) / ry) ** 2; if (d <= 1) b.put(xx, yy, d > 0.6 ? col : "#ffffff", d > 0.6 ? 0.9 : 0.55); }
          const tn = Math.max(4, Math.round(w * 1.3));
          for (let k = 0; k < tn; k++) { const bx = x - w * 0.8 + k * (1.6 * w) / (tn - 1), len = 6 + 9 * hash(i * 9 + k, 75); for (let s = 1; s < len; s++) b.put(bx + Math.sin(t * 1.8 + s * 0.55 + k + i) * (0.3 + s * 0.09), y + s, col, 0.75 * (1 - s / len), s % 3 ? "|" : ":"); }
        }
      },
    },
    {
      id: "fireflies", name: () => L("Светлячки", "Fireflies"),
      bg: (d) => (d ? ["#04100c", "#0a1f16", "#0d2a1c"] : ["#dff5d8", "#eaf7cf", "#d3efd9"]),
      draw(b, t) {
        const gr = b.dark ? "#2f8f4e" : "#3fa35c";
        for (let x = 0; x < b.W; x++) { const h = 2 + 6 * hash(x, 81) * hash(x >> 2, 82) + 2 * hash(x >> 3, 83); for (let s = 0; s < h; s++) b.put(x + Math.sin(t * 0.8 + x * 0.3) * s * 0.07, b.H - 1 - s, gr, 0.3 + 0.5 * (1 - s / h), s === Math.floor(h) ? "'" : "|"); }
        const n = Math.max(12, Math.round(b.W / 5)), col = b.dark ? "#f4ff7a" : "#d99a00";
        for (let i = 0; i < n; i++) {
          const x = (hash(i, 91) + 0.08 * Math.sin(t * 0.21 * (0.5 + hash(i, 92)) + i)) * b.W, y = (0.12 + 0.72 * hash(i, 93) + 0.06 * Math.sin(t * 0.17 + i * 3)) * b.H, f = Math.pow(Math.max(0, Math.sin(t * (0.6 + 0.9 * hash(i, 94)) + i * 2.3)), 3);
          if (f < 0.03) continue;
          b.put(x, y, col, f, "*");
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.put(x + dx, y + dy, col, f * 0.3, false);
        }
      },
    },
    {
      id: "moon", name: () => L("Лунная ночь", "Moonlit"),
      bg: (d) => (d ? ["#090d2a", "#141b4d", "#1d2a66"] : ["#c9d6ff", "#e3d9ff", "#f6e7ee"]),
      draw(b, t) {
        b.stars(Math.round(b.W * 0.7), t, b.dark ? "#ffffff" : "#6b6fc9", 0.8);
        const mx = b.W * 0.78, my = b.H * 0.24, R = Math.max(4, Math.min(b.W, b.H) * 0.13), mc = b.dark ? "#f3e9c6" : "#fff6d6";
        for (let y = Math.floor(my - R); y <= my + R; y++) for (let x = Math.floor(mx - R * 1.3); x <= mx + R * 1.3; x++) {
          const d = Math.hypot((x - mx) / 1.3, y - my), d2 = Math.hypot((x - mx) / 1.3 + R * 0.5, y - my + R * 0.2);
          if (d <= R && d2 > R * 0.92) b.put(x, y, mc, 0.95, hash(x, y) > 0.8 ? "o" : "#");
        }
        const n = Math.max(4, Math.round(b.W / 26)), col = b.dark ? "#6f86e0" : "#ffffff";
        for (let i = 0; i < n; i++) {
          const w = 9 + 12 * hash(i, 101), x = ((hash(i, 102) * (b.W + 50) + t * (0.35 + 0.5 * hash(i, 103))) % (b.W + 50)) - 25, y = (0.2 + 0.6 * hash(i, 104)) * b.H;
          for (let r = 0; r < 3; r++) { const ww = w * (r === 1 ? 1 : 0.66), ox = (hash(i, 105 + r) - 0.5) * 5; for (let k = Math.floor(-ww); k <= ww; k++) b.put(x + ox + k, y + r, col, (b.dark ? 0.5 : 0.85) * (1 - Math.abs(k) / (ww + 1) * 0.5), "="); }
        }
      },
    },
    {
      id: "aurora", name: () => L("Сияние", "Aurora"),
      bg: (d) => (d ? ["#030816", "#06142a", "#0a1f33"] : ["#d8f3ee", "#e2e9ff", "#efe4ff"]),
      draw(b, t) {
        if (b.dark) b.stars(Math.round(b.W * 0.5), t, "#ffffff", 0.55);
        const cols = b.dark ? ["#4dffb4", "#56d9ff", "#b388ff"] : ["#1fb98a", "#3d8fe0", "#8a5fe0"];
        for (let k = 0; k < 3; k++) for (let x = 0; x < b.W; x++) {
          const yc = b.H * (0.16 + 0.13 * k) + Math.sin(x * 0.07 + t * 0.22 + k * 2) * b.H * 0.07 + Math.sin(x * 0.19 - t * 0.31 + k) * 1.6, h = 4 + 5 * (0.5 + 0.5 * Math.sin(x * 0.13 + t * 0.4 + k * 3)), pw = 0.45 + 0.55 * Math.sin(x * 0.045 + t * 0.15 + k * 1.3) ** 2;
          for (let s = 0; s < h; s++) b.put(x, yc + s, cols[k], pw * (b.dark ? 0.7 : 0.75) * (1 - s / h), s === 0 ? "=" : "|");
        }
        for (let x = 0; x < b.W; x++) { const h = b.H * (0.1 + 0.12 * Math.abs(Math.sin(x * 0.06) * Math.cos(x * 0.021 + 1)) + 0.05 * hash(x >> 2, 111)); for (let s = 0; s < h; s++) b.put(x, b.H - 1 - s, s > h - 2 ? (b.dark ? "#cfe3ff" : "#ffffff") : (b.dark ? "#101c36" : "#8fa3c9"), 0.95, s > h - 2 ? "^" : false); }
      },
    },
  ];
  const get = (id) => LIST.find((w) => w.id === id) || null;

  /* ---------- холст с обоями ---------- */
  class Wall {
    /** host — куда положить холст. opts: { id, cell, fps, dark() } */
    constructor(host, opts) {
      this.host = host; this.o = opts;
      const doc = host.ownerDocument; this.win = doc.defaultView || window;
      this.cv = doc.createElement("canvas"); this.cv.className = opts.cls || "fl-wall-canvas";
      host.prepend(this.cv);
      this.g = this.cv.getContext("2d");
      this.t = hash(opts.id.length, 3) * 40; this.last = 0; this.alive = true; this.gone = 0;
      this.still = !!(this.win.matchMedia && this.win.matchMedia("(prefers-reduced-motion: reduce)").matches);
      this._tick = (now) => this._frame(now);
      this.raf = this.win.requestAnimationFrame(this._tick);
    }
    set(id) { this.o.id = id; this.tone = null; this.painted = false; }
    _frame(now) {
      if (!this.alive) return;
      this.raf = this.win.requestAnimationFrame(this._tick);
      if (!this.cv.isConnected) { if (++this.gone > 180) this.destroy(); return; }       // раздел закрыли — обои гаснут сами
      this.gone = 0;
      const doc = this.cv.ownerDocument, w = this.cv.clientWidth, h = this.cv.clientHeight, wall = get(this.o.id);
      if (!wall || !w || !h || doc.hidden) return;
      const fps = this.o.fps || (typeof doc.hasFocus === "function" && !doc.hasFocus() ? 4 : 12);
      if (this.painted && (this.still || now - this.last < 1000 / fps)) return;
      const dt = Math.min(0.5, (now - (this.last || now)) / 1000);
      this.last = now; this.t += dt;
      const dark = this.o.dark ? this.o.dark() : true, dpr = Math.min(this.win.devicePixelRatio || 1, 2), W = Math.round(w * dpr), H = Math.round(h * dpr);
      if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; this.tone = null; }
      if (this.tone !== dark) { const c = wall.bg(dark); this.cv.style.setProperty("--fl-wall-a", c[0]); this.cv.style.setProperty("--fl-wall-b", c[1]); this.cv.style.setProperty("--fl-wall-c", c[2]); this.tone = dark; }
      const g = this.g, cell = this.o.cell || 12;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      g.font = "600 " + Math.round(cell * 0.72) + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace'; g.textAlign = "center"; g.textBaseline = "middle";
      wall.draw(new Brush(g, cell, Math.ceil(w / cell), Math.ceil(h / cell), dark), this.t);
      g.globalAlpha = 1;
      this.painted = true;
    }
    destroy() { this.alive = false; this.win.cancelAnimationFrame(this.raf); this.cv.remove(); }
  }
  // обои под сценой раздела (Нейрограф, Flora 3D): всегда тёмная версия, сцена ложится поверх светом
  function under(host, cur, id) {
    const on = !!get(id);
    host.classList.toggle("fl-wall-on", on);
    if (!on) { if (cur) cur.destroy(); return null; }
    if (cur && cur.cv.isConnected) { cur.set(id); return cur; }
    return new Wall(host, { id, dark: () => true, cls: "fl-wall-canvas fl-wall-under" });
  }
  return { LIST, get, Wall, under };
})();
