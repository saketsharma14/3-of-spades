import os
import game.cards as cards
import random
import game.Bidder as Bidder
print("---------------------------------------")
print("|                                     |")
print("|             3 of Spades             |")
print("|                                     |")
print("---------------------------------------")

# Setting up the game
player_count = int(input("How many people are playing? (6 or 8) : "))
while player_count != 6 and player_count != 8:  
    player_count = int(input("Invalid. How many people are playing? (6 or 8) : "))          
players = []
for i in range(player_count) :
    players.append(input(f"Enter Player {i} 's IGN : "))
    
# Dealing the cards
FullDeck = cards.deck
random.shuffle(FullDeck)
def deal(deck, num_players):
    return [deck[i::num_players] for i in range(num_players)]
hands = deal(FullDeck, player_count)

#Displaying the cards
for i in range(player_count) : 
    os.system('cls' if os.name == 'nt' else 'clear')
    print(f"{players[i]}'s cards : ")
    print(f"{hands[i]}")
    next_hand = input()
os.system('cls' if os.name == 'nt' else 'clear')

    
# Bidding 
highest_bid, highest_bidder = Bidder.BidderBot(players)    
team1 = [highest_bidder]
team2 = []

# Choosing teammates
bidder_index = players.index(highest_bidder)
bidder_hand = hands[bidder_index]

print(f"\n{highest_bidder}, you won the bid with {highest_bid}!")

teammates_needed = (player_count // 2) - 1
chosen_cards = []
print(f"\nYour cards (for reference):")
for card in bidder_hand:
    print(f"  {card}")
print()
print(f"\nPick {teammates_needed} card(s) to reveal your teammate(s).")
print("Format: 'K of Hearts', '3 of Spades', '9 of Clubs' etc.\n")

suit_aliases = {
    "clubs": "Club", "club": "Club",
    "spades": "Spade", "spade": "Spade",
    "hearts": "Heart", "heart": "Heart",
    "diamonds": "Diamond", "diamond": "Diamond"
}
number_aliases = {
    "j": 11, "jack": 11,
    "q": 12, "queen": 12,
    "k": 13, "king": 13,
    "a": 14, "ace": 14
}

def parse_card(entry):
    parts = entry.strip().lower().split(" of ")
    if len(parts) != 2:
        return None
    num_str, suit_str = parts[0].strip(), parts[1].strip()
    suit = suit_aliases.get(suit_str)
    if not suit:
        return None
    if num_str in number_aliases:
        number = number_aliases[num_str]
    elif num_str.isdigit() and 3 <= int(num_str) <= 14:
        number = int(num_str)
    else:
        return None
    return (suit, number)

for t in range(teammates_needed):
    while True:
        entry = input(f"Pick card {t+1}: ")
        parsed = parse_card(entry)
        if not parsed:
            print("Invalid format. Try: 'K of Hearts' or '9 of Clubs'")
            continue
        suit, number = parsed
        match = next((c for c in cards.deck if c.suit == suit and c.number == number), None)
        if not match:
            print("Card not found in deck, try again.")
            continue
        if match in chosen_cards:
            print("You already picked that card.")
            continue
        chosen_cards.append(match)
        print(f"  ✓ {match} selected.")
        break

team1 = [highest_bidder]
team2 = []

for i, player in enumerate(players):
    if player == highest_bidder:
        continue
    for card in chosen_cards:
        if card in hands[i]:
            team1.append(player)
            break

team2 = [p for p in players if p not in team1]

print(f"\nTeam 1 (Bidder's team): {team1}  → Target: {highest_bid} pts")
print(f"Team 2 (Opposing team): {team2}  → Target: {250 - highest_bid} pts")

if highest_bidder in team1:
    bidwinner = "Team 1"
    team1target = highest_bid
    team2target = 250 - highest_bid
else:
    bidwinner = "Team 2"
    team2target = highest_bid
    team1target = 250 - highest_bid


# Declare trump suit
valid_suits = ["Spade", "Heart", "Diamond", "Club"]
suit_input_aliases = {
    "spade": "Spade", "spades": "Spade",
    "heart": "Heart", "hearts": "Heart",
    "diamond": "Diamond", "diamonds": "Diamond",
    "club": "Club", "clubs": "Club"
}

print(f"\n{highest_bidder}, declare your trump suit.")
print("Options: Spade, Heart, Diamond, Club")

while True:
    trump_input = input("Trump suit: ").strip().lower()
    trump_suit = suit_input_aliases.get(trump_input)
    if trump_suit:
        print(f"\nTrump suit is: {trump_suit}s!")
        break
    print("Invalid suit. Choose from: Spade, Heart, Diamond, Club")


# ─── GAMEPLAY ───────────────────────────────────────────────────────────────

def get_trick_winner(trick, led_suit, trump_suit):
    # trick = list of (player_name, card)
    winning_play = trick[0]
    for play in trick[1:]:
        player, card = play
        w_player, w_card = winning_play

        w_is_trump = w_card.suit == trump_suit
        c_is_trump = card.suit == trump_suit
        w_is_led   = w_card.suit == led_suit
        c_is_led   = card.suit == led_suit

        if c_is_trump and not w_is_trump:
            winning_play = play                        # trump beats non-trump
        elif c_is_trump and w_is_trump:
            if card.number > w_card.number:
                winning_play = play                    # higher trump wins
        elif not w_is_trump:
            if c_is_led and not w_is_led:
                winning_play = play                    # led suit beats off-suit
            elif c_is_led and w_is_led:
                if card.number > w_card.number:
                    winning_play = play                # higher led suit wins
    return winning_play[0]  # return winner's name


def play_card(player_name, hand, led_suit, trump_suit, trick):
    os.system('cls' if os.name == 'nt' else 'clear')
    print(f"\n─── Current Trick ───")
    if trick:
        for p, c in trick:
            print(f"  {p:15} → {c}")
    else:
        print("  (No cards played yet)")
    print()

    print(f"\n{player_name}'s turn!")

    # Filter cards that follow led suit
    if led_suit:
        valid_cards = [c for c in hand if c.suit == led_suit]
        if not valid_cards:
            valid_cards = hand   # can't follow suit, play anything
            print(f"  (You have no {led_suit}s, play any card)")
        else:
            print(f"  (You must follow suit: {led_suit}s)")
    else:
        valid_cards = hand       # first card of trick, play anything

    print(f"\nYour hand:")
    for i, card in enumerate(hand):
        tag = "  " if card in valid_cards else "✗ "
        print(f"  {tag}{i} : {card}")

    while True:
        try:
            pick = int(input(f"\nPlay a card (enter number): "))
            if 0 <= pick < len(hand) and hand[pick] in valid_cards:
                chosen = hand.pop(pick)
                return chosen
            elif 0 <= pick < len(hand) and hand[pick] not in valid_cards:
                print(f"  You must follow suit ({led_suit}s). Pick a valid card.")
            else:
                print("  Invalid index.")
        except ValueError:
            print("  Enter a number.")


# ─── MAIN GAME LOOP ──────────────────────────────────────────────────────────

team1_points = 0
team2_points = 0
current_leader = highest_bidder   # bidder leads first trick
total_tricks = 48 // player_count

print(f"\n\n{'='*40}")
print(f"  Game Start! {player_count} players, {total_tricks} tricks.")
print(f"  Trump suit : {trump_suit}s")
print(f"  {highest_bidder} leads the first trick.")
print(f"{'='*40}\n")
input("Press Enter to begin...")

for trick_num in range(total_tricks):
    os.system('cls' if os.name == 'nt' else 'clear')
    print(f"\n─── Trick {trick_num + 1} of {total_tricks} ───")
    print(f"  Trump: {trump_suit}s  |  Leader: {current_leader}")
    print(f"  Team 1 pts: {team1_points}  |  Team 2 pts: {team2_points}\n")

    trick        = []   # list of (player_name, card)
    led_suit     = None
    player_order = []

    # Build turn order starting from current leader
    leader_index = players.index(current_leader)
    for j in range(player_count):
        player_order.append(players[(leader_index + j) % player_count])

    for player_name in player_order:
        p_index = players.index(player_name)
        card = play_card(player_name, hands[p_index], led_suit, trump_suit, trick)
        if led_suit is None:
            led_suit = card.suit   # first card sets the led suit
        trick.append((player_name, card))
        print(f"  → {player_name} played {card}")
        input("  Press Enter for next player...")

    # Determine trick winner
    winner = get_trick_winner(trick, led_suit, trump_suit)
    trick_points = sum(card.points for _, card in trick)

    if winner in team1:
        team1_points += trick_points
    else:
        team2_points += trick_points

    os.system('cls' if os.name == 'nt' else 'clear')
    print(f"\n─── Trick {trick_num + 1} Result ───")
    for player_name, card in trick:
        print(f"  {player_name:15} → {card}")
    print(f"\n  🏆 {winner} wins the trick! (+{trick_points} pts)")
    print(f"  Team 1: {team1_points} pts  |  Team 2: {team2_points} pts")
    current_leader = winner
    input("\nPress Enter for next trick...")

# ─── ROUND RESULT ────────────────────────────────────────────────────────────

os.system('cls' if os.name == 'nt' else 'clear')
print(f"\n{'='*40}")
print(f"  Round Over!")
print(f"  Team 1 ({', '.join(team1)}): {team1_points} pts  (Target: {team1target})")
print(f"  Team 2 ({', '.join(team2)}): {team2_points} pts  (Target: {team2target})")
print(f"{'='*40}")

if team1_points >= team1target:
    print(f"\n  🎉 Team 1 wins the round!")
else:
    print(f"\n  🎉 Team 2 wins the round!")
