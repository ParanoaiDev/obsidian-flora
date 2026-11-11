# Changelog

All notable changes to Flora are listed here. Versions follow [semantic versioning](https://semver.org).

## 5.5.0

### Added
- **Flora 3D**, a new view with its own ribbon icon and the **Open Flora 3D** command. Your vault becomes a 3D organism: every note is a neuron with a bright core and its own dendrites, every link a fine thread, and tens of thousands of particles gather along the links and around the notes. The particles are decoration and never stand in for a note.
- Rotate by dragging, pan with the right button or Shift, zoom with the wheel or a pinch. Double-click the background to fit everything.
- Hover a note to see its name, click to select it: light flows from it along its links, and a card shows its folder, tags and linked notes. Double-click opens the note; one-click opening is an option.
- Search by name, `#tag` or folder. Click a group in the legend to show only that group.
- Group notes by folders, tags or links. Five shapes with a smooth flight between them: **Organism**, **Brain**, **Nerves** (a brain on a spine with ribs and nerves made of particles), **Spheres** (every group is a ball with its most linked note in the centre) and **Galaxy** (groups laid along spiral arms). Seven palettes, and sliders for particles, point size, links, glow and speed.
- Neurons fire: a fan of light grows from a note towards a linked one and sometimes carries on down the chain, pulses run along the links, and slow waves of activity brighten and dim whole regions. Both have their own sliders.
- The layout is stable: the same vault always grows into the same shape.
- Pause stops all motion; the scene is also still when the system asks for reduced motion.

## 5.4.1

### Changed
- The plugin is listed as **Flora** again. The community directory keeps the name a plugin was registered with, so the longer name from 5.3.2 is reverted. Nothing else changed.

## 5.4.0

### Added
- **Timeline** in the Neurograph. Select **Timeline** and watch your vault grow note by note in the order you created it: new cells bloom in place and fire, and a link grows from the older note to the newer one once both exist. Play or pause, change the speed, or drag along the scale to any moment. The date and the number of neurons at that moment are shown under the scale.
- A Flora loading screen. While the Neurograph gathers your notes and lays them out, a glass Flora flower unfolds with a progress bar, and the tissue fades in when it is ready.

### Fixed
- Neurons no longer shake. Repulsion between cells used to cut off sharply at 900 px, so a cell got a small kick every time a distant cluster crossed that line. It now fades out smoothly.
- The Neurograph no longer twitches after you edit a note. A refresh that changes nothing keeps the layout and the signals in flight as they are.
- Large vaults (1,600+ cells) move smoothly instead of in half-steps.

### Changed
- Much faster Neurograph, with the same look: the physics is about 2.6× faster, building a frame for the GPU about 1.5× faster, rebuilding the graph after a change about 1.5× faster.
- Opening the Neurograph no longer freezes Obsidian. The first layout used to run in one block (2 s for 1,000 notes, 12 s for 4,000); it now runs between frames behind the loading screen.
- Styles no longer use `:has()`, `!important` or prefixed masks.
- Releases are built from source by GitHub Actions and come with build provenance attestations. The repository now has a `package-lock.json`.

## 5.3.2

### Changed
- The plugin is now listed as **Flora: Neural Graph & Glass UI**, so it is easier to find in the community directory. The plugin id stays `flora`, so existing installs and settings are untouched.

## 5.3.1

### Changed
- Ready for the Obsidian community directory: layout styles moved from code into CSS, timers and documents are popout-window aware, background file edits use `Vault.process`, and constructed paths go through `normalizePath`.
- The Flora design now also applies to popout windows.
- The interface language is read with `getLanguage()` where available.
- `node build.js` now writes `main.js` and `styles.css` to the repository root, like the official plugin template.

## 5.3.0

### Added
- English interface. Flora follows Obsidian's language: English by default, Russian when Obsidian is in Russian.
- **Language** setting to pick Auto, English or Russian by hand. It applies after the plugin reloads.
- English daily journal template (Notes, Tasks, Thoughts, Links of the day). Journals made with the Russian template are still recognised.

### Changed
- Case statuses are now stored as stable ids (open, active, paused, closed). Existing cases with Russian statuses are read and converted on the next save.
- New cases go to **Investigations** in English and **Расследования** in Russian. Cases are found in any folder, as before.
- Case frontmatter is written with English keys in English and Russian keys in Russian, and both are read in either language.

## 5.2.3

### Fixed
- Removed the colour banding that appeared once the film grain was gone. A static dither keeps gradients smooth without any moving noise.

## 5.2.1 – 5.2.2

### Fixed
- The investigation board stayed blank in Obsidian because a view property shadowed one of its methods.
- Removed the animated film grain that read as visual noise.
- Lower GPU load: 30 fps when idle, 60 while interacting, 12 in the background; embedded views use a lighter render scale; canvas cards no longer blur what's behind them.

## 5.2.0

The first version published as **Flora**.

- **Flora design** for the whole of Obsidian: glass sidebars, capsule tabs, a floating status bar, a card for the text, light and dark mode, five accent colors.
- **Neurograph**: the vault as living neural tissue, rendered with WebGL2.
- Neural look for the built-in **graph view** and **local graph**.
- Neural look for **canvases**: a space backdrop, glass cards and living connections with travelling pulses.
- **Today's journal**: a header for daily notes with a live band of the day's notes, month dots, navigation, a template, a reset button and auto-tasks.
- **Start screen** in empty tabs with living neurons under liquid glass, quick actions and recent notes.
- **Investigation board** for OSINT and research cases with a live link map.
