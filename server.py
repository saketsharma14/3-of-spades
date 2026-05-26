from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
from game_state import RoomManager, GameState

app = Flask(__name__)
app.config["SECRET_KEY"] = "threeofspadeskey"
socketio = SocketIO(app, cors_allowed_origins="*")

manager = RoomManager()

# ─── HELPERS ─────────────────────────────────────────────────────────────────

def broadcast_state(room):
    """Send public state to all players in a room, private state individually."""
    public = room.public_state()
    socketio.emit("state_update", public, to=room.room_code)
    for name, sid in room.player_sids.items():
        socketio.emit("private_update", room.private_state(name), to=sid)

def emit_error(message):
    emit("error", {"message": message})

def get_room_or_error():
    """Get the room the current socket is in, or emit error and return None."""
    room = manager.get_room_by_sid(request.sid)
    if not room:
        emit_error("You are not in a room.")
    return room

def emit_game_over(room):
    socketio.emit("game_over", {
        "winners":    room.winners,
        "scores":     room.scores,
        "end_reason": getattr(room, "end_reason", None),
    }, to=room.room_code)

def process_auto_plays(room):
    """If the current turn belongs to a player who left the table, play their
    lowest-value valid card for them and keep going until either a present
    player's turn comes up or the round finishes. Handles the 5s trick reveal
    pause in the same way as a normal play."""
    safety = 50  # max plays in one call (one round can have up to 48 cards)
    while safety > 0 and room.phase == GameState.PHASE_PLAYING:
        # If a trick just completed, do the 5s reveal then commit
        if room.pending_trick_winner:
            broadcast_state(room)
            socketio.sleep(5)
            room.commit_pending_trick()
            if room.phase == GameState.PHASE_ROUND_END:
                socketio.emit("round_end", room.round_result(), to=room.room_code)
            if room.game_over:
                emit_game_over(room)
                broadcast_state(room)
                return
            broadcast_state(room)
            continue

        next_turn = room.whose_turn()
        if not next_turn or next_turn not in room.left_players:
            return  # nothing to auto-play
        ok, _ = room.auto_play_for_leaver(next_turn)
        if not ok:
            return
        broadcast_state(room)
        socketio.sleep(0.8)  # short delay so each auto-play is visible
        safety -= 1

# ─── PAGE ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")

# ─── CONNECTION ──────────────────────────────────────────────────────────────

@socketio.on("connect")
def on_connect():
    print(f"Connected: {request.sid}")

@socketio.on("disconnect")
def on_disconnect():
    room, name = manager.remove_player(request.sid)
    if room and name:
        leave_room(room.room_code)
        socketio.emit("player_left", {"name": name, "new_owner": room.owner}, to=room.room_code)
        if not room.is_empty():
            if room.game_over:
                emit_game_over(room)
            broadcast_state(room)
            # If they left mid-PLAYING, keep the round moving by auto-playing
            # whatever turns now belong to absent players.
            if room.phase == GameState.PHASE_PLAYING:
                process_auto_plays(room)
    print(f"Disconnected: {request.sid}")

# ─── ROOM MANAGEMENT ─────────────────────────────────────────────────────────

@socketio.on("create_room")
def on_create_room(data):
    """data: { name: string }"""
    name = data.get("name", "").strip()
    if not name:
        return emit_error("Please enter a name.")

    code, error = manager.create_room(name, request.sid)
    if error:
        return emit_error(error)

    join_room(code)     # subscribe this socket to the room's SocketIO channel
    room = manager.get_room_by_sid(request.sid)

    emit("room_created", {"room_code": code, "name": name})
    broadcast_state(room)

@socketio.on("join_room_game")
def on_join_room(data):
    """data: { name: string, code: string }"""
    name = data.get("name", "").strip()
    code = data.get("code", "").strip().upper()

    if not name:
        return emit_error("Please enter a name.")
    if not code:
        return emit_error("Please enter a room code.")

    room, error = manager.join_room(code, name, request.sid)
    if error:
        return emit_error(error)

    join_room(code)     # subscribe to room's SocketIO channel

    emit("room_joined", {"room_code": code, "name": name})
    socketio.emit("player_joined", {"name": name}, to=code)
    broadcast_state(room)

@socketio.on("get_rooms")
def on_get_rooms():
    """Send list of open rooms to the requesting client."""
    emit("rooms_list", {"rooms": manager.list_rooms()})

@socketio.on("leave_room_game")
def on_leave_room():
    room, name = manager.remove_player(request.sid)
    if room and name:
        leave_room(room.room_code)
        socketio.emit("player_left", {"name": name, "new_owner": room.owner}, to=room.room_code)
        if not room.is_empty():
            if room.game_over:
                emit_game_over(room)
            broadcast_state(room)
            if room.phase == GameState.PHASE_PLAYING:
                process_auto_plays(room)
    emit("left_room", {})

# ─── GAME START ──────────────────────────────────────────────────────────────

@socketio.on("start_game")
def on_start():
    room = get_room_or_error()
    if not room:
        return
    name = room.sid_to_name.get(request.sid)
    if name != room.owner:
        return emit_error("Only the room owner can start the game.")
    if not room.can_start():
        return emit_error(f"Need 6 or 8 players. Currently {len(room.players)}.")
    room.start_round()
    broadcast_state(room)

# ─── BIDDING ─────────────────────────────────────────────────────────────────

@socketio.on("place_bid")
def on_bid(data):
    """data: { amount: int }"""
    room = get_room_or_error()
    if not room:
        return
    name = room.sid_to_name.get(request.sid)
    try:
        amount = int(data.get("amount", 0))
    except (ValueError, TypeError):
        return emit_error("Invalid bid amount.")
    success, error = room.place_bid(name, amount)
    if not success:
        return emit_error(error)
    broadcast_state(room)

@socketio.on("pass_bid")
def on_pass():
    room = get_room_or_error()
    if not room:
        return
    name = room.sid_to_name.get(request.sid)
    success, info = room.pass_bid(name)
    if not success:
        return emit_error(info)

    # If everyone passed without bidding, end the round (no scoring)
    # and show the round-result screen so the host can start the next round.
    if info == "all_passed":
        result = room.round_result()
        socketio.emit("round_end", result, to=room.room_code)

    broadcast_state(room)

@socketio.on("close_bidding")
def on_close_bidding():
    """LEGACY: kept for compat. New flow uses request_close_bidding."""
    room = get_room_or_error()
    if not room:
        return
    name = room.sid_to_name.get(request.sid)
    if name != room.highest_bidder:
        return emit_error("Only the highest bidder can close bidding.")
    success, error = room.request_close_bidding(name)
    if not success:
        return emit_error(error)
    broadcast_state(room)

# NEW: bidder requests close; everyone else gets a prompt
@socketio.on("request_close_bidding")
def on_request_close():
    room = get_room_or_error()
    if not room:
        return
    name = room.sid_to_name.get(request.sid)
    success, error = room.request_close_bidding(name)
    if not success:
        return emit_error(error)
    broadcast_state(room)

# NEW: a player responds to the close request by passing
@socketio.on("respond_close_request")
def on_respond_close(data):
    """data: { action: 'pass' }   — counter-bids go through place_bid"""
    room = get_room_or_error()
    if not room:
        return
    name = room.sid_to_name.get(request.sid)
    success, error = room.respond_to_close_request(name, data.get("action", "pass"))
    if not success:
        return emit_error(error)
    broadcast_state(room)

# ─── TEAM SELECTION ──────────────────────────────────────────────────────────

@socketio.on("pick_teammate_card")
def on_pick_card(data):
    """data: { card: "K of Hearts" }"""
    room = get_room_or_error()
    if not room:
        return
    name = room.sid_to_name.get(request.sid)
    if name != room.highest_bidder:
        return emit_error("Only the bid winner can pick teammate cards.")
    success, error = room.pick_teammate_card(data.get("card", ""))
    if not success:
        return emit_error(error)
    broadcast_state(room)

# ─── TRUMP ───────────────────────────────────────────────────────────────────

@socketio.on("declare_trump")
def on_trump(data):
    """data: { suit: "Hearts" }"""
    room = get_room_or_error()
    if not room:
        return
    name = room.sid_to_name.get(request.sid)
    if name != room.highest_bidder:
        return emit_error("Only the bid winner can declare trump.")
    success, error = room.declare_trump(data.get("suit", ""))
    if not success:
        return emit_error(error)
    broadcast_state(room)

# ─── PLAYING ─────────────────────────────────────────────────────────────────

@socketio.on("play_card")
def on_play_card(data):
    """data: { card: "K of Hearts" }"""
    room = get_room_or_error()
    if not room:
        return
    name = room.sid_to_name.get(request.sid)
    success, error = room.play_card(name, data.get("card", ""))
    if not success:
        return emit_error(error)

    # If this play completed the trick, show the full trick + winner for 5s
    # so everyone can see what just happened, THEN commit and advance.
    if room.pending_trick_winner:
        broadcast_state(room)            # everyone sees full trick + winner
        socketio.sleep(5)                # pause so players can see
        room.commit_pending_trick()      # award points, clear, advance

    if room.phase == GameState.PHASE_ROUND_END:
        socketio.emit("round_end", room.round_result(), to=room.room_code)
    # If that round ended the game, emit game_over
    if room.game_over:
        emit_game_over(room)
    broadcast_state(room)

    # If the next turn now belongs to a player who left, auto-play through
    # them until a present player's turn comes up or the round ends.
    if room.phase == GameState.PHASE_PLAYING and room.left_players:
        process_auto_plays(room)

# ─── NEXT ROUND ──────────────────────────────────────────────────────────────

@socketio.on("next_round")
def on_next_round():
    room = get_room_or_error()
    if not room:
        return
    name = room.sid_to_name.get(request.sid)
    if name != room.owner:
        return emit_error("Only the host can start the next round.")
    if room.phase != GameState.PHASE_ROUND_END:
        return emit_error("Round is not over yet.")
    if room.game_over:
        return emit_error("The game is over.")
    # Extra safety — refuse if player count isn't 6 or 8 anymore
    if not room.can_start():
        return emit_error("Can't continue: need 6 or 8 players.")
    room.start_round()
    broadcast_state(room)

# ─── RETURN TO LOBBY (host only, after game over) ────────────────────────────

@socketio.on("return_to_lobby")
def on_return_to_lobby():
    room = get_room_or_error()
    if not room:
        return
    name = room.sid_to_name.get(request.sid)
    success, error = room.reset_to_lobby(name)
    if not success:
        return emit_error(error)
    broadcast_state(room)

# ─── RUN ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    socketio.run(app, debug=True, host="0.0.0.0", port=5000)