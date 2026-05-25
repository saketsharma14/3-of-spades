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
  renderPublicState(state);
});

socket.on("private_update", (state) => {
  privateState = state;
  renderHand(state);
});

socket.on("round_end", (result) => {
  renderRoundResult(result);
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
      showScreen("round_result-screen");
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

  // Hide bid controls once player has bid or passed
  const hasBid      = state.has_bid.includes(myName);
  const bidControls = document.getElementById("bid-controls");
  if (bidControls) bidControls.style.display = hasBid ? "none" : "flex";

  // Close bidding button — only for highest bidder
  const closeBtn = document.getElementById("close-bidding-btn");
  if (closeBtn) {
    closeBtn.style.display =
      myName === state.highest_bidder && !state.bidding_closed ? "block" : "none";
  }

  // Bids list
  const bidsList = document.getElementById("bids-list");
  bidsList.innerHTML = "";
  state.players.forEach(player => {
    const div           = document.createElement("div");
    div.className       = "bid-item";
    const hasBidAlready = state.has_bid.includes(player);
    const isHighest     = player === state.highest_bidder;
    div.innerHTML = `
      <span class="player-name">${escapeHtml(player)}</span>
      <span class="bid-amount ${isHighest ? "highest" : ""}">
        ${isHighest ? state.highest_bid : hasBidAlready ? "Passed" : "..."}
      </span>
    `;
    bidsList.appendChild(div);
  });
}

// ─── RENDER: PICK TEAM ───────────────────────────────────────────────────────

function renderPickTeam(state) {
  showScreen("pick_team-screen");
  document.getElementById("winning-bid").textContent = state.highest_bid;

  const isBidder      = myName === state.highest_bidder;
  const pickerSection = document.getElementById("cards-to-select");
  const waitMsg       = document.getElementById("pick-team-wait-msg");
  const trumpSection  = document.querySelector(".trump-section");

  // Hide trump section during pick_team phase
  if (trumpSection) trumpSection.style.display = "none";

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

  // Current trick — show card images
  const trickEl = document.getElementById("current-trick-display");
  if (trickEl) {
    trickEl.innerHTML = "";
    if (state.current_trick.length === 0) {
      trickEl.innerHTML = "<p class='no-cards'>No cards played yet</p>";
    } else {
      state.current_trick.forEach(entry => {
        const div     = document.createElement("div");
        div.className = "trick-card";
        div.innerHTML = `
          <div class="trick-player">${escapeHtml(entry.player)}</div>
          <img src="${getCardImage(entry.card.display)}"
               alt="${entry.card.display}"
               class="card-img trick-img">
        `;
        trickEl.appendChild(div);
      });
    }
  }

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

  renderCircularTable(state);
}

// ─── RENDER: HAND ────────────────────────────────────────────────────────────

function renderHand(state) {
  const container = document.getElementById("player-hand");
  if (!container) return;
  container.innerHTML = "";

  const validSet = new Set(state.valid_cards);
  const isMyTurn = state.is_my_turn;

  state.hand.forEach(card => {
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
  if (infoEl) infoEl.textContent = `Cards: ${state.hand.length}`;
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
    pos.style.left = `calc(50% + ${x}px - 40px)`;
    pos.style.top  = `calc(50% + ${y}px - 50px)`;

    const isActive  = player === state.whose_turn;
    const isMe      = player === myName;

    // NO team colouring during play — teams hidden until round end
    const trickCard = state.current_trick.find(e => e.player === player);

    pos.innerHTML = `
      <div class="player-card ${isActive ? "active" : ""} ${isMe ? "current-player" : ""}">
        <div class="player-name">${escapeHtml(player)}${isMe ? " (You)" : ""}</div>
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

// ─── RENDER: ROUND RESULT ────────────────────────────────────────────────────

function renderRoundResult(result) {
  showScreen("round_result-screen");
  document.getElementById("result-round").textContent = publicState.round_number || "";

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
  currentBidAmount = Math.max((publicState.highest_bid || 0) + 1, currentBidAmount - 5);
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

const closeBidBtn = document.getElementById("close-bidding-btn");
if (closeBidBtn) {
  closeBidBtn.addEventListener("click", () => {
    socket.emit("close_bidding");
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

console.log("3 of Spades — game.js loaded");