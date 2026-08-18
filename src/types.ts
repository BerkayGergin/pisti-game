export type Suit = "SPADES" | "HEARTS" | "DIAMONDS" | "CLUBS";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export interface DeckTheme {
  id: string;
  name: string;
  price: number;
  isExclusive: boolean;
  bgGradient: string;
  textColor: string;
  borderColor: string;
  backPattern: string;
}

export interface UserProfile {
  username: string;
  gold: number;
  avatar: string;
  inventory: string[];      // Sahip olunan tema ID'leri
  selectedThemeId: string; // Aktif tema
}

export interface PlayResult {
  isCapture: boolean;
  isPishti: boolean;
  isJackPishti: boolean;
  capturedCards: Card[];
  pointsGained: number;
}

export interface TeamScore {
  collectedCards: Card[];
  pishtiPoints: number;
  bonusPoints: number;
  totalCardsCount: number;
  totalScore: number;
}