
/* ------------------------------------------------------------------ */
/* Обёртка для Obsidian                                                */
/* ------------------------------------------------------------------ */
const VIEW_TYPE = "neural-graph";
const DEFAULTS = { cards: true, orphans: true, unresolved: false, activity: 1, skinGraph: true, skinLocal: true, skinHud: true, skinCanvas: true, skinDaily: true, autoTasks: true, fullSkin: true, labScreen: true, accent: "blue" };

class NeuralGraphView extends obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.renderer = null;
    this._timer = null;
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Нейрограф"; }
  getIcon() { return "brain"; }

  async onOpen() {
    const el = this.contentEl;
    el.empty();
    el.addClass("ng-view");
    const wrap = el.createDiv({ cls: "ng-wrap" });
    const canvas = wrap.createEl("canvas");
    this.renderer = new NG.NeuralRenderer(canvas, {
      activity: this.plugin.settings.activity,
      onOpen: (n, ev) => this.openNode(n, ev),
    });
    this.buildControls(wrap);
    await this.refresh();

    const later = () => { clearTimeout(this._timer); this._timer = setTimeout(() => this.refresh(), 1200); };
    this.registerEvent(this.app.metadataCache.on("resolved", later));
    this.registerEvent(this.app.vault.on("create", later));
    this.registerEvent(this.app.vault.on("delete", later));
    this.registerEvent(this.app.vault.on("rename", later));
    this.registerEvent(this.app.vault.on("modify", (f) => { if (f.extension === "canvas") later(); }));
  }

  async onClose() {
    clearTimeout(this._timer);
    if (this.renderer) this.renderer.destroy();
    this.renderer = null;
  }

  onResize() { if (this.renderer) this.renderer.resize(); }

  buildControls(wrap) {
    const s = this.plugin.settings;
    const bar = wrap.createDiv({ cls: "ng-ctl" });
    const ico = (el, name) => { if (typeof obsidian.setIcon === "function") obsidian.setIcon(el, name); };
    const btn = (parent, icon, label, title) => {
      const b = parent.createEl("button", { cls: "ng-ctl-btn", attr: { "aria-label": title } });
      if (icon) ico(b.createSpan({ cls: "ng-ctl-ico" }), icon);
      if (label) b.createSpan({ cls: "ng-ctl-text", text: label });
      return b;
    };
    // фильтры
    const filters = bar.createDiv({ cls: "ng-ctl-group" });
    const toggle = (key, icon, label, title) => {
      const b = btn(filters, icon, label, title);
      b.toggleClass("is-on", !!s[key]);
      b.onclick = async () => {
        s[key] = !s[key];
        b.toggleClass("is-on", s[key]);
        await this.plugin.saveSettings();
        this.refresh();
      };
    };
    toggle("cards", "sticky-note", "Карточки", "Карточки с холстов");
    toggle("orphans", "circle-dashed", "Без связей", "Заметки, у которых нет ни одной связи");
    toggle("unresolved", "link-2-off", "Пустые ссылки", "Ссылки на заметки, которых ещё нет");
    // активность и вид
    const view = bar.createDiv({ cls: "ng-ctl-group" });
    const steps = [[0, "Пауза"], [0.5, "Тихо"], [1, "Обычно"], [2, "Живо"], [4, "Буря"]];
    const nameOf = (v) => (steps.find((x) => x[0] === v) || steps[2])[1];
    const act = btn(view, "zap", nameOf(s.activity), "Как часто клетки сами вспыхивают");
    act.onclick = async () => {
      const i = steps.findIndex((x) => x[0] === s.activity);
      s.activity = steps[(i + 1) % steps.length][0];
      act.querySelector(".ng-ctl-text").setText(nameOf(s.activity));
      this.renderer.opts.activity = s.activity;
      await this.plugin.saveSettings();
    };
    const fit = btn(view, "scan", "", "Показать всё (или двойной клик по фону)");
    fit.onclick = () => this.renderer.fit(false);
  }

  async collect() {
    const app = this.app;
    const all = app.vault.getFiles();
    const files = all.map((f) => f.path);
    const links = {};
    const rl = app.metadataCache.resolvedLinks || {};
    const ul = app.metadataCache.unresolvedLinks || {};
    for (const src in rl) links[src] = Object.assign({}, rl[src]);
    for (const src in ul) for (const d in ul[src]) (links[src] = links[src] || {})["?" + d] = ul[src][d];
    const canvases = {};
    for (const f of all) {
      if (f.extension !== "canvas") continue;
      try { canvases[f.path] = JSON.parse((await app.vault.cachedRead(f)) || "{}"); } catch (e) { /* битый холст — пропускаем */ }
    }
    const s = this.plugin.settings;
    return NG.buildGraph({
      files, links, canvases,
      resolve: (l, from) => { const f = app.metadataCache.getFirstLinkpathDest(l, from); return f ? f.path : "?" + l; },
      cards: s.cards, orphans: s.orphans, unresolved: s.unresolved,
    });
  }

  async refresh() {
    if (!this.renderer) return;
    try {
      this.renderer.setData(await this.collect());
    } catch (e) {
      console.error("Нейрограф:", e);
    }
  }

  async openNode(n, ev) {
    const f = this.app.vault.getAbstractFileByPath(n.path);
    if (!(f instanceof obsidian.TFile)) return;
    let target = null;
    if (!obsidian.Keymap.isModEvent(ev)) {
      this.app.workspace.iterateRootLeaves((l) => {
        if (!target && l !== this.leaf && l.view && ["markdown", "canvas", "image"].includes(l.view.getViewType())) target = l;
      });
    }
    if (!target) target = this.app.workspace.getLeaf("tab");
    await target.openFile(f);
    this.app.workspace.setActiveLeaf(target, { focus: true });
  }
}

class NeuralGraphSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();
    const save = async () => { await this.plugin.saveSettings(); this.plugin.syncSkins(true); };
    new obsidian.Setting(containerEl).setName("Интерфейс").setHeading();
    new obsidian.Setting(containerEl)
      .setName("Дизайн Flora")
      .setDesc("Новый вид всего Obsidian: стеклянные панели и вкладки, мягкий фон, карточка для текста, новые цвета. Светлая и тёмная тема, работает поверх любой темы оформления.")
      .addToggle((t) => t.setValue(s.fullSkin).onChange(async (v) => { s.fullSkin = v; await this.plugin.saveSettings(); this.plugin.applySkin(); }));
    new obsidian.Setting(containerEl)
      .setName("Акцентный цвет")
      .setDesc("Цвет ссылок, выделения, кнопок и активных элементов.")
      .addDropdown((d) => {
        for (const [v, l] of [["blue", "Синий"], ["green", "Зелёный"], ["orange", "Оранжевый"], ["pink", "Розовый"], ["graphite", "Графит"]]) d.addOption(v, l);
        d.setValue(s.accent || "blue").onChange(async (v) => { s.accent = v; await this.plugin.saveSettings(); this.plugin.applySkin(); });
      });
    new obsidian.Setting(containerEl)
      .setName("Стартовый экран в пустой вкладке")
      .setDesc("Вместо «Нет открытых файлов» — живая ткань, быстрые действия и недавние заметки.")
      .addToggle((t) => t.setValue(s.labScreen).onChange(async (v) => { s.labScreen = v; await this.plugin.saveSettings(); this.plugin.syncDays(); }));
    new obsidian.Setting(containerEl).setName("Обычный граф").setHeading();
    new obsidian.Setting(containerEl)
      .setName("Нейронный вид обычного графа")
      .setDesc("Граф Obsidian работает как раньше (фильтры, группы, поиск, перетаскивание), но рисуется живыми нейронами.")
      .addToggle((t) => t.setValue(s.skinGraph).onChange(async (v) => { s.skinGraph = v; await save(); }));
    new obsidian.Setting(containerEl)
      .setName("Нейронный вид локального графа")
      .setDesc("То же для локального графа в боковой панели.")
      .addToggle((t) => t.setValue(s.skinLocal).onChange(async (v) => { s.skinLocal = v; await save(); }));
    new obsidian.Setting(containerEl)
      .setName("Шкала и счётчики")
      .setDesc("Показывать счётчики и шкалу в углах обычного графа.")
      .addToggle((t) => t.setValue(s.skinHud).onChange(async (v) => { s.skinHud = v; await save(); }));
    new obsidian.Setting(containerEl).setName("Холсты").setHeading();
    new obsidian.Setting(containerEl)
      .setName("Нейронный вид холстов")
      .setDesc("Тёмные карточки, связи — живые отростки, по стрелкам бегут импульсы и передаются дальше по схеме.")
      .addToggle((t) => t.setValue(s.skinCanvas).onChange(async (v) => { s.skinCanvas = v; await save(); }));
    new obsidian.Setting(containerEl).setName("Ежедневные заметки").setHeading();
    new obsidian.Setting(containerEl)
      .setName("Журнал дня")
      .setDesc("Шапка ежедневной заметки: живая полоса с заметками этого дня, дата, переход между днями, точки месяца, заготовка журнала.")
      .addToggle((t) => t.setValue(s.skinDaily).onChange(async (v) => { s.skinDaily = v; await this.plugin.saveSettings(); this.plugin.syncDays(); }));
    new obsidian.Setting(containerEl)
      .setName("Автозадачи")
      .setDesc("В разделе «Задачи» ежедневной заметки каждая новая строка сама становится задачей с галочкой.")
      .addToggle((t) => t.setValue(s.autoTasks).onChange(async (v) => { s.autoTasks = v; await this.plugin.saveSettings(); }));
    new obsidian.Setting(containerEl).setName("Живость").setHeading();
    new obsidian.Setting(containerEl)
      .setName("Активность нейронов")
      .setDesc("Как часто клетки сами вспыхивают и посылают импульсы.")
      .addDropdown((d) => {
        for (const v of ["0", "0.5", "1", "2", "4"]) d.addOption(v, v === "0" ? "тишина" : "×" + v);
        d.setValue(String(s.activity)).onChange(async (v) => { s.activity = Number(v); await save(); });
      });
  }
}

class NeuralGraphPlugin extends obsidian.Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.skins = new Map();
    this.registerView(VIEW_TYPE, (leaf) => new NeuralGraphView(leaf, this));
    this.addRibbonIcon("brain", "Нейрограф", () => this.activate());
    this.addCommand({ id: "open", name: "Открыть нейрограф", callback: () => this.activate() });
    this.addCommand({
      id: "toggle-core-skin", name: "Вкл/выкл нейронный вид обычного графа",
      callback: async () => { this.settings.skinGraph = !this.settings.skinGraph; await this.saveSettings(); this.syncSkins(true); },
    });
    this.addSettingTab(new NeuralGraphSettingTab(this.app, this));
    // полный дизайн интерфейса
    this.applySkin();
    // расследование
    this.cases = new CaseStore(this.app);
    this.registerView(CASE_VIEW, (leaf) => new CaseView(leaf, this));
    this.addRibbonIcon("fingerprint", "Расследование", () => this.openCaseBoard());
    this.addCommand({ id: "open-case", name: "Открыть доску расследования", callback: () => this.openCaseBoard() });
    this.addCommand({ id: "new-case", name: "Новое дело", callback: async () => { const f = await this.cases.create(); this.openCaseBoard(f.path); } });
    this.registerMarkdownCodeBlockProcessor("ng-case", (src, el, ctx) => renderCaseBlock(this, src, el, ctx));
    // лаборатория в пустых вкладках
    this.labs = new Map();
    // журнал дня
    this.daily = new DailyTools(this.app, {
      get: () => (this.settings.renamedDays = this.settings.renamedDays || {}),
      save: () => { window.clearTimeout(this._saveT); this._saveT = window.setTimeout(() => this.saveSettings(), 400); },
    });
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => { this.daily.onRename(file, oldPath); this.syncDays(); }));
    this.registerEvent(this.app.vault.on("delete", (file) => this.daily.onDelete(file)));
    this.days = new Map();
    this.addCommand({ id: "open-today-journal", name: "Журнал сегодняшнего дня", callback: () => this.daily.openDay(new Date()) });
    this.registerEvent(this.app.workspace.on("file-open", () => this.syncDays()));
    this.registerEvent(this.app.workspace.on("editor-change", (editor, info) => {
      if (!this.settings.autoTasks || this._autoBusy) return;
      const file = info && info.file;
      if (!file || !this.daily.dayOf(file)) return;
      // Obsidian сообщает об изменении прямо посреди обновления редактора (CodeMirror),
      // а менять текст в этот момент нельзя — делаем правку сразу после него.
      window.clearTimeout(this._autoT);
      this._autoT = window.setTimeout(() => {
        if (this._autoBusy) return;
        this._autoBusy = true;
        try { autoTaskLine(editor); } catch (e) { console.error("Нейрограф: автозадачи", e); }
        finally { this._autoBusy = false; }
      }, 0);
    }));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.syncDays()));
    this.registerEvent(this.app.vault.on("modify", () => { for (const h of this.days.values()) h.tick = 4; }));
    this.app.workspace.onLayoutReady(() => this.syncDays());
    this.registerInterval(window.setInterval(() => this.syncDays(), 1000));
    // обычный граф создаётся и пересоздаётся когда угодно — проверяем регулярно и на смену раскладки
    this.app.workspace.onLayoutReady(() => this.syncSkins());
    this.registerEvent(this.app.workspace.on("layout-change", () => this.syncSkins()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.syncSkins()));
    this.registerInterval(window.setInterval(() => this.syncSkins(), 1000));
  }

  onunload() {
    document.body.classList.remove("ng-skin");
    delete document.body.dataset.floraAccent;
    if (this.labs) { for (const l of this.labs.values()) l.destroy(); this.labs.clear(); }
    for (const leaf of [...this.skins.keys()]) this.dropSkin(leaf);
    for (const h of this.days.values()) h.destroy();
    this.days.clear();
  }

  applySkin() {
    const b = document.body;
    b.classList.toggle("ng-skin", !!this.settings.fullSkin);
    const a = this.settings.accent || "blue";
    if (this.settings.fullSkin && a !== "blue") b.dataset.floraAccent = a; else delete b.dataset.floraAccent;
  }

  async openCaseBoard(path) {
    let leaf = this.app.workspace.getLeavesOfType(CASE_VIEW)[0];
    if (!leaf) leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: CASE_VIEW, active: true, state: path ? { file: path } : {} });
    if (path && leaf.view && leaf.view.openCase) { const f = this.app.vault.getAbstractFileByPath(path); if (f) await leaf.view.openCase(f); }
    this.app.workspace.revealLeaf(leaf);
  }

  syncLabs() {
    if (!this.labs) return;
    const live = new Set(this.app.workspace.getLeavesOfType("empty"));
    for (const [leaf, l] of [...this.labs]) if (!live.has(leaf)) { l.destroy(); this.labs.delete(leaf); }
    for (const leaf of live) {
      let l = this.labs.get(leaf);
      if (!l) { l = new LabScreen(this, leaf); this.labs.set(leaf, l); }
      try { l.update(); } catch (e) { console.error("Нейрограф: лаборатория", e); }
    }
  }

  syncDays() {
    this.syncLabs();
    const on = this.settings.skinDaily;
    const live = new Set(on ? this.app.workspace.getLeavesOfType("markdown") : []);
    for (const [leaf, h] of [...this.days]) if (!live.has(leaf)) { h.destroy(); this.days.delete(leaf); }
    for (const leaf of live) {
      let h = this.days.get(leaf);
      if (!h) { h = new DayHeader(this, leaf); this.days.set(leaf, h); }
      try { h.update(); } catch (e) { console.error("Нейрограф: журнал дня", e); }
    }
  }

  syncSkins(rebuild) {
    const s = this.settings;
    if (rebuild) for (const leaf of [...this.skins.keys()]) this.dropSkin(leaf);
    for (const leaf of [...this.skins.keys()]) {
      const sk = this.skins.get(leaf);
      const cur = sk.kind === "canvas" ? leaf.view && leaf.view.canvas : leaf.view && leaf.view.renderer;
      if (!leaf.view || cur !== (sk.kind === "canvas" ? sk.cv : sk.r)) this.dropSkin(leaf);
    }
    for (const leaf of this.app.workspace.getLeavesOfType("canvas")) {
      const has = this.skins.get(leaf);
      const cv = leaf.view && leaf.view.canvas;
      if (!s.skinCanvas) { if (has) this.dropSkin(leaf); continue; }
      if (has) continue;
      if (!cv || !cv.wrapperEl || !(cv.nodes instanceof Map)) continue;
      try {
        this.skins.set(leaf, Object.assign(new NG.CanvasSkin(() => leaf.view && leaf.view.canvas, {
          activity: s.activity, onDead: () => this.dropSkin(leaf),
        }), { kind: "canvas" }));
      } catch (e) {
        console.error("Нейрограф: не удалось подключиться к холсту", e);
      }
    }
    for (const [type, on] of [["graph", s.skinGraph], ["localgraph", s.skinLocal]]) {
      for (const leaf of this.app.workspace.getLeavesOfType(type)) {
        if (!on) { if (this.skins.has(leaf)) this.dropSkin(leaf); continue; }
        if (this.skins.has(leaf)) continue;
        const r = leaf.view && leaf.view.renderer;
        if (!r || r.destroyed || !r.px || !r.containerEl || !Array.isArray(r.nodes)) continue; // граф ещё не запустился
        try {
          const skin = new NG.CoreSkin(() => leaf.view && leaf.view.renderer, {
            hud: type === "graph" && s.skinHud,
            activity: s.activity,
            onDead: () => this.dropSkin(leaf),
          });
          this.skins.set(leaf, skin);
        } catch (e) {
          console.error("Нейрограф: не удалось подключиться к графу", e);
        }
      }
    }
  }

  dropSkin(leaf) {
    const sk = this.skins.get(leaf);
    if (!sk) return;
    this.skins.delete(leaf);
    try { sk.destroy(); } catch (e) { console.error(e); }
  }

  async saveSettings() { await this.saveData(this.settings); }
  async activate() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    this.app.workspace.revealLeaf(leaf);
  }
}

module.exports = NeuralGraphPlugin;
module.exports.default = NeuralGraphPlugin;
