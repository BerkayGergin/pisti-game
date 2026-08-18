import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";
import { UserProfile } from "./types";

const dbPath = path.join(process.cwd(), "pisti_database.sqlite");
const db = new Database(dbPath);

// Veritabanı Tablosu (Sadece kayıtlı üyeler tutulur)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY COLLATE NOCASE,
    password_hash TEXT NOT NULL DEFAULT '',
    gold INTEGER NOT NULL DEFAULT 100,
    avatar TEXT NOT NULL DEFAULT '👑',
    inventory TEXT NOT NULL,
    selected_theme_id TEXT NOT NULL DEFAULT 'classic',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

try {
  db.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''`);
} catch (e) {
  // Kolon zaten varsa yoksay
}

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password.trim()).digest("hex");
}

export class DBManager {
  // Kayıtlı Kullanıcı Girişi veya Otomatik Kayıt
  public static authenticateUser(username: string, password: string): { success: boolean; message?: string; user?: UserProfile } {
    const cleanName = username.trim();
    const cleanPass = password.trim();

    if (!cleanName || cleanName.length < 2) {
      return { success: false, message: "Kullanıcı adı en az 2 karakter olmalıdır." };
    }
    if (!cleanPass || cleanPass.length < 3) {
      return { success: false, message: "Şifre en az 3 karakter olmalıdır." };
    }

    const passHash = hashPassword(cleanPass);
    const row = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(cleanName) as any;

    if (row) {
      if (row.password_hash && row.password_hash !== passHash) {
        return { success: false, message: "Hatalı şifre! Lütfen şifrenizi kontrol edin." };
      }

      if (!row.password_hash) {
        db.prepare("UPDATE users SET password_hash = ? WHERE username = ? COLLATE NOCASE").run(passHash, cleanName);
      }

      return {
        success: true,
        user: {
          username: row.username,
          gold: row.gold,
          avatar: row.avatar,
          inventory: JSON.parse(row.inventory),
          selectedThemeId: row.selected_theme_id,
        },
      };
    }

    // Yeni Kayıtlı Üye
    const isSpecial = cleanName.toLowerCase().includes("zehra") || cleanName.toLowerCase().includes("berkay");
    const initialInventory = isSpecial ? ["classic", "special_duo"] : ["classic"];
    const initialTheme = isSpecial ? "special_duo" : "classic";

    const insertStmt = db.prepare(`
      INSERT INTO users (username, password_hash, gold, avatar, inventory, selected_theme_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(cleanName, passHash, 100, "👑", JSON.stringify(initialInventory), initialTheme);

    return {
      success: true,
      user: {
        username: cleanName,
        gold: 100,
        avatar: "👑",
        inventory: initialInventory,
        selectedThemeId: initialTheme,
      },
    };
  }

  // Şifre Değiştirme (Yalnızca Üyeler)
  public static changePassword(username: string, oldPass: string, newPass: string): { success: boolean; message: string } {
    const cleanName = username.trim();
    const cleanOld = oldPass.trim();
    const cleanNew = newPass.trim();

    if (!cleanNew || cleanNew.length < 3) {
      return { success: false, message: "Yeni şifre en az 3 karakter olmalıdır." };
    }

    const row = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(cleanName) as any;
    if (!row) {
      return { success: false, message: "Kullanıcı bulunamadı." };
    }

    const oldHash = hashPassword(cleanOld);
    if (row.password_hash && row.password_hash !== oldHash) {
      return { success: false, message: "Mevcut şifrenizi yanlış girdiniz." };
    }

    const newHash = hashPassword(cleanNew);
    db.prepare("UPDATE users SET password_hash = ? WHERE username = ? COLLATE NOCASE").run(newHash, cleanName);

    return { success: true, message: "Şifreniz başarıyla güncellendi!" };
  }

  public static getUser(username: string): UserProfile | null {
    const row = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(username.trim()) as any;
    if (!row) return null;
    return {
      username: row.username,
      gold: row.gold,
      avatar: row.avatar,
      inventory: JSON.parse(row.inventory),
      selectedThemeId: row.selected_theme_id,
    };
  }

  public static updateUser(user: UserProfile) {
    const stmt = db.prepare(`
      UPDATE users 
      SET gold = ?, avatar = ?, inventory = ?, selected_theme_id = ?
      WHERE username = ? COLLATE NOCASE
    `);
    stmt.run(user.gold, user.avatar, JSON.stringify(user.inventory), user.selectedThemeId, user.username);
  }

  public static addGold(username: string, amount: number) {
    const stmt = db.prepare("UPDATE users SET gold = gold + ? WHERE username = ? COLLATE NOCASE");
    stmt.run(amount, username.trim());
  }

  public static getLeaderboard(limit = 10): UserProfile[] {
    const rows = db.prepare("SELECT * FROM users ORDER BY gold DESC LIMIT ?").all(limit) as any[];
    return rows.map(r => ({
      username: r.username,
      gold: r.gold,
      avatar: r.avatar,
      inventory: JSON.parse(r.inventory),
      selectedThemeId: r.selected_theme_id,
    }));
  }
}