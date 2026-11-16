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

### Motion

Clean and quick; the cube shows only in the logo. Code: `render()` in
`app.js`, the "Motion" block in `style.css`. Uses the View Transitions API
(Chrome 111+, Safari 18+); older browsers get a plain slide-in; nothing when
the OS asks for reduced motion.

- **Slide:** forward = the new screen comes in from the right (48px + fade,
  340ms, `cubic-bezier(.2,.8,.2,1)`), the old one leaves left (40px, 200ms).
  Back = mirrored. The header stays put.
- **Shared elements:** the chosen card's title (or Wikipedia word) flies into
  the briefing's word (`card-word`); the screen's main button morphs into the
  next screen's main button (`main-action`); the header team chip morphs
  (`team-chip`).
- **Logo turn:** the 3×3 logo turns a quarter (+90° forward, −90° back),
  520ms with a slight overshoot.
- **Back:** only where it makes sense, currently Setup → version picker.
  Swipe right anywhere on the screen (it follows the finger; past 30% of the
  width or a flick = back), the "version" chip, or the system/browser back.
  Mid-game there is no back on purpose (it would undo picks or show the card
  to the wrong team).
- In Compose: `AnimatedContent` with `slideInHorizontally + fadeIn`,
  `SharedTransitionLayout` + `Modifier.sharedElement` for the title and button,
  `animateFloatAsState` for the logo, `PredictiveBackHandler` for the swipe.
- Haptics: planned (Android `navigator.vibrate` now, real haptics in the app):
  tick on taps, double pulse on "Βρέθηκε!", buzz at 10s left, tick each of the
  last 5 seconds, long buzz at time up.

Earlier ideas, kept in `reference/`: whole-screen cube turn
(`motion-cube-turn.dc.html`, dropped: felt dated), layer turn, sticker flip.

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
