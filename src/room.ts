import { Card, ClientGameState, GameVariant, Player, Rank, Suit, TeamScores } from "./types";
import { BotAI } from "./bot";

export class GameRoom {
  public roomId: string;
  public mode: "1v1" | "2v2";
  public variant: GameVariant;
  public targetScore: number;
  public roundNumber: number = 1;
  public cumulativeScores = { teamA: 0, teamB: 0 };
  public maxPlayers: number;
  public players: Player[] = [];
  public deck: Card[] = [];
  public middleCards: Card[] = [];
  public currentTurnSlot: number = 0;
  public status: "WAITING" | "PLAYING" | "ROUND_FINISHED" | "FINISHED" = "WAITING";
  public lastCapturerSlot: number | null = null;
  public roundScores?: { teamA: TeamScores; teamB: TeamScores };
  public finalScores?: { teamA: TeamScores; teamB: TeamScores };
  public turnDeadline: number = 0;
  public nextRoundCountdown: number = 0;

  private turnTimer: NodeJS.Timeout | null = null;
  private botTimer: NodeJS.Timeout | null = null;
  private roundTransitionTimer: NodeJS.Timeout | null = null;
  private disconnectTimers = new Map<string, NodeJS.Timeout>();
  private onStateChange: (roomId: string) => void;

  constructor(
    roomId: string,
    mode: "1v1" | "2v2",
    targetScore: number = 51,
    variant: GameVariant = "standard",
    onStateChange: (roomId: string) => void
  ) {
    this.roomId = roomId;
    this.mode = mode;
    this.targetScore = targetScore;
    this.variant = variant;
    this.maxPlayers = mode === "1v1" ? 2 : 4;
    this.onStateChange = onStateChange;
  }

  public getTurnDuration(): number {
    return this.variant === "turbo" ? 5000 : 15000;
  }

  public addPlayer(socketId: string, username: string, displayName: string): boolean {
    if (this.players.length >= this.maxPlayers || this.status !== "WAITING") {
      return false;
    }
    
    const slot = this.players.length;
    this.players.push({
      socketId,
      username,
      displayName,
      slot,
      hand: [],
      capturedCards: [],
      pishtiCount: 0,
      jackPishtiCount: 0,
      isBot: false,
      isDisconnected: false,
    });

    if (this.players.length === this.maxPlayers) {
      this.startNewMatch();
    }
    
    return true;
  }

  public addBot(): boolean {
    if (this.players.length >= this.maxPlayers || this.status !== "WAITING") {
      return false;
    }
    
    const botSlot = this.players.length;
    const botNames = ["Robot_As", "Robot_Mekanik", "Robot_Titan", "Robot_Matrix"];
    const botName = `${botNames[botSlot % botNames.length]}`;

    this.players.push({
      socketId: `BOT_${Date.now()}_${botSlot}`,
      username: botName,
      displayName: botName,
      slot: botSlot,
      hand: [],
      capturedCards: [],
      pishtiCount: 0,
      jackPishtiCount: 0,
      isBot: true,
      isDisconnected: false,
    });

    if (this.players.length === this.maxPlayers) {
      this.startNewMatch();
    }
    
    return true;
  }

  public handleDisconnect(socketId: string) {
    const player = this.players.find((p) => p.socketId === socketId);
    if (!player) return;

    if (this.status === "WAITING") {
      // Oyun başlamadan çıkanları direkt odadan sil
      this.players = this.players.filter((p) => p.socketId !== socketId);
    } else {
      // Oyun içindeyken düşenlere 60 saniye süre ver
      player.isDisconnected = true;
      const timer = setTimeout(() => {
        player.isBot = true;
        player.displayName = `${player.username} (Bot)`;
        this.onStateChange(this.roomId);
        this.checkBotTurn();
      }, 60000);
      this.disconnectTimers.set(player.username, timer);
    }
  }

  public handleReconnect(username: string, newSocketId: string): boolean {
    const player = this.players.find((p) => p.username === username);
    if (!player) return false;

    player.socketId = newSocketId;
    player.isDisconnected = false;

    const timer = this.disconnectTimers.get(username);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(username);
    }

    this.onStateChange(this.roomId);
    return true;
  }

  public removePlayer(socketId: string) {
    this.players = this.players.filter((p) => p.socketId !== socketId);
    this.clearTimers();
    this.status = "WAITING";
  }

  public startNewMatch() {
    this.roundNumber = 1;
    this.cumulativeScores = { teamA: 0, teamB: 0 };
    this.startNewRound();
  }

  public startNewRound() {
    this.clearTimers();
    this.status = "PLAYING";
    this.deck = this.createDeck();
    this.shuffle(this.deck);
    this.middleCards = [];
    this.lastCapturerSlot = null;
    this.roundScores = undefined;

    // Oyuncu verilerini sıfırla
    for (const player of this.players) {
      player.hand = [];
      player.capturedCards = [];
      player.pishtiCount = 0;
      player.jackPishtiCount = 0;
    }

    // Yere 4 kart aç
    for (let i = 0; i < 4; i++) {
      const card = this.deck.pop();
      if (card) this.middleCards.push(card);
    }

    this.dealCardsToPlayers();
    this.currentTurnSlot = 0;
    this.resetTurnTimer();
    this.checkBotTurn();
  }

  private dealCardsToPlayers() {
    // Her oyuncuya 4'er kart dağıt
    for (let i = 0; i < 4; i++) {
      for (const player of this.players) {
        if (this.deck.length > 0) {
          const card = this.deck.pop();
          if (card) player.hand.push(card);
        }
      }
    }
  }

  private createDeck(): Card[] {
    const suits: Suit[] = ["SPADES", "HEARTS", "DIAMONDS", "CLUBS"];
    const ranks: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    const deck: Card[] = [];
    
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ id: `${suit}_${rank}`, suit, rank });
      }
    }
    return deck;
  }

  private shuffle(deck: Card[]) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  public playCard(
    socketId: string, 
    cardIndex: number
  ): { playedCard: Card; result: { captured: boolean; isPishti: boolean; isJackPishti: boolean; capturedCount: number } } | null {
    
    if (this.status !== "PLAYING") return null;
    const player = this.players[this.currentTurnSlot];
    if (!player || player.socketId !== socketId) return null;
    if (cardIndex < 0 || cardIndex >= player.hand.length) return null;

    const playedCard = player.hand.splice(cardIndex, 1)[0];
    const topCard = this.middleCards.length > 0 ? this.middleCards[this.middleCards.length - 1] : null;

    let captured = false;
    let isPishti = false;
    let isJackPishti = false;
    let capturedCount = 0;

    // Alma Kontrolü (Aynı Kart veya Vale)
    if (topCard) {
      if (playedCard.rank === topCard.rank) {
        captured = true;
        // Pişti Kontrolü
        if (this.middleCards.length === 1) {
          isPishti = true;
          if (playedCard.rank === "J") {
            isJackPishti = true;
            player.jackPishtiCount++;
          } else {
            player.pishtiCount++;
          }
        }
      } else if (playedCard.rank === "J") {
        captured = true;
      }
    }

    if (captured) {
      this.middleCards.push(playedCard);
      capturedCount = this.middleCards.length;
      player.capturedCards.push(...this.middleCards);
      this.middleCards = [];
      this.lastCapturerSlot = player.slot;
    } else {
      this.middleCards.push(playedCard);
    }

    // Eldeki kartlar bitti mi?
    const allHandsEmpty = this.players.every((p) => p.hand.length === 0);
    if (allHandsEmpty) {
      if (this.deck.length > 0) {
        this.dealCardsToPlayers();
      } else {
        this.endRound();
        return { playedCard, result: { captured, isPishti, isJackPishti, capturedCount } };
      }
    }

    // Sırayı sonraki oyuncuya geçir
    this.currentTurnSlot = (this.currentTurnSlot + 1) % this.players.length;
    this.resetTurnTimer();
    this.checkBotTurn();
    
    return { playedCard, result: { captured, isPishti, isJackPishti, capturedCount } };
  }

  private checkBotTurn() {
    if (this.status !== "PLAYING") return;
    const currentPlayer = this.players[this.currentTurnSlot];
    
    if (currentPlayer && (currentPlayer.isBot || currentPlayer.isDisconnected)) {
      if (this.botTimer) clearTimeout(this.botTimer);
      
      const delay = this.variant === "turbo" ? Math.floor(300 + Math.random() * 300) : Math.floor(900 + Math.random() * 400);
      
      this.botTimer = setTimeout(() => {
        const topCard = this.middleCards.length > 0 ? this.middleCards[this.middleCards.length - 1] : null;
        const chosenIndex = BotAI.chooseCardIndex(currentPlayer.hand, topCard, this.middleCards.length);
        this.playCard(currentPlayer.socketId, chosenIndex);
        this.onStateChange(this.roomId);
      }, delay);
    }
  }

  private endRound() {
    this.clearTimers();

    // Yerde kalan kartları son alana ver
    if (this.middleCards.length > 0 && this.lastCapturerSlot !== null) {
      const capturer = this.players.find((p) => p.slot === this.lastCapturerSlot);
      if (capturer) {
        capturer.capturedCards.push(...this.middleCards);
      }
      this.middleCards = [];
    }

    const teamAScores = this.calculateTeamScore([0, 2]);
    const teamBScores = this.calculateTeamScore([1, 3]);

    // Çoğunluk Bonus Puanı (+3)
    if (teamAScores.totalCardsCount > teamBScores.totalCardsCount) {
      teamAScores.majorityBonus = 3;
      teamAScores.totalScore += 3;
    } else if (teamBScores.totalCardsCount > teamAScores.totalCardsCount) {
      teamBScores.majorityBonus = 3;
      teamBScores.totalScore += 3;
    }

    this.roundScores = { teamA: teamAScores, teamB: teamBScores };
    this.cumulativeScores.teamA += teamAScores.totalScore;
    this.cumulativeScores.teamB += teamBScores.totalScore;

    // Oyun Bitiş Kontrolü
    if (this.targetScore === 0 || this.cumulativeScores.teamA >= this.targetScore || this.cumulativeScores.teamB >= this.targetScore) {
      this.status = "FINISHED";
      this.finalScores = this.roundScores;
    } else {
      this.status = "ROUND_FINISHED";
      this.nextRoundCountdown = 6;
      this.roundTransitionTimer = setInterval(() => {
        this.nextRoundCountdown--;
        if (this.nextRoundCountdown <= 0) {
          if (this.roundTransitionTimer) clearInterval(this.roundTransitionTimer);
          this.roundNumber++;
          this.startNewRound();
        }
        this.onStateChange(this.roomId);
      }, 1000);
    }
  }

  private calculateTeamScore(slots: number[]): TeamScores {
    const teamPlayers = this.players.filter((p) => slots.includes(p.slot));
    const allCards = teamPlayers.flatMap((p) => p.capturedCards);
    const regularPishti = teamPlayers.reduce((acc, p) => acc + p.pishtiCount, 0);
    const jackPishti = teamPlayers.reduce((acc, p) => acc + p.jackPishtiCount, 0);

    let regularPoints = 0;
    for (const card of allCards) {
      if (card.rank === "A" || card.rank === "J") regularPoints += 1;
      else if (card.suit === "DIAMONDS" && card.rank === "10") regularPoints += 3;
      else if (card.suit === "CLUBS" && card.rank === "2") regularPoints += 2;
    }

    // Kanlı Mod ise Pişti x2 Puan
    const pishtiMultiplier = this.variant === "bloody" ? 2 : 1;
    const pishtiPoints = (regularPishti * 10 + jackPishti * 20) * pishtiMultiplier;

    return {
      totalCardsCount: allCards.length,
      pishtiPoints,
      regularPoints,
      majorityBonus: 0,
      totalScore: regularPoints + pishtiPoints,
    };
  }

  private resetTurnTimer() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    const duration = this.getTurnDuration();
    this.turnDeadline = Date.now() + duration;
    
    this.turnTimer = setTimeout(() => {
      this.autoPlayTurn();
    }, duration);
  }

  private autoPlayTurn() {
    const player = this.players[this.currentTurnSlot];
    if (player && player.hand.length > 0) {
      // Süre bittiğinde otomatik ilk kartı oyna
      this.playCard(player.socketId, 0);
      this.onStateChange(this.roomId);
    }
  }

  private clearTimers() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
    if (this.roundTransitionTimer) {
      clearInterval(this.roundTransitionTimer);
      this.roundTransitionTimer = null;
    }
  }

  public getClientState(socketId: string): ClientGameState {
    const player = this.players.find((p) => p.socketId === socketId);
    const mySlot = player ? player.slot : -1;

    const teamACards = this.players.filter((p) => p.slot % 2 === 0).reduce((acc, p) => acc + p.capturedCards.length, 0);
    const teamAPishti = this.players.filter((p) => p.slot % 2 === 0).reduce((acc, p) => acc + p.pishtiCount + p.jackPishtiCount, 0);

    const teamBCards = this.players.filter((p) => p.slot % 2 !== 0).reduce((acc, p) => acc + p.capturedCards.length, 0);
    const teamBPishti = this.players.filter((p) => p.slot % 2 !== 0).reduce((acc, p) => acc + p.pishtiCount + p.jackPishtiCount, 0);

    return {
      roomId: this.roomId,
      mode: this.mode,
      variant: this.variant,
      status: this.status,
      mySlot,
      myHand: player ? player.hand : [],
      topCard: this.middleCards.length > 0 ? this.middleCards[this.middleCards.length - 1] : null,
      middleCardCount: this.middleCards.length,
      remainingDeckCount: this.deck.length,
      currentTurnSlot: this.currentTurnSlot,
      turnDeadline: this.turnDeadline,
      players: this.players.map((p) => ({
        slot: p.slot,
        username: p.username,
        cardCount: p.hand.length,
        isBot: p.isBot,
        isDisconnected: p.isDisconnected,
      })),
      roundNumber: this.roundNumber,
      targetScore: this.targetScore,
      cumulativeScores: this.cumulativeScores,
      liveStats: {
        teamA: { cardCount: teamACards, pishtiCount: teamAPishti },
        teamB: { cardCount: teamBCards, pishtiCount: teamBPishti },
      },
      roundScores: this.roundScores,
      finalScores: this.finalScores,
      nextRoundCountdown: this.nextRoundCountdown,
    };
  }
}