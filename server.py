from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
from game_state import GameState

app = Flask(__name__)
app.config["SECRET_KEY"] = "threeofspadeskey"
socketio = SocketIO(app, cors_allowed_origins="*")

game = GameState()

# ─── HELPERS ─────────────────────────────────────────────────────────────────

def broadcast_state():
    """Send public state to all players, private state to each individually"""
    public = game.public_state()
    socketio.emit("state_update", public)
    for name, sid in game.player_sids.items():
        private = game.private_state(name)
        socketio.emit("private_update", private, to=sid)

def emit_error(message):
    emit("error", {"message": message})

# ─── PAGE ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")

# ─── CONNECTION ──────────────────────────────────────────────────────────────

@socketio.on("connect")
def on_connect():
    print(f"Client connected: {request.sid}")

@socketio.on("disconnect")
def on_disconnect():
    name = game.sid_to_name.get(request.sid)
    if name:
        game.remove_player(request.sid)
        socketio.emit("player_left", {"name": name})
        broadcast_state()
    print(f"Client disconnected: {request.sid}")

# ─── LOBBY ───────────────────────────────────────────────────────────────────

@socketio.on("join_game")
def on_join(data):
    """data: { name: string }"""
    name = data.get("name", "").strip()
    if not name:
        return emit_error("Please enter a name.")

    success, error = game.add_player(name, request.sid)
    if not success:
        return emit_error(error)

    emit("joined", {"name": name})
    socketio.emit("player_joined", {"name": name, "players": game.players})
    broadcast_state()

@socketio.on("start_game")
def on_start():
    """Any player can start when 6 or 8 are in the lobby"""
    if not game.can_start():
        return emit_error(f"Need 6 or 8 players. Currently {len(game.players)}.")
    game.start_round()
    broadcast_state()

# ─── BIDDING ─────────────────────────────────────────────────────────────────

@socketio.on("place_bid")
def on_bid(data):
    """data: { amount: int }"""
    name = game.sid_to_name.get(request.sid)
    if not name:
        return emit_error("You are not in the game.")

    try:
        amount = int(data.get("amount", 0))
    except (ValueError, TypeError):
        return emit_error("Invalid bid amount.")

    success, error = game.place_bid(name, amount)
    if not success:
        return emit_error(error)

    broadcast_state()

@socketio.on("pass_bid")
def on_pass():
    name = game.sid_to_name.get(request.sid)
    if not name:
        return emit_error("You are not in the game.")

    success, error = game.pass_bid(name)
    if not success:
        return emit_error(error)

    broadcast_state()

@socketio.on("close_bidding")
def on_close_bidding():
    name = game.sid_to_name.get(request.sid)
    if name != game.highest_bidder:
        return emit_error("Only the current highest bidder can close bidding.")

    success, error = game.close_bidding()
    if not success:
        return emit_error(error)

    broadcast_state()

# ─── TEAM SELECTION ──────────────────────────────────────────────────────────

@socketio.on("pick_teammate_card")
def on_pick_card(data):
    """data: { card: "K of Hearts" }"""
    name = game.sid_to_name.get(request.sid)
    if name != game.highest_bidder:
        return emit_error("Only the bid winner can pick teammate cards.")

    card_str = data.get("card", "")
    success, error = game.pick_teammate_card(card_str)
    if not success:
        return emit_error(error)

    broadcast_state()

# ─── TRUMP ───────────────────────────────────────────────────────────────────

@socketio.on("declare_trump")
def on_trump(data):
    """data: { suit: "Hearts" }"""
    name = game.sid_to_name.get(request.sid)
    if name != game.highest_bidder:
        return emit_error("Only the bid winner can declare trump.")

    suit = data.get("suit", "")
    success, error = game.declare_trump(suit)
    if not success:
        return emit_error(error)

    broadcast_state()

# ─── PLAYING ─────────────────────────────────────────────────────────────────

@socketio.on("play_card")
def on_play_card(data):
    """data: { card: "K of Hearts" }"""
    name = game.sid_to_name.get(request.sid)
    if not name:
        return emit_error("You are not in the game.")

    card_str = data.get("card", "")
    success, error = game.play_card(name, card_str)
    if not success:
        return emit_error(error)

    # If trick just finished, broadcast trick result before next trick
    if game.phase == GameState.PHASE_ROUND_END:
        result = game.round_result()
        socketio.emit("round_end", result)

    broadcast_state()

# ─── NEXT ROUND ──────────────────────────────────────────────────────────────

@socketio.on("next_round")
def on_next_round():
    if game.phase != GameState.PHASE_ROUND_END:
        return emit_error("Round is not over yet.")
    game.start_round()
    broadcast_state()

# ─── RUN ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    socketio.run(app, debug=True, host="0.0.0.0", port=5000)