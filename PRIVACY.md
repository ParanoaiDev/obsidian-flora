# Privacy

Flora runs entirely inside Obsidian on your device.

- **No network.** Flora makes no network requests. It has no analytics, no telemetry, no update checks and no external fonts or images.
- **Your notes stay where they are.** Flora reads your vault through Obsidian's own API to draw graphs, the journal and the start screen. It only writes to your vault when you ask it to: creating a daily note, resetting a journal entry, turning a line into a task, or editing a case on the investigation board.
- **AI projects reads files outside your vault, only when you open it and press Sync.** It reads the Claude Code history in `~/.claude` and the Codex history in `~/.codex` (and any folder you add yourself) on this computer, to find the projects you worked on. It never sends them anywhere and never changes them. It keeps only project names, folders, dates, session titles and counts in `.obsidian/plugins/flora/ai-cache.json`; API keys and long tokens in chat titles are replaced with •••. If you sync your vault's `.obsidian` folder, that file travels with it; delete it to forget everything.
- **Settings** are stored by Obsidian in `.obsidian/plugins/flora/data.json` inside your vault.
- **The investigation board** is a place to organise what you find yourself. It does not search, scrape, look up or contact anything. Each case is a plain note in your vault.

If you find anything that contradicts this, please [open an issue](https://github.com/ParanoaiDev/obsidian-flora/issues).
