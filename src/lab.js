
/* ------------------------------------------------------------------ */
/* Стартовый экран Flora: нейроны-цветы под жидким стеклом              */
/* ------------------------------------------------------------------ */
const LAB_APPS = [
  { label: "Заметка", glyph: "＋", icon: "file-plus", from: "#5ac8fa", to: "#0a63ff", cmd: "file-explorer:new-file" },
  { label: "Журнал дня", glyph: "◐", icon: "calendar-days", from: "#ffd36b", to: "#ff8a00", cmd: "flora:open-today-journal" },
  { label: "Нейрограф", glyph: "✺", icon: "brain", from: "#e3a6ff", to: "#9b3dff", cmd: "flora:open" },
  { label: "Расследование", glyph: "⌖", icon: "fingerprint", from: "#ff9a8b", to: "#ff2d55", cmd: "flora:open-case" },
  { label: "Холст", glyph: "▦", icon: "layout-dashboard", from: "#8ef0a8", to: "#16b45a", cmd: "canvas:new-file" },
];
const LAB_FILE_KINDS = {
  md: ["Заметка", "file-text", "#8e8e93", "#5b5b60"], canvas: ["Холст", "layout-dashboard", "#8ef0a8", "#16b45a"],
  base: ["База", "table", "#7cc6ff", "#2f7bff"], pdf: ["PDF", "file-text", "#ff9a8b", "#e0343c"],
  png: ["Картинка", "image", "#ffd36b", "#ff9500"], jpg: ["Картинка", "image", "#ffd36b", "#ff9500"],
  jpeg: ["Картинка", "image", "#ffd36b", "#ff9500"], webp: ["Картинка", "image", "#ffd36b", "#ff9500"],
};

// «клумба» из клеток: несколько цветков разных цветов по всему экрану
function labGraph() {
  const R = (function (seed) { let s = seed >>> 0; return () => { s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5 | 0; s ^= s >>> 13; return (s >>> 0) / 4294967296; }; })(Date.now() & 0xffff);
  const nodes = [], edges = [];
  const colors = ["#ff8a70", "#f2c56b", "#8fe3a1", "#7ab8ff", "#e59be0", "#9fe6dc", "#ff8a70"];
  const clusters = 7;
  for (let c = 0; c < clusters; c++) {
    const color = colors[c % colors.length];
    const hub = "h" + c;
    nodes.push({ id: hub, kind: "note", label: "", group: "g" + c, color, deg: 0 });
    const n = 7 + Math.floor(R() * 8);
    for (let i = 0; i < n; i++) {
      const id = hub + "-" + i;
      nodes.push({ id, kind: R() < 0.72 ? "card" : "note", label: "", group: "g" + c, color, deg: 0 });
      edges.push({ a: hub, b: id, w: 1 });
      if (i > 1 && R() < 0.3) edges.push({ a: id, b: hub + "-" + Math.floor(R() * i), w: 1 });
    }
    if (c > 0 && R() < 0.75) edges.push({ a: hub, b: "h" + Math.floor(R() * c), w: 2 });
  }
  const deg = {};
  for (const e of edges) { deg[e.a] = (deg[e.a] || 0) + 1; deg[e.b] = (deg[e.b] || 0) + 1; }
  for (const n of nodes) n.deg = deg[n.id] || 0;
  return { nodes, edges, groups: [] };
}

class LabScreen {
  constructor(plugin, leaf) { this.plugin = plugin; this.app = plugin.app; this.leaf = leaf; this.el = null; this.R = null; }

  update() {
    const view = this.leaf.view;
    const isEmpty = view && typeof view.getViewType === "function" && view.getViewType() === "empty";
    if (!isEmpty || !this.plugin.settings.labScreen) { this.destroy(); return; }
    const host = view.contentEl || view.containerEl;
    if (!host) return;
    if (!this.el || !host.contains(this.el)) this.build(host);
    else if (++this.tick % 10 === 0) this.renderRecent();
  }

  icon(el, name, glyph) { if (typeof obsidian.setIcon === "function") obsidian.setIcon(el, name); else el.textContent = glyph || ""; }
  run(cmd) {
    const ok = this.app.commands && this.app.commands.executeCommandById && this.app.commands.executeCommandById(cmd);
    if (ok === false) new obsidian.Notice("Эта функция выключена в настройках Obsidian");
  }

  build(host) {
    this.destroy();
    this.tick = 0;
    const doc = host.ownerDocument || document;
    const mk = (tag, cls, parent, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; (parent || el).appendChild(e); return e; };
    const el = this.el = doc.createElement("div");
    el.className = "ng-lab";
    host.classList.add("ng-lab-host");
    host.appendChild(el);
    const canvas = mk("canvas", "ng-lab-canvas", el);
    mk("div", "ng-lab-bloom", el);

    const mark = mk("div", "ng-lab-mark", el);
    mk("span", "ng-lab-mark-flower", mark);
    mk("span", "ng-lab-mark-word", mark, "flora");

    const inner = mk("div", "ng-lab-inner");
    const now = new Date();
    const wd = RU_WEEKDAYS[now.getDay()];
    mk("div", "ng-lab-date", inner, wd.charAt(0).toUpperCase() + wd.slice(1) + ", " + now.getDate() + " " + RU_MONTHS_GEN[now.getMonth()]);
    const hour = now.getHours();
    mk("h1", "ng-lab-title", inner, hour < 5 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер");

    const search = mk("button", "ng-lab-search ng-glass", inner);
    const sic = mk("span", "ng-lab-search-icon", search); this.icon(sic, "search", "⌕");
    mk("span", "ng-lab-search-text", search, "Найти заметку");
    mk("kbd", "ng-lab-search-key", search, "Ctrl O");
    search.addEventListener("click", () => this.run("switcher:open"));

    const dock = mk("div", "ng-lab-dock ng-glass", inner);
    for (const a of LAB_APPS) {
      const b = mk("button", "ng-lab-app", dock);
      const ic = mk("span", "ng-lab-app-icon", b);
      ic.style.setProperty("--from", a.from); ic.style.setProperty("--to", a.to);
      this.icon(ic, a.icon, a.glyph);
      mk("span", "ng-lab-app-label", b, a.label);
      b.addEventListener("click", () => this.run(a.cmd));
    }

    const widget = mk("div", "ng-lab-widget ng-glass", inner);
    mk("div", "ng-lab-widget-title", widget, "Недавние");
    this.recentEl = mk("div", "ng-lab-list", widget);
    this.renderRecent();

    this.R = new NG.NeuralRenderer(canvas, { hud: false, labels: false, noWheel: true, activity: 2.6, maxFitZoom: 2.6, maxFps: 30, renderScale: 1 });
    this.R.setData(labGraph());
  }

  renderRecent() {
    if (!this.recentEl) return;
    const doc = this.recentEl.ownerDocument;
    const paths = (this.app.workspace.getLastOpenFiles ? this.app.workspace.getLastOpenFiles() : []).slice(0, 5);
    const key = paths.join("|");
    if (key === this.recentKey) return;
    this.recentKey = key;
    this.recentEl.textContent = "";
    const files = paths.map((p) => this.app.vault.getAbstractFileByPath(p)).filter(Boolean);
    if (!files.length) {
      const e = doc.createElement("div"); e.className = "ng-lab-empty";
      e.textContent = "Здесь появятся заметки, которые вы открывали";
      this.recentEl.appendChild(e);
      return;
    }
    for (const f of files) {
      const kind = LAB_FILE_KINDS[(f.extension || "").toLowerCase()] || LAB_FILE_KINDS.md;
      const b = doc.createElement("button");
      b.className = "ng-lab-row";
      const ic = doc.createElement("span"); ic.className = "ng-lab-row-icon";
      ic.style.setProperty("--from", kind[2]); ic.style.setProperty("--to", kind[3]);
      this.icon(ic, kind[1], "▤"); b.appendChild(ic);
      const txt = doc.createElement("span"); txt.className = "ng-lab-row-text"; b.appendChild(txt);
      const name = doc.createElement("span"); name.className = "ng-lab-row-name"; name.textContent = f.basename || f.name; txt.appendChild(name);
      const sub = doc.createElement("span"); sub.className = "ng-lab-row-kind";
      const folder = f.parent && f.parent.path && f.parent.path !== "/" ? f.parent.path.split("/").pop() : "";
      sub.textContent = kind[0] + (folder ? ", " + folder : "");
      txt.appendChild(sub);
      const ch = doc.createElement("span"); ch.className = "ng-lab-row-chevron"; this.icon(ch, "chevron-right", "›"); b.appendChild(ch);
      b.addEventListener("click", () => this.leaf.openFile(f));
      this.recentEl.appendChild(b);
    }
  }

  destroy() {
    if (this.R) { this.R.destroy(); this.R = null; }
    if (this.el) {
      const host = this.el.parentElement;
      this.el.remove(); this.el = null;
      if (host) host.classList.remove("ng-lab-host");
    }
    this.recentEl = null; this.recentKey = null;
  }
}
