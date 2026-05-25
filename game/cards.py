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
    
    
two_clubs = Card("Club", 2)
three_clubs = Card("Club", 3)
four_clubs = Card("Club", 4)
five_clubs = Card("Club", 5)
six_clubs = Card("Club", 6)
seven_clubs = Card("Club", 7)
eight_clubs = Card("Club", 8)
nine_clubs = Card("Club", 9)
ten_clubs = Card("Club", 10)
jack_clubs = Card("Club", 11)
queen_clubs = Card("Club", 12)
king_clubs = Card("Club", 13)
ace_clubs = Card("Club", 14)

two_spades = Card("Spade", 2)
three_spades = Card("Spade", 3)
four_spades = Card("Spade", 4)
five_spades = Card("Spade", 5)
six_spades = Card("Spade", 6)
seven_spades = Card("Spade", 7)
eight_spades = Card("Spade", 8)
nine_spades = Card("Spade", 9)
ten_spades = Card("Spade", 10)
jack_spades = Card("Spade", 11)
queen_spades = Card("Spade", 12)
king_spades = Card("Spade", 13)
ace_spades = Card("Spade", 14)

two_hearts = Card("Heart", 2)
three_hearts = Card("Heart", 3)
four_hearts = Card("Heart", 4)
five_hearts = Card("Heart", 5)
six_hearts = Card("Heart", 6)
seven_hearts = Card("Heart", 7)
eight_hearts = Card("Heart", 8)
nine_hearts = Card("Heart", 9)
ten_hearts = Card("Heart", 10)
jack_hearts = Card("Heart", 11)
queen_hearts = Card("Heart", 12)
king_hearts = Card("Heart", 13)
ace_hearts = Card("Heart", 14)

two_diamonds = Card("Diamond", 2)
three_diamonds = Card("Diamond", 3)
four_diamonds = Card("Diamond", 4)
five_diamonds = Card("Diamond", 5)
six_diamonds = Card("Diamond", 6)
seven_diamonds = Card("Diamond", 7)
eight_diamonds = Card("Diamond", 8)
nine_diamonds = Card("Diamond", 9)
ten_diamonds = Card("Diamond", 10)
jack_diamonds = Card("Diamond", 11)
queen_diamonds = Card("Diamond", 12)
king_diamonds = Card("Diamond", 13)
ace_diamonds = Card("Diamond", 14)

#Removing the 2's
deck = [
    three_clubs, four_clubs, five_clubs, six_clubs, seven_clubs,
    eight_clubs, nine_clubs, ten_clubs, jack_clubs, queen_clubs, king_clubs, ace_clubs,

    three_spades, four_spades, five_spades, six_spades, seven_spades,
    eight_spades, nine_spades, ten_spades, jack_spades, queen_spades, king_spades, ace_spades,

    three_hearts, four_hearts, five_hearts, six_hearts, seven_hearts,
    eight_hearts, nine_hearts, ten_hearts, jack_hearts, queen_hearts, king_hearts, ace_hearts,

    three_diamonds, four_diamonds, five_diamonds, six_diamonds, seven_diamonds,
    eight_diamonds, nine_diamonds, ten_diamonds, jack_diamonds, queen_diamonds, king_diamonds, ace_diamonds
]
