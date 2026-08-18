import { Card, PlayResult, TeamScore } from "./types";

export class PistiEngine {
  public static evaluatePlay(
    playedCard: Card,
    middleCards: Card[]
  ): { result: PlayResult; nextMiddleCards: Card[] } {
    const topCard = middleCards.length > 0 ? middleCards[middleCards.length - 1] : null;
    const isJack = playedCard.rank === "J";
    const isMatch = topCard !== null && topCard.rank === playedCard.rank;

    // Masada kart yokken atılan hamle
    if (!topCard) {
      return {
        result: {
          isCapture: false,
          isPishti: false,
          isJackPishti: false,
          capturedCards: [],
          pointsGained: 0,
        },
        nextMiddleCards: [playedCard],
      };
    }

    // Pişti Kontrolü: Yerde SADECE 1 kart olmalı ve aynı kart atılmalı (veya Vale üstüne Vale)
    const isPishti = middleCards.length === 1 && (isMatch || (isJack && topCard.rank === "J"));
    const isJackPishti = isPishti && isJack && topCard.rank === "J";

    if (isPishti) {
      return {
        result: {
          isCapture: true,
          isPishti: true,
          isJackPishti,
          capturedCards: [...middleCards, playedCard],
          pointsGained: isJackPishti ? 20 : 10,
        },
        nextMiddleCards: [],
      };
    }

    // Normal Kart Alma (Eşleşme veya Vale ile süpürme)
    if (isMatch || isJack) {
      return {
        result: {
          isCapture: true,
          isPishti: false,
          isJackPishti: false,
          capturedCards: [...middleCards, playedCard],
          pointsGained: 0,
        },
        nextMiddleCards: [],
      };
    }

    // Kart yerde kalır
    return {
      result: {
        isCapture: false,
        isPishti: false,
        isJackPishti: false,
        capturedCards: [],
        pointsGained: 0,
      },
      nextMiddleCards: [...middleCards, playedCard],
    };
  }

  public static calculateFinalScores(
    teamACards: Card[],
    teamAPishtiPoints: number,
    teamBCards: Card[],
    teamBPishtiPoints: number
  ): { teamA: TeamScore; teamB: TeamScore } {
    const scoreA = this.calculateCardPoints(teamACards);
    const scoreB = this.calculateCardPoints(teamBCards);

    let bonusA = 0;
    let bonusB = 0;
    if (teamACards.length > teamBCards.length) bonusA = 3;
    else if (teamBCards.length > teamACards.length) bonusB = 3;

    return {
      teamA: {
        collectedCards: teamACards,
        pishtiPoints: teamAPishtiPoints,
        bonusPoints: scoreA + bonusA,
        totalCardsCount: teamACards.length,
        totalScore: scoreA + bonusA + teamAPishtiPoints,
      },
      teamB: {
        collectedCards: teamBCards,
        pishtiPoints: teamBPishtiPoints,
        bonusPoints: scoreB + bonusB,
        totalCardsCount: teamBCards.length,
        totalScore: scoreB + bonusB + teamBPishtiPoints,
      },
    };
  }

  private static calculateCardPoints(cards: Card[]): number {
    let points = 0;
    for (const card of cards) {
      if (card.suit === "DIAMONDS" && card.rank === "10") points += 3;
      else if (card.suit === "CLUBS" && card.rank === "2") points += 2;
      else if (card.rank === "A" || card.rank === "J") points += 1;
    }
    return points;
  }
}