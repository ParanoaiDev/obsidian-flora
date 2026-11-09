
/* ------------------------------------------------------------------ */
/* «Расследование» — доска дела для OSINT                              */
/* Ничего не ищет и никуда не ходит: красиво оформляет то, что человек  */
/* находит и записывает сам. Дело — обычная заметка в папке             */
/* «Расследования»: машинный блок ```ng-case``` + читаемая сводка.      */
/* ------------------------------------------------------------------ */
const CASE_VIEW = "ng-case-view";
// папка для новых дел; сами дела находятся по свойству ng-case в любой папке (и в «Расследования», и в «Investigations»)
function caseFolder() { return L("Расследования", "Investigations"); }
const caseTypes = floraLazy(() => ({
  person:  { label: L("Человек", "Person"),          icon: "user",        glyph: "◉", color: "#8fe3a1", fields: [["fio", L("ФИО", "Full name")], ["alias", L("Псевдонимы", "Aliases")], ["born", L("Дата рождения", "Date of birth")], ["city", L("Город", "City")], ["role", L("Роль в деле", "Role in the case")]] },
  org:     { label: L("Организация", "Organization"), icon: "building-2",  glyph: "▣", color: "#7ab8ff", fields: [["name", L("Название", "Name")], ["reg", L("Рег. номер", "Registration number")], ["country", L("Страна", "Country")], ["site", L("Сайт", "Website")]] },
  account: { label: L("Аккаунт", "Account"),          icon: "at-sign",     glyph: "@", color: "#e59be0", fields: [["platform", L("Платформа", "Platform")], ["handle", L("Ник", "Username")], ["url", L("Ссылка", "Link")], ["uid", "ID"]] },
  email:   { label: L("Почта", "Email"),              icon: "mail",        glyph: "✉", color: "#f2c56b", fields: [["addr", L("Адрес", "Address")], ["provider", L("Сервис", "Provider")]] },
  phone:   { label: L("Телефон", "Phone"),            icon: "phone",       glyph: "☏", color: "#ff8a70", fields: [["num", L("Номер", "Number")], ["carrier", L("Оператор", "Carrier")], ["region", L("Регион", "Region")]] },
  domain:  { label: L("Домен", "Domain"),             icon: "globe",       glyph: "◎", color: "#9fe6dc", fields: [["host", L("Домен", "Domain")], ["registrar", L("Регистратор", "Registrar")], ["created", L("Создан", "Registered on")]] },
  ip:      { label: L("IP / сервер", "IP / server"),  icon: "server",      glyph: "▤", color: "#c6e07a", fields: [["ip", L("Адрес", "Address")], ["asn", "ASN"], ["geo", L("Гео", "Location")]] },
  place:   { label: L("Место", "Place"),              icon: "map-pin",     glyph: "⌖", color: "#d9b38c", fields: [["addr", L("Адрес", "Address")], ["coords", L("Координаты", "Coordinates")]] },
  vehicle: { label: L("Транспорт", "Vehicle"),        icon: "car",         glyph: "▶", color: "#a7b4c8", fields: [["model", L("Модель", "Model")], ["plate", L("Номер", "Plate number")], ["color", L("Цвет", "Color")]] },
  doc:     { label: L("Документ", "Document"),        icon: "file-text",   glyph: "▦", color: "#d8d2c4", fields: [["kind", L("Вид", "Type")], ["num", L("Номер", "Number")], ["date", L("Дата", "Date")]] },
}));
const caseConf = floraLazy(() => [["confirmed", L("подтверждено", "confirmed")], ["likely", L("вероятно", "likely")], ["unverified", L("не проверено", "unverified")]]);
// статус дела хранится как id; старые дела хранили русское слово — оно тоже понимается
const CASE_STATUS = ["open", "active", "paused", "closed"];
const CASE_STATUS_RU = ["открыто", "в работе", "на паузе", "закрыто"];
const CASE_STATUS_EN = ["open", "in progress", "paused", "closed"];
function caseStatusId(v) {
  const t = String(v == null ? "" : v).trim().toLowerCase();
  for (const list of [CASE_STATUS, CASE_STATUS_RU, CASE_STATUS_EN]) { const i = list.indexOf(t); if (i >= 0) return CASE_STATUS[i]; }
  return CASE_STATUS[0];
}
function caseStatusLabel(id) { const i = Math.max(0, CASE_STATUS.indexOf(caseStatusId(id))); return L(CASE_STATUS_RU[i], CASE_STATUS_EN[i]); }
// шкала оценки источников (как в разведке): надёжность источника A–F, достоверность сведений 1–6
const caseRel = floraLazy(() => ({
  A: L("полностью надёжен", "Completely reliable"), B: L("обычно надёжен", "Usually reliable"), C: L("довольно надёжен", "Fairly reliable"),
  D: L("обычно ненадёжен", "Not usually reliable"), E: L("ненадёжен", "Unreliable"), F: L("нельзя оценить", "Reliability cannot be judged"),
}));
const caseCred = floraLazy(() => ({
  1: L("подтверждено другими", "Confirmed by other sources"), 2: L("вероятно правда", "Probably true"), 3: L("возможно правда", "Possibly true"),
  4: L("сомнительно", "Doubtful"), 5: L("маловероятно", "Improbable"), 6: L("нельзя оценить", "Truth cannot be judged"),
}));
// подсказка к оценке: «A — полностью надёжен» / «A: Completely reliable»
function caseGradeTitle(k, text) { return k + L(" — ", ": ") + text; }

const P_OBJ = [["объект", "объекта", "объектов"], ["entity", "entities"]], P_LINK = [["связь", "связи", "связей"], ["link", "links"]];
const P_EV = [["событие", "события", "событий"], ["event", "events"]], P_SRC = [["источник", "источника", "источников"], ["source", "sources"]];
const P_CONF = [["подтверждено", "подтверждено", "подтверждено"], ["confirmed", "confirmed"]];
function uid() { return Math.random().toString(36).slice(2, 9); }
function todayIso() { const d = new Date(); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
function entityType(e) { const T = caseTypes(); return T[e && e.type] || T.doc; }
function entityName(e) {
  const t = entityType(e);
  for (const [k] of t.fields) if (e.fields && String(e.fields[k] || "").trim()) return String(e.fields[k]).trim();
  return L("без имени", "unnamed");
}
// номер дела из свойств заметки: «код» (старые и русские дела) или «code»
function caseFmCode(fm) { return fm ? (fm["код"] != null ? fm["код"] : fm["code"]) : null; }
function caseFmStatus(fm) { return caseStatusId(fm ? (fm["статус"] != null ? fm["статус"] : fm["status"]) : null); }

class CaseStore {
  constructor(app) { this.app = app; }
  isCase(file) {
    if (!file || file.extension !== "md") return false;
    const c = this.app.metadataCache.getFileCache && this.app.metadataCache.getFileCache(file);
    return !!(c && c.frontmatter && c.frontmatter["ng-case"]);
  }
  list() {
    return this.app.vault.getMarkdownFiles().filter((f) => this.isCase(f)).sort((a, b) => b.stat.mtime - a.stat.mtime);
  }
  async load(file) {
    const text = await this.app.vault.read(file);
    const m = /```ng-case\s*\n([\s\S]*?)\n```/.exec(text);
    if (!m) return null;
    try { return this.normalize(JSON.parse(m[1])); } catch (e) { return null; }
  }
  normalize(d) {
    d = d || {};
    return {
      v: 1, code: d.code || "0001", title: d.title || L("Новое дело", "New case"), status: caseStatusId(d.status),
      created: d.created || todayIso(), summary: d.summary || "",
      entities: Array.isArray(d.entities) ? d.entities : [], links: Array.isArray(d.links) ? d.links : [],
      events: Array.isArray(d.events) ? d.events : [], sources: Array.isArray(d.sources) ? d.sources : [],
    };
  }
  render(d) {
    const byId = new Map(d.entities.map((e) => [e.id, e]));
    const CONF = caseConf();
    const conf = (c) => (CONF.find((x) => x[0] === c) || CONF[2])[1];
    const ru = FLORA_LANG === "ru";
    // сводка ниже — только для чтения человеком; данные дела берутся из блока ng-case
    const out = [];
    out.push("---", "ng-case: true");
    if (ru) out.push("код: \"" + d.code + "\"", "статус: " + caseStatusLabel(d.status), "создано: " + d.created);
    else out.push("code: \"" + d.code + "\"", "status: " + caseStatusLabel(d.status), "created: " + d.created);
    out.push("---", "");
    out.push(L("%% Это дело ведёт Flora. Меняйте его на доске «Расследование»: сводка ниже пересобирается автоматически. %%",
      "%% This case is managed by Flora. Edit it on the Investigation board: the summary below is rebuilt automatically. %%"), "");
    out.push("```ng-case", JSON.stringify(d, null, 1), "```", "");
    out.push("# " + d.title, "");
    if (d.summary) out.push("> " + d.summary.replace(/\n/g, "\n> "), "");
    if (d.entities.length) {
      out.push(L("## Объекты", "## Entities"));
      for (const e of d.entities) {
        const t = entityType(e);
        const extra = t.fields.map(([k, lab]) => (e.fields && e.fields[k] ? lab + ": " + e.fields[k] : "")).filter(Boolean).slice(1).join("; ");
        const note = e.note ? " _(" + e.note + ")_" : "";
        if (ru) out.push("- **" + entityName(e) + "** · " + t.label + " · " + conf(e.conf) + (extra ? " — " + extra : "") + note);
        else out.push("- **" + entityName(e) + "** (" + t.label + ", " + conf(e.conf) + ")" + (extra ? ". " + extra : "") + note);
      }
      out.push("");
    }
    if (d.links.length) {
      out.push(L("## Связи", "## Links"));
      for (const l of d.links) {
        const a = byId.get(l.a), b = byId.get(l.b);
        if (a && b) out.push("- " + entityName(a) + " → " + entityName(b) + (l.label ? L(" — «" + l.label + "»", ": \"" + l.label + "\"") : "") + " (" + conf(l.conf) + ")");
      }
      out.push("");
    }
    if (d.events.length) {
      out.push(L("## Хронология", "## Timeline"));
      for (const ev of d.events.slice().sort((x, y) => String(x.date).localeCompare(String(y.date)))) out.push("- " + (ev.date || L("без даты", "no date")) + L(" — ", ": ") + (ev.text || ""));
      out.push("");
    }
    if (d.sources.length) {
      out.push(L("## Источники", "## Sources"));
      for (const s of d.sources) out.push("- [" + s.rel + s.cred + "] " + (s.title || L("без названия", "untitled")) + (s.url ? L(" — ", ", ") + s.url : "") + (s.accessed ? " (" + s.accessed + ")" : ""));
      out.push("");
    }
    return out.join("\n");
  }
  async save(file, d) { await this.app.vault.modify(file, this.render(d)); }
  async create() {
    let max = 0;
    for (const f of this.list()) { const c = this.app.metadataCache.getFileCache(f); const n = parseInt(caseFmCode(c && c.frontmatter), 10); if (n > max) max = n; }
    const code = String(max + 1).padStart(4, "0");
    const folder = caseFolder(), name = L("Дело ", "Case ") + code;
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    let path = folder + "/" + name + ".md", i = 2;
    while (this.app.vault.getAbstractFileByPath(path)) path = folder + "/" + name + " (" + i++ + ").md";
    const d = this.normalize({ code, title: name });
    return this.app.vault.create(path, this.render(d));
  }
}

class CaseView extends obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.store = plugin.cases;
    this.file = null; this.data = null; this.R = null;
  }
  getViewType() { return CASE_VIEW; }
  getDisplayText() { return this.data ? L("Дело ", "Case ") + this.data.code : L("Расследование", "Investigation"); }
  getIcon() { return "fingerprint"; }
  getState() { return { file: this.file ? this.file.path : null }; }
  async setState(state, result) {
    if (state && state.file) { const f = this.app.vault.getAbstractFileByPath(state.file); if (f) await this.openCase(f); }
    if (super.setState) return super.setState(state, result);
  }

  async onOpen() {
    const root = this.contentEl;
    root.empty ? root.empty() : (root.textContent = "");
    root.classList.add("ng-case-root");
    this.doc = root.ownerDocument || document;
    this.side = this.mk("aside", "ng-case-side", root);
    this.main = this.mk("main", "ng-case-main", root);
    this.renderSide();
    this.registerEvent(this.app.metadataCache.on("changed", (f) => { if (this.store.isCase(f)) { clearTimeout(this.sideT); this.sideT = setTimeout(() => this.renderSide(), 300); } }));
    this.registerEvent(this.app.vault.on("modify", (f) => {
      // файл дела поправили руками — перечитываем (свои записи пропускаем)
      if (this.file && f === this.file && Date.now() - (this.selfWrite || 0) > 1500 && !this.dirty) this.openCase(f);
    }));
    if (!this.file) {
      const first = this.store.list()[0];
      if (first) await this.openCase(first); else this.renderEmpty();
    }
  }
  async onClose() { if (this.R) { this.R.destroy(); this.R = null; } clearTimeout(this.saveT); if (this.dirty) await this.flush(); }

  mk(tag, cls, parent, text) {
    const e = this.doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  setIco(el, name, glyph) { if (typeof obsidian.setIcon === "function") obsidian.setIcon(el, name); else el.textContent = glyph || "•"; }
  input(parent, value, ph, onChange, cls) {
    const i = this.mk("input", "ng-case-input" + (cls ? " " + cls : ""), parent);
    i.type = "text"; i.value = value || ""; i.placeholder = ph || "";
    i.addEventListener("input", () => { onChange(i.value); this.changed(); });
    return i;
  }
  chips(parent, items, current, onPick, cls) {
    const row = this.mk("div", "ng-case-chips" + (cls ? " " + cls : ""), parent);
    for (const [val, label, title] of items) {
      const b = this.mk("button", "ng-case-chip", row, label);
      if (title) b.setAttribute("aria-label", title);
      b.dataset.val = val;
      if (val === current) b.classList.add("is-on");
      b.addEventListener("click", () => {
        for (const x of row.children) x.classList.toggle("is-on", x === b);
        onPick(val); this.changed();
      });
    }
    return row;
  }

  // ---------- сохранение ----------
  changed(structural) {
    this.dirty = true;
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => this.flush(), 700);
    clearTimeout(this.mapT);
    this.mapT = setTimeout(() => this.renderMap(), structural ? 0 : 500);
    this.renderStats();
  }
  async flush() {
    if (!this.dirty || !this.file || !this.data) return;
    this.dirty = false;
    this.selfWrite = Date.now();
    await this.store.save(this.file, this.data);
    this.renderSide();
  }

  async openCase(file) {
    if (this.dirty) await this.flush();
    const d = await this.store.load(file);
    if (!d) { new obsidian.Notice(L("В этой заметке нет данных дела", "This note has no case data")); return; }
    this.file = file; this.data = d;
    this.renderSide();
    this.renderMain();
    if (this.leaf.updateHeader) this.leaf.updateHeader();
  }
  async newCase() {
    const f = await this.store.create();
    await this.openCase(f);
  }

  // ---------- список дел ----------
  renderSide() {
    const s = this.side;
    if (!s) return;
    s.textContent = "";
    this.mk("div", "ng-case-side-title", s, L("Дела", "Cases"));
    const nb = this.mk("button", "ng-case-new", s);
    const nbi = this.mk("span", "ng-case-btn-ico", nb); this.setIco(nbi, "plus", "＋");
    this.mk("span", null, nb, L("Новое дело", "New case"));
    nb.addEventListener("click", () => this.newCase());
    const list = this.mk("div", "ng-case-list", s);
    for (const f of this.store.list()) {
      const c = this.app.metadataCache.getFileCache(f) || {};
      const fm = c.frontmatter || {};
      const b = this.mk("button", "ng-case-item" + (this.file && f.path === this.file.path ? " is-active" : ""), list);
      this.mk("span", "ng-case-item-code", b, L("Дело ", "Case ") + (caseFmCode(fm) || "—"));
      this.mk("span", "ng-case-item-title", b, (this.file && f.path === this.file.path && this.data ? this.data.title : f.basename));
      const st = caseFmStatus(fm);
      this.mk("span", "ng-case-item-status st-" + CASE_STATUS.indexOf(st), b, caseStatusLabel(st));
      b.addEventListener("click", () => this.openCase(f));
    }
  }
  renderEmpty() {
    const m = this.main;
    m.textContent = "";
    const box = this.mk("div", "ng-case-empty", m);
    const ei = this.mk("div", "ng-case-empty-icon", box); this.setIco(ei, "fingerprint", "⌖");
    this.mk("div", "ng-case-empty-title", box, L("Пока ни одного дела", "No cases yet"));
    this.mk("div", "ng-case-empty-text", box, L("Дело — это доска: объекты (люди, аккаунты, домены, места…), связи между ними, хронология и источники с оценкой надёжности. Хранится обычной заметкой в папке «" + caseFolder() + "».",
      "A case is a board: entities (people, accounts, domains, places and more), the links between them, a timeline, and sources rated for reliability. It is stored as a regular note in the \"" + caseFolder() + "\" folder."));
    const b = this.mk("button", "ng-case-cta", box, L("Создать первое дело", "Create the first case"));
    b.addEventListener("click", () => this.newCase());
  }

  // ---------- доска дела ----------
  renderMain() {
    const m = this.main, d = this.data;
    if (this.R) { this.R.destroy(); this.R = null; }
    m.textContent = "";
    const head = this.mk("header", "ng-case-head", m);
    this.mk("div", "ng-case-meta", head, L("Дело " + d.code + ", открыто " + d.created.split("-").reverse().join("."), "Case " + d.code + ", opened " + d.created));
    const title = this.input(head, d.title, L("Название дела", "Case title"), (v) => { d.title = v; }, "ng-case-title");
    title.addEventListener("change", () => this.renderSide());
    const sum = this.mk("textarea", "ng-case-summary", head);
    sum.value = d.summary; sum.placeholder = L("Суть дела: что известно, что ищем, гипотеза…", "What the case is about: what is known, what you are looking for, your hypothesis…"); sum.rows = 2;
    sum.addEventListener("input", () => { d.summary = sum.value; this.changed(); });
    const row = this.mk("div", "ng-case-head-row", head);
    this.chips(row, CASE_STATUS.map((s) => { const t = caseStatusLabel(s); return [s, t.charAt(0).toUpperCase() + t.slice(1)]; }), d.status, (v) => { d.status = v; setTimeout(() => this.renderSide(), 800); }, "ng-case-status ng-seg");
    this.statsEl = this.mk("div", "ng-case-stats", row);

    // карта связей — живая ткань
    const mapWrap = this.mk("section", "ng-case-map", m);
    const mapCanvas = this.mk("canvas", null, mapWrap);
    this.mapHint = this.mk("div", "ng-case-map-hint", mapWrap);
    this.R = new NG.NeuralRenderer(mapCanvas, {
      hud: false, labels: true, noWheel: true, pauseOffscreen: true, activity: 1.6, maxFitZoom: 1.8, maxFps: 30, renderScale: 1,
      onOpen: (n) => { const card = m.querySelector('[data-entity="' + n.id + '"]'); if (card) { card.scrollIntoView({ behavior: "smooth", block: "center" }); card.classList.add("is-flash"); setTimeout(() => card.classList.remove("is-flash"), 900); } },
    });

    this.sectionEntities(m);
    this.sectionLinks(m);
    this.sectionEvents(m);
    this.sectionSources(m);
    this.renderStats();
    this.renderMap();
  }

  section(parent, num, title, hint) {
    const sec = this.mk("section", "ng-case-sec", parent);
    const h = this.mk("div", "ng-case-sec-head", sec);
    this.mk("h2", "ng-case-sec-title", h, title);
    if (hint) this.mk("span", "ng-case-sec-hint", h, hint);
    return sec;
  }

  sectionEntities(m) {
    const d = this.data;
    const sec = this.entSec = this.section(m, "", L("Объекты", "Entities"), L("Люди, аккаунты, адреса и всё, что фигурирует в деле", "People, accounts, addresses and anything else that appears in the case"));
    const grid = this.mk("div", "ng-case-grid", sec);
    for (const e of d.entities) this.entityCard(grid, e);
    // выбор типа нового объекта
    const add = this.mk("div", "ng-case-add", sec);
    this.mk("span", "ng-case-add-label", add, L("Добавить", "Add"));
    for (const [type, t] of Object.entries(caseTypes())) {
      const b = this.mk("button", "ng-case-add-type", add);
      b.style.setProperty("--ng-c", t.color);
      const ic = this.mk("span", "ng-case-add-icon", b); this.setIco(ic, t.icon, t.glyph);
      this.mk("span", null, b, t.label);
      b.addEventListener("click", () => {
        const e = { id: uid(), type, fields: {}, conf: "unverified", note: "" };
        d.entities.push(e);
        const card = this.entityCard(grid, e);
        const first = card.querySelector("input"); if (first) first.focus();
        this.changed(true); this.refreshLinkSelects();
      });
    }
  }

  entityCard(grid, e) {
    const d = this.data;
    const t = entityType(e);
    const card = this.mk("div", "ng-case-card", grid);
    card.dataset.entity = e.id;
    card.style.setProperty("--ng-c", t.color);
    const top = this.mk("div", "ng-case-card-top", card);
    const ic = this.mk("span", "ng-case-card-icon", top); this.setIco(ic, t.icon, t.glyph);
    this.mk("span", "ng-case-card-type", top, t.label);
    const del = this.mk("button", "ng-case-del", top, "×");
    del.setAttribute("aria-label", L("Убрать объект", "Remove entity"));
    del.addEventListener("click", () => {
      d.entities = d.entities.filter((x) => x !== e);
      d.links = d.links.filter((l) => l.a !== e.id && l.b !== e.id);
      card.remove(); this.changed(true); this.rerenderLinks(); this.refreshLinkSelects();
    });
    const fields = this.mk("div", "ng-case-fields", card);
    t.fields.forEach(([k, label], i) => {
      const row = this.mk("label", "ng-case-field" + (i === 0 ? " is-main" : ""), fields);
      this.mk("span", "ng-case-field-label", row, label);
      this.input(row, e.fields[k], i === 0 ? label + "…" : "", (v) => { e.fields[k] = v; if (i === 0) this.refreshLinkSelects(true); });
    });
    const note = this.mk("textarea", "ng-case-note", card);
    note.placeholder = L("заметка, откуда известно…", "note: how you know this…"); note.rows = 1; note.value = e.note || "";
    note.addEventListener("input", () => { e.note = note.value; this.changed(); });
    this.chips(card, caseConf().map(([v, l]) => [v, l]), e.conf, (v) => { e.conf = v; card.dataset.conf = v; }, "ng-case-conf");
    card.dataset.conf = e.conf;
    return card;
  }

  sectionLinks(m) {
    const sec = this.linkSec = this.section(m, "", L("Связи", "Links"), L("Кто с кем и как связан", "Who is connected to whom, and how"));
    this.linkList = this.mk("div", "ng-case-links", sec);
    this.rerenderLinks();
    const add = this.mk("button", "ng-case-addrow", sec, L("Добавить связь", "Add link"));
    add.addEventListener("click", () => {
      const d = this.data;
      if (d.entities.length < 2) { new obsidian.Notice(L("Для связи нужно хотя бы два объекта", "A link needs at least two entities")); return; }
      d.links.push({ id: uid(), a: d.entities[0].id, b: d.entities[1].id, label: "", conf: "unverified" });
      this.rerenderLinks(); this.changed(true);
    });
  }
  rerenderLinks() {
    if (!this.linkList) return;
    const d = this.data;
    this.linkList.textContent = "";
    if (!d.links.length) this.mk("div", "ng-case-none", this.linkList, L("Связей пока нет", "No links yet"));
    for (const l of d.links) {
      const row = this.mk("div", "ng-case-link", this.linkList);
      const sel = (val, on) => {
        const s = this.mk("select", "ng-case-select dropdown", row);
        s.dataset.role = "entity";
        this.fillSelect(s, val);
        s.addEventListener("change", () => { on(s.value); this.changed(true); });
        return s;
      };
      sel(l.a, (v) => { l.a = v; });
      this.mk("span", "ng-case-arrow", row, "—");
      this.input(row, l.label, L("как связаны: владелец, друг, звонил…", "how they are linked: owner, friend, called…"), (v) => { l.label = v; }, "ng-case-link-label");
      this.mk("span", "ng-case-arrow", row, "→");
      sel(l.b, (v) => { l.b = v; });
      this.chips(row, caseConf().map(([v, lab]) => [v, v === "unverified" ? "?" : v === "confirmed" ? "✓" : "≈", lab]), l.conf, (v) => { l.conf = v; }, "ng-case-conf mini");
      const del = this.mk("button", "ng-case-del", row, "×");
      del.addEventListener("click", () => { d.links = d.links.filter((x) => x !== l); this.rerenderLinks(); this.changed(true); });
    }
  }
  fillSelect(s, val) {
    s.textContent = "";
    for (const e of this.data.entities) {
      const o = this.doc.createElement("option");
      o.value = e.id; o.textContent = entityType(e).glyph + " " + entityName(e);
      if (e.id === val) o.selected = true;
      s.appendChild(o);
    }
  }
  refreshLinkSelects(namesOnly) {
    if (!this.linkList) return;
    for (const s of this.linkList.querySelectorAll('select[data-role="entity"]')) { const v = s.value; this.fillSelect(s, v); }
    if (!namesOnly) this.rerenderLinks();
  }

  sectionEvents(m) {
    const sec = this.section(m, "", L("Хронология", "Timeline"), L("Что и когда произошло", "What happened and when"));
    const list = this.mk("div", "ng-case-timeline", sec);
    const draw = () => {
      list.textContent = "";
      const d = this.data;
      if (!d.events.length) this.mk("div", "ng-case-none", list, L("Событий пока нет", "No events yet"));
      for (const ev of d.events) {
        const row = this.mk("div", "ng-case-event", list);
        this.mk("span", "ng-case-event-dot", row);
        const date = this.mk("input", "ng-case-input ng-case-date", row);
        date.type = "date"; date.value = ev.date || "";
        date.addEventListener("change", () => { ev.date = date.value; this.changed(); });
        this.input(row, ev.text, L("что произошло…", "what happened…"), (v) => { ev.text = v; }, "ng-case-event-text");
        const del = this.mk("button", "ng-case-del", row, "×");
        del.addEventListener("click", () => { d.events = d.events.filter((x) => x !== ev); draw(); this.changed(); });
      }
    };
    draw();
    const add = this.mk("button", "ng-case-addrow", sec, L("Добавить событие", "Add event"));
    add.addEventListener("click", () => { this.data.events.push({ id: uid(), date: todayIso(), text: "" }); draw(); this.changed(); const inp = list.querySelectorAll(".ng-case-event-text"); if (inp.length) inp[inp.length - 1].focus(); });
  }

  sectionSources(m) {
    const sec = this.section(m, "", L("Источники", "Sources"), L("Откуда сведения и насколько им верить", "Where the information comes from and how much to trust it"));
    const list = this.mk("div", "ng-case-sources", sec);
    const draw = () => {
      list.textContent = "";
      const d = this.data;
      if (!d.sources.length) this.mk("div", "ng-case-none", list, L("Источников пока нет", "No sources yet"));
      for (const s of d.sources) {
        const card = this.mk("div", "ng-case-source", list);
        const grade = this.mk("div", "ng-case-grade", card, s.rel + s.cred);
        grade.dataset.rel = s.rel;
        const body = this.mk("div", "ng-case-source-body", card);
        this.input(body, s.title, L("название источника", "source name"), (v) => { s.title = v; }, "ng-case-source-title");
        this.input(body, s.url, L("ссылка или где лежит", "link or where it is kept"), (v) => { s.url = v; }, "ng-case-source-url");
        const scales = this.mk("div", "ng-case-scales", body);
        this.mk("span", "ng-case-scale-label", scales, L("Надёжность", "Reliability"));
        const REL = caseRel(), CRED = caseCred();
        this.chips(scales, Object.keys(REL).map((k) => [k, k, caseGradeTitle(k, REL[k])]), s.rel, (v) => { s.rel = v; grade.textContent = s.rel + s.cred; grade.dataset.rel = v; }, "ng-case-scale");
        this.mk("span", "ng-case-scale-label", scales, L("Достоверность", "Credibility"));
        this.chips(scales, Object.keys(CRED).map((k) => [k, k, caseGradeTitle(k, CRED[k])]), s.cred, (v) => { s.cred = v; grade.textContent = s.rel + s.cred; }, "ng-case-scale");
        const del = this.mk("button", "ng-case-del", card, "×");
        del.addEventListener("click", () => { d.sources = d.sources.filter((x) => x !== s); draw(); this.changed(); });
      }
    };
    draw();
    const add = this.mk("button", "ng-case-addrow", sec, L("Добавить источник", "Add source"));
    add.addEventListener("click", () => { this.data.sources.push({ id: uid(), title: "", url: "", rel: "F", cred: "6", accessed: todayIso() }); draw(); this.changed(); });
  }

  renderStats() {
    if (!this.statsEl || !this.data) return;
    const d = this.data;
    const conf = d.entities.filter((e) => e.conf === "confirmed").length;
    this.statsEl.textContent = "";
    for (const [n, f] of [[d.entities.length, P_OBJ], [conf, P_CONF], [d.links.length, P_LINK], [d.events.length, P_EV], [d.sources.length, P_SRC]]) {
      const c = this.mk("span", "ng-case-stat", this.statsEl);
      this.mk("b", null, c, String(n));
      this.mk("span", null, c, " " + plural(n, f[0], f[1]));
    }
  }

  renderMap() {
    if (!this.R || !this.data) return;
    const d = this.data;
    const ids = new Set(d.entities.map((e) => e.id));
    const edges = d.links.filter((l) => ids.has(l.a) && ids.has(l.b) && l.a !== l.b).map((l) => ({ a: l.a, b: l.b, w: l.conf === "confirmed" ? 3 : l.conf === "likely" ? 2 : 1 }));
    const deg = {};
    for (const e of edges) { deg[e.a] = (deg[e.a] || 0) + 1; deg[e.b] = (deg[e.b] || 0) + 1; }
    const nodes = d.entities.map((e) => {
      const t = entityType(e);
      return { id: e.id, kind: e.type === "person" || e.type === "org" ? "note" : "card", label: entityName(e), group: e.type, color: t.color, deg: deg[e.id] || 0, path: e.id };
    });
    this.R.setData({ nodes, edges, groups: [] });
    this.mapHint.textContent = nodes.length ? L("Карта связей. Нажмите на клетку, чтобы перейти к карточке", "Link map. Click a cell to jump to its card") : L("Карта появится, когда вы добавите объекты", "The map appears once you add entities");
  }
}

/** Карточка дела внутри самой заметки (блок ```ng-case```) */
function renderCaseBlock(plugin, src, el, ctx) {
  let d;
  try { d = plugin.cases.normalize(JSON.parse(src)); } catch (e) { el.textContent = L("Данные дела повреждены", "The case data is damaged"); return; }
  const doc = el.ownerDocument || document;
  const mk = (tag, cls, parent, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; parent.appendChild(e); return e; };
  const box = mk("div", "ng-case-block", el);
  mk("div", "ng-case-block-meta", box, L("Дело ", "Case ") + d.code + ", " + caseStatusLabel(d.status));
  mk("div", "ng-case-block-title", box, d.title);
  const stats = mk("div", "ng-case-block-stats", box);
  for (const [n, f] of [[d.entities.length, P_OBJ], [d.links.length, P_LINK], [d.events.length, P_EV], [d.sources.length, P_SRC]]) {
    const s = mk("span", "ng-case-stat", stats); mk("b", null, s, String(n)); mk("span", null, s, " " + plural(n, f[0], f[1]));
  }
  const types = mk("div", "ng-case-block-types", box);
  for (const e of d.entities.slice(0, 18)) {
    const t = entityType(e);
    const chip = mk("span", "ng-case-block-chip", types, entityName(e));
    chip.style.setProperty("--ng-c", t.color);
  }
  const b = mk("button", "ng-case-cta", box, L("Открыть доску дела", "Open the case board"));
  b.addEventListener("click", () => plugin.openCaseBoard(ctx && ctx.sourcePath));
}
