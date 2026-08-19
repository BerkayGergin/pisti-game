import Database from "better-sqlite3";
import path from "path";
import { AchievementDef, UserProfile, UserStats } from "./types";

const db = new Database(path.join(process.cwd(), "pisti_database.sqlite"));

// Tablo Şeması
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password TEXT NOT NULL DEFAULT '1234',
    gold INTEGER DEFAULT 100,
    avatar TEXT DEFAULT '👑',
    inventory TEXT DEFAULT '["classic"]',
    selectedThemeId TEXT DEFAULT 'classic',
    tableInventory TEXT DEFAULT '["classic_green"]',
    selectedTableThemeId TEXT DEFAULT 'classic_green',
    stats TEXT DEFAULT '{"totalWins":0,"totalMatches":0,"totalPishtis":0,"totalJackPishtis":0,"totalCardsCaptured":0}',
    claimedAchievements TEXT DEFAULT '[]'
  );
`);

// Tüm Olası Eksik Sütunların Güvenli Kontrolü (Migration)
const tableInfo = db.prepare("PRAGMA table_info(users)").all() as any[];
const columnNames = tableInfo.map((col) => col.name);

const requiredColumns: Record<string, string> = {
  password: "TEXT DEFAULT '1234'",
  gold: "INTEGER DEFAULT 100",
  avatar: "TEXT DEFAULT '👑'",
  inventory: "TEXT DEFAULT '[\"classic\"]'",
  selectedThemeId: "TEXT DEFAULT 'classic'",
  tableInventory: "TEXT DEFAULT '[\"classic_green\"]'",
  selectedTableThemeId: "TEXT DEFAULT 'classic_green'",
  stats: "TEXT DEFAULT '{\"totalWins\":0,\"totalMatches\":0,\"totalPishtis\":0,\"totalJackPishtis\":0,\"totalCardsCaptured\":0}'",
  claimedAchievements: "TEXT DEFAULT '[]'",
};

for (const [col, typeDef] of Object.entries(requiredColumns)) {
  if (!columnNames.includes(col)) {
    try {
      db.exec(`ALTER TABLE users ADD COLUMN ${col} ${typeDef};`);
    } catch {}
  }
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first_win",
    title: "İlk Galibiyet",
    description: "İlk maçını kazan",
    target: 1,
    rewardGold: 50,
    icon: "🥇",
    statKey: "totalWins",
  },
  {
    id: "pishti_master",
    title: "Pişti Ustası",
    description: "Toplam 5 pişti yap",
    target: 5,
    rewardGold: 100,
    icon: "⚡",
    statKey: "totalPishtis",
  },
  {
    id: "super_jack",
    title: "Süper Vale",
    description: "Vale ile pişti yakala",
    target: 1,
    rewardGold: 75,
    icon: "🔥",
    statKey: "totalJackPishtis",
  },
  {
    id: "card_collector",
    title: "Kart Avcısı",
    description: "Toplam 50 kart topla",
    target: 50,
    rewardGold: 120,
    icon: "🃏",
    statKey: "totalCardsCaptured",
  },
  {
    id: "arena_veteran",
    title: "Arena Müdavimi",
    description: "Toplam 5 maç tamamla",
    target: 5,
    rewardGold: 200,
    icon: "🏆",
    statKey: "totalMatches",
  },
];

export class DBManager {
  public static authenticateUser(username: string, password: string): { success: boolean; message?: string; user?: UserProfile } {
    try {
      const cleanUser = username.trim();
      if (!cleanUser || !password) return { success: false, message: "Kullanıcı adı ve şifre zorunludur." };

      const row = db.prepare("SELECT * FROM users WHERE username = ?").get(cleanUser) as any;

      if (!row) {
        const defaultInventory = JSON.stringify(["classic"]);
        const defaultTableInventory = JSON.stringify(["classic_green"]);
        const defaultStats = JSON.stringify({
          totalWins: 0,
          totalMatches: 0,
          totalPishtis: 0,
          totalJackPishtis: 0,
          totalCardsCaptured: 0,
        });
        const defaultClaimed = JSON.stringify([]);

        db.prepare(`
          INSERT INTO users (username, password, gold, avatar, inventory, selectedThemeId, tableInventory, selectedTableThemeId, stats, claimedAchievements) 
          VALUES (?, ?, 100, '👑', ?, 'classic', ?, 'classic_green', ?, ?)
        `).run(cleanUser, password, defaultInventory, defaultTableInventory, defaultStats, defaultClaimed);

        return {
          success: true,
          user: {
            username: cleanUser,
            gold: 100,
            avatar: "👑",
            inventory: ["classic"],
            selectedThemeId: "classic",
            tableInventory: ["classic_green"],
            selectedTableThemeId: "classic_green",
            stats: { totalWins: 0, totalMatches: 0, totalPishtis: 0, totalJackPishtis: 0, totalCardsCaptured: 0 },
            claimedAchievements: [],
          },
        };
      }

      if (row.password && row.password !== password) {
        return { success: false, message: "Hatalı şifre girdiniz." };
      }

      return { success: true, user: this.formatRow(row) };
    } catch (err: any) {
      return { success: false, message: "Veritabanı hatası: " + err.message };
    }
  }

  public static getUser(username: string): UserProfile | null {
    const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
    return row ? this.formatRow(row) : null;
  }

  public static updateUser(user: UserProfile) {
    db.prepare(`
      UPDATE users 
      SET gold = ?, avatar = ?, inventory = ?, selectedThemeId = ?, tableInventory = ?, selectedTableThemeId = ?, stats = ?, claimedAchievements = ?
      WHERE username = ?
    `).run(
      user.gold,
      user.avatar,
      JSON.stringify(user.inventory),
      user.selectedThemeId,
      JSON.stringify(user.tableInventory),
      user.selectedTableThemeId,
      JSON.stringify(user.stats),
      JSON.stringify(user.claimedAchievements),
      user.username
    );
  }

  public static addStats(username: string, delta: Partial<UserStats>) {
    const user = this.getUser(username);
    if (!user) return;

    user.stats = {
      totalWins: user.stats.totalWins + (delta.totalWins || 0),
      totalMatches: user.stats.totalMatches + (delta.totalMatches || 0),
      totalPishtis: user.stats.totalPishtis + (delta.totalPishtis || 0),
      totalJackPishtis: user.stats.totalJackPishtis + (delta.totalJackPishtis || 0),
      totalCardsCaptured: user.stats.totalCardsCaptured + (delta.totalCardsCaptured || 0),
    };

    this.updateUser(user);
  }

  public static claimAchievement(username: string, achievementId: string): { success: boolean; rewardGold: number; message: string; user?: UserProfile } {
    const user = this.getUser(username);
    if (!user) return { success: false, rewardGold: 0, message: "Kullanıcı bulunamadı." };

    const ach = ACHIEVEMENTS.find((a) => a.id === achievementId);
    if (!ach) return { success: false, rewardGold: 0, message: "Geçersiz görev." };

    if (user.claimedAchievements.includes(achievementId)) {
      return { success: false, rewardGold: 0, message: "Bu ödül zaten alındı." };
    }

    const currentVal = user.stats[ach.statKey] || 0;
    if (currentVal < ach.target) {
      return { success: false, rewardGold: 0, message: "Görev henüz tamamlanmadı." };
    }

    user.gold += ach.rewardGold;
    user.claimedAchievements.push(achievementId);
    this.updateUser(user);

    return { success: true, rewardGold: ach.rewardGold, message: `Tebrikler! ${ach.rewardGold} 🪙 kazandınız!`, user };
  }

  public static addGold(username: string, amount: number) {
    db.prepare("UPDATE users SET gold = gold + ? WHERE username = ?").run(amount, username);
  }

  public static changePassword(username: string, oldPass: string, newPass: string): { success: boolean; message: string } {
    const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
    if (!row || row.password !== oldPass) {
      return { success: false, message: "Mevcut şifreniz hatalı." };
    }
    db.prepare("UPDATE users SET password = ? WHERE username = ?").run(newPass, username);
    return { success: true, message: "Şifreniz başarıyla güncellendi." };
  }

  public static getLeaderboard(limit = 10): { username: string; gold: number; avatar: string }[] {
    return db.prepare("SELECT username, gold, avatar FROM users ORDER BY gold DESC LIMIT ?").all(limit) as any;
  }

  private static formatRow(row: any): UserProfile {
    let inventory: string[] = ["classic"];
    let tableInventory: string[] = ["classic_green"];
    let stats: UserStats = { totalWins: 0, totalMatches: 0, totalPishtis: 0, totalJackPishtis: 0, totalCardsCaptured: 0 };
    let claimedAchievements: string[] = [];

    try { inventory = JSON.parse(row.inventory || "[\"classic\"]"); } catch {}
    try { tableInventory = JSON.parse(row.tableInventory || "[\"classic_green\"]"); } catch {}
    try { stats = JSON.parse(row.stats || "{}"); } catch {}
    try { claimedAchievements = JSON.parse(row.claimedAchievements || "[]"); } catch {}

    return {
      username: row.username,
      gold: Number(row.gold || 0),
      avatar: row.avatar || "👑",
      inventory,
      selectedThemeId: row.selectedThemeId || "classic",
      tableInventory,
      selectedTableThemeId: row.selectedTableThemeId || "classic_green",
      stats: {
        totalWins: stats.totalWins || 0,
        totalMatches: stats.totalMatches || 0,
        totalPishtis: stats.totalPishtis || 0,
        totalJackPishtis: stats.totalJackPishtis || 0,
        totalCardsCaptured: stats.totalCardsCaptured || 0,
      },
      claimedAchievements,
    };
  }
}