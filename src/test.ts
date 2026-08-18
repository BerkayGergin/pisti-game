import { createDeck, shuffleDeck, dealCards } from "./deck";
import { PistiEngine } from "./engine";
import { Card } from "./types";

console.log("=== Pişti Motor Testi ===");

// 1. Deste testi
const deck = shuffleDeck(createDeck());
console.log(`Deste oluşturuldu. Toplam kart: ${deck.length}`);

// 2. Dağıtım testi (2 Kişilik)
const { hands, remainingDeck } = dealCards(deck, 2, 4);
console.log(`Oyuncu 1 Kart Sayısı: ${hands[0].length}`);
console.log(`Oyuncu 2 Kart Sayısı: ${hands[1].length}`);
console.log(`Kalan Deste: ${remainingDeck.length}`);

// 3. Pişti Mantığı Testi
const table: Card[] = [{ id: "HEARTS_7", suit: "HEARTS", rank: "7" }];
const playCard: Card = { id: "DIAMONDS_7", suit: "DIAMONDS", rank: "7" };

const { result } = PistiEngine.evaluatePlay(playCard, table);
console.log("Pişti Yapıldı mı?:", result.isPishti);
console.log("Kazanılan Puan:", result.pointsGained);