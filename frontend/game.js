/* ========================================
   3 OF SPADES - STEP 3: GAME LOGIC
   ======================================== */

// Game state
let gameState = {
  playerName: '',
  roomCode: '',
  players: [],
};

// Mock player data (will be replaced with real data in later steps)
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

// ---- SCREEN NAVIGATION ----

/**
 * Show a specific screen and hide all others
 * @param {string} screenId - The ID of the screen to show
 */
function showScreen(screenId) {
  // Hide all screens
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  
  // Show target screen
  const targetScreen = document.getElementById(screenId);
  if (targetScreen) {
    targetScreen.classList.add('active');
    console.log('Showing screen:', screenId);
  }
}

// ---- GAME LOBBY FUNCTIONS ----

/**
 * Generate a random room code
 * @returns {string} 6-character room code
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Update the game lobby display
 * @param {Array} players - List of player names
 */
function updateGameLobby(players) {
  const playersList = document.getElementById('players-joined');
  const playerCount = document.getElementById('player-count');
  const statusText = document.getElementById('status-text');
  const startBtn = document.getElementById('start-game-btn');
  
  // Update player count
  playerCount.textContent = players.length;
  
  // Clear and repopulate players
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
  
  // Enable/disable start button and update status
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

// ---- EVENT LISTENERS ----

// Create Room button - navigate to game lobby
createRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  
  if (!name) {
    alert('Please enter your name');
    return;
  }
  
  gameState.playerName = name;
  gameState.roomCode = generateRoomCode();
  gameState.players = [name]; // Add current player
  
  console.log('Created room:', gameState.roomCode, 'as:', gameState.playerName);
  
  // Display room code
  document.getElementById('room-code-display').textContent = gameState.roomCode;
  
  // Update lobby with players
  updateGameLobby(gameState.players);
  
  // Show game lobby
  showScreen('lobby_wait-screen');
});

// Join Room button - navigate to room selection
joinRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  
  if (!name) {
    alert('Please enter your name');
    return;
  }
  
  gameState.playerName = name;
  console.log('Navigating to room selection as:', gameState.playerName);
  showScreen('room_select-screen');
});

// Back to Lobby button
backToLobbyBtn.addEventListener('click', () => {
  console.log('Returning to lobby');
  showScreen('lobby-screen');
});

// Join with Room Code button
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
  
  // Simulate joining a room with some players
  gameState.players = [gameState.playerName, ...mockPlayers.slice(0, 4)];
  
  console.log('Joined room:', roomCode, 'as:', gameState.playerName);
  console.log('Current players:', gameState.players);
  
  // Display room code
  document.getElementById('room-code-display').textContent = gameState.roomCode;
  
  // Update lobby with players
  updateGameLobby(gameState.players);
  
  // Show game lobby
  showScreen('lobby_wait-screen');
});

// Start Game button
startGameBtn.addEventListener('click', () => {
  console.log('Starting game with players:', gameState.players);
  alert('Game starting with ' + gameState.players.length + ' players!');
  // In next steps, this will navigate to Bidding screen
});

// Leave Room button
leaveRoomBtn.addEventListener('click', () => {
  console.log('Leaving room:', gameState.roomCode);
  gameState.roomCode = '';
  gameState.players = [];
  showScreen('lobby-screen');
});

// Allow Enter key in player name input
playerNameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    createRoomBtn.click();
  }
});

// Allow Enter key in room code input
roomCodeInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    joinWithCodeBtn.click();
  }
});

console.log('Game initialized - Step 3: Game Lobby');