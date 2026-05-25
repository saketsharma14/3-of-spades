/* ========================================
   3 OF SPADES - STEP 1: BASIC GAME LOGIC
   ======================================== */

// Simple state object
let gameState = {
  playerName: '',
};

// ---- DOM ELEMENTS ----
const playerNameInput = document.getElementById('player-name');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');

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
  alert(`Welcome, ${name}! Room creation would happen here.`);
});

// Join Room button
joinRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  
  if (!name) {
    alert('Please enter your name');
    return;
  }
  
  gameState.playerName = name;
  console.log('Joining room as:', gameState.playerName);
  alert(`Welcome, ${name}! Room selection would happen here.`);
});

// Allow Enter key to submit
playerNameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    createRoomBtn.click();
  }
});

console.log('Game initialized - Step 1: Basic Lobby');