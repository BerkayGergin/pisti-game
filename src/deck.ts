import { Card, Suit, Rank } from "./types";

const SUITS: Suit[] = ["SPADES", "HEARTS", "DIAMONDS", "CLUBS"];
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${suit}_${rank}`, suit, rank });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealCards(deck: Card[], playerCount: number, cardsPerPlayer: number = 4) {
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  const remainingDeck = [...deck];

  for (let i = 0; i < cardsPerPlayer; i++) {
    for (let p = 0; p < playerCount; p++) {
      const card = remainingDeck.pop();
      if (card) hands[p].push(card);
    }
  }

  return { hands, remainingDeck };
}