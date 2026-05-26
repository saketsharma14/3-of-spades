/* ========================================
   3 OF SPADES - game.js
   ======================================== */

const socket = io({ transports: ["websocket", "polling"] });

// ─── LOCAL STATE ─────────────────────────────────────────────────────────────

let myName       = "";
let myRoomCode   = "";
let publicState  = {};
let privateState = {};

// ─── SCREEN MANAGEMENT ───────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
}

// ─── CARD IMAGE HELPER ───────────────────────────────────────────────────────

function getCardImage(display) {
  // "K of Hearts" → "/static/cards/KH.png"
  const parts   = display.split(" of ");
  const numStr  = parts[0].trim();
  const suitStr = parts[1].trim();

  const suitMap = { Spades: "S", Hearts: "H", Clubs: "C", Diamonds: "D" };
  const numMap  = { "J": "J", "Q": "Q", "K": "K", "A": "A", "10": "0" };

  const suit   = suitMap[suitStr];
  const number = numMap[numStr] || numStr;  // 3-9 stay as-is, 10 → 0

  return `/static/cards/${number}${suit}.png`;
}

// ─── SOCKET: CONNECTION ──────────────────────────────────────────────────────

socket.on("connect", () => {
  console.log("Connected to server:", socket.id);
});

socket.on("disconnect", () => {
  console.log("Disconnected from server");
});

socket.on("error", (data) => {
  alert("Error: " + data.message);
});

// ─── SOCKET: ROOM EVENTS ─────────────────────────────────────────────────────

socket.on("room_created", (data) => {
  myName     = data.name;
  myRoomCode = data.room_code;
  document.getElementById("room-code-display").textContent = myRoomCode;
  showScreen("lobby_wait-screen");
});

socket.on("room_joined", (data) => {
  myName     = data.name;
  myRoomCode = data.room_code;
  document.getElementById("room-code-display").textContent = myRoomCode;
  showScreen("lobby_wait-screen");
});

socket.on("player_joined", (data) => {
  console.log("Player joined:", data.name);
});

socket.on("player_left", (data) => {
  console.log("Player left:", data.name);
});

socket.on("rooms_list", (data) => {
  renderRoomsList(data.rooms);
});

socket.on("left_room", () => {
  myName     = "";
  myRoomCode = "";
  showScreen("lobby-screen");
});

// ─── SOCKET: GAME STATE ──────────────────────────────────────────────────────

socket.on("state_update", (state) => {
  publicState = state;

  // Reset bid amount at start of each new round
  if (state.phase === "bidding" && state.trick_number === 0 && state.highest_bid === 0) {
    currentBidAmount = 60;
    const bidInput = document.getElementById("bid-input");
    if (bidInput) bidInput.value = currentBidAmount;
  }

  renderPublicState(state);
});

socket.on("private_update", (state) => {
  privateState = state;
  renderHand(state);
  if (publicState.phase === "bidding" || publicState.phase === "pick_team") {
    const refId = publicState.phase === "bidding"
      ? "bidding-hand-reference"
      : "bidder-hand-reference";
    const handRef = document.getElementById(refId);
    if (handRef && state.hand) {
      handRef.innerHTML = "<h4>Your Hand:</h4>";
      state.hand.forEach(card => {
        const img     = document.createElement("img");
        img.src       = getCardImage(card.display);
        img.alt       = card.display;
        img.className = "card-img";
        img.title     = card.display;
        handRef.appendChild(img);
      });
    }
  }
  // NEW: keep the partner panel in sync the moment our "am I teammate" flag changes
  if (publicState.phase === "playing" || publicState.phase === "trump") {
    renderPartnerInfoPanel(publicState);
  }
});

socket.on("round_end", (result) => {
  renderRoundResult(result);
});

// NEW: server emits this when target reached or vote passed
socket.on("game_over", (data) => {
  renderGameOver(data);
});

// ─── RENDER: ROUTE BY PHASE ──────────────────────────────────────────────────

function renderPublicState(state) {
  switch (state.phase) {
    case "lobby":
      renderLobbyWait(state);
      break;
    case "bidding":
      showScreen("bidding-screen");
      renderBidding(state);
      break;
    case "pick_team":
      renderPickTeam(state);
      break;
    case "trump":
      renderTrump(state);
      break;
    case "playing":
      showScreen("play-screen");
      renderGameplay(state);
      break;
    case "round_end":
      // renderRoundResult is called from the round_end socket event,
      // but if state_update arrives first (e.g. on reconnect) render from publicState
      showScreen("round_result-screen");
      // Gate Next Round to host even when renderRoundResult isn't called
      {
        const isHost     = state.owner === myName;
        const nextBtn    = document.getElementById("next-round-btn");
        const waitingMsg = document.getElementById("waiting-for-host-msg");
        if (nextBtn)    nextBtn.style.display    = isHost ? "" : "none";
        if (waitingMsg) waitingMsg.style.display = isHost ? "none" : "block";
      }
      if (state.team1 && state.team1.length > 0) {
        renderRoundResult({
          team1:        state.team1,
          team2:        state.team2,
          team1_points: state.team1_points,
          team2_points: state.team2_points,
          team1_target: state.highest_bid,
          team2_target: 250 - state.highest_bid,
          winner:       state.team1_points >= state.highest_bid ? "team1" : "team2",
          scores:       state.scores
        });
      }
      break;
    case "game_over":
      // Reconnect or refresh after game ended → still route to game-over.
      renderGameOver({
        winners:    state.winners,
        scores:     state.scores,
        end_reason: state.end_reason,
      });
      break;
  }
}

// ─── RENDER: LOBBY WAIT ──────────────────────────────────────────────────────

function renderLobbyWait(state) {
  showScreen("lobby_wait-screen");

  const playersList = document.getElementById("players-joined");
  const playerCount = document.getElementById("player-count");
  const statusText  = document.getElementById("status-text");
  const startBtn    = document.getElementById("start-game-btn");

  playerCount.textContent = state.players.length;
  playersList.innerHTML   = "";

  state.players.forEach(player => {
    const div     = document.createElement("div");
    div.className = "player-item ready";
    const isOwner = player === state.owner;
    div.innerHTML = `
      <div class="player-avatar">👤</div>
      <div class="player-name">${escapeHtml(player)}${isOwner ? " 👑" : ""}</div>
    `;
    playersList.appendChild(div);
  });

  const isOwner  = myName === state.owner;
  const canStart = state.players.length === 6 || state.players.length === 8;

  startBtn.disabled = !(isOwner && canStart);

  if (!isOwner) {
    statusText.textContent = `Waiting for ${state.owner} to start the game...`;
    statusText.style.color = "";
  } else if (!canStart) {
    statusText.textContent = `Need 6 or 8 players. Currently ${state.players.length}.`;
    statusText.style.color = "";
  } else {
    statusText.textContent = "Ready! Click Start Game.";
    statusText.style.color = "var(--success-color)";
  }
}

// ─── RENDER: BIDDING ─────────────────────────────────────────────────────────

function renderBidding(state) {
  document.getElementById("round-number").textContent = state.round_number;

  const handRef = document.getElementById("bidding-hand-reference");
  if (handRef && privateState.hand) {
    handRef.innerHTML = "<h4>Your Hand:</h4>";
    privateState.hand.forEach(card => {
      const img     = document.createElement("img");
      img.src       = getCardImage(card.display);
      img.alt       = card.display;
      img.className = "card-img";
      img.title     = card.display;
      handRef.appendChild(img);
    });
  }

  // Auto-update bid amount if current value is too low
  if (currentBidAmount <= state.highest_bid) {
    currentBidAmount = state.highest_bid + 5;
    const bidInput = document.getElementById("bid-input");
    if (bidInput) bidInput.value = currentBidAmount;
  }

  // NEW: Close-bidding now uses a "request" pattern
  const reqCloseBtn      = document.getElementById("request-close-btn");
  const closeReqBanner   = document.getElementById("close-request-banner");
  const closeWaitBanner  = document.getElementById("close-waiting-banner");
  const isHighestBidder  = myName === state.highest_bidder;
  const requestActive    = !!state.close_request_active;
  const alreadyPassed    = (state.has_passed || []).includes(myName);

  // Show "Request to Close" button to the bidder ONLY when no request is active.
  if (reqCloseBtn) {
    reqCloseBtn.style.display = (isHighestBidder && !requestActive && !state.bidding_closed) ? "block" : "none";
  }

  // When a request is active:
  //   - non-bidder players see the "respond" banner (unless they already passed)
  //   - the bidder sees a "waiting for responses" banner
  if (closeReqBanner) {
    if (requestActive && !isHighestBidder && !alreadyPassed) {
      closeReqBanner.style.display = "block";
      document.getElementById("close-req-bidder").textContent = state.highest_bidder;
      document.getElementById("close-req-amount").textContent = state.highest_bid;
      // active responders = players who haven't passed (excluding bidder)
      const activeCount = state.players.filter(p =>
        p !== state.highest_bidder && !(state.has_passed || []).includes(p)
      ).length;
      const respondedCount = (state.close_request_responses || []).length;
      document.getElementById("close-req-responded").textContent = respondedCount;
      document.getElementById("close-req-needed").textContent    = activeCount;
    } else {
      closeReqBanner.style.display = "none";
    }
  }
  if (closeWaitBanner) {
    if (requestActive && isHighestBidder) {
      closeWaitBanner.style.display = "block";
      const activeCount = state.players.filter(p =>
        p !== state.highest_bidder && !(state.has_passed || []).includes(p)
      ).length;
      // active count fluctuates as players pass during the request
      const respondedCount = (state.close_request_responses || []).length;
      document.getElementById("close-wait-responded").textContent = respondedCount;
      document.getElementById("close-wait-needed").textContent    = activeCount + respondedCount;
    } else {
      closeWaitBanner.style.display = "none";
    }
  }

  // Hide Pass button for highest bidder or players who already passed
  const passBtn = document.getElementById("pass-bid-btn");
  if (passBtn) {
    passBtn.style.display = (isHighestBidder || alreadyPassed) ? "none" : "inline-block";
  }

  // Bids list
  const bidsList = document.getElementById("bids-list");
  bidsList.innerHTML = "";
  state.players.forEach(player => {
    const div           = document.createElement("div");
    div.className       = "bid-item";
    const hasPassed = (state.has_passed || []).includes(player);
    const isHighest = player === state.highest_bidder;
    div.innerHTML = `
      <span class="player-name">${escapeHtml(player)}</span>
      <span class="bid-amount ${isHighest ? "highest" : ""}">
        ${isHighest ? state.highest_bid : hasPassed ? "Passed" : "..."}
      </span>
    `;
    bidsList.appendChild(div);
  });
}

// ─── RENDER: PICK TEAM ───────────────────────────────────────────────────────

function renderPickTeam(state) {
  showScreen("pick_team-screen");   // ← move this to the TOP before any returns
  document.getElementById("winning-bid").textContent = state.highest_bid;

  const isBidder      = myName === state.highest_bidder;
  const pickerSection = document.getElementById("cards-to-select");
  const waitMsg       = document.getElementById("pick-team-wait-msg");
  const trumpSection  = document.querySelector(".trump-section");
  const teamSection   = document.querySelector(".team-section");

  if (trumpSection) trumpSection.style.display = "none";
  if (teamSection)  teamSection.style.display  = "block";

  if (!isBidder) {
    if (pickerSection) pickerSection.style.display = "none";
    if (waitMsg) waitMsg.textContent =
      `Waiting for ${state.highest_bidder} to pick teammate cards...`;
    return;
  }

  if (waitMsg) waitMsg.textContent = "";
  if (pickerSection) pickerSection.style.display = "grid";
// Add this inside renderPickTeam(), after the waitMsg check, before the card grid
  if (isBidder) {
  const handRef = document.getElementById("bidder-hand-reference");
  if (handRef && privateState.hand) {
      handRef.innerHTML = "<h4>Your Hand:</h4>";
      privateState.hand.forEach(card => {
      const img = document.createElement("img");
      img.src       = getCardImage(card.display);
      img.alt       = card.display;
      img.className = "card-img";
      img.title     = card.display;
      handRef.appendChild(img);
      });
}
}

  const needed  = state.teammates_needed;
  const already = state.chosen_cards.length;
  document.getElementById("cards-selected-info").textContent =
    `Selected: ${already}/${needed} cards`;

  // Render full 48-card deck as image buttons
  if (pickerSection) {
    pickerSection.innerHTML = "";
    buildAllCards().forEach(cardDisplay => {
      const alreadyPicked = state.chosen_cards.some(c => c.display === cardDisplay);
      const btn           = document.createElement("button");
      btn.className       = "card-selector" + (alreadyPicked ? " selected" : "");
      btn.disabled        = alreadyPicked || already >= needed;
      btn.innerHTML       = `<img src="${getCardImage(cardDisplay)}" alt="${cardDisplay}" class="card-img">`;
      btn.title           = cardDisplay;
      btn.addEventListener("click", () => {
        socket.emit("pick_teammate_card", { card: cardDisplay });
      });
      pickerSection.appendChild(btn);
    });
  }
}

// ─── RENDER: TRUMP ───────────────────────────────────────────────────────────

function renderTrump(state) {
  showScreen("pick_team-screen");

  const isBidder      = myName === state.highest_bidder;
  const pickerSection = document.getElementById("cards-to-select");
  const waitMsg       = document.getElementById("pick-team-wait-msg");
  const trumpSection  = document.querySelector(".trump-section");
  const teamSection   = document.querySelector(".team-section");

  // Hide card picker, show trump section
  if (pickerSection) pickerSection.style.display = "none";
  if (teamSection)   teamSection.style.display   = "none";
  if (trumpSection)  trumpSection.style.display  = isBidder ? "block" : "none";

  if (waitMsg) waitMsg.textContent = isBidder
    ? "Now declare your trump suit:"
    : `Waiting for ${state.highest_bidder} to declare trump...`;
}

// ─── RENDER: GAMEPLAY ────────────────────────────────────────────────────────

function renderGameplay(state) {
  document.getElementById("current-round").textContent = state.round_number;
  document.getElementById("trump-display").textContent = state.trump_suit + "s";

  // Whose turn
  const turnEl = document.getElementById("whose-turn-display");
  if (turnEl) {
    turnEl.textContent = state.whose_turn === myName
      ? "Your turn!"
      : `Waiting for ${state.whose_turn}...`;
    turnEl.style.color = state.whose_turn === myName ? "var(--accent-color)" : "";
  }

  // Score — NO team names shown during play
  const scoreEl = document.getElementById("score-display");
  if (scoreEl) {
    scoreEl.innerHTML = `
      Trick ${state.trick_number}/${state.total_tricks}
      &nbsp;|&nbsp; Trump: ${state.trump_suit}s
      &nbsp;|&nbsp; Bid: ${state.highest_bid} pts
    `;
  }

  // Teams display — HIDDEN during gameplay, teams revealed at round end only
  const teamsEl = document.getElementById("teams-display");
  if (teamsEl) teamsEl.innerHTML = "";

  // NEW: Partner info panel — shows bidder + chosen cards + your team status
  renderPartnerInfoPanel(state);

  renderCircularTable(state);
  renderTrickWinners(state);

  // "X wins the trick!" banner during the 5s reveal pause
  const banner = document.getElementById("trick-winner-banner");
  if (banner) {
    if (state.pending_trick_winner) {
      const isMe = state.pending_trick_winner === myName;
      banner.textContent = isMe
        ? "You win this trick! 🏆"
        : `${state.pending_trick_winner} wins this trick! 🏆`;
      banner.style.display = "block";
    } else {
      banner.style.display = "none";
    }
  }
}

// NEW: Renders the small panel near the top of the play screen that shows
// the bidder, the bid amount, the cards the bidder chose, and whether THIS
// player is on the bidder's team (mystery revealed once your card is picked).
function renderPartnerInfoPanel(state) {
  // The old free-floating panel was merged into the header bar to save space.
  // Elements live inside the header now.
  const inlineWrap = document.getElementById("header-bidder-info");
  if (!inlineWrap) return;

  if (!state.highest_bidder) {
    inlineWrap.style.display = "none";
    const statusEl = document.getElementById("partner-info-status");
    if (statusEl) statusEl.textContent = "";
    return;
  }
  inlineWrap.style.display = "inline-flex";
  document.getElementById("partner-info-bidder").textContent = state.highest_bidder;
  document.getElementById("partner-info-bid").textContent    = state.highest_bid + " pts";

  // Show chosen cards as small images
  const cardsEl = document.getElementById("partner-info-cards");
  cardsEl.innerHTML = "";
  (state.chosen_cards || []).forEach(card => {
    const img = document.createElement("img");
    img.src   = getCardImage(card.display);
    img.alt   = card.display;
    img.title = card.display;
    cardsEl.appendChild(img);
  });

  // Per-player status — compact, fits in header
  const statusEl = document.getElementById("partner-info-status");
  if (!statusEl) return;
  statusEl.classList.remove("teammate", "opponent");
  if (privateState.am_i_bidder) {
    statusEl.textContent = "🃏 You are the bidder";
    statusEl.classList.add("teammate");
  } else if (state.chosen_cards && state.chosen_cards.length > 0) {
    if (privateState.is_teammate) {
      statusEl.textContent = "🤝 Teammate";
      statusEl.classList.add("teammate");
    } else {
      statusEl.textContent = "⚔ Chaser";
      statusEl.classList.add("opponent");
    }
  } else {
    statusEl.textContent = "";
  }
}

// ─── RENDER: HAND ────────────────────────────────────────────────────────────

function renderHand(state) {
  const container = document.getElementById("player-hand");
  if (!container) return;
  container.innerHTML = "";

  const validSet = new Set(state.valid_cards);
  const isMyTurn = state.is_my_turn;

  // Sort: trump suit first, then Spades, Hearts, Clubs, Diamonds.
  // Within each suit, higher rank first.
  const sortedHand = sortHand(state.hand || [], publicState.trump_suit);

  sortedHand.forEach(card => {
    const isValid = validSet.has(card.display);
    const btn     = document.createElement("button");
    btn.className = "card"
      + (!isValid        ? " invalid"  : "")
      + (isMyTurn && isValid ? " playable" : "");
    btn.innerHTML = `
      <img src="${getCardImage(card.display)}" alt="${card.display}" class="card-img">
      ${card.points > 0 ? `<span class="card-points">${card.points}pts</span>` : ""}
    `;
    btn.disabled = !isMyTurn || !isValid;
    btn.addEventListener("click", () => {
      socket.emit("play_card", { card: card.display });
    });
    container.appendChild(btn);
  });

  const infoEl = document.getElementById("valid-cards-info");
  if (infoEl) infoEl.textContent = `Cards: ${sortedHand.length}`;
}

// Sort helper used by renderHand. Trump suit always first.
function sortHand(hand, trumpSuit) {
  // Suit display order: trump → Spade → Heart → Club → Diamond
  const baseOrder = { "Spade": 1, "Heart": 2, "Club": 3, "Diamond": 4 };
  return [...hand].sort((a, b) => {
    const ra = (a.suit === trumpSuit) ? 0 : (baseOrder[a.suit] || 99);
    const rb = (b.suit === trumpSuit) ? 0 : (baseOrder[b.suit] || 99);
    if (ra !== rb) return ra - rb;
    return b.number - a.number; // higher rank first within suit
  });
}

// ─── RENDER: TABLE ───────────────────────────────────────────────────────────

function renderCircularTable(state) {
  const table = document.getElementById("game-table");
  if (!table) return;
  table.innerHTML = "";

  const players   = state.players;
  const radius    = 180;
  const angleStep = (2 * Math.PI) / players.length;

  players.forEach((player, idx) => {
    const angle = angleStep * idx - Math.PI / 2;
    const x     = Math.cos(angle) * radius;
    const y     = Math.sin(angle) * radius;

    const pos     = document.createElement("div");
    pos.className = "player-position";
    // Mark the winning seat during the 5s pause
    if (state.pending_trick_winner === player) {
      pos.classList.add("trick-winner");
    }
    // Mark seats of players who left mid-round (auto-played by server)
    const hasLeft = (state.left_players || []).includes(player);
    if (hasLeft) {
      pos.classList.add("player-left");
    }
    pos.style.left = `calc(50% + ${x}px - 40px)`;
    pos.style.top  = `calc(50% + ${y}px - 50px)`;

    const isActive  = player === state.whose_turn;
    const isMe      = player === myName;

    // NO team colouring during play — teams hidden until round end
    const trickCard = state.current_trick.find(e => e.player === player);

    pos.innerHTML = `
      <div class="player-card ${isActive ? "active" : ""} ${isMe ? "current-player" : ""}">
        <div class="player-name">${escapeHtml(player)}${isMe ? " (You)" : ""}${hasLeft ? " (left)" : ""}</div>
        ${trickCard
          ? `<img src="${getCardImage(trickCard.card.display)}"
                  alt="${trickCard.card.display}"
                  class="card-img trick-img">`
          : ""}
      </div>
    `;
    table.appendChild(pos);
  });
}

// ─── RENDER: TRICK WINNERS SIDEBAR ───────────────────────────────────────────

function renderTrickWinners(state) {
  const list = document.getElementById("trick-winners-list");
  if (!list) return;
  list.innerHTML = "";
  const history = state.trick_history || [];
  if (history.length === 0) {
    list.innerHTML = `<li class="empty">No tricks yet</li>`;
    return;
  }
  history.forEach(entry => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="trick-num">#${entry.trick_number}</span>
      <span class="trick-winner-name">${escapeHtml(entry.winner)}</span>
    `;
    list.appendChild(li);
  });
}

// ─── RENDER: ROUND RESULT ────────────────────────────────────────────────────

function renderRoundResult(result) {
  showScreen("round_result-screen");
  document.getElementById("result-round").textContent = publicState.round_number || "";

  // Only the host can start the next round — hide the button for everyone else
  const isHost          = publicState.owner === myName;
  const nextBtn         = document.getElementById("next-round-btn");
  const waitingMsg      = document.getElementById("waiting-for-host-msg");
  if (nextBtn)    nextBtn.style.display    = isHost ? "" : "none";
  if (waitingMsg) waitingMsg.style.display = isHost ? "none" : "block";

  // SPECIAL CASE: everyone passed during bidding — no round was played
  if (result.all_passed) {
    document.getElementById("team1-members").innerHTML =
      `<div class="team-member-item">—</div>`;
    document.getElementById("team2-members").innerHTML =
      `<div class="team-member-item">—</div>`;
    document.getElementById("team1-score").textContent = 0;
    document.getElementById("team2-score").textContent = 0;

    const t1Result = document.getElementById("team1-result");
    const t2Result = document.getElementById("team2-result");
    t1Result.className   = "team-outcome";
    t2Result.className   = "team-outcome";
    t1Result.textContent = result.message || "Everyone passed — no round played.";
    t2Result.textContent = "Scores unchanged.";

    // Standings still reflect cumulative scores
    const standingsList = document.getElementById("standings-list");
    standingsList.innerHTML = "";
    Object.entries(result.scores)
      .sort((a, b) => b[1] - a[1])
      .forEach(([player, score], idx) => {
        const div     = document.createElement("div");
        div.className = "standing-item" + (idx === 0 ? " top" : "");
        div.innerHTML = `
          <span class="standing-rank">#${idx + 1}</span>
          <span class="standing-name">${escapeHtml(player)}</span>
          <span class="standing-score">${score} pts</span>
        `;
        standingsList.appendChild(div);
      });
    return;
  }

  // Team 1 — revealed here for the first time
  document.getElementById("team1-members").innerHTML =
    result.team1.map(p => `<div class="team-member-item">${escapeHtml(p)}</div>`).join("");
  document.getElementById("team1-score").textContent = result.team1_points;

  const t1Result = document.getElementById("team1-result");
  if (result.winner === "team1") {
    t1Result.className   = "team-outcome win";
    t1Result.textContent = `✓ Won! Met bid of ${result.team1_target}`;
  } else {
    t1Result.className   = "team-outcome loss";
    t1Result.textContent = `✗ Failed — needed ${result.team1_target}, got ${result.team1_points}`;
  }

  // Team 2 — revealed here for the first time
  document.getElementById("team2-members").innerHTML =
    result.team2.map(p => `<div class="team-member-item">${escapeHtml(p)}</div>`).join("");
  document.getElementById("team2-score").textContent = result.team2_points;

  const t2Result = document.getElementById("team2-result");
  if (result.winner === "team2") {
    t2Result.className   = "team-outcome win";
    t2Result.textContent = `✓ Won! Opponent failed their bid`;
  } else {
    t2Result.className   = "team-outcome loss";
    t2Result.textContent = `✗ Opponent met their bid`;
  }

  // Overall standings
  const standingsList = document.getElementById("standings-list");
  standingsList.innerHTML = "";
  Object.entries(result.scores)
    .sort((a, b) => b[1] - a[1])
    .forEach(([player, score], idx) => {
      const div     = document.createElement("div");
      div.className = "standing-item" + (idx === 0 ? " top" : "");
      div.innerHTML = `
        <span class="standing-rank">#${idx + 1}</span>
        <span class="standing-name">${escapeHtml(player)}</span>
        <span class="standing-score">${score} pts</span>
      `;
      standingsList.appendChild(div);
    });
}

// ─── RENDER: ROOMS LIST ──────────────────────────────────────────────────────

function renderRoomsList(rooms) {
  const list = document.getElementById("rooms-list");
  if (!list) return;
  list.innerHTML = "";
  if (rooms.length === 0) {
    list.innerHTML = "<p style='color:#aaa'>No open rooms. Create one!</p>";
    return;
  }
  rooms.forEach(room => {
    const div     = document.createElement("div");
    div.className = "room-card";
    div.innerHTML = `
      <h4>${room.code}</h4>
      <p>Owner: ${escapeHtml(room.owner)}</p>
      <p>Players: ${room.player_count}/8</p>
      <p>Status: ${room.phase}</p>
    `;
    div.addEventListener("click", () => {
      document.getElementById("room-code-input").value = room.code;
    });
    list.appendChild(div);
  });
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function escapeHtml(text) {
  const div       = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function buildAllCards() {
  const suits   = ["Spades", "Hearts", "Clubs", "Diamonds"];
  const numbers = ["3","4","5","6","7","8","9","10","J","Q","K","A"];
  const suitMap = { Spades: "Spade", Hearts: "Heart", Clubs: "Club", Diamonds: "Diamond" };
  const cards   = [];
  suits.forEach(suit => {
    numbers.forEach(num => {
      cards.push(`${num} of ${suitMap[suit]}s`);
    });
  });
  return cards;
}

// ─── EVENT LISTENERS: LOBBY ──────────────────────────────────────────────────

document.getElementById("create-room-btn").addEventListener("click", () => {
  const name = document.getElementById("player-name").value.trim();
  if (!name) { alert("Please enter your name."); return; }
  socket.emit("create_room", { name });
});

document.getElementById("join-room-btn").addEventListener("click", () => {
  const name = document.getElementById("player-name").value.trim();
  if (!name) { alert("Please enter your name."); return; }
  window._pendingName = name;
  socket.emit("get_rooms");
  showScreen("room_select-screen");
});

document.getElementById("player-name").addEventListener("keypress", (e) => {
  if (e.key === "Enter") document.getElementById("create-room-btn").click();
});

// ─── EVENT LISTENERS: ROOM SELECT ────────────────────────────────────────────

document.getElementById("back-to-lobby").addEventListener("click", () => {
  showScreen("lobby-screen");
});

document.getElementById("join-with-code-btn").addEventListener("click", () => {
  const code = document.getElementById("room-code-input").value.trim().toUpperCase();
  const name = window._pendingName || document.getElementById("player-name").value.trim();
  if (!code) { alert("Please enter a room code."); return; }
  if (!name) { alert("Please enter your name."); return; }
  socket.emit("join_room_game", { name, code });
});

document.getElementById("room-code-input").addEventListener("keypress", (e) => {
  if (e.key === "Enter") document.getElementById("join-with-code-btn").click();
});

// ─── EVENT LISTENERS: GAME LOBBY ─────────────────────────────────────────────

document.getElementById("start-game-btn").addEventListener("click", () => {
  socket.emit("start_game");
});

document.getElementById("leave-room-btn").addEventListener("click", () => {
  socket.emit("leave_room_game");
});

// ─── EVENT LISTENERS: BIDDING ────────────────────────────────────────────────

let currentBidAmount = 60;

document.getElementById("bid-minus").addEventListener("click", () => {
  currentBidAmount = Math.max((publicState.highest_bid || 0) + 5, currentBidAmount - 5);
  document.getElementById("bid-input").value = currentBidAmount;
});

document.getElementById("bid-plus").addEventListener("click", () => {
  currentBidAmount = Math.min(250, currentBidAmount + 5);
  document.getElementById("bid-input").value = currentBidAmount;
});

document.getElementById("submit-bid-btn").addEventListener("click", () => {
  socket.emit("place_bid", { amount: currentBidAmount });
});

document.getElementById("pass-bid-btn").addEventListener("click", () => {
  socket.emit("pass_bid");
});

// NEW: bidder REQUESTS close (instead of unilaterally closing)
const requestCloseBtn = document.getElementById("request-close-btn");
if (requestCloseBtn) {
  requestCloseBtn.addEventListener("click", () => {
    socket.emit("request_close_bidding");
  });
}

// NEW: non-bidder responds "pass" to a close request
const closeReqPassBtn = document.getElementById("close-req-pass-btn");
if (closeReqPassBtn) {
  closeReqPassBtn.addEventListener("click", () => {
    socket.emit("respond_close_request", { action: "pass" });
  });
}

// ─── EVENT LISTENERS: TRUMP ──────────────────────────────────────────────────

document.querySelectorAll(".trump-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".trump-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    socket.emit("declare_trump", { suit: btn.dataset.suit });
  });
});

// ─── EVENT LISTENERS: ROUND RESULT ───────────────────────────────────────────

document.getElementById("next-round-btn").addEventListener("click", () => {
  socket.emit("next_round");
});

document.getElementById("exit-game-btn").addEventListener("click", () => {
  if (confirm("Exit game?")) socket.emit("leave_room_game");
});

// ─── EVENT LISTENERS: GAME OVER ──────────────────────────────────────────────

// NEW: host returns the room to the lobby (preserving players and target)
const gameOverBackBtn = document.getElementById("game-over-back-to-lobby-btn");
if (gameOverBackBtn) {
  gameOverBackBtn.addEventListener("click", () => {
    socket.emit("return_to_lobby");
  });
}
// NEW: anyone can leave the room from the game-over screen
const gameOverLeaveBtn = document.getElementById("game-over-leave-btn");
if (gameOverLeaveBtn) {
  gameOverLeaveBtn.addEventListener("click", () => {
    socket.emit("leave_room_game");
  });
}

// ─── RENDER: GAME OVER ───────────────────────────────────────────────────────

function renderGameOver(data) {
  // data: { winners: [name, ...], scores: {name: score}, end_reason: str|null }
  showScreen("game_over-screen");

  const winners = data.winners || [];

  // Explanation line (e.g. "Game ended: Bob left the room")
  const reasonEl = document.getElementById("game-over-reason");
  if (reasonEl) {
    if (data.end_reason) {
      reasonEl.textContent = `Game ended: ${data.end_reason}.`;
    } else {
      reasonEl.textContent = "Game over.";
    }
  }

  // Plural "Winners" if it's a tie
  document.getElementById("winner-plural").textContent = winners.length > 1 ? "s (tie!)" : "";

  // List winner name(s)
  document.getElementById("game-over-winners").innerHTML =
    winners.length
      ? winners.map(w => `<div>🏆 ${escapeHtml(w)} 🏆</div>`).join("")
      : "<div>No winner</div>";

  // Winning score
  const top = (winners.length && data.scores) ? data.scores[winners[0]] : 0;
  document.getElementById("game-over-winning-score").textContent = top;

  // Full final standings
  const standingsEl = document.getElementById("game-over-standings");
  if (standingsEl) {
    standingsEl.innerHTML = "";
    Object.entries(data.scores || {})
      .sort((a, b) => b[1] - a[1])
      .forEach(([player, score], idx) => {
        const isWinner = winners.includes(player);
        const div     = document.createElement("div");
        div.className = "standing-item" + (isWinner ? " top" : "");
        div.innerHTML = `
          <span class="standing-rank">#${idx + 1}</span>
          <span class="standing-name">${escapeHtml(player)}${isWinner ? " 👑" : ""}</span>
          <span class="standing-score">${score} pts</span>
        `;
        standingsEl.appendChild(div);
      });
  }

  // Owner sees "Back to Lobby" button; others see waiting message
  const isOwner = myName === publicState.owner;
  const backBtn = document.getElementById("game-over-back-to-lobby-btn");
  const waitMsg = document.getElementById("game-over-wait-msg");
  if (backBtn) backBtn.style.display = isOwner ? "inline-block" : "none";
  if (waitMsg) waitMsg.style.display = isOwner ? "none" : "block";
}

console.log("3 of Spades — game.js loaded");