// Curated card library ("Word Library" version).
// Loads deck JSON files (format from the pantomima_library_creator repo),
// filters them and deals cards without repeats. No DOM code here.
//
// Deck files can be replaced by regenerated versions with the same format.
// Only the fields read in normalizeCard() are used; unknown fields are ignored.

/** Fisher–Yates shuffle. Returns a new array. (Also used by app.js.) */
const shuffle = (items) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

// `size` is only for the picker label ("1.000 κάρτες").
const DECKS = [
  { file: "decks/library_1000.json", size: 1000 },
  { file: "decks/library_2000.json", size: 2000 },
];
const deckLabel = (deck) => t("lib.deckLabel", { n: formatNumber(deck.size) });
const DEFAULT_DECK = DECKS[0].file;

// Display info for known categories (labels: "cat.<name>" in i18n.js).
// Unknown categories still work (raw name, default look).
const CARD_CATEGORIES = {
  Action: { icon: "🏃", color: "#43d17d" },
  Object: { icon: "📦", color: "#e7913f" },
  Media: { icon: "🎬", color: "#b344ff" },
  Person: { icon: "👤", color: "#4aa3ff" },
  Phrase: { icon: "💬", color: "#fd5151" },
};
const DEFAULT_CATEGORY_INFO = { icon: "🃏", color: "#b0b0b0" };

// Labels: "diff.<name>" in i18n.js.
const CARD_DIFFICULTIES = {
  easy: { points: 1 },
  medium: { points: 2 },
  hard: { points: 3 },
};

const categoryInfo = (category) => ({
  ...DEFAULT_CATEGORY_INFO,
  ...(CARD_CATEGORIES[category] || {}),
  label: hasText(`cat.${category}`) ? t(`cat.${category}`) : category,
});
const difficultyInfo = (difficulty) => ({
  points: CARD_DIFFICULTIES[difficulty]?.points || 1,
  label: hasText(`diff.${difficulty}`) ? t(`diff.${difficulty}`) : difficulty || "",
});

// --- localStorage-backed id lists (played history, reported cards) ---

const PLAYED_KEY = "pantomima.library.played"; // ["id", ...]
const REPORTED_KEY = "pantomima.library.reported"; // [{ id, card_text, ... }, ...]

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Could not save ${key}:`, error);
  }
};

// Played ids are shared by all decks: ids are stable across decks and versions.
const playedIds = new Set(readJson(PLAYED_KEY, []));
const savePlayed = () => writeJson(PLAYED_KEY, [...playedIds]);

const markCardsPlayed = (ids) => {
  let changed = false;
  ids.forEach((id) => {
    if (id && !playedIds.has(id)) {
      playedIds.add(id);
      changed = true;
    }
  });
  if (changed) savePlayed();
};

const resetPlayedHistory = () => {
  playedIds.clear();
  savePlayed();
};

const getReportedCards = () => {
  const list = readJson(REPORTED_KEY, []);
  return Array.isArray(list) ? list : [];
};
const reportedIds = () => new Set(getReportedCards().map((r) => r.id));

/** Store a reported card so it can be sent back to the library repo. Not dealt again. */
const reportCard = (card, deckFile, deckGeneratedAt) => {
  const list = getReportedCards();
  if (list.some((r) => r.id === card.id)) return;
  list.push({
    id: card.id,
    card_text: card.title,
    category: card.category,
    difficulty: card.difficulty,
    deck_file: deckFile,
    deck_generated_at: deckGeneratedAt || null,
    reported_at: new Date().toISOString(),
  });
  writeJson(REPORTED_KEY, list);
};

const clearReportedCards = () => writeJson(REPORTED_KEY, []);

/** JSON text of all reported cards, for sending back to pantomima_library_creator. */
const exportReportedCards = () =>
  JSON.stringify({ exported_at: new Date().toISOString(), reported: getReportedCards() }, null, 2);

// --- Deck loading ---

/**
 * Convert a deck card to the game's word shape. Returns null for unusable cards.
 * Game word shape: { id, title, extract, image, category, difficulty, latin, hasName, points, hint }
 */
const normalizeCard = (raw) => {
  if (!raw || typeof raw.id !== "string" || typeof raw.card_text !== "string") return null;
  const text = raw.card_text.trim();
  if (!raw.id || !text) return null;
  return {
    id: raw.id,
    title: text,
    extract: "", // no description for library cards; the hint is separate
    hint: typeof raw.how_to_mime === "string" ? raw.how_to_mime.trim() : "",
    image: typeof raw.image_url === "string" && raw.image_url ? raw.image_url : null,
    category: typeof raw.category === "string" ? raw.category : "Other",
    difficulty: typeof raw.difficulty === "string" ? raw.difficulty : "",
    latin: raw.latin_script === true,
    hasName: raw.contains_name === true,
    points: difficultyInfo(raw.difficulty).points,
  };
};

const deckCache = new Map(); // file -> Promise<deck>

/**
 * Load a deck file. Resolves to { file, generatedAt, cards, categories, difficulties }.
 * categories/difficulties list the values present in the deck (known ones first, in order).
 */
const loadDeck = (file = DEFAULT_DECK) => {
  if (!deckCache.has(file)) {
    const promise = (async () => {
      const res = await fetch(file);
      if (!res.ok) throw new Error(`HTTP ${res.status} loading ${file}`);
      const data = await res.json();
      const seen = new Set();
      const cards = (Array.isArray(data.cards) ? data.cards : [])
        .map(normalizeCard)
        .filter((card) => card && !seen.has(card.id) && seen.add(card.id));
      const ordered = (values, known) => {
        const present = new Set(values);
        return [...known.filter((v) => present.has(v)), ...[...present].filter((v) => !known.includes(v))];
      };
      return {
        file,
        generatedAt: data.generated_at || null,
        cards,
        categories: ordered(cards.map((c) => c.category), Object.keys(CARD_CATEGORIES)),
        difficulties: ordered(cards.map((c) => c.difficulty), Object.keys(CARD_DIFFICULTIES)),
      };
    })();
    promise.catch(() => deckCache.delete(file)); // allow retry after a failure
    deckCache.set(file, promise);
  }
  return deckCache.get(file);
};

// --- Filtering and dealing ---

/**
 * filters: { categories: string[], difficulties: string[], noNames: boolean }
 * An empty or missing categories/difficulties list means "all".
 */
const filterCards = (cards, filters = {}) => {
  const cats = filters.categories?.length ? new Set(filters.categories) : null;
  const diffs = filters.difficulties?.length ? new Set(filters.difficulties) : null;
  const reported = reportedIds();
  return cards.filter(
    (card) =>
      !reported.has(card.id) &&
      (!cats || cats.has(card.category)) &&
      (!diffs || diffs.has(card.difficulty)) &&
      !(filters.noNames && card.hasName)
  );
};

/** Card counts for the setup screen. */
const countCards = (deck, filters) => {
  const pool = filterCards(deck.cards, filters);
  return { total: pool.length, unplayed: pool.filter((c) => !playedIds.has(c.id)).length };
};

/**
 * Deal `count` random cards that have not been played yet.
 * When the filtered deck runs out, its played history is forgotten and dealing
 * continues from a fresh shuffle. `excludeIds` are never dealt (e.g. cards on screen).
 * Returns { cards, reshuffled }.
 */
const dealCards = (deck, filters, count, excludeIds = new Set()) => {
  const pool = filterCards(deck.cards, filters).filter((c) => !excludeIds.has(c.id));
  const hand = shuffle(pool.filter((c) => !playedIds.has(c.id))).slice(0, count);
  let reshuffled = false;
  if (hand.length < count && pool.length > hand.length) {
    reshuffled = true;
    pool.forEach((c) => playedIds.delete(c.id));
    savePlayed();
    const inHand = new Set(hand.map((c) => c.id));
    hand.push(...shuffle(pool.filter((c) => !inHand.has(c.id))).slice(0, count - hand.length));
  }
  return { cards: hand.map((c) => ({ ...c })), reshuffled };
};
