# Harmonic Pair Synthesizer

[English](README.md) · [简体中文](README.zh-CN.md)

A browser-based, two-tone additive synthesizer for seeing and hearing the relationships between fundamentals and harmonics. Compare two spectra on a shared frequency axis, shape their timbres, and save reproducible listening experiments.

Built with HTML, CSS, JavaScript, SVG, and the Web Audio API. No dependencies, backend, or build step are required. The application interface is in English.

## Explore two tones

- Compare Tone A (orange) and Tone B (blue) on a shared logarithmic or linear spectrum. Line shade represents amplitude; selection thickens the line.
- Display frequency labels, note names, or both. Zoom, pan, and resize the spectrum and Playback panels together.
- Tune each fundamental from C0 to C10, approximately 16.35–16,744.04 Hz. Drag a harmonic line to transpose that tone's entire harmonic series while preserving its integer frequency ratios.
- Edit the B/A relationship as a fraction, decimal ratio, or signed cents. Fix ratio links both fundamentals; Shift provides fine adjustment.
- Snap to semitones or nearby harmonic alignments. Dashed links identify coincident, nonzero-amplitude partials.
- Edit 1–32 partial amplitudes using draggable bars. Presets include sine, equal amplitude, inverse 1/n (sawtooth), inverse square, triangle, and square.
- Set levels using reference amplitude or overall RMS normalization, optionally link A/B levels, and route mixed stereo or A-left/B-right output.

## Quick start

Open the deployed GitHub Pages site. Click Play or use a playback shortcut to start audio. Begin with a low output level.

For a local copy, serve `dist/` over HTTP, for example with Python 3:

```sh
python3 -m http.server 8000 --directory dist
```

Then open <http://localhost:8000>. Use an HTTP server rather than opening `index.html` directly, because the app uses JavaScript modules.

## Controls

| Input | Action |
| --- | --- |
| `Z` / `/` | Play or stop Tone A / Tone B |
| `Space` | Play both, or stop all if either is playing |
| `Esc` | Stop all |
| `B` | Switch mixed and split channel routing |
| `Cmd+S` / `Ctrl+S` | Save the current experiment |
| `Cmd+N` / `Ctrl+N` | Create a default experiment; prompt if edits are unsaved |
| `Shift` + supported drag | Fine adjustment |
| Scroll over spectrum | Zoom the frequency view |
| Drag spectrum background | Pan the frequency view |
| Drag spectrum line | Tune that tone's entire harmonic series |
| Double-click panel divider | Fit panel height to Playback controls |

Click a ratio numerator, denominator, or cents value to edit it; Enter or blur commits, and Escape cancels. Drag the decimal B/A ratio horizontally to tune it. Drag inside the full gray or colored bar track to edit amplitude; clicking its margin or harmonic index only highlights it. Click elsewhere to clear the highlight.

Playback shortcuts stay active during numeric edits and selector/slider interactions. Letter shortcuts pause while typing an experiment name. Browser-reserved shortcuts may take precedence in some environments.

## Experiments and transfer between devices

Experiment records include the tone, timbre, routing, tuning, and view settings. Playback is always restored stopped. Changes are saved only when you press Save; unsaved-change prompts protect record switching and page exit where supported by the browser. The most recently opened saved record loads on startup.

Use **Export records** in the sidebar to download a JSON file containing all saved records and the current setup, including its unsaved edits. Exporting does not mark those edits as saved locally.

Transfer the file to another device and choose **Import records** there. Import merges into that browser's saved collection, skips identical name-and-state records, and preserves differing versions with colliding IDs as separate copies. It keeps the currently open setup and its unsaved changes intact. Reimporting the same file does not add duplicates. An import accepts up to 1,000 records and a 10 MB file.

Storage is local to the browser and site origin. There is no account-based or automatic cloud synchronization. A GitHub Pages deployment has separate storage from the earlier Harmonic Lens site; export there and import here to migrate. Existing Harmonic Lens JSON exports remain compatible. Clearing browser data removes local records, so keep exported backups.

## Sound and interpretation

For a tone, the finite additive signal is

```text
x(t) = A × sum(r_n × cos(2π n f0 t + φ_n)),  n = 1 … N
r_n = A_n / A
```

Reference-amplitude mode sets `A`; the fundamental's ratio `r_1` can also be edited. Overall-level mode normalizes using the active partials' RMS energy, making different spectra easier to compare at similar electrical levels. Equal RMS is not guaranteed to sound equally loud. Output headroom protection may reduce gain to keep the summed signal within range.

Phases are assigned automatically, including preset-specific phase signs. Only integer harmonic frequencies and amplitude ratios are editable; there is no independent partial-frequency or phase editor. Partials at or above the audio device's Nyquist limit are silent. At very high fundamentals, even the first partial may exceed that limit.

Harmonic alignment snapping engages within 10 cents and releases beyond 16 cents. It prefers lower-order and stronger active partials, takes priority over semitone snapping near a match, and pauses when Fix ratio is enabled. Dashed links show frequency coincidences, not a universal measure of perceived consonance. Note labels use twelve-tone equal temperament with A4 = 440 Hz.

Touch controls suppress accidental pinch gestures and ordinary text selection, while retaining scrolling and text-field editing. Browser accessibility overrides may still apply.

## Development

Use Node.js 22 or later for the dependency-free tests:

```sh
npm test
npm run check
```

The app itself runs in a modern browser without Node.js. Tests cover settings, linked tuning, harmonic matching, interaction geometry, record persistence, and record transfer.

| Path | Purpose |
| --- | --- |
| `dist/index.html`, `dist/style.css` | Application UI and styling |
| `dist/app.js` | UI interactions, Web Audio, and experiment management |
| `dist/math.mjs` | Frequency, pitch, waveform, and level calculations |
| `dist/settings.mjs` | Defaults and setting validation |
| `dist/alignment.mjs` | Harmonic matching and snapping |
| `dist/records.mjs` | Record snapshots, import/export, and merging |
| `dist/interactions.mjs` | Hit testing, fractions, and tooltip geometry |
| `tests/` | Node.js regression tests |
| `.github/workflows/pages.yml` | Checks and GitHub Pages deployment |

The `dist/` directory is the maintained application source, not generated output. Static assets use relative paths so project Pages URLs work without a base-path rewrite. Legacy storage keys and the export format identifier are intentionally preserved for compatibility.

## GitHub Pages deployment

Create a repository named `harmonic-pair-synthesizer` and push these files to its `main` branch. In **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source. The included workflow tests the code and publishes only `dist/`. Pushes to `main` and manual runs deploy; pull requests run checks without deployment.

The workflow's deployment result reports the actual Pages URL. No API keys or repository secrets are required. See [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
