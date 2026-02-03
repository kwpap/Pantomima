const WIKI_API = "https://el.wikipedia.org/w/api.php";
const STORAGE_KEY = "pantomima.gameState";

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

const COLOR_PALETTE = [
  { name: "Blue", hex: "#4aa3ff" },
  { name: "Red", hex: "#fd5151" },
  { name: "Green", hex: "#e7913f" },
  { name: "Purple", hex: "#b344ff" },
  { name: "Lilac", hex: "#c8a2c8" },
  { name: "Petrol", hex: "#0c8baa" },
  { name: "Lavender", hex: "#71cac3" },
];

class Game {
  constructor() {
    this.state = GameStates.SETUP;
    this.round = 1;
    this.totalRounds = 6;
    this.roundDuration = 90;
    this.teams = [
      { name: "Team A", color: "#4aa3ff", score: 0, time: 0 },
      { name: "Team B", color: "#ff6b6b", score: 0, time: 0 },
    ];
    this.activeTeamIndex = 0;
    this.opponentTeamIndex = 1;
    this.words = [];
    this.selectedIndices = [];
    this.chosenIndex = null;
    this.roundStart = null;
    this.elapsedThisRound = 0;
    this.timerId = null;
    this.isPaused = false;
    this.timerRemaining = 0;
    this.endedEarly = false;
    this.lastResult = null;
    this.category = "random";
    this.prefetchedWords = null;
    this.prefetchPromise = null;
    this.excludeHumans = false;
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this));
  }

  static load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      return Object.assign(new Game(), data);
    } catch {
      return null;
    }
  }

  clearSave() {
    localStorage.removeItem(STORAGE_KEY);
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

const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
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

const stripHtml = (html) => {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
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
    // Extract Q-IDs from articles that have wikibase_item
    const articlesWithQIds = articles.filter(article => article.wikibase_item);
    
    if (articlesWithQIds.length === 0) {
      // No Q-IDs to check, return all articles
      return articles;
    }

    const qIds = articlesWithQIds.map(article => article.wikibase_item).join('|');
    
    // Wikidata API call
    const wikidataUrl = `https://www.wikidata.org/w/api.php?origin=*&action=wbgetentities&ids=${encodeURIComponent(qIds)}&props=claims&format=json`;
    
    const response = await fetch(wikidataUrl);
    const data = await response.json();
    
    // Check each entity for P31 (instance of) containing Q5 (human)
    const humanQIds = new Set();
    
    if (data.entities) {
      Object.entries(data.entities).forEach(([qId, entity]) => {
        // Check if entity has P31 claims (instance of)
        if (entity.claims && entity.claims.P31) {
          const instanceOfClaims = entity.claims.P31;
          
          // Check if any claim points to Q5 (human)
          const isHuman = instanceOfClaims.some(claim => {
            const value = claim.mainsnak?.datavalue?.value;
            return value && value.id === 'Q5';
          });
          
          if (isHuman) {
            humanQIds.add(qId);
          }
        }
      });
    }
    
    // Filter out articles that are humans
    const filtered = articles.filter(article => {
      if (!article.wikibase_item) {
        // Keep articles without Q-IDs (fail open)
        return true;
      }
      return !humanQIds.has(article.wikibase_item);
    });
    
    console.log(`Wikidata filter: ${articles.length} articles → ${filtered.length} non-human articles (removed ${humanQIds.size} humans)`);
    
    return filtered;
  } catch (error) {
    console.warn('Wikidata API error, failing open (keeping all words):', error);
    // Fail open: return all articles if Wikidata check fails
    return articles;
  }
};

const fetchWords = async (category = "random") => {
  const validWords = [];
  const maxAttempts = 100; // Safety limit to prevent infinite loops
  let attempts = 0;

  while (validWords.length < 10 && attempts < maxAttempts) {
    let titles = [];

    if (category === "random" || category === "all") {
      // Fetch random articles (fetch more than needed to account for filtering)
      const batchSize = Math.min(20, 10 + (10 - validWords.length) * 2);
      const randomUrl = `${WIKI_API}?origin=*&action=query&format=json&list=random&rnlimit=${batchSize}&rnnamespace=0`;
      const randomRes = await fetch(randomUrl);
      const randomData = await randomRes.json();
      titles = randomData.query.random.map((item) => item.title);
    } else {
      // Fetch from category (fetch larger batch for filtering)
      const categoryUrl = `${WIKI_API}?origin=*&action=query&format=json&list=categorymembers&cmtitle=${encodeURIComponent(
        category
      )}&cmlimit=50&cmnamespace=0`;
      const categoryRes = await fetch(categoryUrl);
      const categoryData = await categoryRes.json();
      const members = categoryData.query.categorymembers || [];
      
      // Shuffle and get batch
      const shuffled = members.sort(() => 0.5 - Math.random());
      titles = shuffled.slice(0, 30).map((item) => item.title);
    }

    // Fetch extracts and images for all titles
    if (titles.length > 0) {
      const extractsAndImagesUrl = `${WIKI_API}?origin=*&action=query&format=json&prop=pageprops|pageimages|extracts&ppprop=wikibase_item&piprop=thumbnail&pithumbsize=200&exintro=1&explaintext=1&titles=${encodeURIComponent(
        titles.join("|")
      )}`;
      const extractsRes = await fetch(extractsAndImagesUrl);
      const extractsData = await extractsRes.json();
      const pages = extractsData.query.pages;

      const articles = Object.values(pages).map((page) => ({
        title: page.title,
        extract: page.extract || "(No description available)",
        image: page.thumbnail?.source || null,
        wikibase_item: page.pageprops?.wikibase_item || null,
      }));

      // Filter articles based on heuristic
      let playableArticles = articles.filter(article => isPlayable(article));
      
      // Apply Wikidata human filter if enabled
      if (game.excludeHumans) {
        playableArticles = await filterHumansViaWikidata(playableArticles);
      }
      
      validWords.push(...playableArticles);
    }

    attempts++;
  }

  // Take only the first 10 and shuffle
  const finalWords = validWords.slice(0, 10).sort(() => 0.5 - Math.random());

  console.log(`Loaded ${finalWords.length} words from category: ${category}`, finalWords);

  return finalWords;
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

const setState = async (state) => {
  game.state = state;
  switch (state) {
    case GameStates.SETUP:
      renderSetup();
      break;
    case GameStates.SELECTION:
      await renderSelection();
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

  const resumeBlock = $("#resumeBlock");
  const saved = Game.load();
  if (saved) resumeBlock.classList.remove("hidden");

  let selectedTeamAColor = "#4aa3ff";
  let selectedTeamBColor = "#ff6b6b";

  const createColorOptions = (containerId, defaultColor, onSelect) => {
    const container = $(containerId);
    COLOR_PALETTE.forEach((color) => {
      const btn = document.createElement("button");
      btn.className = "color-btn";
      btn.style.backgroundColor = color.hex;
      btn.title = color.name;
      btn.type = "button";
      if (color.hex === defaultColor) btn.classList.add("selected");
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        document.querySelectorAll(`${containerId} .color-btn`).forEach((b) => b.classList.remove("selected"));
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

  $("#startGameBtn").addEventListener("click", async () => {
    const teamAName = $("#teamAName").value.trim() || "Team A";
    const teamBName = $("#teamBName").value.trim() || "Team B";
    const teamAColor = selectedTeamAColor;
    const teamBColor = selectedTeamBColor;
    const roundDuration = Number($("#roundDuration").value) || 90;
    const totalRounds = Number($("#totalRounds").value) || 6;
    const category = $("#categorySelect").value || "random";
    const excludeHumans = $("#excludeHumansCheckbox").checked;

    game.teams = [
      { name: teamAName, color: teamAColor, score: 0, time: 0 },
      { name: teamBName, color: teamBColor, score: 0, time: 0 },
    ];
    game.roundDuration = roundDuration;
    game.totalRounds = totalRounds;
    game.round = 1;
    game.activeTeamIndex = 0;
    game.opponentTeamIndex = 1;
    game.selectedIndices = [];
    game.chosenIndex = null;
    game.lastResult = null;
    game.category = category;
    game.excludeHumans = excludeHumans;
    game.prefetchedWords = null;
    game.prefetchPromise = null;

    await loadWordsAndGo(category);
  });

  $("#resumeBtn")?.addEventListener("click", () => {
    const savedGame = Game.load();
    if (!savedGame) return;
    Object.assign(game, savedGame);
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

const loadWordsAndGo = async (category = "random") => {
  try {
    let words;
    
    // Check if words are already prefetched
    if (game.prefetchedWords) {
      words = game.prefetchedWords;
      game.prefetchedWords = null;
      game.prefetchPromise = null;
    } else if (game.prefetchPromise) {
      // Prefetch is in progress, wait for it
      setState(GameStates.LOADING);
      words = await game.prefetchPromise;
      game.prefetchPromise = null;
    } else {
      // No prefetch, fetch now
      setState(GameStates.LOADING);
      words = await fetchWords(category);
    }
    
    game.words = words;
    game.selectedIndices = [];
    game.chosenIndex = null;
    game.lastResult = null;
    setState(GameStates.SELECTION);
  } catch (error) {
    console.error("Error fetching words:", error);
    showToast("Failed to fetch words. Try again.");
    setState(GameStates.SETUP);
  }
};

const renderSelection = async () => {
  setTeamIndicator(`${game.activeTeam.name} selects`, game.activeTeam.color);
  const node = templates.selection.content.cloneNode(true);
  render(node);

  const list = $("#optionsList");
  $("#selectionTitle").textContent = `${game.activeTeam.name}: Pick 3`;

  game.words.forEach((word, index) => {
    const option = document.createElement("div");
    option.className = "option";
    option.innerHTML = `
      <div class="title">${word.title}</div>
      <button class="info" aria-label="Show description">?</button>
    `;

    option.addEventListener("click", (event) => {
      if (event.target.classList.contains("info")) return;
      toggleSelection(option, index);
    });

    option.querySelector(".info").addEventListener("click", (event) => {
      event.stopPropagation();
      showModal(word.title, word.extract);
    });

    list.appendChild(option);
  });

  const commitBtn = $("#commitSelectionBtn");
  commitBtn.addEventListener("click", () => {
    if (game.selectedIndices.length !== 3) return;
    setState(GameStates.CHOICE);
  });
};

const toggleSelection = (option, index) => {
  const idx = game.selectedIndices.indexOf(index);
  if (idx >= 0) {
    game.selectedIndices.splice(idx, 1);
    option.classList.remove("highlight");
  } else {
    if (game.selectedIndices.length >= 3) {
      showToast("Select only 3.");
      return;
    }
    game.selectedIndices.push(index);
    option.classList.add("highlight");
  }

  const commitBtn = $("#commitSelectionBtn");
  commitBtn.disabled = game.selectedIndices.length !== 3;
};

const renderChoice = () => {
  setTeamIndicator(`${game.opponentTeam.name} chooses`, game.opponentTeam.color);
  const node = templates.choice.content.cloneNode(true);
  render(node);

  const list = $("#choiceList");
  $("#choiceTitle").textContent = `${game.opponentTeam.name}: Choose 1`;

  game.words.forEach((word, index) => {
    const option = document.createElement("div");
    const isSelected = game.selectedIndices.includes(index);
    option.className = `option ${isSelected ? "highlight" : "disabled"}`;
    option.innerHTML = `
      <div class="title">${word.title}</div>
      <button class="info" aria-label="Show description">?</button>
    `;

    if (isSelected) {
      option.addEventListener("click", (event) => {
        if (event.target.classList.contains("info")) return;
        chooseOption(option, index);
      });
    }

    option.querySelector(".info").addEventListener("click", (event) => {
      event.stopPropagation();
      showModal(word.title, word.extract);
    });

    list.appendChild(option);
  });

  const commitBtn = $("#commitChoiceBtn");
  commitBtn.addEventListener("click", () => {
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

  $("#startRoundBtn").addEventListener("click", () => {
    game.timerRemaining = game.roundDuration;
    game.isPaused = false;
    game.endedEarly = false;
    game.roundStart = Date.now();
    setState(GameStates.TIMER);
  });
};

const renderTimer = () => {
  setTeamIndicator(`${game.opponentTeam.name} acting`, game.opponentTeam.color);
  const node = templates.timer.content.cloneNode(true);
  render(node);

  // Start prefetching words for the next round
  if (game.round < game.totalRounds && !game.prefetchPromise && !game.prefetchedWords) {
    game.prefetchPromise = fetchWords(game.category);
  }

  const timerDisplay = $("#timerDisplay");
  const sneakDisplay = $("#sneakDisplay");
  const word = game.words[game.chosenIndex];
  sneakDisplay.textContent = word.title;

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
  };

  updateTimer();
  game.timerId = setInterval(tick, 1000);

  $("#foundBtn").addEventListener("click", () => endRound("success"));
  $("#abortBtn").addEventListener("click", () => endRound("fail"));
  $("#pauseBtn").addEventListener("click", () => {
    game.isPaused = !game.isPaused;
    $("#pauseBtn").textContent = game.isPaused ? "Resume" : "Pause";
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
  clearInterval(game.timerId);
  game.timerId = null;

  game.elapsedThisRound = game.roundDuration - game.timerRemaining;
  game.opponentTeam.time += game.elapsedThisRound;
  game.endedEarly = result !== "timeout";
  game.lastResult = result;

  if (result === "success") {
    game.opponentTeam.score += 1;
  }

  // Store prefetched words if the promise resolved
  if (game.prefetchPromise) {
    game.prefetchPromise
      .then((words) => {
        game.prefetchedWords = words;
      })
      .catch((error) => {
        console.error("Error in prefetch:", error);
      });
  }

  game.save();
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

    const foundBtn = document.createElement("button");
    foundBtn.textContent = "Found It";
    foundBtn.className = "success";
    foundBtn.addEventListener("click", () => {
      game.opponentTeam.score += 1;
      game.lastResult = "success";
      game.save();
      setState(GameStates.SCOREBOARD);
    });

    const failBtn = document.createElement("button");
    failBtn.textContent = "Failed";
    failBtn.className = "danger";
    failBtn.addEventListener("click", () => {
      game.lastResult = "fail";
      game.save();
      setState(GameStates.SCOREBOARD);
    });

    actions.append(foundBtn, failBtn);
  } else {
    setTeamIndicator("Round Complete", game.opponentTeam.color);
    resultTitle.textContent = game.lastResult === "success" ? "Success" : "Failed";
    resultText.textContent = `Round took ${formatTime(game.elapsedThisRound)}.`;

    const continueBtn = document.createElement("button");
    continueBtn.textContent = "Continue";
    continueBtn.className = "primary";
    continueBtn.addEventListener("click", () => setState(GameStates.SCOREBOARD));
    actions.appendChild(continueBtn);
  }
};

const renderScoreboard = () => {
  setTeamIndicator("Scoreboard", game.activeTeam.color);
  const node = templates.scoreboard.content.cloneNode(true);
  render(node);

  const summary = $("#scoreSummary");
  summary.innerHTML = `
    <div><strong>${game.teams[0].name}</strong>: ${game.teams[0].score} points, ${formatTime(game.teams[0].time)}</div>
    <div><strong>${game.teams[1].name}</strong>: ${game.teams[1].score} points, ${formatTime(game.teams[1].time)}</div>
    <div>Round ${game.round} / ${game.totalRounds}</div>
  `;

  $("#roundBreakdown").textContent = `Last round took ${formatTime(game.elapsedThisRound)}.`;
  $("#passMessage").textContent = `Pass phone to ${game.activeTeam.name}`;

  $("#nextRoundBtn").addEventListener("click", async () => {
    if (game.round >= game.totalRounds) {
      setState(GameStates.FINAL);
      return;
    }
    game.round += 1;
    game.swapTeams();
    await loadWordsAndGo(game.category);
  });

  $("#endGameBtn").addEventListener("click", () => {
    setState(GameStates.FINAL);
  });
};

const renderFinal = () => {
  setTeamIndicator("Game Over");
  const node = templates.final.content.cloneNode(true);
  render(node);

  const summary = $("#finalSummary");
  summary.innerHTML = `
    <div><strong>${game.teams[0].name}</strong>: ${game.teams[0].score} points, ${formatTime(game.teams[0].time)}</div>
    <div><strong>${game.teams[1].name}</strong>: ${game.teams[1].score} points, ${formatTime(game.teams[1].time)}</div>
  `;

  $("#resetBtn").addEventListener("click", () => {
    game.clearSave();
    window.location.reload();
  });
};

const init = () => {
  setState(GameStates.SETUP);
};

init();
