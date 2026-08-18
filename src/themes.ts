import { DeckTheme } from "./types";

export const DECK_THEMES: Record<string, DeckTheme> = {
  classic: {
    id: "classic",
    name: "Klasik Casino",
    price: 0,
    isExclusive: false,
    bgGradient: "bg-gradient-to-b from-white via-slate-50 to-slate-100",
    textColor: "text-slate-900",
    borderColor: "border-slate-300 shadow-lg",
    backPattern: "bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-950 border-white/20",
  },
  neon_cyber: {
    id: "neon_cyber",
    name: "Siberpunk Neon",
    price: 150,
    isExclusive: false,
    bgGradient: "bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950",
    textColor: "text-cyan-400",
    borderColor: "border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.5)]",
    backPattern: "bg-gradient-to-br from-cyan-600 via-purple-700 to-fuchsia-700 border-cyan-400/40",
  },
  crimson_dragon: {
    id: "crimson_dragon",
    name: "Kızıl Ejderha",
    price: 300,
    isExclusive: false,
    bgGradient: "bg-gradient-to-b from-neutral-950 via-red-950 to-neutral-900",
    textColor: "text-amber-400",
    borderColor: "border-red-600 shadow-[0_0_20px_rgba(220,38,38,0.5)]",
    backPattern: "bg-gradient-to-tr from-red-950 via-red-800 to-amber-900 border-amber-500/40",
  },
  special_duo: {
    id: "special_duo",
    name: "Yıldız Işığı (Özel)",
    price: 0,
    isExclusive: true,
    bgGradient: "bg-gradient-to-b from-slate-950 via-purple-950 to-indigo-950",
    textColor: "text-amber-300",
    borderColor: "border-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.7)]",
    backPattern: "bg-[url('/assets/cards/special_duo/back.png')] bg-cover bg-center border-amber-300/60",
  },
};