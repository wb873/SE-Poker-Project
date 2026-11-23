import { calculateHandOdds } from "./hand_odds.mjs";

self.onmessage = ({ data }) => {
  self.postMessage(calculateHandOdds(data.playerHand, data.dealerUpCard));
};
