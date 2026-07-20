# Codex Cat

Codex Cat shows Codex activity as an animated cat on the right side of the VS Code status bar. No terminal setup or globally installed `codex` command is required.

## Demo

<video
  src="use_case.mp4"
  title="Codex Cat in action"
  width="560"
  autoplay
  loop
  muted
  playsinline
  controls
></video>

## Initial Setup

1. Click `Set up` in the status bar and approve the installation.
2. Click **Review Hooks** in the notification.
3. Review the `UserPromptSubmit` and `Stop` hooks, then trust them if Codex asks you to do so.
4. Select **Reload hooks**.
5. Select **← Back to Codex** in the status bar.
6. Send a message to Codex to confirm that the animation starts and stops.

While the Hooks screen is open, the status bar shows only **← Back to Codex**. The button remains available until you select it or send a message to Codex, including after a VS Code window reload.

If **Review Hooks** does not open the Hooks screen, open the Codex sidebar and go to **Settings → Hooks**. Codex requires users to review and trust hooks themselves; Codex Cat cannot bypass that security step.

Setup copies the hook runtime to `~/.codex-cat/codex-cat-hook.cjs` and merges the two Codex Cat hooks into `~/.codex/hooks.json`. Existing settings and unrelated hooks are preserved, and a timestamped backup is created before an existing hooks file is changed.

The hook writes event type, session ID, turn ID, and timestamp to `~/.codex-cat/events.jsonl`. It does not store prompt, response, or transcript content, and Codex Cat does not send data over the network. Run **Codex Cat: Uninstall Hooks** to remove Codex Cat's hooks, runtime, and event log; recovery backups remain until you delete them manually.

For development, animation, packaging, and detailed privacy information, see the [full project documentation](.github/README.md).

## Troubleshooting

- If the animation does not start after setup, click the cat or review both hooks under **Codex Settings → Hooks**, then select **Reload hooks**.
- To repair the installation, run **Codex Cat: Reinstall Hooks** and review the two hooks again if they changed.
- If the Hooks screen remains open, click **← Back to Codex** in the status bar.
- Hooks are disabled if `~/.codex/config.toml` or a managed `requirements.toml` contains:

  ```toml
  [features]
  hooks = false
  ```

- Make sure `~/.codex/hooks.json` contains valid JSON. Codex Cat does not overwrite an existing file that it cannot parse.
- To check whether events are arriving, inspect `~/.codex-cat/events.jsonl`.

## License

The source code is distributed under the [MIT License](LICENSE). Visual assets—including `icon.png`, source SVG files, preview images, and generated fonts—are not covered by this code license unless a separate license is provided with the asset.
