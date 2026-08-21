export type Suit = "SPADES" | "HEARTS" | "DIAMONDS" | "CLUBS";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export type GameVariant = "standard" | "turbo" | "bloody";

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

export interface Player {
  socketId: string;
  username: string;
  displayName: string;
  slot: number;
  hand: Card[];
  capturedCards: Card[];
  pishtiCount: number;
  jackPishtiCount: number;
  isBot?: boolean;
  isDisconnected?: boolean;
}

export interface PlayResult {
  isCapture: boolean;
  isPishti: boolean;
  isJackPishti: boolean;
  capturedCards: Card[];
  pointsGained: number;
}

export interface TeamScores {
  totalCardsCount: number;
  pishtiPoints: number;
  regularPoints: number;
  majorityBonus: number;
  totalScore: number;
  collectedCards?: Card[];
  bonusPoints?: number;
}

export type TeamScore = TeamScores;

export interface CumulativeScores {
  teamA: number;
  teamB: number;
}

export interface ClientGameState {
  roomId: string;
  mode: "1v1" | "2v2";
  variant: GameVariant;
  status: "WAITING" | "PLAYING" | "ROUND_FINISHED" | "FINISHED";
  mySlot: number;
  myHand: Card[];
  topCard: Card | null;
  middleCardCount: number;
  remainingDeckCount: number;
  currentTurnSlot: number;
  turnDeadline: number;
  players: {
    slot: number;
    username: string;
    cardCount: number;
    isBot?: boolean;
    isDisconnected?: boolean;
  }[];
  roundNumber: number;
  targetScore: number;
  cumulativeScores: CumulativeScores;
  liveStats: {
    teamA: { cardCount: number; pishtiCount: number };
    teamB: { cardCount: number; pishtiCount: number };
  };
  roundScores?: {
    teamA: TeamScores;
    teamB: TeamScores;
  };
  finalScores?: {
    teamA: TeamScores;
    teamB: TeamScores;
  };
  nextRoundCountdown?: number;
  activeTheme?: DeckTheme;
  activeTableTheme?: TableTheme;
  playerAvatars?: any[];
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

export interface TableTheme {
  id: string;
  name: string;
  price: number;
  isExclusive: boolean;
  tableClass: string;
  previewBg: string;
}

export interface MascotTheme {
  id: string;
  name: string;
  price: number;
  isExclusive: boolean;
  icon: string;
}

export interface FrameTheme {
  id: string;
  name: string;
  price: number;
  isExclusive: boolean;
  cssClass: string;
}

export interface MatchRecord {
  id: string;
  date: string;
  mode: string;
  variant: string;
  result: "WIN" | "LOSS" | "DRAW";
  score: string;
}

export interface UserStats {
  totalWins: number;
  totalMatches: number;
  totalPishtis: number;
  totalJackPishtis: number;
  totalCardsCaptured: number;
  winStreak?: number;
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  target: number;
  rewardGold: number;
  icon: string;
  statKey: keyof UserStats;
}

export interface UserProfile {
  username: string;
  gold: number;
  avatar: string;
  inventory: string[];
  selectedThemeId: string;
  tableInventory: string[];
  selectedTableThemeId: string;
  mascotInventory: string[];
  selectedMascotId: string;
  frameInventory: string[];
  selectedFrameId: string;
  matchHistory: MatchRecord[];
  stats: UserStats;
  claimedAchievements: string[];
}