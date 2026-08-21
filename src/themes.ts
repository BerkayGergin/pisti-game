import { DeckTheme, TableTheme, MascotTheme, FrameTheme } from "./types";

export const DECK_THEMES: Record<string, DeckTheme> = {
  classic: { 
    id: "classic", 
    name: "Klasik Casino", 
    price: 0, 
    isExclusive: false, 
    bgGradient: "bg-white", 
    textColor: "", 
    borderColor: "border-slate-300", 
    backPattern: "bg-blue-800" 
  },
  neon_cyber: { 
    id: "neon_cyber", 
    name: "Neon Siber", 
    price: 500, 
    isExclusive: false, 
    bgGradient: "bg-slate-900", 
    textColor: "text-cyan-400", 
    borderColor: "border-cyan-500", 
    backPattern: "bg-cyan-900" 
  },
  crimson_dragon: { 
    id: "crimson_dragon", 
    name: "Kızıl Ejder", 
    price: 800, 
    isExclusive: false, 
    bgGradient: "bg-red-950", 
    textColor: "text-amber-400", 
    borderColor: "border-red-600", 
    backPattern: "bg-red-800" 
  },
  special_duo: { 
    id: "special_duo", 
    name: "Altın Seri", 
    price: 1500, 
    isExclusive: true, 
    bgGradient: "bg-amber-100", 
    textColor: "text-amber-900", 
    borderColor: "border-amber-500", 
    backPattern: "bg-amber-600" 
  }
};

export const TABLE_THEMES: Record<string, TableTheme> = {
  classic_green: { 
    id: "classic_green", 
    name: "Zümrüt Yeşili", 
    price: 0, 
    isExclusive: false, 
    tableClass: "bg-emerald-900/80", 
    previewBg: "bg-emerald-800" 
  },
  royal_red: { 
    id: "royal_red", 
    name: "Kraliyet Kırmızısı", 
    price: 400, 
    isExclusive: false, 
    tableClass: "bg-red-900/80", 
    previewBg: "bg-red-800" 
  },
  deep_blue: { 
    id: "deep_blue", 
    name: "Okyanus Mavisi", 
    price: 600, 
    isExclusive: false, 
    tableClass: "bg-blue-900/80", 
    previewBg: "bg-blue-800" 
  },
  obsidian_dark: { 
    id: "obsidian_dark", 
    name: "Karanlık Obsidyen", 
    price: 1200, 
    isExclusive: true, 
    tableClass: "bg-slate-950/90", 
    previewBg: "bg-slate-900" 
  }
};

export const MASCOTS: Record<string, MascotTheme> = {
  default_cat: { 
    id: "default_cat", 
    name: "Sokak Kedisi", 
    price: 0, 
    isExclusive: false, 
    icon: "🐱" 
  },
  stone_golem: { 
    id: "stone_golem", 
    name: "Taş Golem", 
    price: 300, 
    isExclusive: false, 
    icon: "🪨" 
  },
  wizard_owl: { 
    id: "wizard_owl", 
    name: "Büyücü Baykuş", 
    price: 600, 
    isExclusive: false, 
    icon: "🦉" 
  },
  fire_dragon: { 
    id: "fire_dragon", 
    name: "Alev Ejderi", 
    price: 1500, 
    isExclusive: true, 
    icon: "🐉" 
  }
};

export const FRAMES: Record<string, FrameTheme> = {
  default_frame: { 
    id: "default_frame", 
    name: "Standart", 
    price: 0, 
    isExclusive: false, 
    cssClass: "border-slate-700" 
  },
  silver_frame: { 
    id: "silver_frame", 
    name: "Gümüş Çerçeve", 
    price: 250, 
    isExclusive: false, 
    cssClass: "border-slate-300 shadow-[0_0_8px_#cbd5e1]" 
  },
  gold_frame: { 
    id: "gold_frame", 
    name: "Altın Çerçeve", 
    price: 750, 
    isExclusive: false, 
    cssClass: "border-amber-400 shadow-[0_0_12px_#fbbf24]" 
  },
  diamond_frame: { 
    id: "diamond_frame", 
    name: "Elmas Çerçeve", 
    price: 2000, 
    isExclusive: true, 
    cssClass: "border-cyan-400 shadow-[0_0_15px_#22d3ee]" 
  }
};