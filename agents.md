# agents.md — Pantomima

Notes and instructions for AI agents (and future me) working on this repo.
**Read this first, and update the Log at the bottom when you finish a task.**

---

## 1. What this is

A two-team **charades (παντομίμα)** game for one shared phone. The game has
**versions** (word sources), picked on the first screen:
- **Wikipedia Freaks** (`mode: "wikipedia"`) — words from Wikipedia at runtime,
  in the **language the app is in** (Greek UI → el.wikipedia, English UI →
  en.wikipedia; fixed at game start in `game.wikiLang`). Pick 3 of 10, the
  other team picks 1, 1 point per word. The user likes this version: it must stay.
- **Curated Library** (`mode: "library"`, Greek name "Επιμελημένη
  Βιβλιοθήκη") — curated card decks from the user's other repo
  `pantomima_library_creator` (copied into `decks/`). Pick 1 of 2, time by
  difficulty, points + bets. See section 6.

**Rounds:** one round = one turn per team. "6 rounds" = 12 turns. Internally
`game.turn` counts turns; `isLastTurn()`, `currentRound()`.

- Pure static site: `index.html` + `i18n.js` + `library.js` + `app.js` +
  `style.css` + `decks/*.json`. No build step, no package.json, no
  dependencies, no tests in the repo. Script order: i18n → library → app.
- **UI in two languages**: Greek (default) and English, chosen with two flag
  buttons on the first screen, remembered in `pantomima.lang`. Deck cards are
  always Greek; Wikipedia words follow the UI language.
- Mobile-first, dark theme, max width 480px.


### Run it
Serve the folder: `python -m http.server 8000` (or `npx serve .`), open
http://localhost:8000. **The Curated Library needs a server** (it `fetch`es
`decks/*.json`, which browsers block on `file://`; setup shows a message).
Wikipedia Freaks also works from `file://` but needs internet.

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
  │                 └───────────── next turn: turn++, swapTeams() ───────────────────┤
  └── New Game (reload → MODE_SELECT) <── FINAL <── last turn / "End Game Early" ───────────────────┘
```

Curated Library skips CHOICE: SELECTION is `renderPick()` (active team picks
1 of 2 cards for the other team), then BRIEFING (actor sees the card and hint,
and chooses a bet), then TIMER.

Roles each turn:
- **activeTeam** chooses the candidate words (3 of 10, or 1 of 2 cards).
- **opponentTeam** (Wikipedia: picks 1 of the 3, then) acts it out and scores.
- After the turn, `swapTeams()` flips roles.

Scoring: Wikipedia Freaks +1 on "Found It". Curated Library: 100 + seconds
left + bet bonus (0 / 75 / 175), 0 if not found (`awardPoints()`). Each team
also accumulates `time` (seconds used). On timeout, the result screen asks the
players to decide found/failed manually (found = 100 + 0 + bonus).

Timer: **real clock**. `game.timerEndsAt` (ms timestamp) while running,
`game.timerLeftMs` while paused (`startTimer`, `timeLeftMs`, `secondsLeft`,
`setPaused`). The 250 ms interval only redraws, so phone sleep, background
tabs and reloads don't slow it. Extras: Pause (the opposing team polices it),
Abort (= fail), "Sneak Peek (Hold)" shows the word while held.

---

## 3. Code map (`app.js`, ~1,500 lines, top to bottom)

| Part | What it does |
|---|---|
| Constants | `WIKIDATA_API`, `STORAGE_KEY`, `SAVE_VERSION`, `WORDS_PER_ROUND` (10), `PICKS_PER_ROUND` (3), `LIBRARY_CARDS_PER_ROUND` (2), `EXTRACTS_BATCH` (20), `MAX_FETCH_ATTEMPTS` (15), `$` = `querySelector` |
| `GameStates`, `CATEGORIES`, `WIKIS`, `COLOR_PALETTE` | State enum; topic keys for the setup `<select>`; per-language Wikipedia config (`api`, category names per topic, banned title prefixes / extract keywords; `wikiFor(lang)`); 7 team colors |
| `class Game` | **Only JSON-safe, persistent data.** `save()/load()/clearSave()` to `localStorage` (`pantomima.gameState`, all wrapped in try/catch), `activeTeam`/`opponentTeam`, `swapTeams()`. `load()` ignores saves whose `version` ≠ `SAVE_VERSION` (bump it when rules/fields change) |
| `game`, `timerId`, `prefetch` | The game singleton + runtime-only state (never saved) |
| UI helpers | `showToast`, `render`, `setTeamIndicator`, `formatTime`, `el(tag, class, text)` (safe element builder), `chunk` |
| `fetchJson(base, params)` | Adds `origin=*&format=json`, checks `res.ok` and API `error`, retries once on HTTP 429 |
| `isPlayable(article, wiki)` | Heuristic filter: 1–6 words, no digits, no `():`, no banned prefixes (per language), extract ≥50 chars, not a disambiguation page |
| `filterHumansViaWikidata(articles)` | "Exclude People": Wikidata `wbgetentities` (50 ids/request), drops P31 = Q5 (human). Fails open |
| `fetchRandomTitles` / `searchCategoryTitles` / `fetchCategoryTitles` | Title sources (all take `wiki` first). Categories use CirrusSearch `deepcat:"X"` with `srsort=random` (whole subcategory tree), falling back to `incategory:`. A topic may list several category names; one is picked per call. `"all"` = 2 random topics per call |
| `fetchArticles(wiki, titles)` | extract + thumbnail + Wikidata id, in batches of 20 (API limit for intro extracts) |
| `fetchWords(category, { excludeHumans, lang })` | Wikipedia only: loops until 10 unique playable words; throws if fewer than 3 |
| `WORD_SOURCES` | Registry of game versions: `{ labelKey, descriptionKey, available, fetchWords(options) }`. Keys: `wikipedia`, `library`. The first screen is built from it |
| `getWords()` | Words for the current `game.mode`. **All word fetching goes through this** |
| `isLastTurn()` / `currentRound()` / `cardSeconds(word)` / `awardPoints(secondsLeft)` | Turn helpers; library acting time from `game.difficultyTimes`; adds points (1, or `libraryPoints`) and sets `game.lastPoints` |
| `reportAndReplaceCard(index)` | Library: log card as reported, swap in a fresh card (on SELECTION it keeps the two difficulties different) |
| `createCardMeta(word)` / `createOption(word)` / `createPickCard(word, index, onReplaced)` | Card badges (category, difficulty + seconds, "Στα αγγλικά!"); Wikipedia word row with "?" (article intro); library card tile (image or category icon, title, badges, "?" with hint + report & replace) |
| `setupLibrarySettings()` | Library part of setup: deck, category chips, difficulty chips + seconds per difficulty, Χωρίς ονόματα, live card count, history reset, reported export. Remembers settings in `pantomima.library.settings` |
| `startPrefetch()` | Background `getWords()` for the next turn, stored in `prefetch` |
| `renderModeSelect()` | First screen: language flags, version buttons, Resume/Discard |
| `setState` + `renderX` per screen | `setState` also saves for resumable states (SELECTION…SCOREBOARD). Library-only: `renderPick()`, `renderBetOptions(word)` (in briefing) |
| `loadWordsAndGo()` | Uses prefetch if ready/pending, else fetches. Returns `false` on failure (caller decides: back to SETUP, or undo turn++ and stay on SCOREBOARD) |
| `startTimer` / `timeLeftMs` / `secondsLeft` / `setPaused` | Real-clock timer (see section 2) |
| `endRound(result)` | Stops timer, updates score/time → RESULT |
| `init()` | `setState(MODE_SELECT)` |

**Prefetch:** when TIMER starts (and it isn't the last turn), `startPrefetch()`
runs so the next SELECTION is usually instant.

**Save/resume:** saved on every resumable state change, pause and bet change,
so a reload resumes on the same screen. The timer keeps running through a
reload (real clock). Cleared on FINAL.

**Word object shape:** `{ title, extract, image, wikibase_item }` (Wikipedia) or
`{ id, title, extract: "", hint, image, category, difficulty, latin, hasName }`
(library, made by `normalizeCard`). A new source needs at least `title`.

### `library.js` (no DOM)
`shuffle`, `DECKS` (file list for the deck picker), `CARD_CATEGORIES` (icons,
colours) / `CARD_DIFFICULTIES` (default seconds 45/60/90,
`defaultDifficultyTimes()`), scoring (`BASE_POINTS`, `BETS`,
`betSeconds(seconds, bet)`, `libraryPoints(secondsLeft, bet)`),
`loadDeck(file)` (cached; derives categories/difficulties from the data),
`normalizeCard`, `filterCards`, `countCards`,
`dealCards(deck, filters, count, { excludeIds, others })` (prefers difficulties
not already in `others`/the hand), played history
(`pantomima.library.played`, ids shared by all decks) and reported cards
(`pantomima.library.reported`, `exportReportedCards()`).

`game.mode` is saved with the game.

`index.html` holds all screens as `<template id="...Template">` (incl.
`pickTemplate` for the library) plus a shared modal and toast. `style.css`
uses CSS variables in `:root`.

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
- Keep the Greek strings in `WIKIS.el` (banned prefixes/keywords) — they are
  intentional and matter for word quality.
- Respect Wikipedia/Wikidata APIs: batch requests (`titles=a|b|c`), keep the
  `origin=*` param, don't add tight retry loops.
- Changing saved fields or game rules: bump `SAVE_VERSION`.

---

## 5. Known issues / tech debt

All 9 issues found on 2026-11-09 are fixed (see Log), and the timer now uses
the real clock. Still open / worth knowing:

- **Category trees on Wikipedia are loose.** `deepcat:` follows every
  subcategory, so e.g. Technology can return "Μαρμελάδα" or film titles. Also
  `deepcat` only covers a subset of very large trees (API warning, harmless).
- **Word quality**: "Random" (and categories) still return many people and
  obscure villages; `isPlayable` is a heuristic. "Exclude People" helps.
  **English Wikipedia is worse** (huge, many obscure stubs: "Laietani",
  "Uvula of cerebellum"). English top-level category trees make `deepcat` time
  out, so `WIKIS.en` uses smaller subtrees (History = Wars / Empires / Ancient
  history, Arts = Visual arts / Performing arts / Films). Checked live 2026-11-09.
- **Rate limits**: Wikipedia returns HTTP 429 if hammered (seen during
  testing from one IP). `fetchJson` retries once; don't add request loops.
- Wrong setup input after a failed start: setup is re-rendered, so typed team
  names are lost.
- "Pass phone to" on the scoreboard names `activeTeam` (kept from the original
  code; it is the team that just picked, before the swap).
- Library data is prototype quality (weak cards, same title in two scripts);
  that's what the report button is for.

## 5b. Testing

No test suite in the repo. What was used on 2026-11-09 (outside the repo):
- Live word fetch: run `fetchWords(category, { excludeHumans, lang })` in a
  headless browser page served locally (or Node with a stubbed `document`).
- UI smoke test: `puppeteer-core` driving the installed Edge
  (`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`), headless,
  390×844, with Wikipedia/Wikidata responses mocked via request interception.
  Covered: full turns, timeout path, resume after reload (scoreboard +
  mid-timer, real clock), old saves ignored, fetch failure mid-game keeps the
  scoreboard, team-name injection, English UI → en.wikipedia with English
  category names, Greek UI → el.wikipedia, no page errors.
- Curated Library test: same setup but against `python -m http.server` (decks
  need http). Covered: names in both languages, counts per filter (section 6
  numbers), default + custom times per difficulty, 2 cards with different
  difficulties, report in dialog and briefing, hint hidden by default, Latin
  notice, bet options and times (60 → 40 / 30), real-clock timer (pause,
  simulated sleep), points 100 + time + bonus, timeout found = 100 + bonus,
  failed = 0, rounds = 2 turns, no repeats, settings kept after reload.

---

## 6. Curated Library version

Spec came from the user on 2026-11-09 (deck rules) and was changed the same
day (game rules). Key rules (keep them):
- **Turn:** the game deals 2 cards (different difficulties when the filters
  allow). The active team sees title, difficulty (+ seconds) and image (or the
  category icon when there is none) and picks 1 for the other team. The actor
  sees the card and chooses a bet, then acts.
- **Time** comes from the difficulty: easy 45s, medium 60s, hard 90s by
  default, each changeable in setup (e.g. only hard cards at 60s).
- **Points** if found: 100 + seconds left + bonus. Bets: give up 1/3 of the
  time → +75, give up 1/2 → +175 (time rounded: 22.5 → 23). Not found: 0
  (no extra penalty: losing the time is the risk; the user decided this).
- Setup: categories and difficulties all on by default.
- Decks are **data**: `decks/library_1000.json` (default) and
  `decks/library_2000.json`, copied from `pantomima_library_creator`
  (branch `m2c-m3-m4`, `data/`). No card content in code. Two separate decks
  (the 2000 deck is not a strict superset).
- Format: `{ generated_at, card_count, quotas, cards: [...] }`. Card fields
  used: `id` (stable key for history), `card_text` (shown), `category`
  (Action/Object/Media/Person/Phrase), `difficulty` (easy/medium/hard →
  acting time), `latin_script` (**must** show "Στα αγγλικά!"),
  `contains_name` (**must** be removable via "Χωρίς ονόματα"), `how_to_mime`
  (hint, hidden until asked), `image_url` (optional, about half the cards).
  `title`, `source`, `score`, `reviewed` are not shown. **Unknown fields are
  ignored**; unknown categories/difficulties still work (raw name, default
  look, 60s).
- No repeats until the filtered deck runs out (then its history resets and it
  reshuffles, with a toast). Cards count as played when shown on SELECTION.
- Reporting: "?" dialog on the pick screen and "Αναφορά & άλλη κάρτα" on
  BRIEFING store the card and replace it. Reported cards are never dealt
  again. Setup has "Λήψη αναφορών" (JSON download, to send back to the
  library repo).

**Updating decks:** copy the new JSON over the files in `decks/`. Nothing else
changes. For a new deck size, add it to `DECKS` in `library.js`.
Expected numbers (handy for checks): 1000 deck: Action 250, Object 220,
Media 200, Person 180, Phrase 150; 226 with names; 94 Latin; 495 with images.
2000 deck: 443 with names, 173 Latin, 923 with images.

Greek labels from the spec (Δράση, Χωρίς ονόματα, Στα αγγλικά!, ...) are the
`el` strings; English mode shows English equivalents ("In English!").

---

## 7. Log

Newest first. One entry per task: date, what changed, anything left open.

- **2026-11-09** — New rules (user's plan). Versions renamed "Wikipedia
  Freaks" (Wikipedia in the app's language: Greek or English, with English
  categories and filters) and "Curated Library". Rounds = one turn per team.
  Library: pick 1 of 2 cards (different difficulties), image or category icon;
  time per difficulty (45/60/90, set in setup); bets on the briefing (1/3 →
  +75, 1/2 → +175); points 100 + seconds left + bonus; points breakdown on the
  result and scoreboard. Timer now uses the real clock. Old saves are ignored
  (`SAVE_VERSION` 2). Tests: library 57/57, Wikipedia 29/29; live English
  fetch checked.

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
