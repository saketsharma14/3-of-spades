/* ========================================
   3 OF SPADES - STEP 5: GAME LOGIC
   ======================================== */

// Game state
let gameState = {
  playerName: '',
  roomCode: '',
  players: [],
  currentBid: 60,
  allBids: {},
  selectedCards: [],
  selectedTrump: null,
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
      <div class="player-name">${player}</div>
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
      <span class="player-name">${player}</span>
      <span class="bid-amount" style="${bidColor}">${bidAmount}</span>
    `;
    bidsList.appendChild(bidItem);
  });
}

function updateBidDisplay() {
  bidInput.value = gameState.currentBid;
}

// ---- TEAM SELECTION FUNCTIONS ----

/**
 * Initialize team selection with available cards
 */
function initializeTeamSelection(winningBid) {
  // Reset selections
  gameState.selectedCards = [];
  gameState.selectedTrump = null;
  
  // Display winning bid
  document.getElementById('winning-bid').textContent = winningBid;
  
  // Populate cards grid
  renderCardSelectionGrid();
  
  // Reset trump buttons
  updateTrumpDisplay();
  updateConfirmButton();
  
  console.log('Team selection initialized');
}

/**
 * Render all available cards in selection grid
 */
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

/**
 * Handle card selection (max 2 cards)
 */
function handleCardSelection(card, element) {
  if (gameState.selectedCards.includes(card)) {
    // Deselect
    gameState.selectedCards = gameState.selectedCards.filter(c => c !== card);
    element.classList.remove('selected');
  } else if (gameState.selectedCards.length < 2) {
    // Select (max 2)
    gameState.selectedCards.push(card);
    element.classList.add('selected');
  }
  
  updateCardsDisplay();
  updateConfirmButton();
}

/**
 * Update cards selected info
 */
function updateCardsDisplay() {
  const info = document.getElementById('cards-selected-info');
  info.textContent = `Selected: ${gameState.selectedCards.length}/2 cards`;
}

/**
 * Handle trump suit selection
 */
function handleTrumpSelection(suit, element) {
  // Deselect all
  document.querySelectorAll('.trump-btn').forEach(btn => {
    btn.classList.remove('selected');
  });
  
  // Select this one
  if (gameState.selectedTrump !== suit) {
    gameState.selectedTrump = suit;
    element.classList.add('selected');
  } else {
    gameState.selectedTrump = null;
  }
  
  updateTrumpDisplay();
  updateConfirmButton();
}

/**
 * Update trump selection display
 */
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

/**
 * Update confirm button state
 */
function updateConfirmButton() {
  const canConfirm = gameState.selectedCards.length === 2 && gameState.selectedTrump;
  confirmTeamBtn.disabled = !canConfirm;
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
  
  document.getElementById('room-code-display').textContent = gameState.roomCode;
  updateGameLobby(gameState.players);
  
  showScreen('lobby_wait-screen');
});

leaveRoomBtn.addEventListener('click', () => {
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
  console.log('Starting game with players:', gameState.players);
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
  console.log('Bid submitted:', gameState.currentBid, 'by:', gameState.playerName);
  // Initialize team selection and show screen
  initializeTeamSelection(gameState.currentBid);
  showScreen('pick_team-screen');
});

passBidBtn.addEventListener('click', () => {
  console.log('Player passed:', gameState.playerName);
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
  alert(`Team confirmed!\nCards: ${gameState.selectedCards.join(', ')}\nTrump: ${gameState.selectedTrump}`);
  // In next steps, will navigate to gameplay screen
});

console.log('Game initialized - Step 5: Team Selection');