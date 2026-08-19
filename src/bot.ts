import { Card } from "./types";

export class BotAI {
  public static chooseCardIndex(hand: Card[], topCard: Card | null, middleCount: number): number {
    if (hand.length <= 1) return 0;

    // 1. Kural: Yerde kart varsa ve elde aynı değerde kart varsa oyna (Pişti / Kart Alma)
    if (topCard) {
      const matchIdx = hand.findIndex((c) => c.rank === topCard.rank);
      if (matchIdx !== -1) return matchIdx;

      // 2. Kural: Yerde değerli kartlar veya 3+ kart varsa Vale (J) at
      const jackIdx = hand.findIndex((c) => c.rank === "J");
      if (jackIdx !== -1) {
        const isValuableTop =
          topCard.rank === "A" ||
          (topCard.suit === "DIAMONDS" && topCard.rank === "10") ||
          (topCard.suit === "CLUBS" && topCard.rank === "2");

        if (middleCount >= 3 || isValuableTop) {
          return jackIdx;
        }
      }
    }

    // 3. Kural: Eşleşme yoksa, Vale dışındaki en güvenli kartı seç
    const nonJacks = hand.map((card, index) => ({ card, index })).filter((item) => item.card.rank !== "J");
    const candidates = nonJacks.length > 0 ? nonJacks : hand.map((card, index) => ({ card, index }));

    // Düşük riskli kartları önce at (3-9 arası sıradan kartlar)
    const priorityOrder = ["4", "5", "6", "7", "8", "9", "3", "2", "Q", "K", "10", "A", "J"];
    candidates.sort((a, b) => priorityOrder.indexOf(a.card.rank) - priorityOrder.indexOf(b.card.rank));

    return candidates[0].index;
  }
}