
/* ------------------------------------------------------------------ */
/* Журнал дня: шапка ежедневной заметки                                 */
/* ------------------------------------------------------------------ */
const RU_MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const RU_MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const RU_WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const JOURNAL_TEMPLATE = "## Наблюдения\n- \n\n## Задачи\n- [ ] \n\n## Мысли\n\n\n## Связи дня\n- \n";

function pad2(n) { return (n < 10 ? "0" : "") + n; }
function dayStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function dayOfYear(d) { return Math.round((dayStart(d) - new Date(d.getFullYear(), 0, 1)) / 864e5) + 1; }
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const wd = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - wd);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 864e5 + 1) / 7);
}

class DailyTools {
  constructor(app, store) {
    this.app = app;
    // store: { get(): {path: "YYYY-MM-DD"}, save() } — память о переименованных журналах
    this.store = store || { get: () => ({}), save: () => {} };
  }
  isoOf(date) { return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate()); }
  fromIso(s) { const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return r ? new Date(+r[1], +r[2] - 1, +r[3]) : null; }
  /** имя файла совпадает с форматом дня в папке ежедневных заметок */
  dayByName(file) {
    const o = this.options();
    const parent = file.parent ? file.parent.path : "";
    const norm = parent === "/" ? "" : parent;
    if (norm !== o.folder) return null;
    return this.parse(file.basename, o.format);
  }
  /** журнал узнаётся по разделам заготовки — для заметок, переименованных раньше */
  looksLikeJournal(file) {
    const c = this.app.metadataCache && this.app.metadataCache.getFileCache && this.app.metadataCache.getFileCache(file);
    const hs = c && c.headings ? c.headings.map((h) => String(h.heading).trim().toLowerCase()) : [];
    return hs.includes("наблюдения") && hs.includes("задачи") && hs.includes("связи дня");
  }
  remember(file, date) {
    const map = this.store.get();
    const iso = this.isoOf(date);
    if (map[file.path] === iso) return;
    map[file.path] = iso;
    this.store.save();
  }
  /** переименование/перенос: журнал остаётся журналом своего дня */
  onRename(file, oldPath) {
    if (!file || file.extension !== "md") return;
    const map = this.store.get();
    let date = this.fromIso(map[oldPath]);
    if (!date) {
      const o = this.options();
      const slash = oldPath.lastIndexOf("/");
      const oldParent = slash < 0 ? "" : oldPath.slice(0, slash);
      const oldBase = oldPath.slice(slash + 1).replace(/\.md$/i, "");
      if (oldParent === o.folder) date = this.parse(oldBase, o.format);
    }
    if (map[oldPath]) delete map[oldPath];
    if (date && !this.dayByName(file)) map[file.path] = this.isoOf(date);
    else if (map[file.path]) delete map[file.path];
    this.store.save();
  }
  onDelete(file) {
    const map = this.store.get();
    if (file && map[file.path]) { delete map[file.path]; this.store.save(); }
  }
  options() {
    let o = {};
    try {
      const p = this.app.internalPlugins && this.app.internalPlugins.getPluginById && this.app.internalPlugins.getPluginById("daily-notes");
      o = (p && p.instance && p.instance.options) || {};
    } catch (e) { /* нет плагина — значения по умолчанию */ }
    return {
      format: (o.format || "YYYY-MM-DD").trim() || "YYYY-MM-DD",
      folder: (o.folder || "").trim().replace(/^\/+|\/+$/g, ""),
      template: (o.template || "").trim(),
    };
  }
  format(date, fmt) {
    const m = window.moment;
    if (m) return m(date).format(fmt);
    return fmt.replace("YYYY", String(date.getFullYear())).replace("MM", pad2(date.getMonth() + 1)).replace("DD", pad2(date.getDate()));
  }
  parse(name, fmt) {
    const m = window.moment;
    if (m) { const d = m(name, fmt, true); return d.isValid() ? d.toDate() : null; }
    const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(name);
    return fmt === "YYYY-MM-DD" && r ? new Date(+r[1], +r[2] - 1, +r[3]) : null;
  }
  /** дата ежедневной заметки или null */
  dayOf(file) {
    if (!file || file.extension !== "md") return null;
    const byName = this.dayByName(file);
    if (byName) return byName;
    const mapped = this.fromIso(this.store.get()[file.path]);
    if (mapped) return mapped;
    if (this.looksLikeJournal(file) && file.stat) {
      const d = dayStart(new Date(file.stat.ctime));
      this.remember(file, d);
      return d;
    }
    return null;
  }
  /** название переименованного журнала (или null, если имя — просто дата) */
  customName(file) { return this.dayByName(file) ? null : file.basename; }
  pathFor(date) {
    const o = this.options();
    const name = this.format(date, o.format) + ".md";
    return o.folder ? o.folder + "/" + name : name;
  }
  fileFor(date) {
    const direct = this.app.vault.getAbstractFileByPath(this.pathFor(date));
    if (direct) return direct;
    const iso = this.isoOf(date), map = this.store.get();
    for (const p in map) if (map[p] === iso) { const f = this.app.vault.getAbstractFileByPath(p); if (f) return f; }
    return null;
  }
  async templateText(date) {
    const o = this.options();
    if (!o.template) return "";
    const tf = this.app.metadataCache.getFirstLinkpathDest(o.template, "");
    if (!tf) return "";
    const raw = await this.app.vault.read(tf);
    const now = new Date();
    return raw
      .replace(/{{\s*date\s*:\s*([^}]+?)\s*}}/g, (_, f) => this.format(date, f))
      .replace(/{{\s*time\s*:\s*([^}]+?)\s*}}/g, (_, f) => this.format(now, f))
      .replace(/{{\s*date\s*}}/g, this.format(date, o.format))
      .replace(/{{\s*time\s*}}/g, this.format(now, "HH:mm"))
      .replace(/{{\s*title\s*}}/g, this.format(date, o.format));
  }
  async openDay(date, leaf) {
    let f = this.fileFor(date);
    if (!f) {
      const o = this.options();
      if (o.folder && !this.app.vault.getAbstractFileByPath(o.folder)) await this.app.vault.createFolder(o.folder);
      f = await this.app.vault.create(this.pathFor(date), await this.templateText(date));
    }
    await (leaf || this.app.workspace.getLeaf(false)).openFile(f);
  }
  /** соседняя существующая ежедневная заметка (dir = -1 / +1) */
  neighbour(date, dir) {
    const o = this.options();
    let best = null;
    for (const f of this.app.vault.getMarkdownFiles()) {
      const d = this.dayOf(f);
      if (!d) continue;
      const diff = dayStart(d) - dayStart(date);
      if (dir < 0 ? diff < 0 : diff > 0) {
        if (!best || (dir < 0 ? d > best.d : d < best.d)) best = { d, f };
      }
    }
    return best;
  }
}

class DayHeader {
  constructor(plugin, leaf) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.leaf = leaf;
    this.tools = plugin.daily;
    this.file = null; this.el = null; this.R = null; this.sig = ""; this.tick = 0;
  }

  update() {
    const view = this.leaf.view;
    const file = view && view.file;
    const isMd = view && typeof view.getViewType === "function" && view.getViewType() === "markdown";
    const day = isMd ? this.tools.dayOf(file) : null;
    if (!day) { this.destroy(); return; }
    if (!this.el || this.file !== file) this.build(file, day);
    // шапка — первым элементом текста заметки (в редакторе и в режиме чтения)
    const mode = typeof view.getMode === "function" ? view.getMode() : "source";
    const host = mode === "preview" ? view.contentEl.querySelector(".markdown-reading-view .markdown-preview-sizer, .markdown-preview-sizer")
                                    : view.contentEl.querySelector(".cm-sizer");
    if (host && host.firstChild !== this.el) host.prepend(this.el);
    view.containerEl.classList.add("ng-daily");
    // переименованный журнал: своё название остаётся видно под шапкой
    view.containerEl.classList.toggle("ng-daily-named", !!this.tools.customName(file));
    // раз в несколько секунд — пересчитать «нейроны дня» и месяц
    if (++this.tick % 5 === 0) this.refresh(false);
  }

  build(file, day) {
    this.destroy(true);
    this.file = file; this.day = day;
    const doc = this.leaf.view.containerEl.ownerDocument || document;
    const el = this.el = doc.createElement("div");
    el.className = "ng-day";
    el.setAttribute("contenteditable", "false");
    for (const ev of ["mousedown", "click", "pointerdown", "keydown"]) el.addEventListener(ev, (e) => e.stopPropagation());

    const band = el.appendChild(doc.createElement("div"));
    band.className = "ng-day-band";
    const canvas = band.appendChild(doc.createElement("canvas"));
    const title = band.appendChild(doc.createElement("div"));
    title.className = "ng-day-title";
    const kicker = title.appendChild(doc.createElement("div")); kicker.className = "ng-day-kicker";
    const big = title.appendChild(doc.createElement("div")); big.className = "ng-day-date";
    const week = title.appendChild(doc.createElement("div")); week.className = "ng-day-week";
    const stat = title.appendChild(doc.createElement("div")); stat.className = "ng-day-stat";
    this.statEl = stat;
    const today = new Date();
    const rel = sameDay(day, today) ? "сегодня" : sameDay(day, addDays(today, -1)) ? "вчера" : sameDay(day, addDays(today, 1)) ? "завтра" : "";
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    kicker.textContent = rel ? cap(rel) + ", " + RU_WEEKDAYS[day.getDay()] : cap(RU_WEEKDAYS[day.getDay()]);
    big.textContent = day.getDate() + " " + RU_MONTHS_GEN[day.getMonth()];
    week.textContent = dayOfYear(day) + "-й день года, " + isoWeek(day) + "-я неделя";

    const nav = band.appendChild(doc.createElement("div"));
    nav.className = "ng-day-nav";
    const setIco = (el, name, glyph) => { if (typeof obsidian.setIcon === "function") obsidian.setIcon(el, name); else el.textContent = glyph; };
    const mkBtn = (parent, icon, glyph, text, title, fn) => {
      const b = parent.appendChild(doc.createElement("button"));
      if (icon) { const i = b.appendChild(doc.createElement("span")); i.className = "ng-day-ico"; setIco(i, icon, glyph); }
      if (text) { const t = b.appendChild(doc.createElement("span")); t.className = "ng-day-btn-text"; t.textContent = text; }
      b.setAttribute("aria-label", title);
      b.addEventListener("click", (e) => { e.preventDefault(); fn(); });
      return b;
    };
    this.resetBtn = mkBtn(nav, "rotate-ccw", "↺", "", "Сбросить запись к заготовке (нажать дважды)", () => this.askReset());
    this.resetBtn.classList.add("ng-day-reset");
    const seg = nav.appendChild(doc.createElement("div")); seg.className = "ng-day-seg";
    this.prevBtn = mkBtn(seg, "chevron-left", "‹", "", "Предыдущая запись", () => { const n = this.tools.neighbour(this.day, -1); if (n) this.leaf.openFile(n.f); });
    mkBtn(seg, null, "", "Сегодня", "Открыть сегодняшнюю заметку", () => this.tools.openDay(new Date(), this.leaf));
    this.nextBtn = mkBtn(seg, "chevron-right", "›", "", "Следующая запись", () => { const n = this.tools.neighbour(this.day, 1); if (n) this.leaf.openFile(n.f); });

    const month = el.appendChild(doc.createElement("div"));
    month.className = "ng-day-month";
    this.monthEl = month;

    this.startEl = el.appendChild(doc.createElement("div"));
    this.startEl.className = "ng-day-start";

    this.R = new NG.NeuralRenderer(canvas, {
      hud: false, labels: true, activity: Math.max(0.5, this.plugin.settings.activity) * 1.6,
      noWheel: true, pauseOffscreen: true, fitShift: 0.2, maxFitZoom: 1.6, maxFps: 30, renderScale: 1,
      onOpen: (n) => { const f = this.app.vault.getAbstractFileByPath(n.path); if (f && f !== this.file) this.leaf.openFile(f); },
    });
    this.refresh(true);
  }

  // заметки, созданные или изменённые в этот день
  touched() {
    const a = dayStart(this.day).getTime(), b = a + 864e5;
    const out = [];
    for (const f of this.app.vault.getFiles()) {
      if (f === this.file || !f.stat) continue;
      const hit = (f.stat.mtime >= a && f.stat.mtime < b) || (f.stat.ctime >= a && f.stat.ctime < b);
      if (hit && (f.extension === "md" || f.extension === "canvas" || /^(png|jpe?g|gif|webp|svg|pdf)$/i.test(f.extension))) out.push(f);
    }
    out.sort((p, q) => q.stat.mtime - p.stat.mtime);
    return out.slice(0, 80);
  }

  refresh(force) {
    if (!this.el || !this.file) return;
    const files = this.touched();
    const sig = files.map((f) => f.path).join("|");
    // нейроны дня
    if (force || sig !== this.sig) {
      this.sig = sig;
      const me = this.file.path;
      const set = new Set(files.map((f) => f.path).concat([me]));
      const links = {};
      const rl = this.app.metadataCache.resolvedLinks || {};
      for (const src of set) {
        const row = rl[src];
        if (!row) continue;
        for (const dst in row) if (set.has(dst)) (links[src] = links[src] || {})[dst] = row[dst];
      }
      for (const f of files) { // каждую заметку дня связываем с днём
        if (!(links[me] && links[me][f.path]) && !(links[f.path] && links[f.path][me])) (links[me] = links[me] || {})[f.path] = 1;
      }
      const g = NG.buildGraph({
        files: [...set], links, canvases: {}, resolve: () => null,
        cards: false, orphans: true, unresolved: false,
      });
      for (const n of g.nodes) if (n.id === me) { n.color = "#8fe3a1"; n.kind = "note"; }
      this.R.setData(g);
      const k = files.length, m10 = k % 10, m100 = k % 100;
      const word = m10 === 1 && m100 !== 11 ? "заметка" : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? "заметки" : "заметок";
      this.statEl.textContent = k ? k + " " + word + " за этот день" : "За этот день пока нет заметок";
    }
    this.renderMonth();
    this.renderStart();
    const p = this.tools.neighbour(this.day, -1), n = this.tools.neighbour(this.day, 1);
    this.prevBtn.disabled = !p; this.nextBtn.disabled = !n;
  }

  renderMonth() {
    const doc = this.el.ownerDocument;
    const d0 = new Date(this.day.getFullYear(), this.day.getMonth(), 1);
    const days = new Date(this.day.getFullYear(), this.day.getMonth() + 1, 0).getDate();
    const today = new Date();
    const key = d0.getTime() + ":" + days;
    if (this.monthKey !== key) {
      this.monthKey = key;
      this.monthEl.empty ? this.monthEl.empty() : (this.monthEl.innerHTML = "");
      const label = this.monthEl.appendChild(doc.createElement("span"));
      label.className = "ng-day-month-label";
      label.textContent = RU_MONTHS[this.day.getMonth()].charAt(0).toUpperCase() + RU_MONTHS[this.day.getMonth()].slice(1);
      this.dots = [];
      for (let i = 1; i <= days; i++) {
        const date = new Date(this.day.getFullYear(), this.day.getMonth(), i);
        const dot = this.monthEl.appendChild(doc.createElement("button"));
        dot.className = "ng-day-dot";
        dot.setAttribute("aria-label", i + " " + RU_MONTHS_GEN[date.getMonth()]);
        if (date.getDay() === 1) dot.classList.add("is-monday");
        dot.addEventListener("click", (e) => { e.preventDefault(); this.tools.openDay(date, this.leaf); });
        this.dots.push({ dot, date });
      }
    }
    for (const { dot, date } of this.dots) {
      const f = this.tools.fileFor(date);
      const size = f && f.stat ? f.stat.size : -1;
      const lvl = size < 0 ? 0 : size < 120 ? 1 : size < 1200 ? 2 : 3;
      dot.dataset.level = String(lvl);
      dot.classList.toggle("is-today", sameDay(date, today));
      dot.classList.toggle("is-current", sameDay(date, this.day));
    }
  }

  // сброс дня: первое нажатие — «точно?», второе в течение 3 с — заменить текст заготовкой
  askReset() {
    const b = this.resetBtn;
    if (!this.resetArmed) {
      this.resetArmed = true;
      b.classList.add("is-armed");
      b.classList.add("is-armed-text"); b.dataset.label = "Сбросить?";
      clearTimeout(this.resetTimer);
      this.resetTimer = setTimeout(() => this.disarmReset(), 3000);
      return;
    }
    this.disarmReset();
    this.resetDay();
  }
  disarmReset() {
    this.resetArmed = false;
    clearTimeout(this.resetTimer);
    if (this.resetBtn) { this.resetBtn.classList.remove("is-armed", "is-armed-text"); }
  }
  async resetDay() {
    const tpl = (await this.tools.templateText(this.day)) || JOURNAL_TEMPLATE;
    const ed = this.leaf.view && this.leaf.view.editor;
    if (ed && typeof ed.setValue === "function") ed.setValue(tpl);
    else await this.app.vault.modify(this.file, tpl);
    // курсор — в первый пункт списка
    if (ed && typeof ed.setCursor === "function") {
      const lines = tpl.split("\n");
      const i = lines.findIndex((l) => /^\s*-\s/.test(l));
      if (i >= 0) ed.setCursor({ line: i, ch: lines[i].length });
    }
    if (this.startEl) this.startEl.style.display = "none";
  }

  isEmpty() {
    const ed = this.leaf.view && this.leaf.view.editor;
    if (ed && typeof ed.getValue === "function") return ed.getValue().trim() === "";
    return !!(this.file.stat && this.file.stat.size === 0);
  }

  renderStart() {
    const empty = this.isEmpty();
    if (!empty) { this.startEl.style.display = "none"; return; }
    this.startEl.style.display = "";
    if (this.startEl.childElementCount) return;
    const doc = this.el.ownerDocument;
    const b = this.startEl.appendChild(doc.createElement("button"));
    b.textContent = "Начать запись";
    const hint = this.startEl.appendChild(doc.createElement("span"));
    hint.textContent = "Разделы: наблюдения, задачи, мысли и связи дня";
    b.addEventListener("click", (e) => { e.preventDefault(); this.resetDay(); });
  }

  destroy(keepState) {
    clearTimeout(this.resetTimer); this.resetArmed = false;
    if (this.R) { this.R.destroy(); this.R = null; }
    if (this.el) { this.el.remove(); this.el = null; }
    this.monthKey = null; this.sig = "";
    if (!keepState) {
      this.file = null;
      const v = this.leaf.view;
      if (v && v.containerEl) v.containerEl.classList.remove("ng-daily", "ng-daily-named");
    }
  }
}

/**
 * Автозадачи: в разделе «Задачи» ежедневной заметки строка с текстом сама становится «- [ ] ».
 * Возвращает true, если строка была переделана.
 */
function autoTaskLine(editor) {
  const cur = editor.getCursor();
  const line = editor.getLine(cur.line);
  if (!line || !line.trim()) return false;
  const m = /^(\s*)(.*)$/.exec(line);
  const indent = m[1], body = m[2];
  if (/^[-*+]\s*(\[[^\]]?\]?)?\s*$/.test(body)) return false;          // человек сам набирает «- [ ]» — ждём
  if (/^(#|>|```|\||\d+[.)]\s|---)/.test(body)) return false; // заголовок, цитата, код, таблица, нумерация
  let section = null;
  for (let i = cur.line - 1; i >= 0; i--) {
    const h = /^(#{1,6})\s+(.*)$/.exec(editor.getLine(i));
    if (h) { section = h[2]; break; }
  }
  if (!section || !/задач|todo|tasks?/i.test(section)) return false;
  let rest;
  const task = /^[-*+]\s+\[(.)\](.*)$/.exec(body);
  if (task) {
    // уже задача; чиним только «- [ ]текст» без пробела
    if (!task[2] || /^\s/.test(task[2])) return false;
    rest = task[2];
    const fixed = indent + "- [" + task[1] + "] " + rest;
    editor.replaceRange(fixed, { line: cur.line, ch: 0 }, { line: cur.line, ch: line.length });
    editor.setCursor({ line: cur.line, ch: Math.max(0, cur.ch + fixed.length - line.length) });
    return true;
  }
  const bm = /^[-*+]\s+(.*)$/.exec(body);
  rest = bm ? bm[1] : body;
  rest = rest.replace(/^\[\s?\]?\s*/, ""); // «[текст» → «текст»
  const next = indent + "- [ ] " + rest;
  if (next === line) return false;
  editor.replaceRange(next, { line: cur.line, ch: 0 }, { line: cur.line, ch: line.length });
  editor.setCursor({ line: cur.line, ch: Math.max(0, cur.ch + next.length - line.length) });
  return true;
}
