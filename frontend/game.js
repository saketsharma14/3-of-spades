/* ========================================
   3 OF SPADES - STEP 4: GAME LOGIC
   ======================================== */

// Game state
let gameState = {
  playerName: '',
  roomCode: '',
  players: [],
  currentBid: 60,
  allBids: {},
};

// Mock player data
const mockPlayers = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank'];

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

// ---- SCREEN NAVIGATION ----

/**
 * Show a specific screen and hide all others
 */
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

/**
 * Initialize bidding screen with mock bid data
 */
function initializeBidding() {
  // Reset bid
  gameState.currentBid = 60;
  bidInput.value = gameState.currentBid;
  
  // Mock other players' bids
  gameState.allBids = {
    'Alice': 150,
    'Bob': null,  // Passed
    'Charlie': 120,
    'Diana': null, // Hasn't bid yet
  };
  
  // Update bids display
  updateBidsDisplay();
  
  console.log('Bidding initialized');
}

/**
 * Update the current bids list display
 */
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

/**
 * Update bid display
 */
function updateBidDisplay() {
  bidInput.value = gameState.currentBid;
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
  
  // Initialize bidding and show bidding screen
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
  alert(`Bid of ${gameState.currentBid} submitted!`);
  // In next steps, will navigate to team selection
});

passBidBtn.addEventListener('click', () => {
  console.log('Player passed:', gameState.playerName);
  gameState.allBids[gameState.playerName] = null;
  updateBidsDisplay();
  alert('You passed the bid');
  // In next steps, will navigate to next player or end bidding
});

// Allow Enter key in bid actions
document.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && document.getElementById('bidding-screen').classList.contains('active')) {
    submitBidBtn.click();
  }
});

console.log('Game initialized - Step 4: Bidding Screen');