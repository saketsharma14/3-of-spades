/* ========================================
   3 OF SPADES - STEP 8: FINAL VERSION
   Socket.IO Ready + Polish
   ======================================== */

// Socket.IO connection (will connect to backend)
let socket = null;

// Game state
let gameState = {
  playerName: '',
  roomCode: '',
  players: [],
  currentBid: 60,
  allBids: {},
  selectedCards: [],
  selectedTrump: null,
  playerHand: [],
  validCards: [],
  roundNumber: 1,
  overallScores: {},
  gamePhase: 'lobby', // lobby, bidding, team_selection, gameplay, results
};

// Mock player data
const mockPlayers = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank'];

// All cards in deck (48 cards - 2s removed)
const allCards = [
  '3♠', '4♠', '5♠', '6♠', '7♠', '8♠', '9♠', '10♠', 'J♠', 'Q♠', 'K♠', 'A♠',
  '3♥', '4♥', '5♥', '6♥', '7♥', '8♥', '9♥', '10♥', 'J♥', 'Q♥', 'K♥', 'A♥',
  '3♣', '4♣', '5♣', '6♣', '7♣', '8♣', '9♣', '10♣', 'J♣', 'Q♣', 'K♣', 'A♣',
  '3♦', '4♦', '5♦', '6♦', '7♦', '8♦', '9♦', '10♦', 'J♦', 'Q♦', 'K♦', 'A♦',
];

// ---- SOCKET.IO INITIALIZATION ----

/**
 * Initialize Socket.IO connection
 * Called when connecting to the backend server
 */
function initializeSocket() {
  // Connect to backend (when deployed)
  socket = io({ transports: ['websocket', 'polling'] });
  
  // Listen for connection
  socket.on('connect', () => {
    console.log('Connected to server');
    addSystemMessage('Connected to game server');
  });
  
  // Listen for errors
  socket.on('error', (error) => {
    console.error('Socket error:', error);
    addSystemMessage('Connection error: ' + error);
  });
  
  // ---- LISTEN FOR GAME STATE UPDATES ----
  
  // Room created
  socket.on('room_created', (data) => {
    console.log('Room created:', data);
    gameState.roomCode = data.room_code;
    document.getElementById('room-code-display').textContent = gameState.roomCode;
  });
  
  // Room joined
  socket.on('room_joined', (data) => {
    console.log('Room joined:', data);
    gameState.players = data.players;
    updateGameLobby(gameState.players);
  });
  
  // Players list updated
  socket.on('players_updated', (data) => {
    console.log('Players updated:', data);
    gameState.players = data.players;
    updateGameLobby(gameState.players);
  });
  
  // Game state update (public - all players)
  socket.on('state_update', (data) => {
    console.log('State update:', data);
    gameState.gamePhase = data.phase;
    gameState.roundNumber = data.round;
    
    // Route based on phase
    switch(data.phase) {
      case 'bidding':
        updateBidsDisplay();
        break;
      case 'team_selection':
        // Show team selection
        break;
      case 'gameplay':
        // Update gameplay table
        break;
      case 'results':
        // Show results
        break;
    }
  });
  
  // Private update (per-player hand and valid cards)
  socket.on('private_update', (data) => {
    console.log('Private update:', data);
    gameState.playerHand = data.hand || [];
    gameState.validCards = data.valid_cards || [];
    renderPlayerHand();
  });
  
  // Error from server
  socket.on('error_message', (data) => {
    console.error('Server error:', data);
    alert('Error: ' + data.message);
  });
}

/**
 * Add system message for testing
 */
function addSystemMessage(message) {
  console.log('[SYSTEM]', message);
}

// ---- DOM ELEMENTS ----
const playerNameInput = document.getElementById('player-name');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const backToLobbyBtn = document.getElementById('back-to-lobby');
const joinWithCodeBtn = document.getElementById('join-with-code-btn');
const roomCodeInput = document.getElementById('room-code-input');
const startGameBtn = document.getElementById('start-game-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');

// Bidding screen elements
const bidMinusBtn = document.getElementById('bid-minus');
const bidPlusBtn = document.getElementById('bid-plus');
const bidInput = document.getElementById('bid-input');
const submitBidBtn = document.getElementById('submit-bid-btn');
const passBidBtn = document.getElementById('pass-bid-btn');

// Team selection screen elements
const confirmTeamBtn = document.getElementById('confirm-team-btn');
const trumpBtns = document.querySelectorAll('.trump-btn');

// Gameplay screen elements
const quitGameBtn = document.getElementById('quit-game-btn');
const playerHandContainer = document.getElementById('player-hand');

// ---- SCREEN NAVIGATION ----

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  
  const targetScreen = document.getElementById(screenId);
  if (targetScreen) {
    targetScreen.classList.add('active');
    console.log('Showing screen:', screenId);
  }
}

// ---- UTILITY FUNCTIONS ----

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function updateGameLobby(players) {
  const playersList = document.getElementById('players-joined');
  const playerCount = document.getElementById('player-count');
  const statusText = document.getElementById('status-text');
  const startBtn = document.getElementById('start-game-btn');
  
  playerCount.textContent = players.length;
  
  playersList.innerHTML = '';
  players.forEach(player => {
    const playerDiv = document.createElement('div');
    playerDiv.className = 'player-item ready';
    playerDiv.innerHTML = `
      <div class="player-avatar">👤</div>
      <div class="player-name">${escapeHtml(player)}</div>
    `;
    playersList.appendChild(playerDiv);
  });
  
  if (players.length >= 6) {
    startBtn.disabled = false;
    statusText.textContent = 'Ready to start!';
    statusText.style.color = 'var(--success-color)';
  } else {
    startBtn.disabled = true;
    statusText.textContent = `Waiting for players... (${players.length}/6)`;
    statusText.style.color = 'var(--accent-color)';
  }
}

// ---- BIDDING FUNCTIONS ----

function initializeBidding() {
  gameState.currentBid = 60;
  bidInput.value = gameState.currentBid;
  
  gameState.allBids = {
    'Alice': 150,
    'Bob': null,
    'Charlie': 120,
    'Diana': null,
  };
  
  updateBidsDisplay();
  console.log('Bidding initialized');
}

function updateBidsDisplay() {
  const bidsList = document.getElementById('bids-list');
  bidsList.innerHTML = '';
  
  Object.entries(gameState.allBids).forEach(([player, bid]) => {
    const bidItem = document.createElement('div');
    bidItem.className = 'bid-item';
    
    const bidAmount = bid === null ? 'Passed' : bid.toString();
    const bidColor = bid === null ? 'opacity: 0.7;' : '';
    
    bidItem.innerHTML = `
      <span class="player-name">${escapeHtml(player)}</span>
      <span class="bid-amount" style="${bidColor}">${bidAmount}</span>
    `;
    bidsList.appendChild(bidItem);
  });
}

function updateBidDisplay() {
  bidInput.value = gameState.currentBid;
}

// ---- TEAM SELECTION FUNCTIONS ----

function initializeTeamSelection(winningBid) {
  gameState.selectedCards = [];
  gameState.selectedTrump = null;
  
  document.getElementById('winning-bid').textContent = winningBid;
  renderCardSelectionGrid();
  updateTrumpDisplay();
  updateConfirmButton();
  
  console.log('Team selection initialized');
}

function renderCardSelectionGrid() {
  const container = document.getElementById('cards-to-select');
  container.innerHTML = '';
  
  allCards.forEach(card => {
    const cardEl = document.createElement('button');
    cardEl.className = 'card-selector';
    cardEl.textContent = card;
    cardEl.dataset.card = card;
    
    cardEl.addEventListener('click', () => {
      handleCardSelection(card, cardEl);
    });
    
    container.appendChild(cardEl);
  });
}

function handleCardSelection(card, element) {
  if (gameState.selectedCards.includes(card)) {
    gameState.selectedCards = gameState.selectedCards.filter(c => c !== card);
    element.classList.remove('selected');
  } else if (gameState.selectedCards.length < 2) {
    gameState.selectedCards.push(card);
    element.classList.add('selected');
  }
  
  updateCardsDisplay();
  updateConfirmButton();
}

function updateCardsDisplay() {
  const info = document.getElementById('cards-selected-info');
  info.textContent = `Selected: ${gameState.selectedCards.length}/2 cards`;
}

function handleTrumpSelection(suit, element) {
  document.querySelectorAll('.trump-btn').forEach(btn => {
    btn.classList.remove('selected');
  });
  
  if (gameState.selectedTrump !== suit) {
    gameState.selectedTrump = suit;
    element.classList.add('selected');
  } else {
    gameState.selectedTrump = null;
  }
  
  updateTrumpDisplay();
  updateConfirmButton();
}

function updateTrumpDisplay() {
  const info = document.getElementById('trump-selected-info');
  
  if (gameState.selectedTrump) {
    const symbols = {
      'Spade': '♠',
      'Heart': '♥',
      'Club': '♣',
      'Diamond': '♦'
    };
    info.textContent = `Trump: ${symbols[gameState.selectedTrump]} ${gameState.selectedTrump}`;
  } else {
    info.textContent = 'Trump: None selected';
  }
}

function updateConfirmButton() {
  const canConfirm = gameState.selectedCards.length === 2 && gameState.selectedTrump;
  confirmTeamBtn.disabled = !canConfirm;
}

// ---- GAMEPLAY FUNCTIONS ----

function initializeGameplay(trump) {
  console.log('Game started with trump:', trump);
  
  document.getElementById('trump-display').textContent = trump;
  document.getElementById('current-round').textContent = gameState.roundNumber;
  
  // Deal mock hand
  gameState.playerHand = [];
  gameState.validCards = [];
  
  for (let i = 0; i < 8; i++) {
    const randomCard = allCards[Math.floor(Math.random() * allCards.length)];
    if (!gameState.playerHand.includes(randomCard)) {
      gameState.playerHand.push(randomCard);
    }
  }
  
  gameState.validCards = gameState.playerHand.slice(0, 3);
  renderPlayerHand();
  renderCircularTable();
  
  console.log('Gameplay initialized');
}

function renderPlayerHand() {
  playerHandContainer.innerHTML = '';
  
  const validCardSet = new Set(gameState.validCards);
  
  gameState.playerHand.forEach(card => {
    const cardEl = document.createElement('button');
    cardEl.className = 'card';
    
    if (!validCardSet.has(card)) {
      cardEl.classList.add('invalid');
    }
    
    cardEl.innerHTML = `
      <span>${card}</span>
      <span>10 pts</span>
    `;
    cardEl.dataset.card = card;
    
    cardEl.addEventListener('click', () => {
      if (!cardEl.classList.contains('invalid')) {
        playCard(card);
      }
    });
    
    playerHandContainer.appendChild(cardEl);
  });
  
  document.getElementById('valid-cards-info').textContent = 
    `Cards: ${gameState.playerHand.length}`;
}

function renderCircularTable() {
  const table = document.getElementById('game-table');
  table.innerHTML = '';
  
  const playerCount = gameState.players.length;
  const radius = 180;
  const angleStep = (2 * Math.PI) / playerCount;
  
  const activePlayer = gameState.players[0];
  
  gameState.players.forEach((player, idx) => {
    const angle = angleStep * idx - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    
    const position = document.createElement('div');
    position.className = 'player-position';
    position.dataset.player = player;
    position.style.left = `calc(50% + ${x}px - 40px)`;
    position.style.top = `calc(50% + ${y}px - 50px)`;
    
    const cardClass = activePlayer === player ? 'player-card active' : 'player-card';
    const isCurrent = player === gameState.playerName ? ' current-player' : '';
    
    position.innerHTML = `
      <div class="${cardClass}${isCurrent}">
        <div class="player-name">${escapeHtml(player)}</div>
        <div class="player-score">${idx === 0 ? '1 trick' : '0 tricks'}</div>
      </div>
    `;
    
    table.appendChild(position);
  });
}

function playCard(card) {
  console.log('Card played:', card, 'by:', gameState.playerName);
  
  // Emit to backend via Socket.IO
  if (socket) {
    socket.emit('play_card', { card: card });
  }
  
  gameState.playerHand = gameState.playerHand.filter(c => c !== card);
  gameState.validCards = gameState.validCards.filter(c => c !== card);
  
  renderPlayerHand();
  alert(`You played ${card}!`);
}

// ---- ROUND RESULTS FUNCTIONS ----

function initializeRoundResults() {
  const team1Score = Math.floor(Math.random() * 150) + 80;
  const team2Score = 250 - team1Score;
  const team1Won = team1Score >= gameState.currentBid;
  
  if (Object.keys(gameState.overallScores).length === 0) {
    gameState.players.forEach(player => {
      gameState.overallScores[player] = 0;
    });
  }
  
  if (team1Won) {
    gameState.overallScores[gameState.players[0]] += team1Score;
    gameState.overallScores[gameState.players[1]] += team1Score;
  } else {
    gameState.overallScores[gameState.players[2]] += team2Score;
    gameState.overallScores[gameState.players[3]] += team2Score;
  }
  
  displayRoundResults(team1Score, team2Score, team1Won);
  console.log('Round results initialized');
}

function displayRoundResults(team1Score, team2Score, team1Won) {
  document.getElementById('result-round').textContent = gameState.roundNumber;
  
  document.getElementById('team1-score').textContent = team1Score;
  document.getElementById('team1-members').innerHTML = `
    <div class="team-member-item">
      <span class="team-member-name">${escapeHtml(gameState.players[0])}</span> (Bid Winner)
    </div>
    <div class="team-member-item">
      <span class="team-member-name">${escapeHtml(gameState.players[1])}</span>
    </div>
  `;
  
  const team1Result = document.getElementById('team1-result');
  if (team1Won) {
    team1Result.className = 'team-outcome win';
    team1Result.textContent = `✓ Won! +${team1Score} points`;
    document.querySelectorAll('.team-result')[0].classList.add('winner');
  } else {
    team1Result.className = 'team-outcome loss';
    team1Result.textContent = `✗ Failed bid`;
  }
  
  document.getElementById('team2-score').textContent = team2Score;
  document.getElementById('team2-members').innerHTML = `
    <div class="team-member-item">
      <span class="team-member-name">${escapeHtml(gameState.players[2])}</span>
    </div>
    <div class="team-member-item">
      <span class="team-member-name">${escapeHtml(gameState.players[3])}</span>
    </div>
  `;
  
  const team2Result = document.getElementById('team2-result');
  if (!team1Won) {
    team2Result.className = 'team-outcome win';
    team2Result.textContent = `✓ Won! +${team2Score} points`;
    document.querySelectorAll('.team-result')[1].classList.add('winner');
  } else {
    team2Result.className = 'team-outcome loss';
    team2Result.textContent = `✗ Defended`;
  }
  
  displayStandings();
}

function displayStandings() {
  const standingsList = document.getElementById('standings-list');
  standingsList.innerHTML = '';
  
  const sorted = Object.entries(gameState.overallScores)
    .sort((a, b) => b[1] - a[1]);
  
  sorted.forEach((entry, idx) => {
    const [player, score] = entry;
    const standingItem = document.createElement('div');
    standingItem.className = 'standing-item';
    if (idx === 0) standingItem.classList.add('top');
    
    standingItem.innerHTML = `
      <span class="standing-rank">#${idx + 1}</span>
      <span class="standing-name">${escapeHtml(player)}</span>
      <span class="standing-score">${score} pts</span>
    `;
    
    standingsList.appendChild(standingItem);
  });
}

// ---- EVENT LISTENERS: LOBBY ----

createRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  
  if (!name) {
    alert('Please enter your name');
    return;
  }
  
  gameState.playerName = name;
  gameState.roomCode = generateRoomCode();
  gameState.players = [name];
  
  // Emit to backend
  if (socket) {
    socket.emit('create_room', { player_name: name });
  }
  
  document.getElementById('room-code-display').textContent = gameState.roomCode;
  updateGameLobby(gameState.players);
  
  showScreen('lobby_wait-screen');
});

joinRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  
  if (!name) {
    alert('Please enter your name');
    return;
  }
  
  gameState.playerName = name;
  showScreen('room_select-screen');
});

backToLobbyBtn.addEventListener('click', () => {
  showScreen('lobby-screen');
});

joinWithCodeBtn.addEventListener('click', () => {
  const roomCode = roomCodeInput.value.trim().toUpperCase();
  
  if (!roomCode) {
    alert('Please enter a room code');
    return;
  }
  
  if (roomCode.length !== 6) {
    alert('Room code must be 6 characters');
    return;
  }
  
  gameState.roomCode = roomCode;
  gameState.players = [gameState.playerName, ...mockPlayers.slice(0, 4)];
  
  // Emit to backend
  if (socket) {
    socket.emit('join_room', { room_code: roomCode, player_name: gameState.playerName });
  }
  
  document.getElementById('room-code-display').textContent = gameState.roomCode;
  updateGameLobby(gameState.players);
  
  showScreen('lobby_wait-screen');
});

leaveRoomBtn.addEventListener('click', () => {
  if (socket) {
    socket.emit('leave_room', {});
  }
  gameState.roomCode = '';
  gameState.players = [];
  showScreen('lobby-screen');
});

playerNameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    createRoomBtn.click();
  }
});

roomCodeInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    joinWithCodeBtn.click();
  }
});

// ---- EVENT LISTENERS: GAME LOBBY ----

startGameBtn.addEventListener('click', () => {
  console.log('Starting game');
  if (socket) {
    socket.emit('start_game', {});
  }
  initializeBidding();
  showScreen('bidding-screen');
});

// ---- EVENT LISTENERS: BIDDING ----

bidMinusBtn.addEventListener('click', () => {
  gameState.currentBid = Math.max(30, gameState.currentBid - 5);
  updateBidDisplay();
});

bidPlusBtn.addEventListener('click', () => {
  gameState.currentBid = Math.min(250, gameState.currentBid + 5);
  updateBidDisplay();
});

submitBidBtn.addEventListener('click', () => {
  console.log('Submitting bid:', gameState.currentBid);
  if (socket) {
    socket.emit('place_bid', { amount: gameState.currentBid });
  }
  initializeTeamSelection(gameState.currentBid);
  showScreen('pick_team-screen');
});

passBidBtn.addEventListener('click', () => {
  console.log('Passing bid');
  if (socket) {
    socket.emit('pass_bid', {});
  }
  gameState.allBids[gameState.playerName] = null;
  updateBidsDisplay();
});

// ---- EVENT LISTENERS: TEAM SELECTION ----

trumpBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const suit = btn.dataset.suit;
    handleTrumpSelection(suit, btn);
  });
});

confirmTeamBtn.addEventListener('click', () => {
  console.log('Team confirmed:', {
    cards: gameState.selectedCards,
    trump: gameState.selectedTrump,
  });
  
  if (socket) {
    socket.emit('confirm_team', {
      cards: gameState.selectedCards,
      trump: gameState.selectedTrump
    });
  }
  
  initializeGameplay(gameState.selectedTrump);
  showScreen('play-screen');
});

// ---- EVENT LISTENERS: GAMEPLAY ----

quitGameBtn.addEventListener('click', () => {
  if (confirm('Are you sure you want to quit?')) {
    gameState.playerHand = [];
    initializeRoundResults();
    showScreen('round_result-screen');
  }
});

// ---- EVENT LISTENERS: ROUND RESULTS ----

const nextRoundBtn = document.getElementById('next-round-btn');
const exitGameBtn = document.getElementById('exit-game-btn');

if (nextRoundBtn) {
  nextRoundBtn.addEventListener('click', () => {
    gameState.roundNumber++;
    console.log('Starting round', gameState.roundNumber);
    
    if (socket) {
      socket.emit('next_round', {});
    }
    
    initializeBidding();
    showScreen('bidding-screen');
  });
}

if (exitGameBtn) {
  exitGameBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to exit the game?')) {
      if (socket) {
        socket.emit('quit_game', {});
      }
      gameState.roundNumber = 1;
      gameState.overallScores = {};
      showScreen('lobby-screen');
    }
  });
}

// ---- INITIALIZATION ----

// Uncomment this line to enable Socket.IO when backend is ready
// initializeSocket();

console.log('=================================');
console.log('3 OF SPADES - STEP 8: FINAL VERSION');
console.log('=================================');
console.log('Frontend ready for Socket.IO integration');
console.log('Backend events to emit:');
console.log('  - create_room');
console.log('  - join_room');
console.log('  - start_game');
console.log('  - place_bid');
console.log('  - pass_bid');
console.log('  - confirm_team');
console.log('  - play_card');
console.log('  - next_round');
console.log('  - quit_game');
console.log('  - leave_room');
console.log('=================================');