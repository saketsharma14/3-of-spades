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
  // Always refresh vote counters — they exist on multiple screens and need
  // to update no matter which screen is currently active.
  updateVoteEndUI(state);
});

socket.on("private_update", (state) => {
  privateState = state;
  renderHand(state);
  // Re-render the appropriate "your hand" reference area whenever the private
  // state changes — handles the case where private_update arrives AFTER
  // state_update (and thus after renderBidding/renderPickTeam already tried to
  // render with an empty hand).
  if (publicState.phase === "bidding") {
    renderBidding(publicState);
  } else if (publicState.phase === "pick_team") {
    renderPickTeam(publicState);
  }
});

socket.on("round_end", (result) => {
  renderRoundResult(result);
});

// NEW: when the server tells us the game is fully over (target hit or vote passed)
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
      // NEW: if the user reconnects after the game ended, route them here.
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

  // ── NEW: Target-score control ────────────────────────────────────────────
  // Only the host can edit it. Others see the current value read-only.
  const targetInput   = document.getElementById("target-score-input");
  const setTargetBtn  = document.getElementById("set-target-btn");
  const targetDisplay = document.getElementById("current-target-display");

  if (targetDisplay) {
    targetDisplay.textContent = state.target_score > 0
      ? `${state.target_score} points`
      : "none (free play)";
  }
  if (targetInput && setTargetBtn) {
    if (isOwner) {
      targetInput.disabled  = false;
      setTargetBtn.disabled = false;
    } else {
      targetInput.disabled  = true;
      setTargetBtn.disabled = true;
      targetInput.value     = state.target_score || 0;
    }
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

  // ── Auto-snap the bid input to the next legal value ──────────────────────
  // Every time the bidding screen re-renders, the input becomes (highest_bid+5)
  // — or 30 if no bid yet. This means a player who's just been outbid doesn't
  // have to mash the "+" button to get past the new high bid; their input is
  // already there.
  const minBid = state.highest_bid > 0 ? state.highest_bid + 5 : 30;
  currentBidAmount = minBid;
  const bidInput = document.getElementById("bid-input");
  if (bidInput) {
    bidInput.value = currentBidAmount;
    bidInput.min   = minBid;       // also prevents typing a value too low
  }

  // Close bidding button — only for highest bidder
  const closeBtn = document.getElementById("close-bidding-btn");
  if (closeBtn) {
    closeBtn.style.display =
      myName === state.highest_bidder && !state.bidding_closed ? "block" : "none";
  }

  // Hide Pass button for highest bidder or players who already passed
  const passBtn = document.getElementById("pass-bid-btn");
  if (passBtn) {
    const alreadyPassed   = (state.has_passed || []).includes(myName);
    const isHighestBidder = myName === state.highest_bidder;
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

  // NEW: update the vote-to-end button labels with current tally
  updateVoteEndUI(state);

  renderCircularTable(state);
}

// NEW: shared helper — fills the vote count text on whichever screen is active
function updateVoteEndUI(state) {
  const cnt     = (state.end_game_votes || []).length;
  const needed  = state.votes_needed || 0;
  const iVoted  = (state.end_game_votes || []).includes(myName);

  // Play-screen button
  const btn  = document.getElementById("vote-end-btn");
  const cEl  = document.getElementById("vote-end-count");
  const nEl  = document.getElementById("vote-end-needed");
  if (btn && cEl && nEl) {
    cEl.textContent = cnt;
    nEl.textContent = needed;
    btn.classList.toggle("voted", iVoted);
    btn.style.opacity = iVoted ? "1" : "0.85";
    btn.textContent   = iVoted
      ? `Unvote (${cnt}/${needed})`
      : `End Game? (${cnt}/${needed})`;
  }
  // Round-result-screen button (same idea)
  const btnR = document.getElementById("vote-end-btn-result");
  const cElR = document.getElementById("vote-end-count-result");
  const nElR = document.getElementById("vote-end-needed-result");
  if (btnR && cElR && nElR) {
    cElR.textContent = cnt;
    nElR.textContent = needed;
    btnR.textContent = iVoted
      ? `Unvote to end (${cnt}/${needed})`
      : `Vote to End Game (${cnt}/${needed})`;
  }
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

  // NEW: also refresh the end-game vote counter on this screen
  updateVoteEndUI(publicState);
}

// ─── NEW: RENDER: GAME OVER ──────────────────────────────────────────────────

function renderGameOver(data) {
  // `data` matches what server emits in the "game_over" event:
  // { winners: [name, ...], scores: {name: score}, end_reason: "target"|"vote" }
  showScreen("game_over-screen");

  const winners = data.winners || [];
  const reason  = data.end_reason || "target";

  document.getElementById("game-over-reason").textContent =
    reason === "vote"
      ? "Players voted to end the game."
      : "A player reached the target score!";

  // Plural "Winners" if it's a tie
  document.getElementById("winner-plural").textContent = winners.length > 1 ? "s (tie!)" : "";

  // List winner names (one per line)
  document.getElementById("game-over-winners").innerHTML =
    winners.length
      ? winners.map(w => `<div>🏆 ${escapeHtml(w)} 🏆</div>`).join("")
      : "<div>No winner</div>";

  // Winning score (max in scores)
  const top = winners.length && data.scores ? data.scores[winners[0]] : 0;
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

  // Owner-only: show the "Back to Lobby" button. Others see a waiting message.
  const isOwner       = myName === publicState.owner;
  const backBtn       = document.getElementById("game-over-back-to-lobby-btn");
  const waitMsg       = document.getElementById("game-over-wait-msg");
  if (backBtn) backBtn.style.display = isOwner ? "inline-block" : "none";
  if (waitMsg) waitMsg.style.display = isOwner ? "none" : "block";
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

// NEW: host clicks "Set" to commit a target score
const setTargetBtn = document.getElementById("set-target-btn");
if (setTargetBtn) {
  setTargetBtn.addEventListener("click", () => {
    const input  = document.getElementById("target-score-input");
    const amount = parseInt(input && input.value, 10) || 0;
    socket.emit("set_target_score", { amount });
  });
}

// NEW: vote to end the game (button on play screen)
const voteEndBtn = document.getElementById("vote-end-btn");
if (voteEndBtn) {
  voteEndBtn.addEventListener("click", () => {
    socket.emit("vote_end_game");
  });
}
// NEW: same vote button on the round-result screen
const voteEndBtnResult = document.getElementById("vote-end-btn-result");
if (voteEndBtnResult) {
  voteEndBtnResult.addEventListener("click", () => {
    socket.emit("vote_end_game");
  });
}
// NEW: game-over screen buttons
// Back-to-Lobby: owner only; resets the game state, keeps room/players intact
const gameOverBackBtn = document.getElementById("game-over-back-to-lobby-btn");
if (gameOverBackBtn) {
  gameOverBackBtn.addEventListener("click", () => {
    socket.emit("return_to_lobby");
  });
}
// Leave Room: any player; fully exits the room
const gameOverLeaveBtn = document.getElementById("game-over-leave-btn");
if (gameOverLeaveBtn) {
  gameOverLeaveBtn.addEventListener("click", () => {
    socket.emit("leave_room_game");
  });
}

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
