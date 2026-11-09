
/* ------------------------------------------------------------------ */
/* Обёртка для Obsidian                                                */
/* ------------------------------------------------------------------ */
const VIEW_TYPE = "neural-graph";
const DEFAULTS = { lang: "auto", cards: true, orphans: true, unresolved: false, activity: 1, skinGraph: true, skinLocal: true, skinHud: true, skinCanvas: true, skinDaily: true, autoTasks: true, fullSkin: true, labScreen: true, accent: "blue" };

class NeuralGraphView extends obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.renderer = null;
    this._timer = null;
  }
  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return L("Нейрограф", "Neurograph"); }
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
    toggle("cards", "sticky-note", L("Карточки", "Cards"), L("Карточки с холстов", "Cards from canvases"));
    toggle("orphans", "circle-dashed", L("Без связей", "Orphans"), L("Заметки, у которых нет ни одной связи", "Notes without any links"));
    toggle("unresolved", "link-2-off", L("Пустые ссылки", "Unresolved"), L("Ссылки на заметки, которых ещё нет", "Links to notes that don't exist yet"));
    // активность и вид
    const view = bar.createDiv({ cls: "ng-ctl-group" });
    const steps = [[0, L("Пауза", "Paused")], [0.5, L("Тихо", "Calm")], [1, L("Обычно", "Normal")], [2, L("Живо", "Lively")], [4, L("Буря", "Storm")]];
    const nameOf = (v) => (steps.find((x) => x[0] === v) || steps[2])[1];
    const act = btn(view, "zap", nameOf(s.activity), L("Как часто клетки сами вспыхивают", "How often cells fire on their own"));
    act.onclick = async () => {
      const i = steps.findIndex((x) => x[0] === s.activity);
      s.activity = steps[(i + 1) % steps.length][0];
      act.querySelector(".ng-ctl-text").setText(nameOf(s.activity));
      this.renderer.opts.activity = s.activity;
      await this.plugin.saveSettings();
    };
    const fit = btn(view, "scan", "", L("Показать всё (или двойной клик по фону)", "Fit all (or double-click the background)"));
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
      console.error(L("Нейрограф:", "Neurograph:"), e);
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
    new obsidian.Setting(containerEl)
      .setName(L("Язык", "Language"))
      .setDesc(L("Язык интерфейса Flora. Применяется после перезапуска плагина.", "Language of the Flora interface. Applies after reloading the plugin."))
      .addDropdown((d) => {
        d.addOption("auto", L("Авто (язык Obsidian)", "Auto (Obsidian language)"));
        d.addOption("en", "English");
        d.addOption("ru", "Русский");
        d.setValue(s.lang || "auto").onChange(async (v) => { s.lang = v; await this.plugin.saveSettings(); });
      });
    new obsidian.Setting(containerEl).setName(L("Интерфейс", "Interface")).setHeading();
    new obsidian.Setting(containerEl)
      .setName(L("Дизайн Flora", "Flora design"))
      .setDesc(L("Новый вид всего Obsidian: стеклянные панели и вкладки, мягкий фон, карточка для текста, новые цвета. Светлая и тёмная тема, работает поверх любой темы оформления.", "A new look for all of Obsidian: glass panels and tabs, a soft background, a card for the text and new colors. Light and dark mode, works on top of any theme."))
      .addToggle((t) => t.setValue(s.fullSkin).onChange(async (v) => { s.fullSkin = v; await this.plugin.saveSettings(); this.plugin.applySkin(); }));
    new obsidian.Setting(containerEl)
      .setName(L("Акцентный цвет", "Accent color"))
      .setDesc(L("Цвет ссылок, выделения, кнопок и активных элементов.", "Color of links, selection, buttons and active elements."))
      .addDropdown((d) => {
        for (const [v, l] of [["blue", L("Синий", "Blue")], ["green", L("Зелёный", "Green")], ["orange", L("Оранжевый", "Orange")], ["pink", L("Розовый", "Pink")], ["graphite", L("Графит", "Graphite")]]) d.addOption(v, l);
        d.setValue(s.accent || "blue").onChange(async (v) => { s.accent = v; await this.plugin.saveSettings(); this.plugin.applySkin(); });
      });
    new obsidian.Setting(containerEl)
      .setName(L("Стартовый экран в пустой вкладке", "Start screen in empty tabs"))
      .setDesc(L("Вместо «Нет открытых файлов» — живая ткань, быстрые действия и недавние заметки.", "Shows living tissue, quick actions and recent notes instead of \"No file is open\"."))
      .addToggle((t) => t.setValue(s.labScreen).onChange(async (v) => { s.labScreen = v; await this.plugin.saveSettings(); this.plugin.syncDays(); }));
    new obsidian.Setting(containerEl).setName(L("Обычный граф", "Graph view")).setHeading();
    new obsidian.Setting(containerEl)
      .setName(L("Нейронный вид обычного графа", "Neural look for the graph view"))
      .setDesc(L("Граф Obsidian работает как раньше (фильтры, группы, поиск, перетаскивание), но рисуется живыми нейронами.", "The Obsidian graph works as before (filters, groups, search, dragging) but is drawn as living neurons."))
      .addToggle((t) => t.setValue(s.skinGraph).onChange(async (v) => { s.skinGraph = v; await save(); }));
    new obsidian.Setting(containerEl)
      .setName(L("Нейронный вид локального графа", "Neural look for the local graph"))
      .setDesc(L("То же для локального графа в боковой панели.", "The same for the local graph in the sidebar."))
      .addToggle((t) => t.setValue(s.skinLocal).onChange(async (v) => { s.skinLocal = v; await save(); }));
    new obsidian.Setting(containerEl)
      .setName(L("Шкала и счётчики", "Scale and counters"))
      .setDesc(L("Показывать счётчики и шкалу в углах обычного графа.", "Show counters and the scale in the corners of the graph view."))
      .addToggle((t) => t.setValue(s.skinHud).onChange(async (v) => { s.skinHud = v; await save(); }));
    new obsidian.Setting(containerEl).setName(L("Холсты", "Canvases")).setHeading();
    new obsidian.Setting(containerEl)
      .setName(L("Нейронный вид холстов", "Neural look for canvases"))
      .setDesc(L("Тёмные карточки, связи — живые отростки, по стрелкам бегут импульсы и передаются дальше по схеме.", "Dark cards, connections drawn as living neurites, and impulses that run along the arrows and pass on through the diagram."))
      .addToggle((t) => t.setValue(s.skinCanvas).onChange(async (v) => { s.skinCanvas = v; await save(); }));
    new obsidian.Setting(containerEl).setName(L("Ежедневные заметки", "Daily notes")).setHeading();
    new obsidian.Setting(containerEl)
      .setName(L("Журнал дня", "Today's journal"))
      .setDesc(L("Шапка ежедневной заметки: живая полоса с заметками этого дня, дата, переход между днями, точки месяца, заготовка журнала.", "A header for daily notes: a living strip with the notes of that day, the date, day navigation, month dots and a journal template."))
      .addToggle((t) => t.setValue(s.skinDaily).onChange(async (v) => { s.skinDaily = v; await this.plugin.saveSettings(); this.plugin.syncDays(); }));
    new obsidian.Setting(containerEl)
      .setName(L("Автозадачи", "Auto tasks"))
      .setDesc(L("В разделе «Задачи» ежедневной заметки каждая новая строка сама становится задачей с галочкой.", "In the Tasks section of a daily note, every new line becomes a checkbox task automatically."))
      .addToggle((t) => t.setValue(s.autoTasks).onChange(async (v) => { s.autoTasks = v; await this.plugin.saveSettings(); }));
    new obsidian.Setting(containerEl).setName(L("Живость", "Liveliness")).setHeading();
    new obsidian.Setting(containerEl)
      .setName(L("Активность нейронов", "Neuron activity"))
      .setDesc(L("Как часто клетки сами вспыхивают и посылают импульсы.", "How often cells fire on their own and send impulses."))
      .addDropdown((d) => {
        for (const v of ["0", "0.5", "1", "2", "4"]) d.addOption(v, v === "0" ? L("тишина", "Off") : "×" + v);
        d.setValue(String(s.activity)).onChange(async (v) => { s.activity = Number(v); await save(); });
      });
  }
}

class NeuralGraphPlugin extends obsidian.Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    // язык — до регистрации видов, команд и значков
    const lang = this.settings.lang;
    FLORA_LANG = lang === "ru" || lang === "en" ? lang : floraDetectLang();
    this.skins = new Map();
    this.registerView(VIEW_TYPE, (leaf) => new NeuralGraphView(leaf, this));
    this.addRibbonIcon("brain", L("Нейрограф", "Neurograph"), () => this.activate());
    this.addCommand({ id: "open", name: L("Открыть нейрограф", "Open Neurograph"), callback: () => this.activate() });
    this.addCommand({
      id: "toggle-core-skin", name: L("Вкл/выкл нейронный вид обычного графа", "Toggle the neural look of the graph view"),
      callback: async () => { this.settings.skinGraph = !this.settings.skinGraph; await this.saveSettings(); this.syncSkins(true); },
    });
    this.addSettingTab(new NeuralGraphSettingTab(this.app, this));
    // полный дизайн интерфейса
    this.applySkin();
    // расследование
    this.cases = new CaseStore(this.app);
    this.registerView(CASE_VIEW, (leaf) => new CaseView(leaf, this));
    this.addRibbonIcon("fingerprint", L("Расследование", "Investigation"), () => this.openCaseBoard());
    this.addCommand({ id: "open-case", name: L("Открыть доску расследования", "Open the investigation board"), callback: () => this.openCaseBoard() });
    this.addCommand({ id: "new-case", name: L("Новое дело", "New case"), callback: async () => { const f = await this.cases.create(); this.openCaseBoard(f.path); } });
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
    this.addCommand({ id: "open-today-journal", name: L("Журнал сегодняшнего дня", "Open today's journal"), callback: () => this.daily.openDay(new Date()) });
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
        try { autoTaskLine(editor); } catch (e) { console.error(L("Нейрограф: автозадачи", "Neurograph: auto tasks"), e); }
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
      try { l.update(); } catch (e) { console.error(L("Нейрограф: лаборатория", "Neurograph: start screen"), e); }
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
      try { h.update(); } catch (e) { console.error(L("Нейрограф: журнал дня", "Neurograph: today's journal"), e); }
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
        console.error(L("Нейрограф: не удалось подключиться к холсту", "Neurograph: could not attach to the canvas"), e);
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
          console.error(L("Нейрограф: не удалось подключиться к графу", "Neurograph: could not attach to the graph"), e);
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
