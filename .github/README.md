# Codex Cat

Codex Cat shows Codex activity on the right side of the VS Code status bar.

- Before setup: an idle cat with `Set up`
- After hook installation but before activity is confirmed: an idle cat
- While Codex is idle: an idle cat
- While Codex is working: a dancing cat animation

The animation starts when Codex sends a `UserPromptSubmit` hook event and stops when it sends a `Stop` event.

## Demo

[Watch Codex Cat in action](../use_case.mp4)

## Initial Setup

No terminal setup or globally installed `codex` command is required.

1. Click `Set up` in the status bar and approve the installation.
2. Click **Review Hooks** in the notification.
3. Review the `UserPromptSubmit` and `Stop` hooks, then trust them if Codex asks you to do so.
4. Select **Reload hooks**.
5. Select **← Back to Codex** in the status bar.
6. Send a message to Codex to confirm that the animation starts and stops.

While the Hooks screen is open, the status bar shows only **← Back to Codex**. The button remains available until you select it or send a message to Codex, including after a VS Code window reload.

If **Review Hooks** does not open the Hooks screen, open the Codex sidebar and go to **Settings → Hooks**. Codex requires users to review and trust hooks themselves; Codex Cat cannot bypass that security step.

Setup copies the hook runtime to `~/.codex-cat/codex-cat-hook.cjs` and merges the two Codex Cat hooks into `~/.codex/hooks.json`. Existing top-level settings and unrelated hooks are preserved, and a timestamped backup is created before an existing hooks file is changed.

## Commands

The following commands are available from the Command Palette:

- `Codex Cat: Install Hooks`: performs the initial hook installation
- `Codex Cat: Reinstall Hooks`: repairs or updates the hook definitions and runtime path
- `Codex Cat: Uninstall Hooks`: removes Codex Cat's hooks, runtime script, and local event log
- `Codex Cat: Back to Codex`: leaves the Hooks settings screen and opens a new Codex task

Reinstalling or removing Codex Cat preserves unrelated Codex hooks and settings. Uninstalling the extension runs the same cleanup automatically. If an extension update changes the hook runtime, the status bar shows `Update`; after updating, Codex may require you to trust the changed hooks again.

## Development

1. Install dependencies and compile the extension.

   ```bash
   npm install
   npm run compile
   ```

2. Open the project in VS Code and press `F5`.
3. Follow the status bar instructions in the Extension Development Host window.

To test the setup flow again, run `Codex Cat: Reinstall Hooks` from the Command Palette. If the hook definitions are unchanged from a previously working installation, Codex Cat preserves the confirmation state. It asks for another review only when the definitions change.

## Replacing the Cat Animation

Source animation sets live in the development-only `animation-sources/` directory. To switch animations, point `framesRoot` in `cat-animation.json` to a set inside that directory.

```json
{
  "framesRoot": "./animation-sources/cat_line_svg_clean_bold_48frames_custom"
}
```

If the set contains `sequence.json`, the generator uses its `recommended_order` and `recommended_timing_ms` values exactly. The same SVG can appear more than once to repeat a frame. Without `sequence.json`, frames are sorted by their `frame_*.svg` filenames and displayed for 100 ms each. WOFF data, frame code, and icon registration are regenerated automatically before `F5`, `npm run compile`, and release builds. Helper files such as `preview_animation.svg` are not treated as frames.

Stroke-based SVG artwork is supported. During font generation, strokes are converted to filled outlines without modifying the source SVG files.

Source SVG files, previews, and contact sheets are excluded from the VSIX. The extension includes only the generated `media/codex-cat-frames.woff` at runtime. TypeScript is bundled into `dist/extension.js`, so splitting internal source files does not change the release file list.

## Verifying the Release Package

The following command builds the extension and prints the files that will be included in the VSIX:

```bash
npm run package:check
```

Create the VSIX with:

```bash
npm run package:vsix
```

## Local Event File and Privacy

The hook appends events to this local JSONL file:

```text
~/.codex-cat/events.jsonl
```

Each line contains only the event type, session ID, turn ID, and timestamp. Codex Cat does not use or record prompt text, final responses, or transcript content.

Codex Cat does not make network requests or send event or conversation data anywhere. Review and trust the hooks yourself under **Settings → Hooks** in the IDE, or use `/hooks` in the Codex CLI.

Before writing a new event, the hook clears the event file if it has reached 1 MiB. On supported operating systems, file permissions are restricted so that only the current user can read and write the file. Removing the hooks or uninstalling the extension also removes the event file.

Recovery backups named `~/.codex/hooks.json.codex-cat-backup-*` are not deleted automatically. Delete them manually after confirming that you no longer need them.

## Troubleshooting

- If the animation does not start after setup, click the cat or review both hooks under **Codex Settings → Hooks**, then select **Reload hooks**.
- To repair the installation, run `Codex Cat: Reinstall Hooks` and review the two hooks again if they changed.
- If the Hooks screen remains open, click **← Back to Codex** in the status bar.
- Hooks are disabled if `~/.codex/config.toml` or a managed `requirements.toml` contains:

  ```toml
  [features]
  hooks = false
  ```

- Make sure `~/.codex/hooks.json` contains valid JSON. Codex Cat does not overwrite an existing file that it cannot parse.
- To check whether events are arriving, inspect `~/.codex-cat/events.jsonl`.

## License

The source code is distributed under the [MIT License](../LICENSE). Visual assets—including `icon.png`, source SVG files, preview images, and generated fonts—are not covered by this code license unless a separate license is provided with the asset.
