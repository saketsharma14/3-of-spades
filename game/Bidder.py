def BidderBot(players):
    highest_bid = 0
    highest_bidder = ""
    while True:
        print("Who wants to bid? Enter -1 to close bid")
        for i in range(len(players)):
            print(f"{i} : {players[i]} ")
            
        # Input Validation
        while True:
            try:
                p = int(input("Chose a player / Close the bid : "))
                if p == -1:
                    return (highest_bid, highest_bidder)
                if 0 <= p < len(players):
                    break
                print(f"Please enter a number between 0 and {len(players)-1}, or -1 to close.")
            except ValueError:
                print("Invalid input, enter a number.")
        
        print(f"Highest Bid : {highest_bid}")
        
        # Validate bid amount
        while True:
            try:
                bid = int(input(f"How much does {players[p]} want to bid ? : "))
                if highest_bid < bid <= 250:
                    break
                elif bid <= highest_bid:
                    print(f"Bid must be higher than current highest bid ({highest_bid}).")
                elif bid > 250:
                    print("Bid cannot exceed 250.")
            except ValueError:
                print("Invalid input, enter a number.")

        highest_bid = bid
        highest_bidder = players[p]
        if highest_bid == 250:
            print(f"{highest_bidder} bid 250! Bidding closed.")
            return (highest_bid, highest_bidder)
