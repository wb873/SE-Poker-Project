// Mock data used to build the UI before the backend exists

export const mock_lobbies = [
  { id: "l1", name: "Chill Table", host: "chrism", players: 3, max_players: 7, ante: 10, bots: true, is_private: false, region: "US East" },
  { id: "l2", name: "High Stakes Table", host: "pokerbeast", players: 7, max_players: 7, ante: 15000, bots: false, is_private: false, region: "US East" },
  { id: "l3", name: "Beginners Welcome", host: "will_b", players: 2, max_players: 5, ante: 5, bots: true, is_private: false, region: "US West" },
  { id: "l4", name: "Friday Night", host: "jason", players: 4, max_players: 6, ante: 100, bots: false, is_private: true, region: "Europe" },
  { id: "l5", name: "Quick Hands", host: "mrpoker", players: 1, max_players: 4, ante: 50, bots: true, is_private: false, region: "US East" },
];

export const mock_friends = [
  { id: "f1", username: "Jason", status: "in_game", detail: "Chill Table" },
  { id: "f2", username: "pokerbeast", status: "in_game", detail: "High Stakes" },
  { id: "f3", username: "bro", status: "online", detail: "Main Menu" },
  { id: "f4", username: "mrpoker", status: "offline", detail: "" },
  { id: "f5", username: "ace_of_spades", status: "offline", detail: "" },
];

export const mock_stats = {
  user_since: "September 16th, 2014",
  hands_played: 12000,
  hands_won: 50,
  win_rate: "<1%",
  total_winnings: -500000,
  biggest_win: 20,
  best_hand: "High Card",
  times_folded: 11950,
  side_bet_winnings: -2000,
};

export const mock_leaderboard = [
  { rank: 1, username: "pokerbeast", balance: 4820000, hands_won: 912 },
  { rank: 2, username: "chrism", balance: 2210500, hands_won: 640 },
  { rank: 3, username: "will_b", balance: 1750000, hands_won: 588 },
  { rank: 4, username: "Jason", balance: 930250, hands_won: 301 },
  { rank: 5, username: "bro", balance: 410000, hands_won: 188 },
];

// Sample hand and dealer cards for the game table mock
export const mock_hand = [
  { rank: "K", suit: "♠" },
  { rank: "K", suit: "♦" },
  { rank: "9", suit: "♣" },
  { rank: "5", suit: "♥" },
  { rank: "2", suit: "♠" },
];

export const mock_dealer_up_card = { rank: "A", suit: "♥" };

export const avatar_options = ["🂡", "♠", "♥", "♦", "♣", "🎲", "👑", "🃏"];
