/* ========================================
   3 OF SPADES - STEP 2: GAME LOGIC
   ======================================== */

// Game state
let gameState = {
  playerName: '',
};

// ---- DOM ELEMENTS ----
const playerNameInput = document.getElementById('player-name');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const backToLobbyBtn = document.getElementById('back-to-lobby');
const joinWithCodeBtn = document.getElementById('join-with-code-btn');
const roomCodeInput = document.getElementById('room-code-input');

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

// ---- EVENT LISTENERS ----

// Create Room button
createRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  
  if (!name) {
    alert('Please enter your name');
    return;
  }
  
  gameState.playerName = name;
  console.log('Creating room for:', gameState.playerName);
  alert(`Welcome, ${name}! You created a room.`);
  // In next steps, this will navigate to Game Lobby
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
  
  console.log('Joining room:', roomCode, 'as:', gameState.playerName);
  alert(`Joining room ${roomCode}...`);
  // In next steps, this will navigate to Game Lobby
});

// Allow Enter key in room code input
roomCodeInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    joinWithCodeBtn.click();
  }
});

// Allow Enter key in player name input
playerNameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    createRoomBtn.click();
  }
});

console.log('Game initialized - Step 2: Screen Navigation');