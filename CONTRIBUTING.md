# Contributing

Thanks for wanting to make Flora better. Bug reports, ideas and pull requests are all welcome.

## Reporting a bug

[Open an issue](https://github.com/ParanoaiDev/obsidian-flora/issues) with:

- your Obsidian version and operating system,
- the Flora version (Settings → Community plugins),
- what you did, what you expected, and what happened,
- a screenshot if something looks wrong, and anything from the developer console (Ctrl+Shift+I) that mentions Flora or Neurograph.

## Working on the code

Flora has no dependencies and no bundler. The source is plain JavaScript and CSS in `src/`, and `build.js` concatenates it into a single `main.js` and `styles.css`.

```bash
node build.js                                   # builds into dist/
node build.js "/path/to/vault/.obsidian/plugins/flora"   # builds straight into a vault
```

Reload the plugin in Obsidian (turn it off and on, or use a hot-reload plugin) to see your change.

| File | What it does |
| --- | --- |
| `src/core.js` | Language helpers, graph building, physics, the WebGL2 renderer, graph and canvas skins |
| `src/daily.js` | Today's journal and auto-tasks |
| `src/lab.js` | The start screen in empty tabs |
| `src/case.js` | The investigation board |
| `src/plugin.js` | Views, commands and settings |
| `src/skin.css` | The Flora design for Obsidian's interface |
| `src/plugin.css`, `src/case.css`, `src/lab.css` | Styles for Flora's own views |

## Guidelines

- **Text in two languages.** Every string a user can see goes through `L("Русский", "English")`. Keep English short, plain and in sentence case.
- **Keep it light.** The living layers run every frame. Avoid allocations in render loops, and respect the frame budget in `frameGate`.
- **Fail safe.** The graph and canvas skins depend on Obsidian internals. Guard every access, and if something is missing, detach and leave Obsidian's own view untouched.
- **No network access**, no telemetry, no new dependencies.
- One change per pull request, with a short description of what it does and how you checked it.
