// UI translations (Greek = default, English). Card/word content is not translated.
// Load before library.js and app.js.
//
// Static HTML: <el data-i18n="key">, data-i18n-placeholder="key", data-i18n-aria="key".
// JS: t("key", { var: value }). A string may use {var}; a function gets the vars object.

const LANG_KEY = "pantomima.lang";
const DEFAULT_LANG = "el";

const LANGUAGES = {
  el: {
    name: "Ελληνικά",
    locale: "el-GR",
    flag: `<svg viewBox="0 0 27 18" aria-hidden="true"><rect width="27" height="18" fill="#0D5EAF"/><path d="M0 3H27M0 7H27M0 11H27M0 15H27" stroke="#fff" stroke-width="2"/><rect width="10" height="10" fill="#0D5EAF"/><path d="M5 0V10M0 5H10" stroke="#fff" stroke-width="2"/></svg>`,
  },
  en: {
    name: "English",
    locale: "en-GB",
    flag: `<svg viewBox="0 0 60 30" aria-hidden="true"><clipPath id="ukClipS"><path d="M0,0 v30 h60 v-30 z"/></clipPath><clipPath id="ukClipT"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath><g clip-path="url(#ukClipS)"><path d="M0,0 v30 h60 v-30 z" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#ukClipT)" stroke="#C8102E" stroke-width="4"/><path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/><path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6"/></g></svg>`,
  },
};

const STRINGS = {
  el: {
    "app.language": "Γλώσσα",
    "modal.close": "Κλείσιμο",
    "info.aria": "Περιγραφή",

    // Version picker + resume
    "mode.title": "Επιλογή έκδοσης",
    "mode.subtitle": "Από πού θα έρχονται οι λέξεις;",
    "resume.found": "Βρέθηκε αποθηκευμένο παιχνίδι.",
    "resume.resume": "Συνέχεια παιχνιδιού",
    "resume.discard": "Απόρριψη",
    "resume.discarded": "Το αποθηκευμένο παιχνίδι διαγράφηκε.",
    "source.wikipedia.label": "Wikipedia",
    "source.wikipedia.desc": "Ζωντανές λέξεις από την ελληνική Wikipedia, με κατηγορίες.",
    "source.library.label": "Βιβλιοθήκη λέξεων",
    "source.library.desc": "Επιλεγμένη τράπουλα: δράσεις, αντικείμενα, ταινίες & τραγούδια, πρόσωπα, φράσεις.",

    // Setup
    "setup.title": "Ρυθμίσεις — {mode}",
    "setup.teamAName": "Όνομα ομάδας Α",
    "setup.teamAColor": "Χρώμα ομάδας Α",
    "setup.teamBName": "Όνομα ομάδας Β",
    "setup.teamBColor": "Χρώμα ομάδας Β",
    "setup.roundDuration": "Διάρκεια γύρου (δευτερόλεπτα)",
    "setup.totalRounds": "Αριθμός γύρων",
    "setup.start": "Έναρξη παιχνιδιού",
    "setup.changeMode": "Αλλαγή έκδοσης",
    "team.a": "Ομάδα Α",
    "team.b": "Ομάδα Β",
    "color.Blue": "Μπλε",
    "color.Red": "Κόκκινο",
    "color.Orange": "Πορτοκαλί",
    "color.Purple": "Μωβ",
    "color.Lilac": "Λιλά",
    "color.Petrol": "Πετρόλ",
    "color.Teal": "Τιρκουάζ",

    // Wikipedia settings
    "wiki.category": "Κατηγορία",
    "wcat.random": "Τυχαία (οποιοδήποτε άρθρο)",
    "wcat.all": "Όλες οι κατηγορίες (μείγμα)",
    "wcat.history": "Ιστορία",
    "wcat.geography": "Γεωγραφία",
    "wcat.science": "Επιστήμες",
    "wcat.arts": "Τέχνες/Κινηματογράφος",
    "wcat.technology": "Τεχνολογία",
    "wiki.excludePeople": "Χωρίς πρόσωπα (αυστηρό)",

    // Word Library
    "lib.deck": "Τράπουλα",
    "lib.deckLabel": "{n} κάρτες",
    "lib.categories": "Κατηγορίες",
    "lib.difficulty": "Δυσκολία",
    "lib.noNames": "Χωρίς ονόματα",
    "lib.points": "Πόντοι ανά δυσκολία (1 / 2 / 3)",
    "lib.loading": "Φόρτωση τράπουλας...",
    "lib.count": "Διαθέσιμες κάρτες: {total} · δεν έχουν παιχτεί: {unplayed}",
    "lib.tooFew": " (χρειάζονται τουλάχιστον {n})",
    "lib.loadFailedFile": "Η τράπουλα δεν φορτώθηκε: άνοιξε το παιχνίδι από server (π.χ. GitHub Pages), όχι ως αρχείο.",
    "lib.loadFailed": "Η τράπουλα δεν φορτώθηκε. Δοκίμασε ξανά.",
    "lib.resetHistory": "Επαναφορά ιστορικού",
    "lib.resetConfirm": "Να ξεχαστούν όλες οι κάρτες που έχουν παιχτεί;",
    "lib.historyCleared": "Το ιστορικό διαγράφηκε.",
    "lib.reportedCount": "Αναφερμένες κάρτες: {n}",
    "lib.downloadReports": "Λήψη αναφορών",
    "lib.clearReports": "Διαγραφή αναφορών",
    "lib.clearConfirm": "Να διαγραφούν οι αναφερμένες κάρτες; (Θα ξαναμπούν στην τράπουλα.)",
    "lib.reshuffled": "Όλες οι κάρτες παίχτηκαν: η τράπουλα ανακατεύτηκε.",
    "lib.reportedNoMore": "Η κάρτα αναφέρθηκε. Δεν υπάρχουν άλλες κάρτες.",
    "lib.reportedReplaced": "Η κάρτα αναφέρθηκε και αντικαταστάθηκε.",
    "lib.replaceFailed": "Δεν φορτώθηκε νέα κάρτα.",
    "lib.reportReplace": "Αναφορά & άλλη κάρτα",
    "lib.hint": "Υπόδειξη",
    "lib.hintPrefix": "Υπόδειξη: {hint}",
    "lib.latin": "Στα αγγλικά!",
    "lib.pointsShort": "{n}π",
    "cat.Action": "Δράση",
    "cat.Object": "Αντικείμενο",
    "cat.Media": "Ταινίες/Σειρές/Τραγούδια",
    "cat.Person": "Πρόσωπο",
    "cat.Phrase": "Φράση",
    "diff.easy": "Εύκολη",
    "diff.medium": "Μέτρια",
    "diff.hard": "Δύσκολη",

    // Round screens
    "loading.indicator": "Φόρτωση...",
    "loading.text": "Φόρτωση λέξεων...",
    "fetchFailed": "Αποτυχία φόρτωσης λέξεων. Δοκιμάστε ξανά.",
    "commit": "Επιβεβαίωση",
    "selection.indicator": "Διαλέγει: {team}",
    "selection.title": "{team}: Διαλέξτε {n}",
    "selection.help": "Διαλέξτε ακριβώς {n} επιλογές για την αντίπαλη ομάδα.",
    "selection.onlyN": "Μόνο {n}.",
    "choice.indicator": "Επιλέγει: {team}",
    "choice.title": "{team}: Διαλέξτε 1",
    "choice.help": "Διαλέξτε 1 από τις {n} επισημασμένες επιλογές.",
    "briefing.indicator": "Παίζει: {team}",
    "briefing.title": "Η λέξη σας",
    "briefing.start": "Έναρξη γύρου",
    "timer.indicator": "Παντομίμα: {team}",
    "timer.title": "Χρόνος",
    "timer.found": "Βρέθηκε!",
    "timer.abort": "Εγκατάλειψη",
    "timer.pause": "Παύση",
    "timer.resume": "Συνέχεια",
    "timer.sneak": "Κρυφή ματιά (κράτα πατημένο)",
    "result.timeUp": "Τέλος χρόνου!",
    "result.decide": "Αποφασίστε το αποτέλεσμα:",
    "result.found": "Βρέθηκε",
    "result.notFound": "Δεν βρέθηκε",
    "result.roundComplete": "Τέλος γύρου",
    "result.success": ({ n }) => `Επιτυχία (+${n} ${n === 1 ? "πόντος" : "πόντοι"})`,
    "result.failed": "Αποτυχία",
    "result.took": "Ο γύρος κράτησε {time}.",
    "continue": "Συνέχεια",
    "score.indicator": "Βαθμολογία",
    "score.title": "Βαθμολογία",
    "score.row": ({ n, time }) => `: ${n} ${n === 1 ? "πόντος" : "πόντοι"}, ${time}`,
    "score.round": "Γύρος {round} / {total}",
    "score.lastRound": "Ο τελευταίος γύρος κράτησε {time}.",
    "score.pass": "Δώστε το κινητό στην ομάδα: {team}",
    "score.next": "Επόμενος γύρος",
    "score.end": "Πρόωρο τέλος παιχνιδιού",
    "final.indicator": "Τέλος παιχνιδιού",
    "final.title": "Τελικό σκορ",
    "final.newGame": "Νέο παιχνίδι",
  },

  en: {
    "app.language": "Language",
    "modal.close": "Close",
    "info.aria": "Show description",

    "mode.title": "Choose Version",
    "mode.subtitle": "Where should the words come from?",
    "resume.found": "Found a saved game.",
    "resume.resume": "Resume Game",
    "resume.discard": "Discard",
    "resume.discarded": "Saved game discarded.",
    "source.wikipedia.label": "Wikipedia",
    "source.wikipedia.desc": "Live words from Greek Wikipedia, with categories.",
    "source.library.label": "Word Library",
    "source.library.desc": "Curated deck of charades cards: actions, objects, films & songs, people, phrases.",

    "setup.title": "Setup — {mode}",
    "setup.teamAName": "Team A Name",
    "setup.teamAColor": "Team A Color",
    "setup.teamBName": "Team B Name",
    "setup.teamBColor": "Team B Color",
    "setup.roundDuration": "Round Duration (seconds)",
    "setup.totalRounds": "Total Rounds",
    "setup.start": "Start Game",
    "setup.changeMode": "Change Version",
    "team.a": "Team A",
    "team.b": "Team B",
    "color.Blue": "Blue",
    "color.Red": "Red",
    "color.Orange": "Orange",
    "color.Purple": "Purple",
    "color.Lilac": "Lilac",
    "color.Petrol": "Petrol",
    "color.Teal": "Teal",

    "wiki.category": "Category",
    "wcat.random": "Random (any article)",
    "wcat.all": "All categories (mix)",
    "wcat.history": "History",
    "wcat.geography": "Geography",
    "wcat.science": "Science",
    "wcat.arts": "Arts/Cinema",
    "wcat.technology": "Technology",
    "wiki.excludePeople": "Exclude People (Strict Mode)",

    "lib.deck": "Deck",
    "lib.deckLabel": "{n} cards",
    "lib.categories": "Categories",
    "lib.difficulty": "Difficulty",
    "lib.noNames": "No names",
    "lib.points": "Points by difficulty (1 / 2 / 3)",
    "lib.loading": "Loading deck...",
    "lib.count": "Cards available: {total} · not played yet: {unplayed}",
    "lib.tooFew": " (at least {n} needed)",
    "lib.loadFailedFile": "Could not load the deck: open the game from a server (e.g. GitHub Pages), not as a file.",
    "lib.loadFailed": "Could not load the deck. Try again.",
    "lib.resetHistory": "Reset history",
    "lib.resetConfirm": "Forget all played cards?",
    "lib.historyCleared": "History cleared.",
    "lib.reportedCount": "Reported cards: {n}",
    "lib.downloadReports": "Download reports",
    "lib.clearReports": "Clear reports",
    "lib.clearConfirm": "Clear reported cards? (They will return to the deck.)",
    "lib.reshuffled": "All cards played: the deck was reshuffled.",
    "lib.reportedNoMore": "Card reported. No other cards left.",
    "lib.reportedReplaced": "Card reported and replaced.",
    "lib.replaceFailed": "Could not load a new card.",
    "lib.reportReplace": "Report & new card",
    "lib.hint": "Hint",
    "lib.hintPrefix": "Hint: {hint}",
    "lib.latin": "In English!",
    "lib.pointsShort": "{n}pt",
    "cat.Action": "Action",
    "cat.Object": "Object",
    "cat.Media": "Films/Series/Songs",
    "cat.Person": "Person",
    "cat.Phrase": "Phrase",
    "diff.easy": "Easy",
    "diff.medium": "Medium",
    "diff.hard": "Hard",

    "loading.indicator": "Loading...",
    "loading.text": "Fetching words...",
    "fetchFailed": "Failed to fetch words. Try again.",
    "commit": "Commit",
    "selection.indicator": "{team} selects",
    "selection.title": "{team}: Pick {n}",
    "selection.help": "Select exactly {n} options for the opponent.",
    "selection.onlyN": "Select only {n}.",
    "choice.indicator": "{team} chooses",
    "choice.title": "{team}: Choose 1",
    "choice.help": "Pick 1 of the {n} highlighted options.",
    "briefing.indicator": "{team} plays",
    "briefing.title": "Briefing",
    "briefing.start": "Start Round",
    "timer.indicator": "{team} acting",
    "timer.title": "Timer",
    "timer.found": "Found It",
    "timer.abort": "Abort",
    "timer.pause": "Pause",
    "timer.resume": "Resume",
    "timer.sneak": "Sneak Peek (Hold)",
    "result.timeUp": "Time's Up!",
    "result.decide": "Decide the outcome:",
    "result.found": "Found It",
    "result.notFound": "Failed",
    "result.roundComplete": "Round Complete",
    "result.success": ({ n }) => `Success (+${n} ${n === 1 ? "point" : "points"})`,
    "result.failed": "Failed",
    "result.took": "Round took {time}.",
    "continue": "Continue",
    "score.indicator": "Scoreboard",
    "score.title": "Scoreboard",
    "score.row": ({ n, time }) => `: ${n} ${n === 1 ? "point" : "points"}, ${time}`,
    "score.round": "Round {round} / {total}",
    "score.lastRound": "Last round took {time}.",
    "score.pass": "Pass phone to {team}",
    "score.next": "Next Round",
    "score.end": "End Game Early",
    "final.indicator": "Game Over",
    "final.title": "Final Score",
    "final.newGame": "New Game",
  },
};

const readLang = () => {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    return STRINGS[saved] ? saved : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
};

let currentLang = readLang();
document.documentElement.lang = currentLang;

const getLanguage = () => currentLang;

const setLanguage = (lang) => {
  if (!STRINGS[lang]) return;
  currentLang = lang;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Not saved: still works for this visit.
  }
  applyTranslations(document);
};

/** Has a translation for this key (in any language)? */
const hasText = (key) => key in STRINGS[currentLang] || key in STRINGS[DEFAULT_LANG];

/** Translate a key. Missing keys fall back to Greek, then to the key itself. */
const t = (key, vars = {}) => {
  const value = STRINGS[currentLang][key] ?? STRINGS[DEFAULT_LANG][key] ?? key;
  if (typeof value === "function") return value(vars);
  return value.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? vars[name] : match));
};

/** Number formatted for the current language (1.000 / 1,000). */
const formatNumber = (n) => n.toLocaleString(LANGUAGES[currentLang].locale);

/** Fill data-i18n attributes inside `root` (an element, fragment or document). */
const applyTranslations = (root) => {
  root.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  root.querySelectorAll("[data-i18n-aria]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAria));
  });
};
