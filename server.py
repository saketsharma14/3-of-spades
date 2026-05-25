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
            broadcast_state(room)
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
            broadcast_state(room)
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
    success, error = room.pass_bid(name)
    if not success:
        return emit_error(error)
    broadcast_state(room)

@socketio.on("close_bidding")
def on_close_bidding():
    room = get_room_or_error()
    if not room:
        return
    name = room.sid_to_name.get(request.sid)
    if name != room.highest_bidder:
        return emit_error("Only the highest bidder can close bidding.")
    success, error = room.close_bidding()
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
    if room.phase == GameState.PHASE_ROUND_END:
        socketio.emit("round_end", room.round_result(), to=room.room_code)
    broadcast_state(room)

# ─── NEXT ROUND ──────────────────────────────────────────────────────────────

@socketio.on("next_round")
def on_next_round():
    room = get_room_or_error()
    if not room:
        return
    if room.phase != GameState.PHASE_ROUND_END:
        return emit_error("Round is not over yet.")
    room.start_round()
    broadcast_state(room)

# ─── RUN ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    socketio.run(app, debug=True, host="0.0.0.0", port=5000)