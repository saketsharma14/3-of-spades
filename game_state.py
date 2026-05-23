import random

#CARD CLASS same as cards.py but added JSON tag
class Card:
    def __init__(self, suit, number):
        self.suit = suit
        self.number = number
        self.color = "Black" if suit == "Club" or suit == "Spade" else "Red"
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
        """Serialize card to JSON-safe dict for sending over SocketIO"""
        return {
            "suit":   self.suit,
            "number": self.number,
            "points": self.points,
            "color":  self.color,
            "display": str(self)
        }


# ─── DECK BUILDER ────────────────────────────────────────────────────────────

def build_deck():
    suits   = ["Club", "Spade", "Heart", "Diamond"]
    numbers = range(3, 15) 
    return [Card(suit, number) for suit in suits for number in numbers]


# ─── GAME STATE ──────────────────────────────────────────────────────────────

class GameState:
    # ── phases ──────────────────────────────────────────────────────────────
    PHASE_LOBBY        = "lobby"
    PHASE_BIDDING      = "bidding"
    PHASE_PICK_TEAM    = "pick_team"
    PHASE_TRUMP        = "trump"
    PHASE_PLAYING      = "playing"
    PHASE_ROUND_END    = "round_end"
    PHASE_GAME_END     = "game_end"

    def __init__(self):
        self.players        = []        # list of player names (in join order)
        self.player_sids    = {}        # name → socket id
        self.sid_to_name    = {}        # socket id → name
        self.player_count   = 0

        # Per-round state
        self.hands          = {}        # name → [Card, ...]
        self.highest_bid    = 0
        self.highest_bidder = None
        self.has_bid        = set()     # players who have passed/bid this round
        self.bidding_closed = False

        self.chosen_cards   = []        # cards picked to reveal teammates (Card objects)
        self.team1          = []        # bidder's team
        self.team2          = []        # opposing team
        self.trump_suit     = None

        # Trick state
        self.current_trick  = []        # list of {"player": name, "card": Card}
        self.led_suit       = None
        self.current_leader = None
        self.trick_number   = 0
        self.total_tricks   = 0

        # Scores
        self.team1_points   = 0
        self.team2_points   = 0
        self.scores         = {}        # name → total score across rounds
        self.round_number   = 0

        self.phase          = self.PHASE_LOBBY

    # ── lobby ────────────────────────────────────────────────────────────────

    def add_player(self, name, sid):
        """Returns (success, error_message)"""
        if name in self.players:
            return False, "Name already taken."
        if len(self.players) >= 8:
            return False, "Game is full."
        if self.phase != self.PHASE_LOBBY:
            return False, "Game already started."
        self.players.append(name)
        self.player_sids[name] = sid
        self.sid_to_name[sid]  = name
        self.scores[name]      = 0
        return True, None

    def remove_player(self, sid):
        name = self.sid_to_name.pop(sid, None)
        if name:
            self.players.remove(name)
            self.player_sids.pop(name, None)
            self.scores.pop(name, None)

    def can_start(self):
        return len(self.players) in (6, 8)

    # ── round setup ─────────────────────────────────────────────────────────

    def start_round(self):
        self.round_number  += 1
        self.player_count   = len(self.players)
        self.highest_bid    = 0
        self.highest_bidder = None
        self.has_bid        = set()
        self.bidding_closed = False
        self.chosen_cards   = []
        self.team1          = []
        self.team2          = []
        self.trump_suit     = None
        self.current_trick  = []
        self.led_suit       = None
        self.trick_number   = 0
        self.total_tricks   = 48 // self.player_count
        self.team1_points   = 0
        self.team2_points   = 0

        deck = build_deck()
        random.shuffle(deck)
        self.hands = {
            self.players[i]: deck[i::self.player_count]
            for i in range(self.player_count)
        }
        self.phase = self.PHASE_BIDDING

    # ── bidding ──────────────────────────────────────────────────────────────

    def place_bid(self, name, amount):
        """Returns (success, error_message)"""
        if self.phase != self.PHASE_BIDDING:
            return False, "Not in bidding phase."
        if name in self.has_bid:
            return False, "You have already bid or passed this round."
        if amount <= self.highest_bid:
            return False, f"Bid must be higher than current highest ({self.highest_bid})."
        if amount > 250:
            return False, "Bid cannot exceed 250."
        self.highest_bid    = amount
        self.highest_bidder = name
        self.has_bid.add(name)
        if amount == 250:
            self.bidding_closed = True
            self._finalize_bid()
            return True, None
        return True, None

    def pass_bid(self, name):
        """Player passes their turn to bid"""
        if self.phase != self.PHASE_BIDDING:
            return False, "Not in bidding phase."
        self.has_bid.add(name)
        # If everyone has bid or passed, close bidding
        if len(self.has_bid) == self.player_count:
            self.bidding_closed = True
            self._finalize_bid()
        return True, None

    def close_bidding(self):
        """Manually close bidding (host action)"""
        if not self.highest_bidder:
            return False, "No one has bid yet."
        self.bidding_closed = True
        self._finalize_bid()
        return True, None

    def _finalize_bid(self):
        self.phase          = self.PHASE_PICK_TEAM
        self.current_leader = self.highest_bidder

    # ── team selection ───────────────────────────────────────────────────────

    def teammates_needed(self):
        return (self.player_count // 2) - 1

    def pick_teammate_card(self, card_str):
        """
        Bidder picks a card by display string e.g. 'K of Hearts'.
        Returns (success, error_message)
        """
        if self.phase != self.PHASE_PICK_TEAM:
            return False, "Not in team selection phase."
        if len(self.chosen_cards) >= self.teammates_needed():
            return False, "Already picked enough cards."

        # Find the card in the full deck
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
        self.team2 = []
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
        """Returns (success, error_message)"""
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
        """Returns name of player whose turn it is in the current trick"""
        played = {entry["player"] for entry in self.current_trick}
        leader_index = self.players.index(self.current_leader)
        for i in range(self.player_count):
            name = self.players[(leader_index + i) % self.player_count]
            if name not in played:
                return name
        return None     # all played

    def get_valid_cards(self, name):
        """Returns list of cards the player is allowed to play"""
        hand = self.hands[name]
        if self.led_suit:
            suited = [c for c in hand if c.suit == self.led_suit]
            return suited if suited else hand
        return hand

    def play_card(self, name, card_display):
        """
        Player plays a card identified by its display string.
        Returns (success, error_message)
        """
        if self.phase != self.PHASE_PLAYING:
            return False, "Not in playing phase."
        if self.whose_turn() != name:
            return False, "Not your turn."

        hand  = self.hands[name]
        card  = next((c for c in hand if str(c) == card_display), None)
        if not card:
            return False, "Card not in your hand."

        valid = self.get_valid_cards(name)
        if card not in valid:
            return False, f"You must follow suit ({self.led_suit}s)."

        hand.remove(card)
        if self.led_suit is None:
            self.led_suit = card.suit
        self.current_trick.append({"player": name, "card": card})

        # All players have played
        if len(self.current_trick) == self.player_count:
            self._resolve_trick()

        return True, None

    def _resolve_trick(self):
        winner      = self._get_trick_winner()
        trick_pts   = sum(e["card"].points for e in self.current_trick)

        if winner in self.team1:
            self.team1_points += trick_pts
        else:
            self.team2_points += trick_pts

        self.trick_number  += 1
        self.current_leader = winner
        self.current_trick  = []
        self.led_suit       = None

        if self.trick_number == self.total_tricks:
            self._end_round()

    def _get_trick_winner(self):
        winning = self.current_trick[0]
        for entry in self.current_trick[1:]:
            card   = entry["card"]
            w_card = winning["card"]
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
        self.phase     = self.PHASE_ROUND_END
        team1_target   = self.highest_bid
        team2_target   = 250 - self.highest_bid

        if self.team1_points >= team1_target:
            # Bidder's team wins: each member gets their points
            for p in self.team1:
                self.scores[p] += self.team1_points
        else:
            # Bidder's team fails: opposing team gets the bid amount
            for p in self.team2:
                self.scores[p] += self.highest_bid

    def round_result(self):
        return {
            "team1":        self.team1,
            "team2":        self.team2,
            "team1_points": self.team1_points,
            "team2_points": self.team2_points,
            "team1_target": self.highest_bid,
            "team2_target": 250 - self.highest_bid,
            "winner":       "team1" if self.team1_points >= self.highest_bid else "team2",
            "scores":       self.scores.copy()
        }

    # ── serialization (for sending state to clients) ─────────────────────────

    def public_state(self):
        """State visible to ALL players"""
        return {
            "phase":          self.phase,
            "players":        self.players,
            "player_count":   self.player_count,
            "round_number":   self.round_number,
            "highest_bid":    self.highest_bid,
            "highest_bidder": self.highest_bidder,
            "has_bid":        list(self.has_bid),
            "team1":          self.team1,
            "team2":          self.team2,
            "trump_suit":     self.trump_suit,
            "current_trick":  [
                {"player": e["player"], "card": e["card"].to_dict()}
                for e in self.current_trick
            ],
            "led_suit":       self.led_suit,
            "whose_turn":     self.whose_turn(),
            "trick_number":   self.trick_number,
            "total_tricks":   self.total_tricks,
            "team1_points":   self.team1_points,
            "team2_points":   self.team2_points,
            "scores":         self.scores,
            "chosen_cards":   [c.to_dict() for c in self.chosen_cards],
            "teammates_needed": self.teammates_needed() if self.phase == self.PHASE_PICK_TEAM else 0,
        }

    def private_state(self, name):
        """State only for a specific player (their hand + valid cards)"""
        if name not in self.hands:
            return {"hand": [], "valid_cards": []}
        hand  = self.hands[name]
        valid = self.get_valid_cards(name) if self.phase == self.PHASE_PLAYING else hand
        return {
            "hand":        [c.to_dict() for c in hand],
            "valid_cards": [str(c) for c in valid],
            "is_my_turn":  self.whose_turn() == name,
            "in_team1":    name in self.team1,
        }
