# Changelog

## [Unreleased]

- Added a dedicated Back to Codex status button that persists until used and survives window reloads.
- Simplified setup notifications and removed development-only commands from the Command Palette.
- Hardened local event, hook, and backup paths against symbolic-link redirection.
- Prevented a missing Stop event from leaving an older turn in the same session animated forever.
- Added Marketplace publisher metadata, an MIT code license, and a listing icon.
- Added automatic Codex hook installation, trust guidance, and safe removal.
- Added a primary `Review Hooks` action that opens Codex Hooks settings directly.
- Removed the misleading persistent `Trust hooks` status and retained working-state evidence when reinstalling an unchanged hook definition.
- Added status bar animation driven by `UserPromptSubmit` and `Stop` events.
- Added configurable SVG animation sets with per-frame timing.
- Kept prompt and response content out of the local event log.
- Added bounded event logging and automatic cleanup when the extension is removed.
- Bundled runtime code and reduced the VSIX to an explicit runtime allowlist.
