# Pantomima — design

The look of the app, written down so it can be rebuilt 1:1 in the Kotlin
Multiplatform app. The canvas with all mockups (A–E):
https://claude.ai/artifact/LdUbK16AkZWfSVRQ8xg1nU (private to the owner).

`reference/` holds the mockup sources (`*.dc.html`, the canvas's own format:
plain HTML with inline styles, readable in any editor; they only render inside
the canvas).

## Rules (from the owner)

1. **Every screen fits on one phone screen.** No page scrolling. Long content
   (a Wikipedia intro, the 10-word list on a small phone) scrolls inside its own box.
2. **The feel:** a cuber, a coder, a videographer. Simple theme; the "cube" shows
   mostly in the motion between screens.
3. Greek voice: see `agents.md` (singular for a person, plural for a team).

## D · "Cube Pro" — the live theme

Implemented in `style.css` (tokens in `:root`), `index.html`, `app.js`.

### Tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0F1012` | screen background |
| `--surface` | `#1A1C20` | cards, rows, secondary buttons |
| `--surface-2` | `#24272C` | chips, pressed/selected neutral |
| `--line` | `#2E3238` | borders |
| `--line-2` | `#3A3F47` | stronger borders, empty squares |
| `--text` | `#F3F3F1` | text; also the neutral button (cube white) |
| `--muted` | `#A0A4AB` | secondary text |
| `--ink` | `#0F1012` | text on a coloured button |
| `--cube-blue` | `#4C8DFF` | team colour / Object |
| `--cube-orange` | `#FF8A2B` | team colour / Action |
| `--cube-red` | `#FF6369` | team colour / Media / hard |
| `--cube-green` | `#3DD68C` | team colour / Phrase / easy / switch on |
| `--cube-yellow` | `#FFD43B` | team colour / Person / medium / numbers |
| `--cube-white` | `#F3F3F1` | team colour |

Fonts: **Inter** (400/500/600/700) for text, **JetBrains Mono** (500/700) for
numbers, the timer and the small `// section` labels. Both have Greek.

Shape: screens padded 20px; cards radius 22; buttons/rows radius 14–16; chips
are pills; main button 58px tall (76px for "Βρέθηκε!"); touch targets ≥ 44px.

### Colour rule: the screen takes the colour of the team holding the phone

`--team` is set per screen. It tints the header chip, the selected card, the
timer bar and the main button (dark text on it). Screens that belong to no
team (version picker, setup, final) use white as `--team`.

- Tint background: `color-mix(in srgb, var(--team) 16%, var(--bg))`
- Tint border: `color-mix(in srgb, var(--team) 50%, var(--bg))`

Other colour is small and has a second cue:
- categories: a small sticker (square) in the category's cube colour + the name
- difficulty: 1 / 2 / 3 filled squares (green / yellow / red) + the name
- numbers that matter (rounds, bonus): yellow, monospace

### Motion: cube turn

Changing screen turns the whole screen like a cube face (rotate −90° around Y,
600ms, `cubic-bezier(.65,0,.35,1)`). Skipped when the OS asks for reduced
motion, and when the same screen is redrawn. Code: `render()` in `app.js`,
`.cube` in `style.css`. In Compose: `graphicsLayer { rotationY; cameraDistance }`
on the outgoing and incoming screens, pivoting on the shared edge.

Two alternatives were mocked up and can be swapped in
(`reference/motion-layer-turn.dc.html`: 4 horizontal layers turn one after the
other; `reference/motion-sticker-flip.dc.html`: 9 stickers flip in a wave).

## E · "Editor" — planned easter egg (not built)

A hidden second theme: the same app drawn as a code editor. Mockup:
`reference/E-editor.dc.html`. Nothing in the app uses it yet.

What defines it:
- **All text in JetBrains Mono.**
- Colours: bg `#0E1013`, surface `#15181D`, line `#262B33`, text `#E8E6E1`,
  comments `#8B93A1`, names (keys) `#7AB7FF`, strings `#7EE0A2`,
  numbers `#FFB86B`, booleans `#FFD866`, line numbers `#7A828E`.
- **Setup reads like a settings file** with line numbers; each line is still a
  normal control: `ομάδα_α = "Ομάδα Α"`, `γύροι = 6`, `[x] Εύκολη = 45s`,
  `χωρίς_ονόματα = true`. Section labels are `// comments`.
- A **tab** at the top of each screen with the active team's colour
  (underline + square). Team colours: blue `#7AB7FF`, orange `#FFB86B`.
- **Start = green "run" button** (`#7EE0A2`, ▶ icon). Other main buttons take
  the team colour, as in D.
- Cards show their details as code: `δυσκολία: "Μέτρια", χρόνος: 60s`.
- Timer: big `00:27` with a blinking colon, a bar of 20 blocks, and a small
  box with `στοίχημα = "…"`, `μπόνους = +75 // αν βρεθεί`.

How to add it later:
- Web: everything visual hangs off the CSS variables in `:root`, so the theme
  is mostly a `[data-theme="editor"]` block in `style.css` (colours, mono font,
  squarer radii) plus the setup line numbers. Remember the choice in
  `localStorage` (`pantomima.theme`).
- Kotlin: a second `ColorScheme` + `Typography`.
- Trigger idea (not decided): tap the 3×3 logo in the header 7 times, or enter
  a cube move (e.g. "R U R' U'") as a team name.
