import { Card, TeamScore } from "./types";
import { createDeck, shuffleDeck, dealCards } from "./deck";
import { PistiEngine } from "./engine";

export interface Player {
  socketId: string;
  userId: string;
  username: string;
  slot: number;
  hand: Card[];
}

export class GameRoom {
  public id: string;
  public mode: "1v1" | "2v2";
  public maxPlayers: number;
  public players: Player[] = [];
  public status: "WAITING" | "PLAYING" | "FINISHED" = "WAITING";
  
  public deck: Card[] = [];
  public middleCards: Card[] = [];
  public currentTurnSlot: number = 0;
  public lastTakerSlot: number | null = null;
  public turnDeadline: number = 0; // Kalan süre için unix zaman damgası

  public teamACards: Card[] = [];
  public teamAPishtiPoints: number = 0;
  public teamBCards: Card[] = [];
  public teamBPishtiPoints: number = 0;
  public finalScores: { teamA: TeamScore; teamB: TeamScore } | null = null;

  private onTimeoutCallback?: (roomId: string) => void;
  private turnTimer: NodeJS.Timeout | null = null;

  constructor(id: string, mode: "1v1" | "2v2" = "1v1", onTimeout?: (roomId: string) => void) {
    this.id = id;
    this.mode = mode;
    this.maxPlayers = mode === "1v1" ? 2 : 4;
    this.onTimeoutCallback = onTimeout;
  }

  public addPlayer(socketId: string, userId: string, username: string): boolean {
    if (this.players.length >= this.maxPlayers || this.status !== "WAITING") {
      return false;
    }
    const slot = this.players.length;
    this.players.push({ socketId, userId, username, slot, hand: [] });

    if (this.players.length === this.maxPlayers) {
      this.startGame();
    }
    return true;
  }

  public removePlayer(socketId: string) {
    this.players = this.players.filter((p) => p.socketId !== socketId);
    if (this.turnTimer) clearTimeout(this.turnTimer);
  }

  public startGame() {
    this.status = "PLAYING";
    this.deck = shuffleDeck(createDeck());
    this.middleCards = this.deck.splice(0, 4);
    this.dealNextRound();
    this.resetTurnTimer();
  }

  public resetTurnTimer() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    if (this.status !== "PLAYING") return;

    this.turnDeadline = Date.now() + 15000; // 15 Saniye süre
    this.turnTimer = setTimeout(() => {
      // Süre bittiğinde otomatik ilk kartı oyna
      const currentPlayer = this.players.find(p => p.slot === this.currentTurnSlot);
      if (currentPlayer && currentPlayer.hand.length > 0) {
        this.playCard(currentPlayer.socketId, 0);
        if (this.onTimeoutCallback) this.onTimeoutCallback(this.id);
      }
    }, 15000);
  }

  public dealNextRound(): boolean {
    if (this.deck.length === 0) return false;

    const { hands, remainingDeck } = dealCards(this.deck, this.players.length, 4);
    this.deck = remainingDeck;

    for (let i = 0; i < this.players.length; i++) {
      this.players[i].hand = hands[i];
    }
    return true;
  }

  public playCard(socketId: string, cardIndex: number) {
    const player = this.players.find((p) => p.socketId === socketId);
    if (!player || player.slot !== this.currentTurnSlot || this.status !== "PLAYING") {
      return null;
    }

    const playedCard = player.hand.splice(cardIndex, 1)[0];
    const { result, nextMiddleCards } = PistiEngine.evaluatePlay(playedCard, this.middleCards);
    this.middleCards = nextMiddleCards;

    if (result.isCapture) {
      this.lastTakerSlot = player.slot;
      const isTeamA = player.slot % 2 === 0;

      if (isTeamA) {
        this.teamACards.push(...result.capturedCards);
        this.teamAPishtiPoints += result.pointsGained;
      } else {
        this.teamBCards.push(...result.capturedCards);
        this.teamBPishtiPoints += result.pointsGained;
      }
    }

    const allHandsEmpty = this.players.every((p) => p.hand.length === 0);
    if (allHandsEmpty) {
      const hasMoreCards = this.dealNextRound();
      if (!hasMoreCards) {
        this.endGame();
      }
    }

    this.currentTurnSlot = (this.currentTurnSlot + 1) % this.players.length;
    this.resetTurnTimer();

    return { playedCard, result };
  }

  private endGame() {
    this.status = "FINISHED";
    if (this.turnTimer) clearTimeout(this.turnTimer);

    if (this.middleCards.length > 0 && this.lastTakerSlot !== null) {
      const isTeamA = this.lastTakerSlot % 2 === 0;
      if (isTeamA) {
        this.teamACards.push(...this.middleCards);
      } else {
        this.teamBCards.push(...this.middleCards);
      }
      this.middleCards = [];
    }

    this.finalScores = PistiEngine.calculateFinalScores(
      this.teamACards,
      this.teamAPishtiPoints,
      this.teamBCards,
      this.teamBPishtiPoints
    );
  }

  public getClientState(socketId: string) {
    const player = this.players.find((p) => p.socketId === socketId);
    return {
      roomId: this.id,
      mode: this.mode,
      status: this.status,
      currentTurnSlot: this.currentTurnSlot,
      turnDeadline: this.turnDeadline,
      middleCardCount: this.middleCards.length,
      topCard: this.middleCards.length > 0 ? this.middleCards[this.middleCards.length - 1] : null,
      remainingDeckCount: this.deck.length,
      myHand: player ? player.hand : [],
      mySlot: player ? player.slot : null,
      players: this.players.map((p) => ({
        slot: p.slot,
        username: p.username,
        cardCount: p.hand.length,
      })),
      finalScores: this.finalScores,
    };
  }
}