// Сборка плагина без зависимостей: склеивает исходники в main.js и стили в styles.css.
// Запуск: node build.js            → папка dist/
//         node build.js <папка>    → например, прямо в .obsidian/plugins/flora хранилища
const fs = require("fs");
const path = require("path");

const root = __dirname;
const out = path.resolve(process.argv[2] || path.join(root, "dist"));
const src = (f) => fs.readFileSync(path.join(root, "src", f), "utf8");

const JS = ["core.js", "daily.js", "lab.js", "case.js", "plugin.js"];
const CSS = ["plugin.css", "skin.css", "case.css", "lab.css"];

const main =
  '"use strict";\n' +
  "/* Flora — новый дизайн Obsidian и живые нейронные графы. Собрано из src/ скриптом build.js */\n" +
  'const obsidian = require("obsidian");\n' +
  JS.map(src).join("\n");

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "main.js"), main);
fs.writeFileSync(path.join(out, "styles.css"), CSS.map(src).join("\n"));
fs.copyFileSync(path.join(root, "manifest.json"), path.join(out, "manifest.json"));
console.log("Собрано в " + out + " (" + Math.round(main.length / 1024) + " КБ)");
