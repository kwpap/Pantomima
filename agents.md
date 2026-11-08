# agents.md — Pantomima

Notes and instructions for AI agents (and future me) working on this repo.
**Read this first, and update the Log at the bottom when you finish a task.**

---

## 1. What this is

A two-team **charades (παντομίμα)** game for one shared phone. Words come from
**Greek Wikipedia** at runtime, so nobody is at a disadvantage for not knowing
Greek TV / pop culture (see README).

- Pure static site: `index.html` + `app.js` + `style.css`. No build step, no
  package.json, no dependencies, no tests.
- UI text is English; game content (words, excerpts) is Greek. `<html lang="el">`.
- Mobile-first, dark theme, max width 480px.
- **Planned:** the game will soon move onto a new library/framework (not yet
  decided as of 2026-11-09). See section 6 before starting that work.

### Run it
Open `index.html` in a browser, or serve the folder (better, avoids file://
quirks): `npx serve .` or `python -m http.server 8000`.
Needs internet (Wikipedia + Wikidata APIs, CORS via `origin=*`).

---

## 2. Game flow (state machine)

`GameStates` enum in `app.js`. `setState(state)` sets `game.state` and calls the
matching `renderX()`.

```
SETUP ──start──> LOADING ──> SELECTION ──> CHOICE ──> BRIEFING ──> TIMER ──> RESULT ──> SCOREBOARD
  ^                 ^        (active team   (opponent    (opponent   (opponent         │
  │                 │         picks 3 of 10) picks 1)     sees word)  acts it out)     │
  │                 └───────────── next round: round++, swapTeams() ─────────────────┤
  └── New Game (reload) <── FINAL <── last round / "End Game Early" ──────────────────┘
```

Roles each round:
- **activeTeam** chooses 3 candidate words out of 10.
- **opponentTeam** picks 1 of those 3, then acts it and scores.
- After the round, `swapTeams()` flips roles.

Scoring: +1 to the acting team on "Found It". Each team also accumulates
`time` (seconds used). On timeout, the result screen asks the players to decide
found/failed manually.

Timer screen extras: Pause, Abort (= fail), "Sneak Peek (Hold)" shows the word
while held (mouse + touch handlers).

---

## 3. Code map (`app.js`, ~880 lines, top to bottom)

| Part | What it does |
|---|---|
| Constants | `WIKI_API`, `WIKIDATA_API`, `STORAGE_KEY`, `WORDS_PER_ROUND` (10), `PICKS_PER_ROUND` (3), `EXTRACTS_BATCH` (20), `MAX_FETCH_ATTEMPTS` (15), `$` = `querySelector` |
| `GameStates`, `CATEGORIES`, `COLOR_PALETTE` | State enum; topic categories (the setup `<select>` is filled from `CATEGORIES`); 7 team colors (defaults = first two) |
| `class Game` | **Only JSON-safe, persistent data.** `save()/load()/clearSave()` to `localStorage` (`pantomima.gameState`, all wrapped in try/catch), `activeTeam`/`opponentTeam`, `swapTeams()`. `load()` strips legacy runtime fields from old saves |
| `game`, `timerId`, `prefetch` | The game singleton + runtime-only state (never saved) |
| UI helpers | `showToast`, `render`, `setTeamIndicator`, `formatTime`, `el(tag, class, text)` (safe element builder), `shuffle` (Fisher–Yates), `chunk` |
| `fetchJson(base, params)` | Adds `origin=*&format=json`, checks `res.ok` and API `error`, retries once on HTTP 429 |
| `isPlayable(article)` | Heuristic filter: 1–6 words, no digits, no `():`, no Greek namespace prefixes, extract ≥50 chars, not a disambiguation page |
| `filterHumansViaWikidata(articles)` | "Exclude People": Wikidata `wbgetentities` (50 ids/request), drops P31 = Q5 (human). Fails open |
| `fetchRandomTitles` / `searchCategoryTitles` / `fetchCategoryTitles` | Title sources. Categories use CirrusSearch `deepcat:"X"` with `srsort=random` (whole subcategory tree), falling back to `incategory:`. `"all"` = 2 random topics per call |
| `fetchArticles(titles)` | extract + thumbnail + Wikidata id, in batches of 20 (API limit for intro extracts) |
| `fetchWords(category, { excludeHumans })` | Loops until 10 unique playable words; throws if fewer than 3 |
| `startPrefetch()` | Background fetch for the next round, stored in `prefetch` |
| `setState` + `renderX` per screen | `setState` also saves for resumable states (SELECTION…SCOREBOARD) |
| `loadWordsAndGo()` | Uses prefetch if ready/pending, else fetches. Returns `false` on failure (caller decides: back to SETUP, or undo round++ and stay on SCOREBOARD) |
| `endRound(result)` | Stops timer, updates score/time → RESULT |
| `init()` | `setState(SETUP)` |

**Prefetch:** when TIMER starts (and it isn't the last round), `startPrefetch()`
runs so the next SELECTION is usually instant.

**Save/resume:** saved on every resumable state change and every timer tick, so
a reload resumes on the same screen (timer included). Cleared on FINAL.

**Word object shape:** `{ title, extract, image, wikibase_item }`.

`index.html` holds all screens as `<template id="...Template">` plus a shared
modal (word description) and toast. `style.css` uses CSS variables in `:root`.

---

## 4. Conventions

- Vanilla JS, ES2020+ (optional chaining, async/await), no modules, globals.
- Each screen = template in HTML + `renderX()` in JS. Re-rendering replaces
  `#screenContainer` content, so listeners are re-attached every render.
- Commits so far are short, informal messages straight on `main`.
- Keep the Greek strings in `isPlayable` (banned prefixes/keywords) — they are
  intentional and matter for word quality.
- Respect Wikipedia/Wikidata APIs: batch requests (`titles=a|b|c`), keep the
  `origin=*` param, don't add tight retry loops.

---

## 5. Known issues / tech debt

All 9 issues found on 2026-11-09 are fixed (see Log). Still open / worth knowing:

- **Timer uses `setInterval` ticks**, so it can drift or pause if the phone
  screen locks or the tab is in the background. A timestamp-based timer would
  fix it.
- **Category trees on Wikipedia are loose.** `deepcat:` follows every
  subcategory, so e.g. Technology can return "Μαρμελάδα" or film titles. Also
  `deepcat` only covers a subset of very large trees (API warning, harmless).
- **Word quality**: "Random" (and categories) still return many people and
  obscure villages; `isPlayable` is a heuristic. "Exclude People" helps.
- **Rate limits**: Wikipedia returns HTTP 429 if hammered (seen during
  testing from one IP). `fetchJson` retries once; don't add request loops.
- Wrong setup input after a failed start: setup is re-rendered, so typed team
  names are lost.

## 5b. Testing

No test suite in the repo. What was used on 2026-11-09 (outside the repo):
- Live word fetch: run `app.js` in Node 24 with a stubbed `document` and call
  `fetchWords(category, { excludeHumans })` for each category.
- UI smoke test: `puppeteer-core` driving the installed Edge
  (`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`), headless,
  390×844, with Wikipedia/Wikidata responses mocked via request interception.
  Covered: full round, timeout path, resume after reload (scoreboard + mid-timer),
  legacy save format, fetch failure mid-game, team-name injection, no page errors.

---

## 6. Guidance for the upcoming library migration

- Ask the user which library/framework before starting; don't assume.
- The cleanest seam: **game logic vs. word fetching vs. UI**.
  - Word source (`fetchJson`, `isPlayable`, `filterHumansViaWikidata`, the
    title fetchers, `fetchArticles`, `fetchWords`) has no DOM or `game`
    dependency any more — move it to its own module as is.
  - Game rules (`Game` class, scoring, `swapTeams`, round progression) can be a
    plain store/reducer, independent of the DOM.
  - The 9 `renderX` functions map 1:1 to components/screens.
- Keep behavior identical (same states, same localStorage key or a
  migration for it).
- Keep it deployable as a static site (likely GitHub Pages) unless told otherwise.
- Test manually on a phone-sized viewport: full round, timeout path,
  Sneak Peek on touch, Resume after reload, Exclude People on/off.

---

## 7. Log

Newest first. One entry per task: date, what changed, anything left open.

- **2026-11-09** — Fixed all 9 issues from the first review:
  1. Resume: runtime state (`timerId`, prefetch) moved out of `Game`; old saves
     are cleaned on load; saving on each resumable state + timer tick; save
     cleared at game over.
  2. Categories: switched from `categorymembers` (≈20 direct articles) to
     `deepcat:` random search over the whole tree; fewer attempts (15), dedup.
  3. "All categories (mix)" now mixes topic categories; "Random" = any article.
  4. Team B default is now a palette color; palette names fixed (Orange, Teal).
  5. No more `innerHTML` with user/wiki text (`el()` helper + `textContent`).
  6. Briefing shows the excerpt and thumbnail; removed unused `stripHtml`.
  7. Fisher–Yates `shuffle`.
  8. `fetchWords(category, { excludeHumans })` takes options, no globals.
  9. `fetchJson` checks HTTP/API errors, retries once on 429. A failed fetch
     mid-game keeps the scoreboard (round undone) instead of dropping to setup.
  Also found and fixed: extracts API returns max 20 intro extracts per call
  (old code asked for 30 in category mode, so ~10 were silently dropped).
  Tested live (all categories) and with a headless Edge UI test. Open: section 5.

- **2026-11-09** — First look at the codebase. Created this `agents.md`
  (overview, state machine, code map, known issues, migration notes). No code
  changes. Open: which new library to use; known issues in section 5.
