/* ------------------------------------------------------------------ */
/* Раздел «Проекты с ИИ»: стартовый экран с выбором ИИ, граф проектов,  */
/* карточка проекта, паук, который связывает проекты, и заметки.        */
/* ------------------------------------------------------------------ */
const AI_VIEW = "flora-ai";
const AI_LOOK = {
  claude: { from: "#ffc29e", to: "#d9663a", icon: "sparkles" },
  codex: { from: "#a9e6ff", to: "#2f6bff", icon: "terminal-square" },
};

class FloraAIView extends NeuralGraphView {
  getViewType() { return AI_VIEW; }
  getDisplayText() { return L("Проекты с ИИ", "AI projects"); }
  getIcon() { return "sparkles"; }

  async onOpen() {
    const el = this.contentEl;
    el.empty();
    el.addClass("ng-view"); el.addClass("fai-view");
    this.wrapEl = el.createDiv({ cls: "ng-wrap" });
    this.setWall(this.plugin.settings.wall);
    if (!FloraAI.available()) { this.showMessage(L("Проекты с ИИ работают только в Obsidian для компьютера: истории Claude и Codex лежат на диске компьютера.", "AI projects only work in Obsidian for desktop: Claude and Codex keep their histories on the computer's disk."), false); return; }
    this.cache = await this.plugin.aiLoad();
    if (this.cache && this.cache.files && Object.keys(this.cache.files).length) { this.useCache(); this.showGraph(false); }
    else await this.showStart();
  }

  async onClose() {
    this.scanning = null;
    this.closeStart(); this.closeCard(); this.closeMessage();
    await super.onClose();
  }

  ico(el, name) { if (typeof obsidian.setIcon === "function") obsidian.setIcon(el, name); }

  /* ---------- данные ---------- */
  useCache() {
    const recs = Object.values(this.cache.files || {}).map((x) => x && x.rec).filter(Boolean);
    this.B = FloraAI.build({ sessions: recs.filter((r) => r.ai), memories: recs.filter((r) => !r.ai) });
    this.links = this.cache.links || [];
  }
  visibleProjects() {
    if (!this.B) return [];
    return this.plugin.settings.aiChats === false ? this.B.projects.filter((p) => !p.chat) : this.B.projects;
  }
  async collect() { return FloraAI.graph(Object.assign({}, this.B, { projects: this.visibleProjects() }), this.links); }
  projectOf(key) { return this.B && this.B.projects.find((p) => p.key === key); }

  /* ---------- стартовый экран: какой ИИ синхронизировать ---------- */
  closeStart() {
    if (this.startR) { this.startR.destroy(); this.startR = null; }
    if (this.startEl) { this.startEl.remove(); this.startEl = null; }
  }
  async showStart() {
    this.closeCard(); this.closeMessage();
    if (this.web) { this.web.destroy(); this.web = null; if (this.spBtn) this.spBtn.toggleClass("is-on", false); }
    this.closeStart();
    const s = this.plugin.settings;
    const el = (this.startEl = this.wrapEl.createDiv({ cls: "ng-lab fai-start" }));
    const canvas = el.createEl("canvas", { cls: "ng-lab-canvas" });
    el.createDiv({ cls: "ng-lab-bloom" });
    const mark = el.createDiv({ cls: "ng-lab-mark" });
    mark.createSpan({ cls: "ng-lab-mark-flower" });
    mark.createSpan({ cls: "ng-lab-mark-word", text: "flora" });
    if (this.B) {
      const back = el.createEl("button", { cls: "fai-back ng-glass", attr: { "aria-label": L("Вернуться к графу", "Back to the graph") } });
      this.ico(back.createSpan({ cls: "fai-back-ico" }), "chevron-left");
      back.createSpan({ text: L("К графу", "Graph") });
      back.onclick = () => this.showGraph(false);
    }
    const inner = el.createDiv({ cls: "ng-lab-inner fai-inner" });
    inner.createDiv({ cls: "ng-lab-date", text: L("Синхронизация с ИИ", "Sync with AI") });
    inner.createEl("h1", { cls: "ng-lab-title fai-title", text: L("Проекты с ИИ", "AI projects") });
    inner.createDiv({ cls: "fai-lead", text: L("Выберите ИИ. Flora найдёт проекты, которые вы с ним делали, вырастит из них нейроны, а паук свяжет их между собой.", "Pick an AI. Flora finds the projects you made with it, grows them into neurons, and the spider links them together.") });
    const grid = inner.createDiv({ cls: "fai-ais" });
    const extraBox = inner.createDiv({ cls: "ng-lab-widget ng-glass fai-extra" });
    const go = inner.createEl("button", { cls: "fai-go" });
    this.ico(go.createSpan({ cls: "fai-go-ico" }), "refresh-cw");
    go.createSpan({ text: L("Синхронизировать", "Sync") });
    inner.createDiv({ cls: "fai-privacy", text: L("Всё читается только на этом компьютере и никуда не отправляется. Flora сохраняет лишь названия, даты и папки проектов.", "Everything is read on this computer only and never sent anywhere. Flora keeps only project names, dates and folders.") });

    this.startR = new NG.NeuralRenderer(canvas, { hud: false, labels: false, noWheel: true, activity: 2.6, maxFitZoom: 2.6, maxFps: 30, renderScale: 1 });
    this.startR.setData(labGraph());

    grid.createDiv({ cls: "fai-wait", text: L("Ищу истории ИИ на этом компьютере…", "Looking for AI histories on this computer…") });
    let found;
    try { found = await FloraAI.detect(s.aiExtra || []); } catch (e) { console.error("Flora AI:", e); found = {}; }
    if (this.startEl !== el) return;
    grid.empty();
    const chosen = new Set((s.aiAis || Object.keys(FloraAI.AIS)).filter((k) => found[k] && found[k].sessions));
    const syncGo = () => { go.disabled = !chosen.size; };
    for (const k in FloraAI.AIS) {
      const a = FloraAI.AIS[k], f = found[k] || { sessions: 0, memory: 0 }, look = AI_LOOK[k];
      const b = grid.createEl("button", { cls: "fai-ai ng-glass" });
      const icon = b.createSpan({ cls: "ng-lab-app-icon fai-ai-icon" });
      icon.style.setProperty("--from", look.from); icon.style.setProperty("--to", look.to);
      this.ico(icon, look.icon);
      const tx = b.createSpan({ cls: "fai-ai-text" });
      tx.createSpan({ cls: "fai-ai-name", text: a.name });
      const st = f.sessions
        ? floraNum(f.sessions) + " " + plural(f.sessions, ["сессия", "сессии", "сессий"], ["session", "sessions"]) + (f.memory ? " · " + floraNum(f.memory) + " " + plural(f.memory, ["заметка памяти", "заметки памяти", "заметок памяти"], ["memory note", "memory notes"]) : "")
        : L("Не найдено на этом компьютере", "Not found on this computer");
      tx.createSpan({ cls: "fai-ai-sub", text: st });
      const chk = b.createSpan({ cls: "fai-check" });
      this.ico(chk, "check");
      if (!f.sessions) { b.disabled = true; b.addClass("is-off"); continue; }
      b.toggleClass("is-on", chosen.has(k));
      b.onclick = async () => {
        if (chosen.has(k)) chosen.delete(k); else chosen.add(k);
        b.toggleClass("is-on", chosen.has(k));
        s.aiAis = [...chosen]; syncGo();
        await this.plugin.saveSettings();
      };
    }
    syncGo();
    go.onclick = () => { if (chosen.size) this.runSync(); };
    this.renderExtra(extraBox, found);
  }

  // папки с историей: свои по умолчанию и добавленные вручную (например, бэкап со старого компьютера)
  renderExtra(box, found) {
    const s = this.plugin.settings;
    box.empty();
    box.createDiv({ cls: "ng-lab-widget-title", text: L("Папки с историей", "History folders") });
    const list = box.createDiv({ cls: "fai-folders" });
    const home = FloraAI.homeDir();
    const short = (p) => (home && p.startsWith(home) ? "~" + p.slice(home.length) : p);
    for (const k in found) for (const src of found[k].sources) {
      const row = list.createDiv({ cls: "fai-folder" });
      const ic = row.createSpan({ cls: "ng-lab-row-icon" });
      ic.style.setProperty("--from", AI_LOOK[k].from); ic.style.setProperty("--to", AI_LOOK[k].to);
      this.ico(ic, "folder");
      const tx = row.createSpan({ cls: "ng-lab-row-text" });
      tx.createSpan({ cls: "ng-lab-row-name", text: short(src.dir) });
      tx.createSpan({ cls: "ng-lab-row-kind", text: FloraAI.AIS[k].name + " · " + floraNum(src.sessions) + " " + plural(src.sessions, ["сессия", "сессии", "сессий"], ["session", "sessions"]) });
      if (!src.own) {
        const x = row.createEl("button", { cls: "fai-folder-x", attr: { "aria-label": L("Убрать папку", "Remove the folder") } });
        this.ico(x, "x");
        x.onclick = async () => { s.aiExtra = (s.aiExtra || []).filter((e) => e.dir !== src.dir); await this.plugin.saveSettings(); this.showStart(); };
      }
    }
    const add = box.createDiv({ cls: "fai-add" });
    const input = add.createEl("input", { cls: "fai-add-input", attr: { type: "text", spellcheck: "false", placeholder: L("Ещё папка: .claude или .codex, например из бэкапа", "Another folder: .claude or .codex, for example from a backup") } });
    const btn = add.createEl("button", { cls: "fai-add-btn", text: L("Добавить", "Add") });
    const submit = async () => {
      const dir = FloraAI.expand(input.value);
      if (!dir) return;
      if (!FloraAI.exists(dir)) { new obsidian.Notice(L("Такой папки нет", "This folder does not exist")); return; }
      const ai = await FloraAI.sniff(dir);
      if (!ai) { new obsidian.Notice(L("Не похоже на историю Claude Code или Codex: внутри нет папок projects или sessions", "This does not look like a Claude Code or Codex history: there is no projects or sessions folder inside")); return; }
      s.aiExtra = (s.aiExtra || []).filter((e) => e.dir !== dir).concat([{ ai, dir }]);
      s.aiAis = [...new Set((s.aiAis || Object.keys(FloraAI.AIS)).concat([ai]))];
      await this.plugin.saveSettings();
      this.showStart();
    };
    btn.onclick = submit;
    input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") submit(); });
  }

  /* ---------- синхронизация ---------- */
  async runSync() {
    const s = this.plugin.settings;
    const ais = s.aiAis && s.aiAis.length ? s.aiAis : Object.keys(FloraAI.AIS);
    this.closeStart(); this.closeCard(); this.closeMessage();
    if (this.web) { this.web.destroy(); this.web = null; if (this.spBtn) this.spBtn.toggleClass("is-on", false); }
    const loader = floraLoader(this.wrapEl);
    loader.set(L("Ищу истории ИИ", "Looking for AI histories"));
    const token = {}, t0 = performance.now();
    this.scanning = token;
    let res = null;
    try {
      res = await FloraAI.sync({
        ais, extra: s.aiExtra || [], cache: this.cache,
        onProgress: (d, n) => loader.set(L("Читаю историю  ", "Reading history  ") + floraNum(d) + " / " + floraNum(n), n ? d / n : 1),
        alive: () => this.scanning === token,
      });
    } catch (e) {
      console.error("Flora AI:", e);
      new obsidian.Notice(L("Не получилось прочитать историю ИИ: ", "Could not read the AI history: ") + (e && e.message ? e.message : e));
    }
    if (this.scanning !== token) { loader.remove(); return; }
    this.scanning = null;
    if (!res) { loader.remove(); this.showStart(); return; }
    this.cache = Object.assign({}, res.cache, { ais, links: (this.cache && this.cache.links) || [] });
    this.useCache();
    try { await this.plugin.aiSave(this.cache); } catch (e) { console.error("Flora AI:", e); }
    loader.set(L("Выращиваю нейроны", "Growing neurons"), 1);
    await new Promise((r) => window.setTimeout(r, Math.max(0, 1100 - (performance.now() - t0))));
    loader.done();
    if (!this.B.projects.length) {
      this.showMessage(L("Проектов пока не нашлось: в истории нет работы в папках проектов. Поработайте с ИИ в папке проекта и синхронизируйте снова.", "No projects found yet: the history has no work inside project folders. Work with the AI in a project folder and sync again."), true);
      return;
    }
    this.showGraph(true);
  }

  /* ---------- граф ---------- */
  showGraph(spider) {
    this.closeStart(); this.closeMessage();
    if (!this.B || !this.B.projects.length) { this.showStart(); return; }
    if (!this.renderer) {
      const s = this.plugin.settings;
      const canvas = this.wrapEl.createEl("canvas");
      this.renderer = new NG.NeuralRenderer(canvas, {
        activity: s.activity,
        onOpen: (n, ev) => this.openNode(n, ev),
        onTimeline: (tl) => this.updateTimeline(tl),
      });
      this.buildControls(this.wrapEl);
    }
    this.refresh().then(() => { if (spider && this.renderer) window.setTimeout(() => this.startSpider(), 900); });
  }

  buildControls(wrap) {
    const s = this.plugin.settings;
    const bar = wrap.createDiv({ cls: "ng-ctl" });
    const btn = (parent, icon, label, title) => {
      const b = parent.createEl("button", { cls: "ng-ctl-btn", attr: { "aria-label": title } });
      if (icon) this.ico(b.createSpan({ cls: "ng-ctl-ico" }), icon);
      if (label) b.createSpan({ cls: "ng-ctl-text", text: label });
      else b.addClass("is-icon");
      return b;
    };
    const g1 = bar.createDiv({ cls: "ng-ctl-group" });
    btn(g1, "sparkles", L("ИИ", "AI"), L("Выбрать ИИ и папки с историей", "Choose the AIs and history folders")).onclick = () => this.showStart();
    btn(g1, "refresh-cw", L("Синхронизировать", "Sync"), L("Найти новые проекты и сессии", "Find new projects and sessions")).onclick = () => this.runSync();
    const chats = btn(g1, "message-square", L("Чаты", "Chats"), L("Чаты без папки проекта", "Chats without a project folder"));
    chats.toggleClass("is-on", s.aiChats !== false);
    chats.onclick = async () => { s.aiChats = s.aiChats === false; chats.toggleClass("is-on", s.aiChats); await this.plugin.saveSettings(); this.closeCard(); this.refresh(); };
    const g2 = bar.createDiv({ cls: "ng-ctl-group" });
    const steps = [[0, L("Пауза", "Paused")], [0.5, L("Тихо", "Calm")], [1, L("Обычно", "Normal")], [2, L("Живо", "Lively")], [4, L("Буря", "Storm")]];
    const nameOf = (v) => (steps.find((x) => x[0] === v) || steps[2])[1];
    const act = btn(g2, "zap", nameOf(s.activity), L("Как часто клетки сами вспыхивают", "How often cells fire on their own"));
    act.onclick = async () => {
      const i = steps.findIndex((x) => x[0] === s.activity);
      s.activity = steps[(i + 1) % steps.length][0];
      act.querySelector(".ng-ctl-text").setText(nameOf(s.activity));
      this.renderer.opts.activity = s.activity;
      await this.plugin.saveSettings();
    };
    btn(g2, "image", "", L("Живые обои", "Live wallpaper")).onclick = () => new FloraWallModal(this.app, this.plugin).open();
    btn(g2, "scan", "", L("Показать всё (или двойной клик по фону)", "Fit all (or double-click the background)")).onclick = () => this.renderer.fit(false);
    const tlBtn = btn(g2, "history", L("Таймлайн", "Timeline"), L("Посмотреть, как появлялись проекты", "Watch your projects appear one by one"));
    tlBtn.onclick = () => { const on = !this.tlBar; tlBtn.toggleClass("is-on", on); if (on) { this.closeCard(); this.openTimeline(wrap); } else this.closeTimeline(); };
    this.tlBtn = tlBtn;
    this.spBtn = btn(g2, "bug", L("Паук", "Spider"), L("Паук пройдёт по проектам и свяжет их между собой", "The spider walks your projects and links them together"));
    this.spBtn.onclick = () => { if (this.web) { this.web.destroy(); this.web = null; this.spBtn.toggleClass("is-on", false); } else this.startSpider(); };
    btn(g2, "file-plus", L("В заметки", "To notes"), L("Сохранить проекты заметками в хранилище", "Save the projects as notes in the vault")).onclick = () => this.exportNotes();
  }

  /* ---------- паук связывает проекты ---------- */
  startSpider() {
    if (!this.renderer) return;
    if (this.web) this.web.destroy();
    this.closeCard();
    this.spBtn && this.spBtn.toggleClass("is-on", true);
    const B = this.B;
    this.web = new FloraSpider.Web(this.renderer, this.wrapEl, {
      app: this.app, icon: (el, n) => this.ico(el, n),
      kinds: FloraAI.KINDS,
      steps: [L("Читаю проекты", "Reading projects"), L("Сверяю память, папки и дни", "Comparing memory, folders and days"), L("Связываю проекты", "Linking projects")],
      note: L("Паук связывает проекты только в этом графе. Ваши файлы и истории ИИ он не трогает.", "The spider links projects only in this graph. It never touches your files or AI histories."),
      empty: L("Связей между проектами пока не нашёл.", "No links between projects yet."),
      name: (id) => { const n = this.renderer && this.renderer.byId.get(id); return n ? n.label : id; },
      scan: async (prog, alive) => {
        const P = this.visibleProjects();
        for (let i = 0; i < P.length; i++) {
          if (!alive()) return null;
          if (i % 3 === 0) { prog(i + 1, P.length, 0); await new Promise((r) => window.setTimeout(r, 30)); }
        }
        prog(P.length, P.length, 1);
        return FloraAI.links(Object.assign({}, B, { projects: P }));
      },
      open: (id, ev) => this.openNode({ id }, ev),
      onDone: (found) => this.keepLinks(found),
      onClose: () => { this.web = null; this.spBtn && this.spBtn.toggleClass("is-on", false); },
    });
  }
  async keepLinks(found) {
    this.links = (found || []).map((f) => ({ a: f.a, b: f.b, kind: f.kind, why: f.why, snippet: f.snippet || "" }));
    if (this.cache) { this.cache.links = this.links; try { await this.plugin.aiSave(this.cache); } catch (e) { console.error("Flora AI:", e); } }
    this.refresh();
  }

  /* ---------- карточка проекта, сессии или памяти ---------- */
  closeCard() { if (this.cardEl) { this.cardEl.remove(); this.cardEl = null; } }
  openNode(n) {
    const R = this.renderer;
    const node = R && R.byId.get(n.id || n.path);
    if (!node || !node.ai) return;
    try { R.fire(node, null, true); } catch { /* вспышка — украшение */ }
    this.showCard(node);
  }
  showCard(node) {
    this.closeCard();
    const c = (this.cardEl = this.wrapEl.createDiv({ cls: "fai-card" }));
    const head = c.createDiv({ cls: "fai-card-head" });
    const dot = head.createSpan({ cls: "fai-card-dot" });
    dot.style.setProperty("--c", node.color || "#fff");
    const kind = head.createSpan({ cls: "fai-card-kind" });
    const x = head.createEl("button", { cls: "fai-card-x", attr: { "aria-label": L("Закрыть", "Close") } });
    this.ico(x, "x");
    x.onclick = () => this.closeCard();
    const body = c.createDiv({ cls: "fai-card-body" });
    const t = node.ai.type;
    if (t === "project") { kind.setText(node.ai.p.chat ? L("Чат с ИИ", "AI chat") : L("Проект", "Project")); this.cardProject(body, node.ai.p, node); }
    else if (t === "session") { kind.setText(L("Сессия ", "Session · ") + FloraAI.AIS[node.ai.S.ai].name); this.cardSession(body, node.ai.S); }
    else { kind.setText(L("Память ИИ", "AI memory")); this.cardMemory(body, node.ai.M); }
  }
  fmtDate(t, year) { return t ? new Date(t).toLocaleDateString(FLORA_LANG === "ru" ? "ru-RU" : "en-US", year ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" }) : ""; }
  span(t0, t1) {
    if (!t0) return "";
    const y = new Date(t0).getFullYear() !== new Date(t1 || t0).getFullYear();
    const a = this.fmtDate(t0, y), b = this.fmtDate(t1 || t0, true);
    return a === b || new Date(t0).toDateString() === new Date(t1 || t0).toDateString() ? b : a + " — " + b;
  }
  section(body, title) { const s = body.createDiv({ cls: "fai-sec" }); s.createDiv({ cls: "fai-sec-title", text: title }); return s; }
  row(parent, color, name, sub, onClick) {
    const r = parent.createEl(onClick ? "button" : "div", { cls: "fai-row" });
    const d = r.createSpan({ cls: "fai-row-dot" }); d.style.setProperty("--c", color);
    const tx = r.createSpan({ cls: "fai-row-tx" });
    tx.createSpan({ cls: "fai-row-name", text: name });
    if (sub) tx.createSpan({ cls: "fai-row-sub", text: sub });
    if (onClick) r.onclick = onClick;
    return r;
  }
  actions(body) { return body.createDiv({ cls: "fai-actions" }); }
  action(parent, icon, text, fn, main) {
    const b = parent.createEl("button", { cls: "fai-act" + (main ? " is-main" : "") });
    this.ico(b.createSpan({ cls: "fai-act-ico" }), icon);
    b.createSpan({ text });
    b.onclick = fn;
    return b;
  }
  copy(text, what) {
    const done = () => new obsidian.Notice(what || L("Скопировано", "Copied"));
    try { navigator.clipboard.writeText(text).then(done, () => new obsidian.Notice(text)); } catch { new obsidian.Notice(text); }
  }
  openPath(p, reveal) {
    try {
      const sh = require("electron").shell;
      if (reveal) sh.showItemInFolder(p);
      else sh.openPath(p).then((err) => { if (err) new obsidian.Notice(err); });
    } catch { new obsidian.Notice(L("Не получилось открыть: ", "Could not open: ") + p); }
  }
  resumeCmd(S) {
    if (!S || !S.id) return "";
    const cd = S.cwd && FloraAI.exists(S.cwd) ? 'cd "' + S.cwd + '" && ' : "";
    if (!cd && S.cwd) return "";       // папки этой сессии на компьютере нет (например, история со старого ПК)
    return cd + (S.ai === "codex" ? "codex resume " + S.id : "claude --resume " + S.id);
  }

  cardProject(body, p, node) {
    body.createEl("h3", { cls: "fai-card-title", text: p.chat ? (p.sessions[0] && p.sessions[0].title) || p.name : p.name });
    if (p.path) {
      const pth = body.createEl("button", { cls: "fai-path", text: p.path, attr: { "aria-label": L("Скопировать путь", "Copy the path") } });
      pth.onclick = () => this.copy(p.path, L("Путь скопирован", "Path copied"));
    } else if (p.chat) body.createDiv({ cls: "fai-path is-muted", text: L("Чат без папки проекта", "A chat without a project folder") });
    const chips = body.createDiv({ cls: "fai-chips" });
    for (const k in p.ais) {
      const ch = chips.createSpan({ cls: "fai-chip" });
      ch.style.setProperty("--c", FloraAI.AIS[k].color);
      ch.createSpan({ cls: "fai-chip-dot" });
      ch.createSpan({ text: FloraAI.AIS[k].name + " · " + floraNum(p.ais[k]) });
    }
    for (const tl of p.tools) chips.createSpan({ cls: "fai-chip is-tool", text: FloraAI.stackName(tl) });
    if (p.fromMemory && !p.sessions.length) chips.createSpan({ cls: "fai-chip is-tool", text: L("Из памяти ИИ", "From AI memory") });
    const stats = body.createDiv({ cls: "fai-stats" });
    const stat = (n, l) => { const s = stats.createDiv({ cls: "fai-stat" }); s.createDiv({ cls: "fai-stat-n", text: n }); s.createDiv({ cls: "fai-stat-l", text: l }); };
    const days = Object.keys(p.days).length;
    stat(floraNum(p.sessions.length), plural(p.sessions.length, ["сессия", "сессии", "сессий"], ["session", "sessions"]));
    stat(floraNum(days), plural(days, ["день работы", "дня работы", "дней работы"], ["day of work", "days of work"]));
    stat(floraNum(p.prompts), plural(p.prompts, ["просьба", "просьбы", "просьб"], ["request", "requests"]));
    const when = this.span(p.t0, p.t1);
    if (when) body.createDiv({ cls: "fai-when", text: when });
    if (p.memories.length) {
      const sec = this.section(body, L("Что помнит ИИ", "What the AI remembers"));
      for (const M of p.memories.slice(0, 5)) this.row(sec, "#f0a57c", M.name, M.desc, () => this.openNode({ id: "m:" + M.name }));
    }
    if (p.sessions.length) {
      const sec = this.section(body, L("Сессии", "Sessions"));
      for (const S of p.sessions.slice(0, 8)) this.row(sec, FloraAI.AIS[S.ai].color, S.title || FloraAI.AIS[S.ai].name, this.fmtDate(S.t1 || S.t0, true) + " · " + FloraAI.AIS[S.ai].name, () => this.openNode({ id: "s:" + S.ai + ":" + S.id }));
      if (p.sessions.length > 8) sec.createDiv({ cls: "fai-more", text: L("и ещё ", "and ") + floraNum(p.sessions.length - 8) + L("", " more") });
    }
    const pid = "p:" + p.key;
    const mine = (this.links || []).filter((l) => l.a === pid || l.b === pid);
    if (mine.length) {
      const sec = this.section(body, L("Связи", "Links"));
      for (const l of mine.slice(0, 8)) {
        const other = l.a === pid ? l.b : l.a, n = this.renderer.byId.get(other);
        if (!n) continue;
        this.row(sec, (FloraAI.KINDS[l.kind] || {}).color || "#fff", n.label, l.why, () => this.openNode({ id: other }));
      }
    }
    const act = this.actions(body);
    if (p.path && FloraAI.exists(p.path)) this.action(act, "folder-open", L("Открыть папку", "Open folder"), () => this.openPath(p.path), true);
    const cmd = this.resumeCmd(p.sessions[0]);
    if (cmd) this.action(act, "terminal", L("Продолжить", "Continue"), () => this.copy(cmd, L("Команда скопирована: вставьте её в терминал", "Command copied: paste it into a terminal")));
    this.action(act, "file-plus", L("Заметка", "Note"), () => this.exportNotes([p]));
  }
  cardSession(body, S) {
    body.createEl("h3", { cls: "fai-card-title", text: S.title || FloraAI.AIS[S.ai].name });
    const when = this.span(S.t0, S.t1);
    if (when) body.createDiv({ cls: "fai-when", text: when });
    const stats = body.createDiv({ cls: "fai-stats" });
    const stat = (n, l) => { const s = stats.createDiv({ cls: "fai-stat" }); s.createDiv({ cls: "fai-stat-n", text: n }); s.createDiv({ cls: "fai-stat-l", text: l }); };
    stat(floraNum(S.prompts), plural(S.prompts, ["просьба", "просьбы", "просьб"], ["request", "requests"]));
    stat(floraNum(S.tools || 0), plural(S.tools || 0, ["действие", "действия", "действий"], ["action", "actions"]));
    stat(floraNum(Object.keys(S.days).length), plural(Object.keys(S.days).length, ["день", "дня", "дней"], ["day", "days"]));
    if (S.projects && S.projects.length) {
      const sec = this.section(body, L("Проекты", "Projects"));
      for (const k of S.projects) { const p = this.projectOf(k); if (p) this.row(sec, "#7fd6ff", p.chat ? L("Этот чат", "This chat") : p.name, p.path, () => this.openNode({ id: "p:" + k })); }
    }
    const act = this.actions(body);
    const cmd = this.resumeCmd(S);
    if (cmd) this.action(act, "terminal", L("Продолжить сессию", "Resume session"), () => this.copy(cmd, L("Команда скопирована: вставьте её в терминал", "Command copied: paste it into a terminal")), true);
    if (S.file && FloraAI.exists(S.file)) this.action(act, "folder-open", L("Файл истории", "History file"), () => this.openPath(S.file, true));
  }
  cardMemory(body, M) {
    body.createEl("h3", { cls: "fai-card-title", text: M.name });
    if (M.desc) body.createDiv({ cls: "fai-desc", text: M.desc });
    if (M.t) body.createDiv({ cls: "fai-when", text: L("Обновлено ", "Updated ") + this.fmtDate(M.t, true) });
    if (M.projects && M.projects.length) {
      const sec = this.section(body, L("Про проекты", "About the projects"));
      for (const k of M.projects) { const p = this.projectOf(k); if (p) this.row(sec, "#7fd6ff", p.name, p.path, () => this.openNode({ id: "p:" + k })); }
    }
    const act = this.actions(body);
    if (M.file && FloraAI.exists(M.file)) this.action(act, "file-text", L("Открыть заметку памяти", "Open the memory note"), () => this.openPath(M.file), true);
  }

  /* ---------- сообщения поверх пустого раздела ---------- */
  closeMessage() { if (this.msgEl) { this.msgEl.remove(); this.msgEl = null; } }
  showMessage(text, withBack) {
    this.closeMessage();
    const m = (this.msgEl = this.wrapEl.createDiv({ cls: "fai-msg ng-glass-dark" }));
    this.ico(m.createDiv({ cls: "fai-msg-ico" }), "sparkles");
    m.createDiv({ cls: "fai-msg-text", text });
    if (withBack) { const b = m.createEl("button", { cls: "fai-go", text: L("Выбрать ИИ", "Choose an AI") }); b.onclick = () => this.showStart(); }
  }

  /* ---------- проекты заметками: по одной на проект, со ссылками между связанными ---------- */
  async exportNotes(only) {
    const s = this.plugin.settings, vault = this.app.vault, mc = this.app.metadataCache;
    const folder = String(s.aiFolder || "Flora AI").replace(/^\/+|\/+$/g, "") || "Flora AI";
    const P = only || this.visibleProjects();
    if (!P.length) return;
    try {
      if (!vault.getAbstractFileByPath(folder)) await vault.createFolder(folder);
      // уже созданные Flora заметки узнаём по ключу проекта в свойствах
      const mine = new Map();
      for (const f of vault.getMarkdownFiles()) {
        if (!f.path.startsWith(folder + "/")) continue;
        const fm = (mc.getFileCache(f) || {}).frontmatter;
        if (fm && fm["flora-ai"]) mine.set(String(fm["flora-ai"]), f);
      }
      const safe = (t) => String(t).replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Project";
      const names = new Map(), taken = new Set([...mine.values()].map((f) => f.basename.toLowerCase()));
      for (const p of this.B.projects) {
        const f = mine.get(p.key);
        if (f) { names.set(p.key, f.basename); continue; }
        if (!P.includes(p)) continue;
        const base = safe(p.chat ? (p.sessions[0] && p.sessions[0].title) || p.name : p.name);
        let nm = base, i = 2;
        while (taken.has(nm.toLowerCase()) || vault.getAbstractFileByPath(folder + "/" + nm + ".md")) nm = base + " " + i++;
        taken.add(nm.toLowerCase());
        names.set(p.key, nm);
      }
      const day = (t) => { if (!t) return ""; const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
      let made = 0, updated = 0;
      for (const p of P) {
        const pid = "p:" + p.key;
        const lines = ["<!-- flora-ai:start -->"];
        lines.push("> [!info] " + L("Проект с ИИ", "AI project") + " · " + Object.keys(p.ais).map((k) => FloraAI.AIS[k].name).join(", "));
        if (p.path) lines.push("> " + L("Папка", "Folder") + ": \x60" + p.path + "\x60");
        const when = this.span(p.t0, p.t1);
        lines.push("> " + (when ? when + " · " : "") + floraNum(p.sessions.length) + " " + plural(p.sessions.length, ["сессия", "сессии", "сессий"], ["session", "sessions"]));
        if (p.memories.length) {
          lines.push("", "## " + L("Что помнит ИИ", "What the AI remembers"));
          for (const M of p.memories) lines.push("- **" + M.name + "**" + (M.desc ? " — " + M.desc : ""));
        }
        if (p.sessions.length) {
          lines.push("", "## " + L("Сессии", "Sessions"));
          for (const S of p.sessions) lines.push("- " + day(S.t1 || S.t0) + " · " + FloraAI.AIS[S.ai].name + " · " + (S.title || "…").replace(/\[\[|\]\]/g, ""));
        }
        const rel = (this.links || []).filter((l) => l.a === pid || l.b === pid);
        const linked = rel.map((l) => ({ k: (l.a === pid ? l.b : l.a).slice(2), why: l.why })).filter((x) => names.has(x.k));
        if (linked.length) {
          lines.push("", "## " + L("Связи", "Links"));
          for (const x of linked) lines.push("- [[" + names.get(x.k) + "]] — " + x.why);
        }
        lines.push("<!-- flora-ai:end -->");
        const block = lines.join("\n");
        const meta = (fm) => {
          fm["flora-ai"] = p.key;
          if (p.path) fm.folder = p.path;
          fm.ai = Object.keys(p.ais).map((k) => FloraAI.AIS[k].name);
          if (p.tools.length) fm.tools = p.tools.map((t) => FloraAI.stackName(t));
          fm.sessions = p.sessions.length;
          if (p.t0) fm.first = day(p.t0);
          if (p.t1) fm.last = day(p.t1);
          const tags = Array.isArray(fm.tags) ? fm.tags : fm.tags ? [fm.tags] : [];
          if (!tags.includes("flora-ai")) tags.push("flora-ai");
          fm.tags = tags;
        };
        let f = mine.get(p.key);
        if (f) {
          // своё у человека в заметке не трогаем: меняем только блок Flora
          await vault.process(f, (text) => /<!-- flora-ai:start -->[\s\S]*<!-- flora-ai:end -->/.test(text) ? text.replace(/<!-- flora-ai:start -->[\s\S]*<!-- flora-ai:end -->/, () => block) : text.replace(/\s*$/, "\n\n") + block + "\n");
          updated++;
        } else {
          f = await vault.create(folder + "/" + names.get(p.key) + ".md", block + "\n");
          made++;
        }
        await this.app.fileManager.processFrontMatter(f, meta);
      }
      new obsidian.Notice(L("Заметки в папке «", "Notes in the folder “") + folder + L("»: создано ", "”: created ") + made + L(", обновлено ", ", updated ") + updated);
      if (only && only.length === 1) { const f = mine.get(only[0].key) || vault.getAbstractFileByPath(folder + "/" + names.get(only[0].key) + ".md"); if (f instanceof obsidian.TFile) this.app.workspace.getLeaf("tab").openFile(f); }
    } catch (e) {
      console.error("Flora AI:", e);
      new obsidian.Notice(L("Не получилось сохранить заметки: ", "Could not save the notes: ") + (e && e.message ? e.message : e));
    }
  }
}
