# Changelog

## [Unreleased]

- Added automatic Codex hook installation, trust guidance, and safe removal.
- Added a primary `Review Hooks` action that opens Codex Hooks settings directly.
- Removed the misleading persistent `Trust hooks` status and retained working-state evidence when reinstalling an unchanged hook definition.
- Added status bar animation driven by `UserPromptSubmit` and `Stop` events.
- Added configurable SVG animation sets with per-frame timing.
- Kept prompt and response content out of the local event log.
- Added bounded event logging and automatic cleanup when the extension is removed.
- Bundled runtime code and reduced the VSIX to an explicit runtime allowlist.
