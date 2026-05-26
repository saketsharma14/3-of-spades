import random
import string

# ─── CARD CLASS ──────────────────────────────────────────────────────────────

class Card:
    def __init__(self, suit, number):
        self.suit = suit
        self.number = number
        self.color = "Black" if suit in ("Club", "Spade") else "Red"
        if self.number == 3 and self.suit == "Spade":
            self.points = 30
        elif self.number == 5:
            self.points = 5
        elif self.number >= 10:
            self.points = 10
        else:
            self.points = 0

    def __str__(self):
        names = {11: "J", 12: "Q", 13: "K", 14: "A"}
        num = names.get(self.number, str(self.number))
        return f"{num} of {self.suit}s"

    def __repr__(self):
        return self.__str__()

    def to_dict(self):
        return {
            "suit":    self.suit,
            "number":  self.number,
            "points":  self.points,
            "color":   self.color,
            "display": str(self)
        }


# ─── DECK BUILDER ────────────────────────────────────────────────────────────

def build_deck():
    suits   = ["Club", "Spade", "Heart", "Diamond"]
    numbers = range(3, 15)
    return [Card(suit, number) for suit in suits for number in numbers]


# ─── GAME STATE (one per room) ───────────────────────────────────────────────

class GameState:
    PHASE_LOBBY     = "lobby"
    PHASE_BIDDING   = "bidding"
    PHASE_PICK_TEAM = "pick_team"
    PHASE_TRUMP     = "trump"
    PHASE_PLAYING   = "playing"
    PHASE_ROUND_END = "round_end"
    PHASE_GAME_OVER = "game_over"   # NEW

    def __init__(self, room_code, owner_name, owner_sid):
        self.room_code      = room_code
        self.owner          = owner_name

        self.players        = [owner_name]
        self.player_sids    = {owner_name: owner_sid}
        self.sid_to_name    = {owner_sid: owner_name}
        self.player_count   = 0

        self.hands          = {}
        self.highest_bid    = 0
        self.highest_bidder = None
        self.has_bid        = set()   # players who placed at least one bid
        self.has_passed     = set()   # players who explicitly passed
        self.bidding_closed = False
        self.all_passed_round = False
        self.chosen_cards   = []
        self.team1          = []
        self.team2          = []
        self.trump_suit     = None

        self.current_trick  = []
        self.led_suit       = None
        self.current_leader = None
        self.trick_number   = 0
        self.total_tricks   = 0

        self.team1_points   = 0
        self.team2_points   = 0
        self.scores         = {owner_name: 0}
        self.round_number   = 0

        # Trick winner history + pending-resolve state for 5s reveal pause
        self.trick_history       = []
        self.pending_trick_winner = None

        # Mid-round leaver handling: if someone leaves while cards are being
        # played, we mark them here, auto-play their remaining turns, and
        # end the game cleanly when the round finishes.
        self.left_players          = set()
        self.end_game_after_round  = False

        # Game-over tracking (used when a player leaves and forces a stop)
        self.game_over      = False
        self.winners        = []   # list (1+ names if tie)

        # NEW: close-bidding request system (anti-exploit)
        # When the bidder requests close, other active bidders must each
        # confirm (pass or counter-bid) before the auction actually closes.
        self.close_request_active = False
        self.close_request_responses = set()   # players who have responded

        self.phase          = self.PHASE_LOBBY

    # ── lobby ────────────────────────────────────────────────────────────────

    def add_player(self, name, sid):
        if name in self.players:
            return False, "Name already taken."
        if len(self.players) >= 8:
            return False, "Room is full (max 8 players)."
        if self.phase != self.PHASE_LOBBY:
            return False, "Game already started."
        self.players.append(name)
        self.player_sids[name] = sid
        self.sid_to_name[sid]  = name
        self.scores[name]      = 0
        return True, None

    def remove_player(self, sid):
        name = self.sid_to_name.pop(sid, None)
        if not name:
            return None
        self.player_sids.pop(name, None)

        if self.phase == self.PHASE_LOBBY:
            if name in self.players:
                self.players.remove(name)
            self.scores.pop(name, None)
            if name == self.owner and self.players:
                self.owner = self.players[0]
            return name

        # If we're already in game_over, just clean up.
        if self.phase == self.PHASE_GAME_OVER:
            if name in self.players:
                self.players.remove(name)
            self.hands.pop(name, None)
            self.scores.pop(name, None)
            if name == self.owner and self.players:
                self.owner = self.players[0]
            return name

        # NEW: if they leave during the PLAYING phase, don't end the game
        # right away. Mark them as "left" (their seat stays so trick counts
        # still work), flip end_game_after_round, and let the server auto-play
        # their remaining turns. When the round finishes naturally, the game
        # ends and shows the final leaderboard.
        if self.phase == self.PHASE_PLAYING:
            self.left_players.add(name)
            self.end_game_after_round = True
            self.end_reason = f"{name} left the room"
            # Hand off ownership if the host left so the round-end screen
            # still has a valid owner (game_over has no "Next Round" anyway).
            if name == self.owner:
                remaining = [p for p in self.players if p not in self.left_players]
                if remaining:
                    self.owner = remaining[0]
            return name

        # Other mid-game phases (BIDDING / PICK_TEAM / TRUMP) can't continue
        # with a missing player — no cards have been played, no "round" to
        # finish — so end the game immediately.
        if name in self.players:
            self.players.remove(name)
        self.hands.pop(name, None)
        self.scores.pop(name, None)
        if name == self.owner and self.players:
            self.owner = self.players[0]
        self.end_reason = f"{name} left the room"
        self._finalize_game()
        return name

    def can_start(self):
        return len(self.players) in (6, 8)

    def _finalize_game(self):
        """Pick the winner(s) and switch to game_over phase."""
        if not self.scores:
            self.winners = []
        else:
            top = max(self.scores.values())
            self.winners = [p for p, s in self.scores.items() if s == top]
        self.game_over = True
        self.phase     = self.PHASE_GAME_OVER

    def reset_to_lobby(self, requester):
        """Host returns to lobby after a game ends; preserves players and target."""
        if requester != self.owner:
            return False, "Only the room owner can return to lobby."
        if self.phase != self.PHASE_GAME_OVER:
            return False, "Game is not over yet."
        # Wipe round/game state but keep players
        self.player_count   = 0
        self.hands          = {}
        self.highest_bid    = 0
        self.highest_bidder = None
        self.has_bid        = set()
        self.has_passed     = set()
        self.bidding_closed = False
        self.all_passed_round = False
        self.chosen_cards   = []
        self.team1          = []
        self.team2          = []
        self.trump_suit     = None
        self.current_trick  = []
        self.led_suit       = None
        self.current_leader = None
        self.trick_number   = 0
        self.total_tricks   = 0
        self.team1_points   = 0
        self.team2_points   = 0
        # Trick winner history + pending-resolve state for 5s reveal pause
        self.trick_history       = []   # list of {"trick_number", "winner", "points"}
        self.pending_trick_winner = None
        self.scores         = {p: 0 for p in self.players}
        self.round_number   = 0
        self.game_over      = False
        self.winners        = []
        self.close_request_active   = False
        self.close_request_responses = set()
        self.phase          = self.PHASE_LOBBY
        return True, None

    def is_empty(self):
        return len(self.players) == 0

    # ── round setup ──────────────────────────────────────────────────────────

    def start_round(self):
        self.round_number  += 1
        self.player_count   = len(self.players)
        self.highest_bid    = 0
        self.highest_bidder = None
        self.has_bid        = set()
        self.has_passed     = set()
        self.bidding_closed = False
        self.all_passed_round = False
        self.chosen_cards   = []
        self.team1          = []
        self.team2          = []
        self.trump_suit     = None
        self.current_trick  = []
        self.led_suit       = None
        self.current_leader = None
        self.trick_number   = 0
        self.total_tricks   = 48 // self.player_count
        self.team1_points   = 0
        self.team2_points   = 0
        self.trick_history       = []
        self.pending_trick_winner = None
        self.left_players          = set()
        self.end_game_after_round  = False

        deck = build_deck()
        random.shuffle(deck)
        self.hands = {
            self.players[i]: deck[i::self.player_count]
            for i in range(self.player_count)
        }
        self.phase = self.PHASE_BIDDING

    # ── bidding ──────────────────────────────────────────────────────────────

    def place_bid(self, name, amount):
        if self.phase != self.PHASE_BIDDING:
            return False, "Not in bidding phase."
        if amount <= self.highest_bid:
            return False, f"Bid must be higher than current highest ({self.highest_bid})."
        if amount > 250:
            return False, "Bid cannot exceed 250."
        self.highest_bid    = amount
        self.highest_bidder = name
        self.has_bid.add(name)
        # If they previously passed, un-pass them since they're bidding again
        self.has_passed.discard(name)
        # NEW: any active close request is cancelled by a counter-bid
        self.close_request_active    = False
        self.close_request_responses = set()
        if amount == 250:
            self.bidding_closed = True
            self._finalize_bid()
        return True, None

    def pass_bid(self, name):
        if self.phase != self.PHASE_BIDDING:
            return False, "Not in bidding phase."
        if name == self.highest_bidder:
            return False, "You are the highest bidder — close bidding instead."
        if name in self.has_passed:
            return False, "You already passed."
        self.has_passed.add(name)

        # If EVERY player has passed and no one bid, end the round (no scoring)
        if not self.highest_bidder and all(p in self.has_passed for p in self.players):
            self.all_passed_round = True
            self.phase            = self.PHASE_ROUND_END
            return True, "all_passed"

        # Auto-close if everyone except the highest bidder has passed
        others = [p for p in self.players if p != self.highest_bidder]
        if all(p in self.has_passed for p in others) and self.highest_bidder:
            self.bidding_closed = True
            self._finalize_bid()
        return True, None

    def close_bidding(self):
        """OLD direct close — kept for emergency. Use request_close_bidding instead."""
        if not self.highest_bidder:
            return False, "No one has bid yet."
        self.bidding_closed = True
        self._finalize_bid()
        return True, None

    # NEW: request-based close to prevent the bidder from unilaterally
    # closing the auction at a low price.
    def request_close_bidding(self, name):
        """
        Bidder asks to close. All other active (non-passed) players must
        respond by passing or counter-bidding. If anyone counter-bids, the
        request is cancelled. If everyone passes, the auction closes.
        """
        if self.phase != self.PHASE_BIDDING:
            return False, "Not in bidding phase."
        if name != self.highest_bidder:
            return False, "Only the highest bidder can request to close."
        if self.close_request_active:
            return False, "A close request is already active."

        # Pre-compute "active responders" = everyone except the bidder and
        # anyone who already passed. If there are no active responders, just
        # close immediately — there's no one to ask.
        active = [
            p for p in self.players
            if p != self.highest_bidder and p not in self.has_passed
        ]
        if not active:
            self.bidding_closed = True
            self._finalize_bid()
            return True, None

        self.close_request_active    = True
        self.close_request_responses = set()
        return True, None

    def respond_to_close_request(self, name, action):
        """
        action: "pass" or "stay" (stay = "I haven't bid yet but I won't pass
        either"). Counter-bids go through place_bid which cancels the request.
        """
        if not self.close_request_active:
            return False, "No close request is active."
        if name == self.highest_bidder:
            return False, "The bidder doesn't respond to their own request."
        if name in self.has_passed:
            return False, "You already passed earlier — no response needed."

        if action == "pass":
            self.has_passed.add(name)
            self.close_request_responses.add(name)
        else:
            return False, f"Unknown action '{action}'."

        # If every non-passed, non-bidder player has now passed → close.
        remaining = [
            p for p in self.players
            if p != self.highest_bidder and p not in self.has_passed
        ]
        if not remaining:
            self.bidding_closed       = True
            self.close_request_active = False
            self._finalize_bid()
        return True, None

    def _finalize_bid(self):
        self.phase          = self.PHASE_PICK_TEAM
        self.current_leader = self.highest_bidder

    # ── team selection ───────────────────────────────────────────────────────

    def teammates_needed(self):
        pc = self.player_count or len(self.players)
        return (pc // 2) - 1

    def pick_teammate_card(self, card_str):
        if self.phase != self.PHASE_PICK_TEAM:
            return False, "Not in team selection phase."
        if len(self.chosen_cards) >= self.teammates_needed():
            return False, "Already picked enough cards."
        match = None
        for hand in self.hands.values():
            for card in hand:
                if str(card).lower() == card_str.strip().lower():
                    match = card
                    break
            if match:
                break
        if not match:
            return False, f"Card '{card_str}' not found."
        if match in self.chosen_cards:
            return False, "Card already chosen."
        self.chosen_cards.append(match)
        if len(self.chosen_cards) == self.teammates_needed():
            self._finalize_teams()
        return True, None

    def _finalize_teams(self):
        self.team1 = [self.highest_bidder]
        for player in self.players:
            if player == self.highest_bidder:
                continue
            for card in self.chosen_cards:
                if card in self.hands[player]:
                    self.team1.append(player)
                    break
        self.team2 = [p for p in self.players if p not in self.team1]
        self.phase = self.PHASE_TRUMP

    # ── trump ────────────────────────────────────────────────────────────────

    SUIT_ALIASES = {
        "spade": "Spade", "spades": "Spade",
        "heart": "Heart", "hearts": "Heart",
        "diamond": "Diamond", "diamonds": "Diamond",
        "club": "Club", "clubs": "Club"
    }

    def declare_trump(self, suit_input):
        if self.phase != self.PHASE_TRUMP:
            return False, "Not in trump declaration phase."
        suit = self.SUIT_ALIASES.get(suit_input.strip().lower())
        if not suit:
            return False, "Invalid suit. Choose: Spade, Heart, Diamond, Club."
        self.trump_suit = suit
        self.phase      = self.PHASE_PLAYING
        return True, None

    # ── trick playing ────────────────────────────────────────────────────────

    def whose_turn(self):
        if not self.current_leader or self.current_leader not in self.players:
            return self.players[0] if self.players else None
        played       = {entry["player"] for entry in self.current_trick}
        leader_index = self.players.index(self.current_leader)
        for i in range(len(self.players)):   # use len(players) not player_count
            name = self.players[(leader_index + i) % len(self.players)]
            if name not in played:
                return name
        return None

    def get_valid_cards(self, name):
        hand = self.hands.get(name, [])
        if self.led_suit:
            suited = [c for c in hand if c.suit == self.led_suit]
            return suited if suited else hand
        return hand

    def play_card(self, name, card_display):
        if self.phase != self.PHASE_PLAYING:
            return False, "Not in playing phase."
        if self.whose_turn() != name:
            return False, "Not your turn."
        hand = self.hands.get(name, [])
        card = next((c for c in hand if str(c) == card_display), None)
        if not card:
            return False, "Card not in your hand."
        valid = self.get_valid_cards(name)
        if card not in valid:
            return False, f"You must follow suit ({self.led_suit}s)."
        hand.remove(card)
        if self.led_suit is None:
            self.led_suit = card.suit
        self.current_trick.append({"player": name, "card": card})
        # When the last card lands, compute the winner immediately so the
        # frontend can highlight them, but DO NOT clear the trick or advance
        # yet. The server will call commit_pending_trick() after a 5s pause.
        if len(self.current_trick) == len(self.players):
            self.pending_trick_winner = self._get_trick_winner()
        return True, None

    def commit_pending_trick(self):
        """Finalize the trick that's currently being shown. Awards points,
        records history, clears the table, advances to the next trick — and
        ends the round if this was the last trick."""
        if not self.pending_trick_winner:
            return
        winner    = self.pending_trick_winner
        trick_pts = sum(e["card"].points for e in self.current_trick)
        if winner in self.team1:
            self.team1_points += trick_pts
        else:
            self.team2_points += trick_pts
        self.trick_history.append({
            "trick_number": self.trick_number + 1,
            "winner":       winner,
            "points":       trick_pts,
        })
        self.trick_number  += 1
        self.current_leader = winner
        self.current_trick  = []
        self.led_suit       = None
        self.pending_trick_winner = None
        if self.trick_number == self.total_tricks:
            self._end_round()

    def auto_play_for_leaver(self, name):
        """Play the lowest-value valid card from a left player's hand.
        Used by the server to keep the round moving when a player has left."""
        if self.phase != self.PHASE_PLAYING:
            return False, "Not in playing phase."
        if self.whose_turn() != name:
            return False, "Not their turn."
        valid = self.get_valid_cards(name)
        if not valid:
            return False, "No valid cards."
        # Lowest-points then lowest-rank — basic "dump junk" bot strategy
        card = min(valid, key=lambda c: (c.points, c.number))
        return self.play_card(name, str(card))

    def _get_trick_winner(self):
        winning = self.current_trick[0]
        for entry in self.current_trick[1:]:
            card    = entry["card"]
            w_card  = winning["card"]
            w_trump = w_card.suit == self.trump_suit
            c_trump = card.suit   == self.trump_suit
            w_led   = w_card.suit == self.led_suit
            c_led   = card.suit   == self.led_suit
            if c_trump and not w_trump:
                winning = entry
            elif c_trump and w_trump:
                if card.number > w_card.number:
                    winning = entry
            elif not w_trump:
                if c_led and not w_led:
                    winning = entry
                elif c_led and w_led:
                    if card.number > w_card.number:
                        winning = entry
        return winning["player"]

    # ── round end ────────────────────────────────────────────────────────────

    def _end_round(self):
        self.phase = self.PHASE_ROUND_END
        if self.team1_points >= self.highest_bid:
            for p in self.team1:
                self.scores[p] += self.team1_points
        else:
            for p in self.team2:
                self.scores[p] += self.highest_bid

        # If someone left mid-round, finish the game here instead of waiting
        # for the host to click "Next Round".
        if self.end_game_after_round:
            self._finalize_game()

    def round_result(self):
        if self.all_passed_round:
            return {
                "all_passed":   True,
                "team1":        [],
                "team2":        [],
                "team1_points": 0,
                "team2_points": 0,
                "team1_target": 0,
                "team2_target": 0,
                "winner":       None,
                "scores":       self.scores.copy(),
                "message":      "Everyone passed. No round played — scores unchanged."
            }
        return {
            "all_passed":   False,
            "team1":        self.team1,
            "team2":        self.team2,
            "team1_points": self.team1_points,
            "team2_points": self.team2_points,
            "team1_target": self.highest_bid,
            "team2_target": 250 - self.highest_bid,
            "winner":       "team1" if self.team1_points >= self.highest_bid else "team2",
            "scores":       self.scores.copy()
        }

    # ── serialization ────────────────────────────────────────────────────────

    def public_state(self):
        return {
            "phase":            self.phase,
            "room_code":        self.room_code,
            "owner":            self.owner,
            "players":          self.players,
            "player_count":     self.player_count,
            "round_number":     self.round_number,
            "highest_bid":      self.highest_bid,
            "highest_bidder":   self.highest_bidder,
            "has_bid":          list(self.has_bid),
            "has_passed":       list(self.has_passed),
            "team1":            self.team1,
            "team2":            self.team2,
            "trump_suit":       self.trump_suit,
            "current_trick":    [
                {"player": e["player"], "card": e["card"].to_dict()}
                for e in self.current_trick
            ],
            "led_suit":         self.led_suit,
            "whose_turn":       self.whose_turn(),
            "trick_number":     self.trick_number,
            "total_tricks":     self.total_tricks,
            "team1_points":     self.team1_points,
            "team2_points":     self.team2_points,
            "trick_history":         self.trick_history,
            "pending_trick_winner":  self.pending_trick_winner,
            "left_players":          list(self.left_players),
            "end_game_after_round":  self.end_game_after_round,
            "scores":           self.scores,
            "chosen_cards":     [c.to_dict() for c in self.chosen_cards],
            "teammates_needed": self.teammates_needed() if self.phase == self.PHASE_PICK_TEAM else 0,
            "bidding_closed":   self.bidding_closed,
            # Game-ending and close-bidding state
            "game_over":        self.game_over,
            "winners":          self.winners,
            "end_reason":       getattr(self, "end_reason", None),
            "close_request_active":    self.close_request_active,
            "close_request_responses": list(self.close_request_responses),
        }

    def private_state(self, name):
        if name not in self.hands:
            return {"hand": [], "valid_cards": [], "is_my_turn": False, "in_team1": False, "is_teammate": False, "am_i_bidder": False}
        hand  = self.hands[name]
        valid = self.get_valid_cards(name) if self.phase == self.PHASE_PLAYING else hand

        # Live "am I a teammate of the bidder?" check.
        # IMPORTANT: once teams are finalized (phase >= trump), use the
        # stable team1 list. If we re-derived this from chosen_cards every
        # time, a teammate who PLAYS one of their chosen cards would suddenly
        # appear as a chaser, because the card is no longer in their hand.
        am_i_bidder = (name == self.highest_bidder)
        is_teammate = False
        if am_i_bidder:
            is_teammate = True
        elif self.team1:
            # Teams are finalized — use the canonical list.
            is_teammate = name in self.team1
        elif self.chosen_cards:
            # Still in pick_team phase — derive from chosen_cards (best we can do).
            hand_set = {str(c) for c in hand}
            is_teammate = any(str(c) in hand_set for c in self.chosen_cards)

        return {
            "hand":         [c.to_dict() for c in hand],
            "valid_cards":  [str(c) for c in valid],
            "is_my_turn":   self.whose_turn() == name,
            "in_team1":     name in self.team1,
            # NEW: per-player visibility during pick_team / trump / playing
            "is_teammate":  is_teammate,
            "am_i_bidder":  am_i_bidder,
        }


# ─── ROOM MANAGER ────────────────────────────────────────────────────────────

class RoomManager:
    def __init__(self):
        self.rooms       = {}
        self.sid_to_room = {}

    def _generate_code(self):
        chars = string.ascii_uppercase + string.digits
        while True:
            code = ''.join(random.choices(chars, k=6))
            if code not in self.rooms:
                return code

    def create_room(self, owner_name, owner_sid):
        if owner_sid in self.sid_to_room:
            return None, "You are already in a room."
        code = self._generate_code()
        self.rooms[code]            = GameState(code, owner_name, owner_sid)
        self.sid_to_room[owner_sid] = code
        return code, None

    def join_room(self, code, name, sid):
        if sid in self.sid_to_room:
            return None, "You are already in a room."
        code = code.upper().strip()
        room = self.rooms.get(code)
        if not room:
            return None, f"Room '{code}' not found."
        success, error = room.add_player(name, sid)
        if not success:
            return None, error
        self.sid_to_room[sid] = code
        return room, None

    def get_room_by_sid(self, sid):
        code = self.sid_to_room.get(sid)
        return self.rooms.get(code) if code else None

    def remove_player(self, sid):
        code = self.sid_to_room.pop(sid, None)
        if not code:
            return None, None
        room = self.rooms.get(code)
        if not room:
            return None, None
        name = room.remove_player(sid)
        if room.is_empty():
            del self.rooms[code]
        return room, name

    def list_rooms(self):
        return [
            {
                "code":         code,
                "owner":        room.owner,
                "player_count": len(room.players),
                "phase":        room.phase,
            }
            for code, room in self.rooms.items()
        ]