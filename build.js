// Builds the plugin with no dependencies: concatenates the sources into main.js and styles.css.
// Usage: node build.js            -> main.js and styles.css in the repository root, next to manifest.json
//        node build.js <folder>   -> for example straight into <vault>/.obsidian/plugins/flora
const fs = require("fs");
const path = require("path");

const root = __dirname;
const out = path.resolve(process.argv[2] || root);
const src = (f) => fs.readFileSync(path.join(root, "src", f), "utf8");

const JS = ["core.js", "flora3d.js", "shapes.js", "spider.js", "walls.js", "daily.js", "lab.js", "case.js", "plugin.js"];
const CSS = ["plugin.css", "flora3d.css", "spider.css", "skin.css", "walls.css", "case.css", "lab.css"];

const main =
  '"use strict";\n' +
  "/* Flora: a new look for Obsidian and living neural graphs. Built from src/ by build.js */\n" +
  'const obsidian = require("obsidian");\n' +
  JS.map(src).join("\n");

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "main.js"), main);
fs.writeFileSync(path.join(out, "styles.css"), CSS.map(src).join("\n"));
if (out !== root) fs.copyFileSync(path.join(root, "manifest.json"), path.join(out, "manifest.json"));
console.log("Built into " + out + " (" + Math.round(main.length / 1024) + " KB)");
