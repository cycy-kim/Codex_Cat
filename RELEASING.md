# Releasing Codex Cat

## Marketplace metadata

The extension manifest uses the Marketplace publisher ID `codex-cat` and the
display name `Codex Cat`. Before the first release, create or confirm a
Marketplace publisher whose ID is exactly `codex-cat`; the display name alone
is not the publisher ID.

The public repository links, MIT code license, and 256×256 PNG Marketplace icon
are included in `package.json` and the repository root.

Confirm that the icon, every bundled font glyph, and its source SVG may be
redistributed. These visual assets are not covered by the MIT code license
unless their source includes a separate license notice.

## Release check

From a clean checkout:

```bash
npm ci
npm test
npm run package:check
npm run package:vsix
```

The same test and package-content checks run in `.github/workflows/ci.yml` on
every push and pull request. Marketplace publishing stays manual until the
publisher identity and release credentials are configured.

`package:check` prints the exact VSIX contents. The runtime package should
contain only the manifest and documentation, `dist/extension.js`,
`dist/uninstall.js`, `icon.png`, `media/codex-cat-frames.woff`, and
`scripts/codex-cat-hook.cjs`.

Install the generated VSIX in a clean VS Code profile and verify setup, hook
trust, Back to Codex navigation, animation start/stop, hook reinstall, and
extension removal before publishing it with `vsce publish`.
