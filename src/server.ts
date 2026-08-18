import express from "express";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import { GameRoom } from "./room";
import { DECK_THEMES } from "./themes";
import { DBManager } from "./db";
import { UserProfile } from "./types";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(process.cwd(), "public")));

const rooms = new Map<string, GameRoom>();

// Aktif Oturumlar (Socket ID -> { user: UserProfile, isGuest: boolean })
const activeSessions = new Map<string, { user: UserProfile; isGuest: boolean }>();

function getSessionUser(socketId: string): { user: UserProfile; isGuest: boolean } | null {
  return activeSessions.get(socketId) || null;
}

function broadcastRoomState(room: GameRoom) {
  for (const player of room.players) {
    const session = getSessionUser(player.socketId);
    const activeThemeId = session ? session.user.selectedThemeId : "classic";

    io.to(player.socketId).emit("game_state", {
      ...room.getClientState(player.socketId),
      activeTheme: DECK_THEMES[activeThemeId] || DECK_THEMES.classic,
      playerAvatars: room.players.map(p => {
        const pSession = getSessionUser(p.socketId);
        return {
          slot: p.slot,
          avatar: pSession ? pSession.user.avatar : "👑",
          username: p.username,
        };
      })
    });
  }
}

io.on("connection", (socket) => {
  // 1. Üye Girişi / Kayıt
  socket.on("auth_user", ({ username, password }: { username: string; password: string }) => {
    const auth = DBManager.authenticateUser(username, password);
    if (!auth.success || !auth.user) {
      socket.emit("auth_error", auth.message || "Giriş başarısız.");
      return;
    }

    activeSessions.set(socket.id, { user: auth.user, isGuest: false });
    socket.emit("auth_success", { user: auth.user, isGuest: false });
    socket.emit("profile_data", { user: auth.user, themes: DECK_THEMES, isGuest: false });
  });

  // 2. Misafir Girişi
  socket.on("guest_login", (customName?: string) => {
    const randomId = Math.floor(1000 + Math.random() * 9000);
    const guestUsername = customName && customName.trim() ? `${customName.trim()} (Misafir)` : `Misafir_${randomId}`;

    const guestUser: UserProfile = {
      username: guestUsername,
      gold: 50,
      avatar: "👤",
      inventory: ["classic"],
      selectedThemeId: "classic",
    };

    activeSessions.set(socket.id, { user: guestUser, isGuest: true });
    socket.emit("auth_success", { user: guestUser, isGuest: true });
    socket.emit("profile_data", { user: guestUser, themes: DECK_THEMES, isGuest: true });
  });

  // 3. Çıkış Yapma
  socket.on("logout", () => {
    activeSessions.delete(socket.id);
    socket.emit("logout_success");
  });

  // Şifre Değiştirme
  socket.on("change_password", ({ oldPassword, newPassword }: { oldPassword: string; newPassword: string }) => {
    const session = getSessionUser(socket.id);
    if (!session || session.isGuest) {
      socket.emit("password_change_result", { success: false, message: "Misafir hesapların şifresi yoktur." });
      return;
    }
    const result = DBManager.changePassword(session.user.username, oldPassword, newPassword);
    socket.emit("password_change_result", result);
  });

  // Liderlik Tablosu
  socket.on("get_leaderboard", () => {
    const leaderboard = DBManager.getLeaderboard(10);
    socket.emit("leaderboard_data", leaderboard);
  });

  // Avatar Seçimi
  socket.on("select_avatar", ({ avatar }: { avatar: string }) => {
    const session = getSessionUser(socket.id);
    if (!session) return;

    session.user.avatar = avatar;
    if (!session.isGuest) {
      DBManager.updateUser(session.user);
    }
    socket.emit("profile_data", { user: session.user, themes: DECK_THEMES, isGuest: session.isGuest });
  });

  // Tema Satın Alma
  socket.on("buy_theme", ({ themeId }: { themeId: string }) => {
    const session = getSessionUser(socket.id);
    if (!session) return;

    const theme = DECK_THEMES[themeId];
    if (!theme || session.user.inventory.includes(themeId) || theme.isExclusive) return;

    if (session.user.gold >= theme.price) {
      session.user.gold -= theme.price;
      session.user.inventory.push(themeId);
      session.user.selectedThemeId = themeId;

      if (!session.isGuest) {
        DBManager.updateUser(session.user);
      }
      socket.emit("profile_data", { user: session.user, themes: DECK_THEMES, isGuest: session.isGuest });
    }
  });

  // Tema Kuşanma
  socket.on("select_theme", ({ themeId }: { themeId: string }) => {
    const session = getSessionUser(socket.id);
    if (session && session.user.inventory.includes(themeId)) {
      session.user.selectedThemeId = themeId;
      if (!session.isGuest) {
        DBManager.updateUser(session.user);
      }
      socket.emit("profile_data", { user: session.user, themes: DECK_THEMES, isGuest: session.isGuest });
    }
  });

  // Odaya Katılma
  socket.on("join_room", ({ roomId, mode }: { roomId: string; mode: "1v1" | "2v2" }) => {
    const session = getSessionUser(socket.id);
    if (!session) {
      socket.emit("error_message", "Lütfen önce giriş yapın veya misafir olarak devam edin.");
      return;
    }

    let room = rooms.get(roomId);
    if (!room) {
      room = new GameRoom(roomId, mode, (rId) => {
        const targetRoom = rooms.get(rId);
        if (targetRoom) broadcastRoomState(targetRoom);
      });
      rooms.set(roomId, room);
    }

    const joined = room.addPlayer(socket.id, session.user.username, session.user.username);
    if (!joined) {
      socket.emit("error_message", "Oda dolu veya oyun zaten başlamış.");
      return;
    }

    socket.join(roomId);
    broadcastRoomState(room);
  });

  // Hızlı İfade (Emote)
  socket.on("send_emote", ({ roomId, emote }: { roomId: string; emote: string }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    io.to(roomId).emit("player_emote", { slot: player.slot, emote });
  });

  // Canlı Sohbet
  socket.on("send_chat", ({ roomId, text, isTeamOnly }: { roomId: string; text: string; isTeamOnly?: boolean }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    const session = getSessionUser(socket.id);
    const cleanText = text.trim().slice(0, 150);
    if (!cleanText) return;

    const msgPayload = {
      sender: player.username,
      avatar: session ? session.user.avatar : "👑",
      slot: player.slot,
      text: cleanText,
      isTeamOnly: !!isTeamOnly,
      time: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    };

    if (isTeamOnly && room.mode === "2v2") {
      const myTeam = player.slot % 2;
      for (const p of room.players) {
        if (p.slot % 2 === myTeam) {
          io.to(p.socketId).emit("chat_message", msgPayload);
        }
      }
    } else {
      io.to(roomId).emit("chat_message", msgPayload);
    }
  });

  // Kart Atma
  socket.on("play_card", ({ roomId, cardIndex }: { roomId: string; cardIndex: number }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const playResult = room.playCard(socket.id, cardIndex);
    if (!playResult) {
      socket.emit("error_message", "Sıra sizde değil veya geçersiz hamle.");
      return;
    }

    if (playResult.result.isPishti) {
      io.to(roomId).emit("game_event", {
        type: "PISHTI",
        message: playResult.result.isJackPishti ? "🔥 SÜPER VALE PİŞTİ! (+20)" : "⚡ PİŞTİ! (+10)",
      });
    }

    // Oyun Sonu Altın Dağıtımı
    if (room.status === "FINISHED" && room.finalScores) {
      const isTeamAWinner = room.finalScores.teamA.totalScore >= room.finalScores.teamB.totalScore;
      for (const player of room.players) {
        const isTeamA = player.slot % 2 === 0;
        const won = (isTeamA && isTeamAWinner) || (!isTeamA && !isTeamAWinner);
        const goldGain = won ? 100 : 30;

        const session = getSessionUser(player.socketId);
        if (session) {
          session.user.gold += goldGain;
          if (!session.isGuest) {
            DBManager.addGold(player.username, goldGain);
          }
          io.to(player.socketId).emit("profile_data", { user: session.user, themes: DECK_THEMES, isGuest: session.isGuest });
        }
      }
    }

    broadcastRoomState(room);
  });

  socket.on("disconnect", () => {
    activeSessions.delete(socket.id);
    for (const [roomId, room] of rooms.entries()) {
      room.removePlayer(socket.id);
      if (room.players.length === 0) {
        rooms.delete(roomId);
      } else {
        broadcastRoomState(room);
      }
    }
  });
});

// Canlı ortam için Dinamik Port ve 0.0.0.0 dinleme desteği
const PORT = Number(process.env.PORT) || 3001;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Pişti Sunucusu aktif: Port ${PORT}`);
});