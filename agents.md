# agents.md — Pantomima

Notes and instructions for AI agents (and future me) working on this repo.
**Read this first, and update the Log at the bottom when you finish a task.**

---

## 1. What this is

A two-team **charades (παντομίμα)** game for one shared phone. The game has
**versions** (word sources), picked on the first screen:
- **Wikipedia** — words from Greek Wikipedia at runtime, so nobody is at a
  disadvantage for not knowing Greek TV / pop culture (see README). The user
  likes this version: it must stay.
- **Word Library** — curated card decks from the user's other repo
  `pantomima_library_creator` (copied into `decks/`). See section 6.

- Pure static site: `index.html` + `i18n.js` + `library.js` + `app.js` +
  `style.css` + `decks/*.json`. No build step, no package.json, no
  dependencies, no tests in the repo. Script order: i18n → library → app.
- **UI in two languages**: Greek (default) and English, chosen with two flag
  buttons on the first screen, remembered in `pantomima.lang`. Game content
  (Wikipedia words, deck cards) is always Greek.
- Mobile-first, dark theme, max width 480px.


### Run it
Serve the folder: `python -m http.server 8000` (or `npx serve .`), open
http://localhost:8000. **The Word Library needs a server** (it `fetch`es
`decks/*.json`, which browsers block on `file://`; setup shows a message).
The Wikipedia version also works from `file://` but needs internet.

---

## 2. Game flow (state machine)

`GameStates` enum in `app.js`. `setState(state)` sets `game.state` and calls the
matching `renderX()`.

```
MODE_SELECT ──pick version──> SETUP   (MODE_SELECT also has Resume / Discard;
                                        SETUP has "Change Version" back)

SETUP ──start──> LOADING ──> SELECTION ──> CHOICE ──> BRIEFING ──> TIMER ──> RESULT ──> SCOREBOARD
  ^                 ^        (active team   (opponent    (opponent   (opponent         │
  │                 │         picks 3 of 10) picks 1)     sees word)  acts it out)     │
  │                 └───────────── next round: round++, swapTeams() ─────────────────┤
  └── New Game (reload → MODE_SELECT) <── FINAL <── last round / "End Game Early" ──────────────────┘
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
| `fetchWords(category, { excludeHumans })` | Wikipedia only: loops until 10 unique playable words; throws if fewer than 3 |
| `WORD_SOURCES` | Registry of game versions: `{ label, description, available, fetchWords(options) }`. Keys: `wikipedia`, `library`. The first screen is built from it |
| `getWords()` | Words for the current `game.mode`. **All word fetching goes through this** |
| `roundPoints()` | 1, or the card's 1/2/3 points (library + "Πόντοι ανά δυσκολία") |
| `reportAndReplaceCard(index)` | Library: log card as reported, swap in a fresh card |
| `createCardMeta(word)` / `createOption(word, index, onReplaced)` | Card badges (category, difficulty, "Στα αγγλικά!"); word row with "?" dialog (hint + report, report only on SELECTION) |
| `setupLibrarySettings()` | Library part of setup: deck, category/difficulty chips, Χωρίς ονόματα, points, live card count, history reset, reported export. Remembers settings in `pantomima.library.settings` |
| `startPrefetch()` | Background `getWords()` for the next round, stored in `prefetch` |
| `renderModeSelect()` | First screen: version buttons + Resume/Discard |
| `setState` + `renderX` per screen | `setState` also saves for resumable states (SELECTION…SCOREBOARD) |
| `loadWordsAndGo()` | Uses prefetch if ready/pending, else fetches. Returns `false` on failure (caller decides: back to SETUP, or undo round++ and stay on SCOREBOARD) |
| `endRound(result)` | Stops timer, updates score/time → RESULT |
| `init()` | `setState(MODE_SELECT)` |

**Prefetch:** when TIMER starts (and it isn't the last round), `startPrefetch()`
runs so the next SELECTION is usually instant.

**Save/resume:** saved on every resumable state change and every timer tick, so
a reload resumes on the same screen (timer included). Cleared on FINAL.

**Word object shape:** `{ title, extract, image, wikibase_item }` (Wikipedia) or
`{ id, title, extract: "", hint, image, category, difficulty, latin, hasName, points }`
(library, made by `normalizeCard`). A new source needs at least `title`.

### `library.js` (no DOM)
`shuffle`, `DECKS` (file list for the deck picker), `CARD_CATEGORIES` /
`CARD_DIFFICULTIES` (Greek labels, icons, colours, points), `loadDeck(file)`
(cached; derives categories/difficulties from the data), `normalizeCard`,
`filterCards`, `countCards`, `dealCards(deck, filters, count, excludeIds)`,
played history (`pantomima.library.played`, ids shared by all decks) and
reported cards (`pantomima.library.reported`, `exportReportedCards()`).

`game.mode` is saved with the game (old saves default to `"wikipedia"`).

`index.html` holds all screens as `<template id="...Template">` plus a shared
modal (word description) and toast. `style.css` uses CSS variables in `:root`.

---

## 4. Conventions

- Vanilla JS, ES2020+ (optional chaining, async/await), no modules, globals.
- **No hard-coded UI text.** Add every string to both `STRINGS.el` and
  `STRINGS.en` in `i18n.js`. HTML: `data-i18n="key"` (also
  `data-i18n-placeholder`, `data-i18n-aria`; `render()` applies them). JS:
  `t("key", { vars })`; plurals use a function value. Numbers: `formatNumber`.
  Category/difficulty labels are `cat.<name>` / `diff.<name>`.
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

- Library data is prototype quality (weak cards, same title in two scripts);
  that's what the report button is for.

## 5b. Testing

No test suite in the repo. What was used on 2026-11-09 (outside the repo):
- Live word fetch: run `app.js` in Node 24 with a stubbed `document` and call
  `fetchWords(category, { excludeHumans })` for each category.
- UI smoke test: `puppeteer-core` driving the installed Edge
  (`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`), headless,
  390×844, with Wikipedia/Wikidata responses mocked via request interception.
  Covered: full round, timeout path, resume after reload (scoreboard + mid-timer),
  legacy save format, fetch failure mid-game, team-name injection, no page errors.
- Word Library test: same setup but against `python -m http.server` (decks
  need http). Covered: counts per filter (matches section 6 numbers), deck
  switch, hint hidden by default, Latin notice (card + sneak peek), report in
  dialog and briefing, points 1/2/3, no repeats across rounds and until the
  filtered deck runs out, history/settings kept after reload, unknown fields.

---

## 6. Word Library version

Spec came from the user on 2026-11-09. Key rules (keep them):
- Decks are **data**: `decks/library_1000.json` (default) and
  `decks/library_2000.json`, copied from `pantomima_library_creator`
  (branch `m2c-m3-m4`, `data/`). No card content in code. Two separate decks
  (the 2000 deck is not a strict superset).
- Format: `{ generated_at, card_count, quotas, cards: [...] }`. Card fields
  used: `id` (stable key for history), `card_text` (shown), `category`
  (Action/Object/Media/Person/Phrase), `difficulty` (easy/medium/hard →
  1/2/3 points), `latin_script` (**must** show "Στα αγγλικά!"),
  `contains_name` (**must** be removable via "Χωρίς ονόματα"), `how_to_mime`
  (hint, hidden until asked), `image_url` (optional). `title`, `source`,
  `score`, `reviewed` are not shown. **Unknown fields are ignored**; unknown
  categories/difficulties still work (raw name, default look, 1 point).
- No repeats until the filtered deck runs out (then its history resets and it
  reshuffles, with a toast). Cards count as played when shown on SELECTION.
- Reporting: "?" dialog on SELECTION and "Αναφορά & άλλη κάρτα" on BRIEFING
  store the card and replace it. Reported cards are never dealt again. Setup
  has "Λήψη αναφορών" (JSON download, to send back to the library repo).

**Updating decks:** copy the new JSON over the files in `decks/`. Nothing else
changes. For a new deck size, add it to `DECKS` in `library.js`.
Expected numbers (handy for checks): 1000 deck: Action 250, Object 220,
Media 200, Person 180, Phrase 150; 226 with names; 94 Latin. 2000 deck: 443
with names, 173 Latin.

Greek labels from the spec (Δράση, Χωρίς ονόματα, Στα αγγλικά!, ...) are the
`el` strings; English mode shows English equivalents ("In English!").

---

## 7. Log

Newest first. One entry per task: date, what changed, anything left open.

- **2026-11-09** — Two UI languages. New `i18n.js` (Greek default + English,
  inline SVG flags, `t()`, `applyTranslations`). Flag switch on the first
  screen; all HTML/JS UI text moved to translation keys (≈110 per language),
  incl. library labels, plurals and number format (1.000 / 1,000). Tests:
  Wikipedia (English) 24/24, library + language (Greek) 43/43.

- **2026-11-09** — Word Library version (user's spec). Copied both decks to
  `decks/`; new `library.js` (deck loading, filters, dealing, played/reported
  history). Setup: deck picker, category + difficulty chips, Χωρίς ονόματα,
  points by difficulty, live card count, history reset, reported download.
  Cards show category/difficulty badges and "Στα αγγλικά!"; hint button on
  briefing; report & replace. Wikipedia test 24/24, library test 37/37.

- **2026-11-09** — Dual modes. New first screen "Choose Version"
  (`MODE_SELECT`) built from `WORD_SOURCES`: Wikipedia (enabled) and Word
  Library (disabled, "Coming soon"). Resume/Discard moved to this screen.
  Setup shows the chosen version, hides Wikipedia-only settings for other
  versions, and has "Change Version". `game.mode` is saved; all fetching goes
  through `getWords()`. UI test (24 checks) passes. Open: plug in the library
  (section 6).

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
