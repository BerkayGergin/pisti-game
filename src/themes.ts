import { DeckTheme } from "./types";

export const DECK_THEMES: Record<string, DeckTheme> = {
  classic: {
    id: "classic",
    name: "Klasik Beyaz",
    price: 0,
    isExclusive: false,
    bgGradient: "bg-slate-50",
    textColor: "text-slate-950",
    borderColor: "border-slate-300",
    backPattern: "bg-blue-700",
  },
  neon_cyber: {
    id: "neon_cyber",
    name: "Siberpunk Neon",
    price: 150,
    isExclusive: false,
    bgGradient: "bg-slate-950",
    textColor: "text-cyan-400",
    borderColor: "border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.4)]",
    backPattern: "bg-gradient-to-br from-cyan-600 to-fuchsia-600",
  },
  crimson_dragon: {
    id: "crimson_dragon",
    name: "Kızıl Ejderha",
    price: 300,
    isExclusive: false,
    bgGradient: "bg-neutral-900",
    textColor: "text-amber-400",
    borderColor: "border-red-600 shadow-[0_0_15px_rgba(220,38,38,0.4)]",
    backPattern: "bg-gradient-to-tr from-red-900 via-amber-700 to-red-950",
  },
  special_duo: {
    id: "special_duo",
    name: "Yıldız Işığı (Özel)",
    price: 0,
    isExclusive: true, // Sadece yetkili hesaplara özel
    bgGradient: "bg-gradient-to-b from-indigo-950 via-slate-900 to-purple-950",
    textColor: "text-amber-300 font-extrabold",
    borderColor: "border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.6)]",
    backPattern: "bg-gradient-to-r from-purple-800 via-pink-700 to-indigo-900",
  },
};