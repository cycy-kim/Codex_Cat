# Animation sources

This directory contains development-only source artwork. It is excluded from the
published VSIX; the extension ships only the generated icon font in `media/`.

Each child directory is one interchangeable animation set. A set should contain:

- SVG frames named `frame_*.svg`, such as `frame_01.svg`.
- An optional `sequence.json` defining playback order and timing.
- Optional previews, contact sheets, and source notes.

Select the active set in the project-root `cat-animation.json`:

```json
{
  "framesRoot": "./animation-sources/my-animation"
}
```

When `sequence.json` is present:

- `recommended_order` may reference the same SVG more than once.
- `frame_count` must match the number of playback entries.
- `recommended_timing_ms` must provide one positive duration per entry.

Run `npm run compile` after changing the active set or its sequence. The build
regenerates the WOFF, TypeScript frame list, and icon contributions.

Only `frame_*.svg` files are auto-discovered. Files such as
`preview_animation.svg` are treated as documentation assets, not animation
frames.
