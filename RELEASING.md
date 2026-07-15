# Releasing Codex Cat

## One-time Marketplace metadata

Before the first public release, add values owned by the publisher to
`package.json`:

- `publisher`: the Visual Studio Marketplace publisher ID (required).
- `repository`, `bugs`, and `homepage`: the public project locations.
- `license` and a matching root `LICENSE` file.
- `icon`: a 128×128 or larger PNG used by the Marketplace listing.

Confirm that every bundled font glyph and source SVG may be redistributed
under the selected license. Do not use placeholder publisher or repository
values in a public release.

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
`dist/uninstall.js`, `media/codex-cat-frames.woff`, and
`scripts/codex-cat-hook.cjs`.

If an intentional runtime file such as a Marketplace icon is added later,
update the allowlist in `tools/verify-package-contents.cjs` in the same change.

Install the generated VSIX in a clean VS Code profile and verify setup, hook
trust, animation start/stop, hook reinstall, and extension removal before
publishing it with `vsce publish`.
