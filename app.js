const WIKI_API = "https://el.wikipedia.org/w/api.php";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const STORAGE_KEY = "pantomima.gameState";

const WORDS_PER_ROUND = 10;
const PICKS_PER_ROUND = 3;
// The extracts API returns at most 20 intro extracts per request.
const EXTRACTS_BATCH = 20;
const MAX_FETCH_ATTEMPTS = 15;

const $ = (selector) => document.querySelector(selector);

const GameStates = {
  SETUP: 0,
  SELECTION: 1,
  CHOICE: 2,
  BRIEFING: 3,
  TIMER: 4,
  RESULT: 5,
  SCOREBOARD: 6,
  FINAL: 7,
  LOADING: 8,
};

// Topic categories on Greek Wikipedia. "all" mixes these; "random" uses any article.
const CATEGORIES = [
  { value: "Κατηγορία:Ιστορία", label: "History" },
  { value: "Κατηγορία:Γεωγραφία", label: "Geography" },
  { value: "Κατηγορία:Επιστήμες", label: "Science" },
  { value: "Κατηγορία:Τέχνες", label: "Arts/Cinema" },
  { value: "Κατηγορία:Τεχνολογία", label: "Technology" },
];

const COLOR_PALETTE = [
  { name: "Blue", hex: "#4aa3ff" },
  { name: "Red", hex: "#fd5151" },
  { name: "Orange", hex: "#e7913f" },
  { name: "Purple", hex: "#b344ff" },
  { name: "Lilac", hex: "#c8a2c8" },
  { name: "Petrol", hex: "#0c8baa" },
  { name: "Teal", hex: "#71cac3" },
];
const DEFAULT_TEAM_A_COLOR = COLOR_PALETTE[0].hex;
const DEFAULT_TEAM_B_COLOR = COLOR_PALETTE[1].hex;

// Older saves (before 2026-11-09) also stored these runtime-only fields.
const LEGACY_RUNTIME_FIELDS = ["prefetchPromise", "prefetchedWords", "timerId"];

/**
 * All persistent game data. Every field must be JSON-serializable:
 * runtime-only things (timer handle, prefetch promise) live outside this class.
 */
class Game {
  constructor() {
    this.state = GameStates.SETUP;
    this.round = 1;
    this.totalRounds = 6;
    this.roundDuration = 90;
    this.teams = [
      { name: "Team A", color: DEFAULT_TEAM_A_COLOR, score: 0, time: 0 },
      { name: "Team B", color: DEFAULT_TEAM_B_COLOR, score: 0, time: 0 },
    ];
    this.activeTeamIndex = 0;
    this.opponentTeamIndex = 1;
    this.words = [];
    this.selectedIndices = [];
    this.chosenIndex = null;
    this.elapsedThisRound = 0;
    this.isPaused = false;
    this.timerRemaining = 0;
    this.endedEarly = false;
    this.lastResult = null;
    this.category = "random";
    this.excludeHumans = false;
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this));
    } catch (error) {
      console.warn("Could not save game:", error);
    }
  }

  static load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      LEGACY_RUNTIME_FIELDS.forEach((key) => delete data[key]);
      const loaded = Object.assign(new Game(), data);
      if (!Array.isArray(loaded.words) || !Array.isArray(loaded.teams)) return null;
      return loaded;
    } catch {
      return null;
    }
  }

  clearSave() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable: nothing to clear.
    }
  }

  get activeTeam() {
    return this.teams[this.activeTeamIndex];
  }

  get opponentTeam() {
    return this.teams[this.opponentTeamIndex];
  }

  swapTeams() {
    [this.activeTeamIndex, this.opponentTeamIndex] = [
      this.opponentTeamIndex,
      this.activeTeamIndex,
    ];
  }
}

const game = new Game();

// Runtime-only state (never saved).
let timerId = null;
let prefetch = null; // { words, promise } for the next round's words

const screenContainer = $("#screenContainer");
const teamIndicator = $("#teamIndicator");
const toast = $("#toast");
const modal = $("#modal");
const modalTitle = $("#modalTitle");
const modalText = $("#modalText");

const templates = {
  setup: $("#setupTemplate"),
  selection: $("#selectionTemplate"),
  choice: $("#choiceTemplate"),
  briefing: $("#briefingTemplate"),
  timer: $("#timerTemplate"),
  result: $("#resultTemplate"),
  scoreboard: $("#scoreboardTemplate"),
  final: $("#finalTemplate"),
  loading: $("#loadingTemplate"),
};

let toastTimeout = null;
const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 2500);
};

const render = (node) => {
  screenContainer.innerHTML = "";
  screenContainer.appendChild(node);
};

const setTeamIndicator = (text, color) => {
  teamIndicator.textContent = text;
  teamIndicator.style.borderColor = color || "var(--border)";
  teamIndicator.style.color = color || "var(--text)";
};

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.max(0, seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

/** Create an element with optional class and text (text is never parsed as HTML). */
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Fisher–Yates shuffle. Returns a new array. */
const shuffle = (items) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const chunk = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};

/** Fetch a MediaWiki API URL and return its JSON, throwing on HTTP or API errors. */
const fetchJson = async (baseUrl, params) => {
  const url = new URL(baseUrl);
  Object.entries({ origin: "*", format: "json", ...params }).forEach(([key, value]) =>
    url.searchParams.set(key, value)
  );
  let res = await fetch(url);
  if (res.status === 429) {
    // Rate limited: wait once (max 5s) and retry.
    const waitSeconds = Math.min(Number(res.headers.get("Retry-After")) || 2, 5);
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
    res = await fetch(url);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url.host}`);
  const data = await res.json();
  if (data.error) throw new Error(`API error: ${data.error.info || data.error.code}`);
  return data;
};

/**
 * Heuristic Filter for "Pantomima" Playability
 * Returns true if the article is suitable for a charades game.
 * @param {Object} article - The Wikipedia article object (must include .title and .extract)
 * @returns {boolean}
 */
const isPlayable = (article) => {
  if (!article || !article.title) return false;

  const title = article.title.trim();
  // Use the extract (summary) if available, otherwise empty string
  const summary = (article.extract || "").toLowerCase();
  const titleLower = title.toLowerCase();

  // --- RULE 1: TITLE LENGTH & STRUCTURE ---
  // Split by spaces to count words
  const wordCount = title.split(/\s+/).length;

  // Reject if too short (empty) or too long (over 6 words is usually a complex sentence)
  if (wordCount < 1 || wordCount > 6) return false;

  // --- RULE 2: THE "CLEAN TEXT" CHECK ---
  // Reject titles with numbers (years, dates, "Apollo 13")
  // Regex matches any digit 0-9
  if (/\d/.test(title)) return false;

  // Reject titles with "meta-data" symbols: Parentheses () or Colons :
  // Example: "Paris (Mythology)" or "List of: Cities"
  if (/[():]/.test(title)) return false;

  // --- RULE 3: GREEK WIKIPEDIA "SYSTEM" FILTERS ---
  // These prefixes indicate non-game pages
  const bannedPrefixes = [
    "κατάλογος", // List
    "αρχείο",    // File
    "πρότυπο",   // Template
    "κατηγορία", // Category
    "βοήθεια",   // Help
    "χρήστης",   // User
    "συζήτηση",  // Talk page
    "βικιπαίδεια"// Wikipedia meta page
  ];

  if (bannedPrefixes.some(prefix => titleLower.startsWith(prefix))) {
    return false;
  }

  // --- RULE 4: CONTENT QUALITY CHECK ---
  // If the summary is missing or extremely short, it's likely a "stub" or broken page.
  if (summary.length < 50) return false;

  // --- RULE 5: CONTEXT BANS (SUMMARY SCAN) ---
  // Even if the title looks good, the summary might reveal it's a technical list
  // or a disambiguation page (where one word has 10 meanings).
  const bannedKeywords = [
    "αποσαφήνιση", // Disambiguation page
    "αναφέρεται σε", // "Refers to..." (often disambiguation)
    "μπορεί να αναφέρεται", // "May refer to..."
  ];

  if (bannedKeywords.some(keyword => summary.includes(keyword))) {
    return false;
  }

  // If it passed all gauntlets, it's a valid game word!
  return true;
};

/**
 * Filter out human biographies using Wikidata
 * Makes a batch request to Wikidata to check if articles are about humans (Q5)
 * @param {Array} articles - Array of article objects with wikibase_item property
 * @returns {Promise<Array>} - Filtered array excluding human biographies
 */
const filterHumansViaWikidata = async (articles) => {
  try {
    const qIds = articles.map((article) => article.wikibase_item).filter(Boolean);
    if (qIds.length === 0) return articles;

    const humanQIds = new Set();
    // wbgetentities accepts at most 50 ids per request.
    for (const ids of chunk(qIds, 50)) {
      const data = await fetchJson(WIKIDATA_API, {
        action: "wbgetentities",
        ids: ids.join("|"),
        props: "claims",
      });
      Object.entries(data.entities || {}).forEach(([qId, entity]) => {
        // P31 = "instance of", Q5 = "human"
        const isHuman = (entity.claims?.P31 || []).some(
          (claim) => claim.mainsnak?.datavalue?.value?.id === "Q5"
        );
        if (isHuman) humanQIds.add(qId);
      });
    }

    // Keep articles without Q-IDs (fail open)
    const filtered = articles.filter(
      (article) => !article.wikibase_item || !humanQIds.has(article.wikibase_item)
    );
    console.log(`Wikidata filter: ${articles.length} articles → ${filtered.length} non-human articles (removed ${humanQIds.size} humans)`);
    return filtered;
  } catch (error) {
    console.warn("Wikidata API error, failing open (keeping all words):", error);
    return articles;
  }
};

/** Titles of random articles from anywhere on Greek Wikipedia. */
const fetchRandomTitles = async (count) => {
  const data = await fetchJson(WIKI_API, {
    action: "query",
    list: "random",
    rnlimit: count,
    rnnamespace: 0,
  });
  return data.query.random.map((item) => item.title);
};

/** Random article titles from one category tree, using CirrusSearch. */
const searchCategoryTitles = async (category, count) => {
  const name = category.replace(/^(Κατηγορία|Category):/, "");
  const search = async (operator) => {
    const data = await fetchJson(WIKI_API, {
      action: "query",
      list: "search",
      srsearch: `${operator}:"${name}"`,
      srsort: "random",
      srnamespace: 0,
      srlimit: count,
      srprop: "",
    });
    return (data.query?.search || []).map((item) => item.title);
  };
  // deepcat searches the whole subcategory tree. It can be unavailable,
  // so fall back to direct members only (incategory).
  const titles = await search("deepcat");
  return titles.length > 0 ? titles : search("incategory");
};

/**
 * Titles from a topic category, or from a mix of all topics for "all".
 * Top-level categories hold few articles directly, so we search their whole tree.
 */
const fetchCategoryTitles = async (category, count) => {
  if (category !== "all") return searchCategoryTitles(category, count);
  // Mix two random topics per call to keep requests low.
  const picks = shuffle(CATEGORIES).slice(0, 2);
  const perTopic = Math.ceil(count / picks.length);
  const results = await Promise.all(picks.map((c) => searchCategoryTitles(c.value, perTopic)));
  return shuffle(results.flat());
};

/** Load extract, thumbnail and Wikidata id for the given titles. */
const fetchArticles = async (titles) => {
  const articles = [];
  for (const batch of chunk(titles, EXTRACTS_BATCH)) {
    const data = await fetchJson(WIKI_API, {
      action: "query",
      prop: "pageprops|pageimages|extracts",
      ppprop: "wikibase_item",
      piprop: "thumbnail",
      pithumbsize: 300,
      exintro: 1,
      explaintext: 1,
      exlimit: "max",
      redirects: 1,
      titles: batch.join("|"),
    });
    Object.values(data.query?.pages || {})
      .filter((page) => !("missing" in page) && page.ns === 0)
      .forEach((page) =>
        articles.push({
          title: page.title,
          extract: page.extract || "",
          image: page.thumbnail?.source || null,
          wikibase_item: page.pageprops?.wikibase_item || null,
        })
      );
  }
  return articles;
};

/**
 * Fetch playable words for one round.
 * @param {string} category - "random", "all", or a CATEGORIES value
 * @param {{ excludeHumans?: boolean }} options
 * @returns {Promise<Array<{title, extract, image, wikibase_item}>>}
 */
const fetchWords = async (category = "random", { excludeHumans = false } = {}) => {
  const found = new Map(); // title -> article (dedupes across attempts)
  const seenTitles = new Set();

  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS && found.size < WORDS_PER_ROUND; attempt++) {
    const missing = WORDS_PER_ROUND - found.size;
    const wanted = Math.min(EXTRACTS_BATCH, 10 + missing * 2);

    const candidates = category === "random"
      ? await fetchRandomTitles(wanted)
      : await fetchCategoryTitles(category, wanted);
    const titles = candidates.filter((title) => !seenTitles.has(title));
    titles.forEach((title) => seenTitles.add(title));
    if (titles.length === 0) continue;

    let playable = (await fetchArticles(titles)).filter(isPlayable);
    if (excludeHumans) playable = await filterHumansViaWikidata(playable);
    playable.forEach((article) => {
      if (!found.has(article.title)) found.set(article.title, article);
    });
  }

  const words = shuffle([...found.values()]).slice(0, WORDS_PER_ROUND);
  console.log(`Loaded ${words.length} words from category: ${category}`, words);
  if (words.length < PICKS_PER_ROUND) {
    throw new Error(`Only found ${words.length} playable words`);
  }
  return words;
};

/** Start fetching next round's words in the background. */
const startPrefetch = () => {
  const entry = { words: null };
  entry.promise = fetchWords(game.category, { excludeHumans: game.excludeHumans })
    .then((words) => (entry.words = words))
    .catch((error) => {
      console.warn("Prefetch failed, will fetch again when needed:", error);
      return null;
    });
  prefetch = entry;
};

const showModal = (title, text) => {
  modalTitle.textContent = title;
  modalText.textContent = text;
  modal.classList.remove("hidden");
};

const hideModal = () => {
  modal.classList.add("hidden");
};

$("#closeModal").addEventListener("click", hideModal);
modal.addEventListener("click", (event) => {
  if (event.target === modal) hideModal();
});

// States worth restoring after a reload.
const SAVED_STATES = new Set([
  GameStates.SELECTION,
  GameStates.CHOICE,
  GameStates.BRIEFING,
  GameStates.TIMER,
  GameStates.RESULT,
  GameStates.SCOREBOARD,
]);

const setState = (state) => {
  game.state = state;
  if (SAVED_STATES.has(state)) game.save();
  switch (state) {
    case GameStates.SETUP:
      renderSetup();
      break;
    case GameStates.SELECTION:
      renderSelection();
      break;
    case GameStates.CHOICE:
      renderChoice();
      break;
    case GameStates.BRIEFING:
      renderBriefing();
      break;
    case GameStates.TIMER:
      renderTimer();
      break;
    case GameStates.RESULT:
      renderResult();
      break;
    case GameStates.SCOREBOARD:
      renderScoreboard();
      break;
    case GameStates.FINAL:
      renderFinal();
      break;
    case GameStates.LOADING:
      renderLoading();
      break;
    default:
      break;
  }
};

const renderSetup = () => {
  setTeamIndicator("Setup");
  const node = templates.setup.content.cloneNode(true);
  render(node);

  const categorySelect = $("#categorySelect");
  CATEGORIES.forEach(({ value, label }) => {
    const option = el("option", null, label);
    option.value = value;
    categorySelect.appendChild(option);
  });

  const resumeBlock = $("#resumeBlock");
  const saved = Game.load();
  if (saved) resumeBlock.classList.remove("hidden");

  let selectedTeamAColor = DEFAULT_TEAM_A_COLOR;
  let selectedTeamBColor = DEFAULT_TEAM_B_COLOR;

  const createColorOptions = (containerId, defaultColor, onSelect) => {
    const container = $(containerId);
    COLOR_PALETTE.forEach((color) => {
      const btn = el("button", "color-btn");
      btn.style.backgroundColor = color.hex;
      btn.title = color.name;
      btn.type = "button";
      if (color.hex === defaultColor) btn.classList.add("selected");
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        container.querySelectorAll(".color-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        onSelect(color.hex);
      });
      container.appendChild(btn);
    });
  };

  createColorOptions("#teamAColorOptions", selectedTeamAColor, (color) => {
    selectedTeamAColor = color;
  });
  createColorOptions("#teamBColorOptions", selectedTeamBColor, (color) => {
    selectedTeamBColor = color;
  });

  const startGameBtn = $("#startGameBtn");
  startGameBtn.addEventListener("click", async () => {
    startGameBtn.disabled = true;
    const teamAName = $("#teamAName").value.trim() || "Team A";
    const teamBName = $("#teamBName").value.trim() || "Team B";
    const roundDuration = Number($("#roundDuration").value) || 90;
    const totalRounds = Number($("#totalRounds").value) || 6;
    const category = categorySelect.value || "random";

    Object.assign(game, new Game(), {
      teams: [
        { name: teamAName, color: selectedTeamAColor, score: 0, time: 0 },
        { name: teamBName, color: selectedTeamBColor, score: 0, time: 0 },
      ],
      roundDuration,
      totalRounds,
      category,
      excludeHumans: $("#excludeHumansCheckbox").checked,
    });
    prefetch = null;

    if (!(await loadWordsAndGo())) setState(GameStates.SETUP);
  });

  $("#resumeBtn")?.addEventListener("click", () => {
    const savedGame = Game.load();
    if (!savedGame) return;
    Object.assign(game, savedGame);
    prefetch = null;
    setState(game.state);
  });

  $("#discardBtn")?.addEventListener("click", () => {
    game.clearSave();
    resumeBlock.classList.add("hidden");
    showToast("Saved game discarded.");
  });
};

const renderLoading = () => {
  setTeamIndicator("Loading...");
  const node = templates.loading.content.cloneNode(true);
  render(node);
};

/**
 * Get words for a new round (prefetched if ready) and go to SELECTION.
 * Returns false on failure so the caller can decide where to go back to.
 */
const loadWordsAndGo = async () => {
  const pending = prefetch;
  prefetch = null;
  try {
    let words = pending?.words || null;
    if (!words) {
      setState(GameStates.LOADING);
      if (pending) words = await pending.promise;
      if (!words) words = await fetchWords(game.category, { excludeHumans: game.excludeHumans });
    }

    game.words = words;
    game.selectedIndices = [];
    game.chosenIndex = null;
    game.lastResult = null;
    setState(GameStates.SELECTION);
    return true;
  } catch (error) {
    console.error("Error fetching words:", error);
    showToast("Failed to fetch words. Try again.");
    return false;
  }
};

/** Build one word row (title + "?" button that opens the description). */
const createOption = (word) => {
  const option = el("div", "option");
  option.appendChild(el("div", "title", word.title));
  const info = el("button", "info", "?");
  info.setAttribute("aria-label", "Show description");
  info.addEventListener("click", (event) => {
    event.stopPropagation();
    showModal(word.title, word.extract);
  });
  option.appendChild(info);
  return option;
};

const renderSelection = () => {
  setTeamIndicator(`${game.activeTeam.name} selects`, game.activeTeam.color);
  const node = templates.selection.content.cloneNode(true);
  render(node);

  // Each render starts with a clean selection (also after resume).
  game.selectedIndices = [];

  const list = $("#optionsList");
  $("#selectionTitle").textContent = `${game.activeTeam.name}: Pick ${PICKS_PER_ROUND}`;

  game.words.forEach((word, index) => {
    const option = createOption(word);
    option.addEventListener("click", () => toggleSelection(option, index));
    list.appendChild(option);
  });

  $("#commitSelectionBtn").addEventListener("click", () => {
    if (game.selectedIndices.length !== PICKS_PER_ROUND) return;
    setState(GameStates.CHOICE);
  });
};

const toggleSelection = (option, index) => {
  const idx = game.selectedIndices.indexOf(index);
  if (idx >= 0) {
    game.selectedIndices.splice(idx, 1);
    option.classList.remove("highlight");
  } else {
    if (game.selectedIndices.length >= PICKS_PER_ROUND) {
      showToast(`Select only ${PICKS_PER_ROUND}.`);
      return;
    }
    game.selectedIndices.push(index);
    option.classList.add("highlight");
  }

  $("#commitSelectionBtn").disabled = game.selectedIndices.length !== PICKS_PER_ROUND;
};

const renderChoice = () => {
  setTeamIndicator(`${game.opponentTeam.name} chooses`, game.opponentTeam.color);
  const node = templates.choice.content.cloneNode(true);
  render(node);

  game.chosenIndex = null;

  const list = $("#choiceList");
  $("#choiceTitle").textContent = `${game.opponentTeam.name}: Choose 1`;

  game.words.forEach((word, index) => {
    const option = createOption(word);
    const isSelected = game.selectedIndices.includes(index);
    option.classList.add(isSelected ? "highlight" : "disabled");
    if (isSelected) {
      option.addEventListener("click", () => chooseOption(option, index));
    }
    list.appendChild(option);
  });

  $("#commitChoiceBtn").addEventListener("click", () => {
    if (game.chosenIndex === null) return;
    setState(GameStates.BRIEFING);
  });
};

const chooseOption = (option, index) => {
  document.querySelectorAll(".option.highlight").forEach((node) => {
    node.classList.remove("selected");
  });
  option.classList.add("selected");
  game.chosenIndex = index;
  $("#commitChoiceBtn").disabled = false;
};

const renderBriefing = () => {
  setTeamIndicator(`${game.opponentTeam.name} plays`, game.opponentTeam.color);
  const node = templates.briefing.content.cloneNode(true);
  render(node);

  const word = game.words[game.chosenIndex];
  $("#briefWord").textContent = word.title;
  $("#briefExcerpt").textContent = word.extract;

  const image = $("#briefImage");
  if (word.image) {
    image.src = word.image;
    image.alt = word.title;
    image.classList.remove("hidden");
    image.addEventListener("error", () => image.classList.add("hidden"));
  }

  $("#startRoundBtn").addEventListener("click", () => {
    game.timerRemaining = game.roundDuration;
    game.isPaused = false;
    game.endedEarly = false;
    setState(GameStates.TIMER);
  });
};

const renderTimer = () => {
  setTeamIndicator(`${game.opponentTeam.name} acting`, game.opponentTeam.color);
  const node = templates.timer.content.cloneNode(true);
  render(node);

  // Start prefetching words for the next round
  if (game.round < game.totalRounds && !prefetch) startPrefetch();

  const timerDisplay = $("#timerDisplay");
  const sneakDisplay = $("#sneakDisplay");
  const pauseBtn = $("#pauseBtn");
  const word = game.words[game.chosenIndex];
  sneakDisplay.textContent = word.title;
  pauseBtn.textContent = game.isPaused ? "Resume" : "Pause";

  const updateTimer = () => {
    timerDisplay.textContent = formatTime(game.timerRemaining);
  };

  const tick = () => {
    if (game.isPaused) return;
    game.timerRemaining -= 1;
    if (game.timerRemaining <= 0) {
      game.timerRemaining = 0;
      updateTimer();
      endRound("timeout");
      return;
    }
    updateTimer();
    game.save(); // so a reload resumes with the right time left
  };

  updateTimer();
  clearInterval(timerId);
  timerId = setInterval(tick, 1000);

  $("#foundBtn").addEventListener("click", () => endRound("success"));
  $("#abortBtn").addEventListener("click", () => endRound("fail"));
  pauseBtn.addEventListener("click", () => {
    game.isPaused = !game.isPaused;
    pauseBtn.textContent = game.isPaused ? "Resume" : "Pause";
    game.save();
  });

  const sneakBtn = $("#sneakBtn");
  const showSneak = () => {
    sneakDisplay.classList.remove("hidden");
    timerDisplay.classList.add("hidden");
  };
  const hideSneak = () => {
    sneakDisplay.classList.add("hidden");
    timerDisplay.classList.remove("hidden");
  };

  sneakBtn.addEventListener("mousedown", showSneak);
  sneakBtn.addEventListener("mouseup", hideSneak);
  sneakBtn.addEventListener("mouseleave", hideSneak);
  sneakBtn.addEventListener("touchstart", (event) => {
    event.preventDefault();
    showSneak();
  });
  sneakBtn.addEventListener("touchend", hideSneak);
  sneakBtn.addEventListener("touchcancel", hideSneak);
};

const endRound = (result) => {
  clearInterval(timerId);
  timerId = null;

  game.elapsedThisRound = game.roundDuration - game.timerRemaining;
  game.opponentTeam.time += game.elapsedThisRound;
  game.endedEarly = result !== "timeout";
  game.lastResult = result;

  if (result === "success") {
    game.opponentTeam.score += 1;
  }

  setState(GameStates.RESULT);
};

const renderResult = () => {
  const node = templates.result.content.cloneNode(true);
  render(node);

  const resultTitle = $("#resultTitle");
  const resultText = $("#resultText");
  const actions = $("#resultActions");

  if (!game.endedEarly && game.lastResult === "timeout") {
    setTeamIndicator("Time's Up!", game.opponentTeam.color);
    resultTitle.textContent = "Time's Up!";
    resultText.textContent = "Decide the outcome:";

    const foundBtn = el("button", "success", "Found It");
    foundBtn.addEventListener("click", () => {
      game.opponentTeam.score += 1;
      game.lastResult = "success";
      setState(GameStates.SCOREBOARD);
    });

    const failBtn = el("button", "danger", "Failed");
    failBtn.addEventListener("click", () => {
      game.lastResult = "fail";
      setState(GameStates.SCOREBOARD);
    });

    actions.append(foundBtn, failBtn);
  } else {
    setTeamIndicator("Round Complete", game.opponentTeam.color);
    resultTitle.textContent = game.lastResult === "success" ? "Success" : "Failed";
    resultText.textContent = `Round took ${formatTime(game.elapsedThisRound)}.`;

    const continueBtn = el("button", "primary", "Continue");
    continueBtn.addEventListener("click", () => setState(GameStates.SCOREBOARD));
    actions.appendChild(continueBtn);
  }
};

/** Fill a container with one line per team: "<name>: N points, mm:ss". */
const renderTeamScores = (container) => {
  container.replaceChildren();
  game.teams.forEach((team) => {
    const row = el("div");
    row.append(el("strong", null, team.name), `: ${team.score} points, ${formatTime(team.time)}`);
    container.appendChild(row);
  });
};

const renderScoreboard = () => {
  setTeamIndicator("Scoreboard", game.activeTeam.color);
  const node = templates.scoreboard.content.cloneNode(true);
  render(node);

  const summary = $("#scoreSummary");
  renderTeamScores(summary);
  summary.appendChild(el("div", null, `Round ${game.round} / ${game.totalRounds}`));

  $("#roundBreakdown").textContent = `Last round took ${formatTime(game.elapsedThisRound)}.`;
  $("#passMessage").textContent = `Pass phone to ${game.activeTeam.name}`;

  const nextRoundBtn = $("#nextRoundBtn");
  nextRoundBtn.addEventListener("click", async () => {
    if (game.round >= game.totalRounds) {
      setState(GameStates.FINAL);
      return;
    }
    nextRoundBtn.disabled = true;
    game.round += 1;
    game.swapTeams();
    if (!(await loadWordsAndGo())) {
      // Undo so the scoreboard is unchanged and "Next Round" can be retried.
      game.round -= 1;
      game.swapTeams();
      setState(GameStates.SCOREBOARD);
    }
  });

  $("#endGameBtn").addEventListener("click", () => {
    setState(GameStates.FINAL);
  });
};

const renderFinal = () => {
  setTeamIndicator("Game Over");
  const node = templates.final.content.cloneNode(true);
  render(node);

  game.clearSave(); // the game is over, nothing to resume
  renderTeamScores($("#finalSummary"));

  $("#resetBtn").addEventListener("click", () => {
    game.clearSave();
    window.location.reload();
  });
};

const init = () => {
  setState(GameStates.SETUP);
};

init();
