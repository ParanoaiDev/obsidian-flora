/* ------------------------------------------------------------------ */
/* Flora AI: проекты, которые вы делаете с ИИ                          */
/* Читает истории Claude Code и Codex на этом компьютере и собирает     */
/* из них проекты: по папкам, где шла работа, и по памяти Claude.       */
/* Ничего не отправляет в сеть. Сохраняет только названия, даты, папки. */
/* ------------------------------------------------------------------ */
const FloraAI = (function () {
  "use strict";
  let N = null;
  // fs/os/path есть только в настольном Obsidian; на телефоне раздел просто недоступен
  function nodeApi() {
    if (N) return N;
    try { N = { fs: require("fs"), path: require("path"), os: require("os") }; } catch { N = false; }
    return N;
  }
  const available = () => !!nodeApi();

  const AIS = {
    claude: { name: "Claude Code", color: "#f0a57c", icon: "sparkles" },
    codex: { name: "Codex", color: "#8fd1ff", icon: "terminal-square" },
  };

  /* ---------- где лежат истории ---------- */
  function homeDir() { const n = nodeApi(); return n ? n.os.homedir() : ""; }
  function env(k) { try { return (typeof process !== "undefined" && process.env && process.env[k]) || ""; } catch { return ""; } }
  function defaultRoots() {
    const n = nodeApi(); if (!n) return [];
    const h = homeDir();
    return [
      { ai: "claude", dir: env("CLAUDE_CONFIG_DIR") || n.path.join(h, ".claude"), own: true },
      { ai: "codex", dir: env("CODEX_HOME") || n.path.join(h, ".codex"), own: true },
    ];
  }
  async function isDir(p) { try { return (await nodeApi().fs.promises.stat(p)).isDirectory(); } catch { return false; } }
  async function ls(p) { try { return await nodeApi().fs.promises.readdir(p, { withFileTypes: true }); } catch { return []; } }
  async function walk(dir, test, out, depth) {
    if (depth < 0) return out;
    for (const e of await ls(dir)) {
      const p = nodeApi().path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".git" && e.name !== "subagents") await walk(p, test, out, depth - 1); }
      else if (test(e.name, p)) out.push(p);
    }
    return out;
  }
  /** Папка, добавленная вручную: определяем, чья это история. */
  async function sniff(dir) {
    const path = nodeApi().path;
    if (await isDir(path.join(dir, "projects"))) return "claude";
    if (await isDir(path.join(dir, "sessions"))) return "codex";
    const base = path.basename(dir).toLowerCase();
    if (base === "projects" || base.includes("claude")) return "claude";
    if (base === "sessions" || base.includes("codex")) return "codex";
    return null;
  }
  /** Файлы одного источника: сессии и память. */
  async function filesOf(src) {
    const path = nodeApi().path, d = src.dir;
    if (src.ai === "claude") {
      const proj = (await isDir(path.join(d, "projects"))) ? path.join(d, "projects") : d;
      const sessions = [], memory = [];
      for (const e of await ls(proj)) {
        if (!e.isDirectory()) continue;
        const pd = path.join(proj, e.name);
        for (const f of await ls(pd)) if (f.isFile() && f.name.endsWith(".jsonl")) sessions.push(path.join(pd, f.name));
        for (const f of await ls(path.join(pd, "memory"))) if (f.isFile() && f.name.endsWith(".md") && f.name !== "MEMORY.md") memory.push(path.join(pd, "memory", f.name));
      }
      return { sessions, memory };
    }
    const base = (await isDir(path.join(d, "sessions"))) ? d : path.dirname(d);
    const sessions = [];
    for (const sub of ["sessions", "archived_sessions"]) await walk(path.join(base, sub), (n) => n.endsWith(".jsonl"), sessions, 5);
    return { sessions, memory: [], index: path.join(base, "session_index.jsonl"), history: path.join(base, "history.jsonl") };
  }
  /** Что найдено у каждого ИИ — для стартового экрана. */
  async function detect(extra) {
    const out = {};
    for (const k in AIS) out[k] = { ai: k, sources: [], sessions: 0, memory: 0, bytes: 0 };
    const roots = defaultRoots().concat((extra || []).map((x) => ({ ai: x.ai, dir: x.dir, own: false })));
    for (const r of roots) {
      if (!r.ai || !out[r.ai] || !(await isDir(r.dir))) continue;
      const f = await filesOf(r);
      let bytes = 0;
      for (const p of f.sessions) { try { bytes += (await nodeApi().fs.promises.stat(p)).size; } catch { /* файл исчез */ } }
      out[r.ai].sources.push({ dir: r.dir, own: r.own, sessions: f.sessions.length, memory: f.memory.length });
      out[r.ai].sessions += f.sessions.length; out[r.ai].memory += f.memory.length; out[r.ai].bytes += bytes;
    }
    return out;
  }

  /* ---------- путь → проект ---------- */
  // папки-«контейнеры»: проект — первая папка внутри них
  const CONTAINERS = new Set(["desktop", "рабочий стол", "documents", "документы", "downloads", "загрузки", "projects", "проекты", "project", "проект",
    "repos", "repositories", "repo", "code", "dev", "src", "source", "work", "работа", "github", "git", "gitlab", "workspace", "workspaces", "sites", "www",
    "games", "игры", "onedrive", "dropbox", "yandex.disk", "яндекс.диск", "google drive", "mega", "files", "файлы"]);
  const FILEISH = /\.[A-Za-z0-9]{1,9}$/;
  // папки программ и медиатеки, а не проекты
  const NOT_PROJECT = /^(appdata|library|snap|go|bin|opt|sdk|android|miniconda3|anaconda3|applications|unity|unity hub|unityhub|blender|godot|steam|steamlibrary|epic games|videos|видео|pictures|изображения|music|музыка|public|общедоступные|шаблоны|templates)$/i;
  function splitPath(raw) {
    let p = String(raw || "").trim().replace(/^file:\/\//, "");
    if (!p) return null;
    if (p[0] === "~") { const h = homeDir(); if (!h) return null; p = h + p.slice(1); }
    p = p.replace(/\\+/g, "/");
    const win = /^[A-Za-z]:\//.test(p);
    if (!win && p[0] !== "/") return null;
    return { win, segs: p.split("/").filter((s) => s && s !== ".") };
  }
  /**
   * Корень проекта для пути, или null. { key, name, path }
   * key — нормализованный, для сравнения; path — как показать человеку.
   */
  function rootOf(raw, isFile) {
    const sp = splitPath(raw);
    if (!sp) return null;
    const s = sp.segs;
    if (s.some((x) => x === "..")) return null;
    let base = -1;
    const lo = (i) => (s[i] || "").toLowerCase();
    if (sp.win) {
      if (lo(1) === "users" && s[2]) base = 3;
      else if (lo(0) !== "c:") base = 1;            // D:/проект
      else return null;
    } else if ((lo(0) === "home" || lo(0) === "users") && s[1]) base = 2;
    else if (lo(0) === "root") base = 1;
    else if (lo(0) === "mnt" && s[1]) base = 2;
    else if (lo(0) === "media" && s[2]) base = 3;
    else if (lo(0) === "run" && lo(1) === "media" && s[3]) base = 4;
    else if (lo(0) === "srv" || lo(0) === "data") base = 1;
    else return null;
    const rest = s.slice(base);
    if (!rest.length) return null;
    if (rest[0][0] === "." || NOT_PROJECT.test(rest[0])) return null;
    let i = 0;
    while (i < rest.length - 1 && CONTAINERS.has(rest[i].toLowerCase())) i++;
    if (CONTAINERS.has(rest[i].toLowerCase()) && i === rest.length - 1) return null;
    // хвост из текста: «prototype:», «NewGame —»
    rest[i] = rest[i].replace(/[\s:;,.!?—–-]+$/, "");
    const name = rest[i];
    if (!name) return null;
    if (name[0] === "." || NOT_PROJECT.test(name) || /^(node_modules|\$recycle\.bin|tmp|temp)$/i.test(name)) return null;
    if (i === rest.length - 1 && (isFile || FILEISH.test(name))) return null;  // файл прямо на рабочем столе — не проект
    const parts = s.slice(0, base).concat(rest.slice(0, i + 1));
    const path = sp.win ? parts.join("\\") : "/" + parts.join("/");
    return { key: (sp.win ? "w:" : "u:") + parts.join("/").toLowerCase(), name, path };
  }

  // пути внутри команд и кода: в кавычках или без (с экранированными пробелами)
  const PATH_RE = /(["'\x60])((?:~\/|\/|[A-Za-z]:[\\\/])[^"'\x60\n]{1,260}?)\1|(?:^|[\s=(:,])((?:~\/|\/(?:home|Users|mnt|media|run\/media|root)\/|[A-Za-z]:[\\\/])(?:\\ |[^\s"'\x60;|&<>(),])+)/g;
  function pathsIn(text, max) {
    const out = [];
    if (!text || text.length > 400000) return out;
    PATH_RE.lastIndex = 0;
    let m;
    while ((m = PATH_RE.exec(text)) && out.length < (max || 40)) out.push(m[2] || m[3].replace(/\\ /g, " "));
    return out;
  }

  /* ---------- чем делали проект ---------- */
  const STACK = [
    ["blender", "Blender", /blender|\.blend\b|\bbpy\b/i],
    ["unity", "Unity", /unity|\.unity\b|\.prefab\b|\.cs\b/i],
    ["godot", "Godot", /godot|\.gd\b|\.tscn\b|\.tres\b/i],
    ["roblox", "Roblox", /roblox|\.luau?\b|\.rbxl/i],
    ["unreal", "Unreal", /unreal|\.uproject\b|\.uasset\b/i],
    ["minecraft", "Minecraft", /minecraft|forge|gradle|\.java\b/i],
    ["web", "Web", /\.(html?|css|tsx?|jsx|vue|svelte)\b|\bnpm |\bvite\b|package\.json/i],
    ["python", "Python", /\.py\b|\bpython3?\b|\bpip\b/i],
    ["obsidian", "Obsidian", /obsidian|\.canvas\b/i],
    ["video", () => L("Видео", "Video"), /ffmpeg|\.mp4\b|\.mov\b|hyperframes|remotion|davinci/i],
    ["image", () => L("Картинки", "Images"), /imagegen|image_gen|generate_image|higgsfield|unsplash|\.psd\b/i],
    ["mods", () => L("Моды", "Mods"), /\bmods?\b|modpack|7dtd|7 days|zomboid|workshop/i],
  ];
  const stackName = (id) => { const s = STACK.find((x) => x[0] === id); return s ? (typeof s[1] === "function" ? s[1]() : s[1]) : id; };
  function tagStack(text, into, w) {
    if (!text) return;
    const t = text.length > 4000 ? text.slice(0, 4000) : text;
    for (const s of STACK) if (s[2].test(t)) into[s[0]] = (into[s[0]] || 0) + (w || 1);
  }

  /* ---------- чтение jsonl построчно, без лишних копий ---------- */
  async function eachLine(file, fn) {
    const fs = nodeApi().fs;
    const fh = await fs.promises.open(file, "r");
    const CH = 1 << 22, buf = Buffer.allocUnsafe(CH);
    let carry = null, pos = 0;
    try {
      for (;;) {
        const { bytesRead } = await fh.read(buf, 0, CH, pos);
        if (!bytesRead) break;
        pos += bytesRead;
        let chunk = buf.subarray(0, bytesRead);
        if (carry) { chunk = Buffer.concat([carry, chunk]); carry = null; }
        let s = 0, i;
        while ((i = chunk.indexOf(10, s)) >= 0) { if (i > s) fn(chunk, s, i); s = i + 1; }
        if (s < chunk.length) carry = Buffer.from(chunk.subarray(s));
      }
      if (carry && carry.length) fn(carry, 0, carry.length);
    } finally { await fh.close(); }
  }
  const unq = (s) => { try { return JSON.parse('"' + s + '"'); } catch { return s; } };
  const lastStr = (text, key) => {
    const k = '"' + key + '":"', i = text.lastIndexOf(k);
    if (i < 0) return null;
    const m = /^((?:[^"\\]|\\.)*)"/.exec(text.slice(i + k.length, i + k.length + 2000));
    return m ? unq(m[1]) : null;
  };
  const firstStr = (text, key) => {
    const m = new RegExp('"' + key + '":"((?:[^"\\\\]|\\\\.)*)"').exec(text);
    return m ? unq(m[1]) : null;
  };
  // строка в окне: целиком, если она небольшая, иначе только начало и конец (метаданные там)
  function window_(buf, s, e, limit) {
    if (e - s <= limit) return { text: buf.toString("utf8", s, e), whole: true };
    return { text: buf.toString("utf8", s, s + 1500) + "\n" + buf.toString("utf8", e - 5000, e), whole: false };
  }
  function cleanTitle(t) {
    t = String(t || "").replace(/\s+/g, " ").trim()
      // ключи и токены, вставленные в чат, не попадают ни в граф, ни в кэш
      .replace(/\b(?:sk|pk|rk|ghp|gho|ghs|github_pat|xox[abpr]|AIza|ya29|glpat)[-_A-Za-z0-9]{6,}/g, "•••")
      .replace(/\b[A-Za-z0-9+_-]{28,}={0,2}/g, "•••").replace(/\b[a-f0-9]{16,}\b/gi, "•••");
    if (!t || t[0] === "<" || /^(#|caveat:|\[request interrupted|\[image|this session is being continued|base directory for this skill)/i.test(t)) return "";
    return t.length > 90 ? t.slice(0, 89) + "…" : t;
  }

  function newSession(ai, id, file) { return { ai, id, file, title: "", t0: 0, t1: 0, prompts: 0, tools: 0, roots: {}, names: {}, stack: {}, days: {} }; }
  function touch(S, raw, w, isFile) {
    const r = rootOf(raw, isFile);
    if (!r) return;
    S.roots[r.key] = (S.roots[r.key] || 0) + w;
    if (!S.names[r.key]) S.names[r.key] = [r.name, r.path];
    tagStack(raw, S.stack, w * 0.5);
  }
  function stamp(S, ts) {
    const t = Date.parse(ts);
    if (!(t > 0)) return;
    if (!S.t0 || t < S.t0) S.t0 = t;
    if (t > S.t1) S.t1 = t;
    const d = new Date(t), k = d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
    S.days[k] = 1;
  }

  /* Claude Code: ~/.claude/projects/<папка>/<сессия>.jsonl */
  async function readClaude(file) {
    const S = newSession("claude", nodeApi().path.basename(file, ".jsonl"), file);
    let cwdSeen = 0, lastCwd = null, fallback = "";
    await eachLine(file, (buf, s, e) => {
      const head = buf.toString("utf8", s, Math.min(e, s + 400));
      const tm = /"type":"([a-z-]+)"/.exec(head);
      const type = tm ? tm[1] : "";
      if (type === "ai-title" || type === "summary") {
        if (e - s > 20000) return;
        try { const o = JSON.parse(buf.toString("utf8", s, e)); const t = cleanTitle(o.aiTitle || o.summary); if (t) S.title = t; } catch { /* битая строка */ }
        return;
      }
      if (type !== "user" && type !== "assistant") return;
      if (/"isSidechain":true/.test(head)) return;
      const W = window_(buf, s, e, type === "assistant" ? 3000000 : 200000);
      const ts = lastStr(W.text, "timestamp");
      if (ts) stamp(S, ts);
      const cwd = lastStr(W.text, "cwd");
      if (cwd && (cwd !== lastCwd || cwdSeen++ % 8 === 0)) { touch(S, cwd, 0.5, false); lastCwd = cwd; if (!S.cwd) S.cwd = cwd; }
      if (!W.whole) return;
      if (type === "user") {
        if (W.text.indexOf('"tool_result"') >= 0) return;
        let o; try { o = JSON.parse(W.text); } catch { return; }
        const c = o.message && o.message.content;
        const txt = typeof c === "string" ? c : Array.isArray(c) ? (c.find((b) => b && b.type === "text") || {}).text : "";
        const t = cleanTitle(txt);
        if (t) { S.prompts++; if (!fallback || (fallback.length < 15 && t.length >= 15 && S.prompts <= 5)) fallback = t; }
        return;
      }
      if (W.text.indexOf('"tool_use"') < 0) return;
      let o; try { o = JSON.parse(W.text); } catch { return; }
      const c = (o.message && o.message.content) || [];
      if (!Array.isArray(c)) return;
      for (const b of c) {
        if (!b || b.type !== "tool_use") continue;
        const name = String(b.name || ""), inp = b.input || {};
        S.tools++;
        tagStack(name, S.stack, 1);
        const writes = /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(name);
        for (const k of ["file_path", "notebook_path", "path"]) if (typeof inp[k] === "string") touch(S, inp[k], writes ? 3 : 1, k !== "path");
        for (const k of ["command", "code", "script", "pattern"]) if (typeof inp[k] === "string") { for (const p of pathsIn(inp[k], 20)) touch(S, p, 1, false); tagStack(inp[k], S.stack, 0.3); }
      }
    });
    if (!S.title) S.title = fallback;
    return S;
  }

  /* Codex: ~/.codex/sessions/ГГГГ/ММ/ДД/rollout-…-<id>.jsonl */
  async function readCodex(file, titles) {
    const base = nodeApi().path.basename(file, ".jsonl");
    const idm = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(base);
    const S = newSession("codex", idm ? idm[1] : base, file);
    let fallback = "", exec = false;
    await eachLine(file, (buf, s, e) => {
      const head = buf.toString("utf8", s, Math.min(e, s + 300));
      const ts = /"timestamp":"([^"]+)"/.exec(head);
      const tm = /"type":"([a-z_]+)"/.exec(head);
      const type = tm ? tm[1] : "";
      if (type === "session_meta") {
        const W = window_(buf, s, e, 2000000);
        const id = firstStr(W.text, "id"); if (id && !idm) S.id = id;
        const cwd = firstStr(W.text, "cwd"); if (cwd) { touch(S, cwd, 2, false); S.cwd = S.cwd || cwd; }   // у Codex папка работы задана явно
        if (/"originator":"codex_exec"/.test(W.text) && /\/tmp\/|\\Temp\\/.test(cwd || "")) exec = true;
        if (ts) stamp(S, ts[1]);
        return;
      }
      if (ts && (type === "response_item" || type === "event_msg")) stamp(S, ts[1]);
      if (type === "turn_context") { const W = window_(buf, s, e, 400000); const cwd = firstStr(W.text, "cwd"); if (cwd) touch(S, cwd, 0.5, false); return; }
      if (type !== "response_item") return;
      const W = window_(buf, s, e, 2000000);
      if (!W.whole) return;
      const pt = /"payload":\{"type":"([a-z_]+)"/.exec(W.text.slice(0, 600));
      const ptype = pt ? pt[1] : "";
      if (ptype === "message" && /"role":"user"/.test(W.text.slice(0, 800))) {
        let o; try { o = JSON.parse(W.text); } catch { return; }
        const c = (o.payload && o.payload.content) || [];
        // первый блок — служебный <environment_context>, сама просьба дальше
        for (const b of Array.isArray(c) ? c : []) {
          if (!b || (b.type !== "input_text" && b.type !== "text")) continue;
          const t = cleanTitle(b.text);
          if (t) { S.prompts++; if (!fallback) fallback = t; break; }
        }
        return;
      }
      if (ptype !== "custom_tool_call" && ptype !== "function_call" && ptype !== "local_shell_call") return;
      let o; try { o = JSON.parse(W.text); } catch { return; }
      const p = o.payload || {};
      const body = String(p.input || p.arguments || (p.action && JSON.stringify(p.action)) || "");
      S.tools++;
      tagStack(String(p.name || ""), S.stack, 1);
      for (const m of body.matchAll(/\*\*\* (?:Add|Update|Delete) File: ([^\n]+)/g)) touch(S, m[1].trim(), 3, true);
      for (const q of pathsIn(body, 20)) touch(S, q, 1, false);
      tagStack(body, S.stack, 0.3);
    });
    S.title = (titles && titles.get(S.id)) || fallback || S.title;
    if (exec) S.delegated = true;   // Codex, запущенный другим ИИ во временной папке
    return S;
  }
  async function codexTitles(f) {
    const map = new Map();
    for (const p of [f.history, f.index]) {
      try {
        await eachLine(p, (buf, s, e) => {
          if (e - s > 20000) return;
          try {
            const o = JSON.parse(buf.toString("utf8", s, e));
            if (o.thread_name && o.id) map.set(o.id, cleanTitle(o.thread_name));            // index: имя треда важнее
            else if (o.session_id && o.text && !map.has(o.session_id)) map.set(o.session_id, cleanTitle(o.text));
          } catch { /* битая строка */ }
        });
      } catch { /* файла нет */ }
    }
    return map;
  }

  /* память Claude: заметки с name / description и ссылками [[...]] */
  async function readMemory(file) {
    const n = nodeApi();
    let text = "";
    try { text = await n.fs.promises.readFile(file, "utf8"); } catch { return null; }
    const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
    const get = (k) => { const m = fm && new RegExp("^" + k + ":\\s*(.*)$", "m").exec(fm[1]); return m ? m[1].trim().replace(/^["']|["']$/g, "") : ""; };
    const body = fm ? text.slice(fm[0].length) : text;
    const name = get("name") || n.path.basename(file, ".md");
    const M = { name, file, desc: get("description"), type: get("type"), roots: {}, names: {}, links: [], stack: {}, t: 0 };
    try { M.t = (await n.fs.promises.stat(file)).mtimeMs; } catch { /* нет даты */ }
    for (const m of body.matchAll(/\[\[([^\]|#]+)/g)) M.links.push(m[1].trim());
    const paths = [];
    for (const m of body.matchAll(/\x60([^\x60\n]{2,260})\x60/g)) if (/^(~\/|\/|[A-Za-z]:[\\\/])/.test(m[1].trim())) paths.push(m[1].trim());
    // путь Windows с пробелами в тексте: обрезаем там, где дальше уже пояснение
    for (const m of body.matchAll(/(?:^|[\s(])([A-Za-z]:\\[^\n\x60"'(),;]{2,200})/g)) paths.push(m[1].split(/\s[—–-]\s|:\s|\.\s|\s\(|\s(?:—|–)/)[0].trim());
    for (const p of paths.concat(pathsIn(body, 30))) {
      const r = rootOf(p.replace(/[.\s]+$/, ""), false);
      if (!r) continue;
      M.roots[r.key] = (M.roots[r.key] || 0) + 1;
      M.names[r.key] = M.names[r.key] || [r.name, r.path];
    }
    tagStack(M.desc + " " + body.slice(0, 3000), M.stack, 0.5);
    return M;
  }

  /* ---------- синхронизация ---------- */
  /**
   * opts: { ais: ["claude","codex"], extra: [{ai, dir}], cache: {files:{}} , onProgress(done,total,label), alive() }
   * Возвращает { sessions, memories, cache } — кэш по размеру и дате файла, чтобы повторная синхронизация была быстрой.
   */
  async function sync(opts) {
    const fs = nodeApi().fs;
    const want = new Set(opts.ais || Object.keys(AIS));
    const roots = defaultRoots().concat((opts.extra || []).map((x) => ({ ai: x.ai, dir: x.dir })));
    const jobs = [];
    for (const r of roots) {
      if (!want.has(r.ai) || !(await isDir(r.dir))) continue;
      const f = await filesOf(r);
      const titles = r.ai === "codex" ? await codexTitles(f) : null;
      for (const p of f.sessions) jobs.push({ kind: r.ai, p, titles });
      for (const p of f.memory) jobs.push({ kind: "memory", p });
    }
    const old = (opts.cache && opts.cache.files) || {}, files = {};
    const sessions = [], memories = [];
    let done = 0;
    const seen = new Set();
    for (const j of jobs) {
      if (opts.alive && !opts.alive()) return null;
      if (seen.has(j.p)) continue;
      seen.add(j.p);
      let st; try { st = await fs.promises.stat(j.p); } catch { continue; }
      const sig = st.size + ":" + Math.round(st.mtimeMs);
      let rec = old[j.p] && old[j.p].sig === sig ? old[j.p].rec : null;
      if (!rec) {
        try { rec = j.kind === "memory" ? await readMemory(j.p) : j.kind === "claude" ? await readClaude(j.p) : await readCodex(j.p, j.titles); }
        catch (e) { console.warn("Flora AI:", j.p, e); rec = null; }
      } else if (j.kind === "codex" && j.titles && j.titles.get(rec.id)) rec.title = j.titles.get(rec.id);
      if (rec) { files[j.p] = { sig, rec }; (j.kind === "memory" ? memories : sessions).push(rec); }
      done++;
      if (opts.onProgress && (done % 3 === 0 || done === jobs.length)) {
        opts.onProgress(done, jobs.length, j.kind);
        await new Promise((r) => window.setTimeout(r, 0));
      }
    }
    return { sessions, memories, cache: { files, at: Date.now() } };
  }

  /* ---------- проекты из сессий и памяти ---------- */
  function words(s) { return String(s).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []; }
  const STOP = new Set(["project", "проект", "game", "игра", "the", "and", "new", "test", "for", "мод", "mod", "app", "site", "сайт"]);
  function build(data) {
    const projects = new Map();
    const ensure = (key, nm) => {
      let p = projects.get(key);
      if (!p) projects.set(key, (p = { key, name: nm[0], path: nm[1], ais: {}, sessions: [], memories: [], t0: 0, t1: 0, w: 0, stack: {}, days: {}, prompts: 0 }));
      return p;
    };
    const loose = [];
    for (const S of data.sessions) {
      if (S.delegated) { S.projects = []; continue; }
      const keys = Object.keys(S.roots);
      const tot = keys.reduce((a, k) => a + S.roots[k], 0);
      const best = keys.sort((a, b) => S.roots[b] - S.roots[a]);
      // проект сессии — папки, где шла заметная доля работы
      S.projects = best.filter((k, i) => (i === 0 && S.roots[k] >= 1.5) || (S.roots[k] / tot >= 0.2 && S.roots[k] >= 2));
      if (!S.projects.length) {
        // чат без папки проекта (временная папка, домашняя): если в нём шла настоящая работа — это отдельный проект
        if (S.title && (S.prompts >= 5 || S.tools >= 15)) {
          const k = "chat:" + S.ai + ":" + S.id;
          S.roots[k] = 1; S.names[k] = [S.title.length > 40 ? S.title.slice(0, 39) + "…" : S.title, ""];
          S.projects = [k];
        } else { loose.push(S); continue; }
      }
      const tot2 = keys.reduce((a, k) => a + S.roots[k], 0) || 1;
      for (const k of S.projects) {
        const p = ensure(k, S.names[k]);
        if (k.startsWith("chat:")) p.chat = true;
        p.sessions.push(S); p.ais[S.ai] = (p.ais[S.ai] || 0) + 1;
        p.w += S.roots[k] / tot2; p.prompts += S.prompts;
        if (S.t0 && (!p.t0 || S.t0 < p.t0)) p.t0 = S.t0;
        if (S.t1 > p.t1) p.t1 = S.t1;
        for (const s in S.stack) p.stack[s] = (p.stack[s] || 0) + S.stack[s] * (S.roots[k] / tot2);
        for (const d in S.days) p.days[d] = 1;
      }
    }
    // память: прикрепляем по путям, а если путей нет — по словам из названия проекта
    const byName = new Map();
    for (const M of data.memories) {
      byName.set(M.name, M);
      // новый проект из памяти заводим только по заметкам о проектах; остальные лишь прикрепляем к уже найденным
      const own = !M.type || M.type === "project";
      M.projects = Object.keys(M.roots).filter((k) => own || projects.has(k));
      for (const k of M.projects) { const p = ensure(k, M.names[k]); p.fromMemory = p.fromMemory || !p.sessions.length; }
    }
    const tokOf = (p) => new Set(words(p.name).filter((w) => w.length >= 4 && !STOP.has(w)));
    for (const M of data.memories) {
      if (M.projects.length) continue;
      const mw = new Set(words(M.name + " " + M.desc).filter((w) => w.length >= 4));
      let best = null, bs = 0;
      for (const p of projects.values()) { if (p.chat) continue; let s = 0; for (const t of tokOf(p)) if (mw.has(t)) s++; if (s > bs) { bs = s; best = p; } }
      if (best) M.projects = [best.key];
    }
    for (const M of data.memories) for (const k of M.projects) {
      const p = projects.get(k);
      p.memories.push(M);
      if (!p.sessions.length) { if (M.t && (!p.t0 || M.t < p.t0)) p.t0 = M.t; if (M.t > p.t1) p.t1 = M.t; }
      for (const s in M.stack) p.stack[s] = (p.stack[s] || 0) + M.stack[s] * 0.5;
    }
    for (const p of projects.values()) {
      const top = Object.keys(p.stack).sort((a, b) => p.stack[b] - p.stack[a]);
      p.tools = top.filter((s) => p.stack[s] >= Math.max(1, p.stack[top[0]] * 0.25)).slice(0, 4);
      p.main = p.tools[0] || "other";
      p.sessions.sort((a, b) => b.t1 - a.t1);
    }
    return { projects: [...projects.values()].sort((a, b) => b.t1 - a.t1), loose, byName, memories: data.memories };
  }

  /* ---------- связи между проектами: что находит паук ---------- */
  const KINDS = {
    memory: { color: "#f0a57c", name: () => L("Память ИИ", "AI memory") },
    session: { color: "#7fd6ff", name: () => L("Одна сессия", "Same session") },
    name: { color: "#f2c56b", name: () => L("Похожие названия", "Similar names") },
    time: { color: "#9fe6dc", name: () => L("В одни дни", "Same days") },
    stack: { color: "#e59be0", name: () => L("Общий инструмент", "Shared tool") },
  };
  const RANK = { memory: 5, session: 4, name: 3, time: 2, stack: 1 };
  const fmtDay = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(FLORA_LANG === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "short" }); };
  function links(B) {
    const P = B.projects, out = new Map();
    const id = (p) => "p:" + p.key;
    const add = (a, b, kind, why, score, snippet) => {
      if (a === b) return;
      const k = a.key < b.key ? a.key + "\x00" + b.key : b.key + "\x00" + a.key;
      const e = out.get(k);
      if (!e) { out.set(k, { kind, a: id(a), b: id(b), why, score, snippet: snippet || "", kinds: [kind] }); return; }
      if (e.kinds.indexOf(kind) < 0) { e.kinds.push(kind); e.score += score * 0.5; }
      if (RANK[kind] > RANK[e.kind]) { e.kind = kind; e.why = why; e.snippet = snippet || e.snippet; }
    };
    const pk = new Map(P.map((p) => [p.key, p]));
    // 1. память: одна заметка про оба проекта или ссылка [[...]] между заметками разных проектов
    for (const M of B.memories) {
      const ps = M.projects.map((k) => pk.get(k)).filter(Boolean);
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) add(ps[i], ps[j], "memory", L("ИИ помнит их вместе: ", "The AI remembers them together: ") + M.name, 4, M.desc);
      for (const l of M.links) {
        const N2 = B.byName.get(l);
        if (!N2 || (M.type && M.type !== "project") || (N2.type && N2.type !== "project")) continue;
        for (const a of ps) for (const k of N2.projects) { const b = pk.get(k); if (b) add(a, b, "memory", M.name + " → " + N2.name, 3.5, M.desc); }
      }
    }
    // 2. одна сессия работала в обоих
    const seenS = new Set();
    for (const p of P) for (const S of p.sessions) {
      if (seenS.has(S) || S.projects.length < 2) continue;
      seenS.add(S);
      const ps = S.projects.map((k) => pk.get(k)).filter(Boolean);
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) add(ps[i], ps[j], "session", L("Работали в одной сессии", "Worked on in one session"), 3, S.title);
    }
    // 3. похожие названия (Flora Obs ↔ flora obsidian)
    const tk = P.map((p) => new Set(words(p.name).filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w))));
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      let c = 0, pre = false;
      for (const w of tk[i]) { if (tk[j].has(w)) c++; else for (const v of tk[j]) if (w.length >= 4 && v.length >= 4 && w.slice(0, 4) === v.slice(0, 4)) pre = true; }
      if (c || pre) add(P[i], P[j], "name", L("Похожие названия", "Similar names"), c ? 2.5 : 1.5);
    }
    // 4. одни и те же дни
    const dk = P.map((p) => Object.keys(p.days));
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const a = dk[i], b = P[j].days;
      if (!a.length || !dk[j].length) continue;
      const both = a.filter((x) => b[x]);
      const jac = both.length / (a.length + dk[j].length - both.length);
      if (both.length >= 2 && jac >= 0.34) add(P[i], P[j], "time", L("Работали в одни дни: ", "Worked on the same days: ") + both.slice(-3).map(fmtDay).join(", "), 1 + jac);
    }
    // 5. общий инструмент — только редкий (есть не больше чем у трети проектов), иначе всё со всем
    const by = {};
    for (const p of P) for (const t of p.tools) (by[t] = by[t] || []).push(p);
    for (const t in by) {
      const list = by[t];
      if (list.length < 2 || (P.length > 6 && list.length > Math.max(3, P.length / 3))) continue;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) add(list[i], list[j], "stack", L("Оба сделаны в ", "Both made with ") + stackName(t), 1);
    }
    return [...out.values()].sort((a, b) => b.score - a.score).slice(0, 200);
  }

  /* ---------- граф для Нейрографа ---------- */
  function graph(B, saved) {
    const nodes = [], edges = [];
    const stacks = {};
    for (const p of B.projects) stacks[p.main] = (stacks[p.main] || 0) + 1;
    const order = Object.keys(stacks).sort((a, b) => (a === "other") - (b === "other") || stacks[b] - stacks[a]);
    const gcolor = {};
    order.forEach((g, i) => (gcolor[g] = g === "other" ? NG.ROOT_COLOR : NG.PALETTE[i % NG.PALETTE.length]));
    const gname = (g) => (g === "other" ? L("Другое", "Other") : stackName(g));
    const deg = {};
    const edge = (a, b, w) => { edges.push({ a, b, w: w || 1 }); deg[a] = (deg[a] || 0) + 1; deg[b] = (deg[b] || 0) + 1; };
    const sid = (S) => "s:" + S.ai + ":" + S.id;
    const placed = new Set();
    const month = (t) => { const x = new Date(t); return x.getFullYear() + "-" + (x.getMonth() + 1); };
    for (const p of B.projects) {
      const pid = "p:" + p.key, color = gcolor[p.main], group = gname(p.main);
      nodes.push({ id: pid, kind: "note", label: p.name, group, color, path: pid, born: p.t0 || p.t1 || 0, ai: { type: "project", p } });
      // сессии — листья; если их много, собираем по месяцам на общих отростках
      const own = p.sessions.filter((S) => !placed.has(sid(S)));
      const many = own.length > 12;
      const branches = {};
      for (const S of own) {
        placed.add(sid(S));
        const label = S.title ? (S.title.length > 34 ? S.title.slice(0, 33) + "…" : S.title) : AIS[S.ai].name;
        nodes.push({ id: sid(S), kind: "card", label, group, color, path: sid(S), parent: pid, born: S.t0 || p.t0, ai: { type: "session", S } });
        let hub = pid;
        if (many) {
          const bid = pid + "::" + month(S.t0 || S.t1);
          if (!branches[bid]) { branches[bid] = 1; nodes.push({ id: bid, kind: "branch", label: "", group, color, path: null, born: S.t0 || p.t0 }); edge(pid, bid, 2); }
          hub = bid;
        }
        edge(hub, sid(S), 1);
      }
      // сессия, которая была и в этом проекте, но уже висит на другом, — связь к ней
      for (const S of p.sessions) if (!own.includes(S)) edge(pid, sid(S), 1);
      for (const M of p.memories) {
        const mid = "m:" + M.name;
        if (!placed.has(mid)) { placed.add(mid); nodes.push({ id: mid, kind: "attachment", label: M.name, group, color, path: mid, born: M.t || p.t0, ai: { type: "memory", M } }); }
        edge(pid, mid, 1);
      }
    }
    // связи, которые сплёл паук
    const have = new Set(nodes.map((n) => n.id));
    for (const l of saved || []) if (have.has(l.a) && have.has(l.b)) edge(l.a, l.b, 2);
    let t0 = Infinity;
    for (const n of nodes) { n.deg = deg[n.id] || 0; if (n.born && n.born < t0) t0 = n.born; }
    for (const n of nodes) if (!n.born) n.born = t0 < Infinity ? t0 : 0;
    const groups = order.map((g) => ({ name: gname(g), color: gcolor[g], count: stacks[g] }));
    return { nodes, edges, groups };
  }

  function exists(p) { try { return !!p && nodeApi().fs.existsSync(p); } catch { return false; } }
  function expand(p) { p = String(p || "").trim().replace(/^["']|["']$/g, ""); return p[0] === "~" ? homeDir() + p.slice(1) : p; }

  return { available, AIS, KINDS, detect, sniff, sync, build, links, graph, rootOf, pathsIn, stackName, defaultRoots, exists, expand, homeDir };
})();
