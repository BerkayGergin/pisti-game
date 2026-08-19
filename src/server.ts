import express from "express";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import { GameRoom } from "./room";
import { DECK_THEMES, TABLE_THEMES } from "./themes";
import { DBManager, ACHIEVEMENTS } from "./db";
import { GameVariant, UserProfile } from "./types";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(process.cwd(), "public")));

const rooms = new Map<string, GameRoom>();
const activeSessions = new Map<string, { user: UserProfile; isGuest: boolean }>();

function getSessionUser(socketId: string): { user: UserProfile; isGuest: boolean } | null {
  return activeSessions.get(socketId) || null;
}

function broadcastRoomState(room: GameRoom) {
  for (const player of room.players) {
    if (player.isBot) continue;

    const session = getSessionUser(player.socketId);
    const activeThemeId = session ? session.user.selectedThemeId : "classic";
    const activeTableThemeId = session ? session.user.selectedTableThemeId : "classic_green";

    io.to(player.socketId).emit("game_state", {
      ...room.getClientState(player.socketId),
      activeTheme: DECK_THEMES[activeThemeId] || DECK_THEMES.classic,
      activeTableTheme: TABLE_THEMES[activeTableThemeId] || TABLE_THEMES.classic_green,
      playerAvatars: room.players.map((p) => {
        if (p.isBot) return { slot: p.slot, avatar: "🤖", username: p.username };
        const pSession = getSessionUser(p.socketId);
        return {
          slot: p.slot,
          avatar: pSession ? pSession.user.avatar : "👑",
          username: p.username,
        };
      }),
    });
  }
}

io.on("connection", (socket) => {
  socket.on("auth_user", ({ username, password }: { username: string; password: string }) => {
    const auth = DBManager.authenticateUser(username, password);
    if (!auth.success || !auth.user) {
      socket.emit("auth_error", auth.message || "Giriş başarısız.");
      return;
    }

    activeSessions.set(socket.id, { user: auth.user, isGuest: false });
    socket.emit("auth_success", { user: auth.user, isGuest: false });
    socket.emit("profile_data", {
      user: auth.user,
      themes: DECK_THEMES,
      tableThemes: TABLE_THEMES,
      achievements: ACHIEVEMENTS,
      isGuest: false,
    });

    for (const [rId, r] of rooms.entries()) {
      const p = r.players.find((pl) => pl.username === auth.user!.username);
      if (p && p.isDisconnected) {
        socket.join(rId);
        r.handleReconnect(auth.user.username, socket.id);
        broadcastRoomState(r);
        break;
      }
    }
  });

  socket.on("guest_login", (customName?: string) => {
    const randomId = Math.floor(1000 + Math.random() * 9000);
    const guestUsername = customName && customName.trim() ? `${customName.trim()} (Misafir)` : `Misafir_${randomId}`;

    const guestUser: UserProfile = {
      username: guestUsername,
      gold: 50,
      avatar: "👤",
      inventory: ["classic"],
      selectedThemeId: "classic",
      tableInventory: ["classic_green"],
      selectedTableThemeId: "classic_green",
      stats: { totalWins: 0, totalMatches: 0, totalPishtis: 0, totalJackPishtis: 0, totalCardsCaptured: 0 },
      claimedAchievements: [],
    };

    activeSessions.set(socket.id, { user: guestUser, isGuest: true });
    socket.emit("auth_success", { user: guestUser, isGuest: true });
    socket.emit("profile_data", {
      user: guestUser,
      themes: DECK_THEMES,
      tableThemes: TABLE_THEMES,
      achievements: ACHIEVEMENTS,
      isGuest: true,
    });
  });

  socket.on("logout", () => {
    activeSessions.delete(socket.id);
    socket.emit("logout_success");
  });

  socket.on("claim_achievement", ({ achievementId }: { achievementId: string }) => {
    const session = getSessionUser(socket.id);
    if (!session || session.isGuest) {
      socket.emit("error_message", "Misafir hesaplar görev ödülü toplayamaz.");
      return;
    }

    const result = DBManager.claimAchievement(session.user.username, achievementId);
    if (result.success && result.user) {
      session.user = result.user;
      socket.emit("achievement_claimed", { achievementId, rewardGold: result.rewardGold, message: result.message });
      socket.emit("profile_data", { user: session.user, themes: DECK_THEMES, tableThemes: TABLE_THEMES, achievements: ACHIEVEMENTS, isGuest: false });
    } else {
      socket.emit("error_message", result.message);
    }
  });

  socket.on("change_password", ({ oldPassword, newPassword }: { oldPassword: string; newPassword: string }) => {
    const session = getSessionUser(socket.id);
    if (!session || session.isGuest) {
      socket.emit("password_change_result", { success: false, message: "Misafir hesapların şifresi yoktur." });
      return;
    }
    const result = DBManager.changePassword(session.user.username, oldPassword, newPassword);
    socket.emit("password_change_result", result);
  });

  socket.on("get_leaderboard", () => {
    const leaderboard = DBManager.getLeaderboard(10);
    socket.emit("leaderboard_data", leaderboard);
  });

  socket.on("select_avatar", ({ avatar }: { avatar: string }) => {
    const session = getSessionUser(socket.id);
    if (!session) return;

    session.user.avatar = avatar;
    if (!session.isGuest) {
      DBManager.updateUser(session.user);
    }
    socket.emit("profile_data", { user: session.user, themes: DECK_THEMES, tableThemes: TABLE_THEMES, achievements: ACHIEVEMENTS, isGuest: session.isGuest });
  });

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
      socket.emit("profile_data", { user: session.user, themes: DECK_THEMES, tableThemes: TABLE_THEMES, achievements: ACHIEVEMENTS, isGuest: session.isGuest });
    }
  });

  socket.on("select_theme", ({ themeId }: { themeId: string }) => {
    const session = getSessionUser(socket.id);
    if (session && session.user.inventory.includes(themeId)) {
      session.user.selectedThemeId = themeId;
      if (!session.isGuest) {
        DBManager.updateUser(session.user);
      }
      socket.emit("profile_data", { user: session.user, themes: DECK_THEMES, tableThemes: TABLE_THEMES, achievements: ACHIEVEMENTS, isGuest: session.isGuest });
    }
  });

  socket.on("buy_table_theme", ({ tableThemeId }: { tableThemeId: string }) => {
    const session = getSessionUser(socket.id);
    if (!session) return;

    const tableTheme = TABLE_THEMES[tableThemeId];
    if (!tableTheme || (session.user.tableInventory && session.user.tableInventory.includes(tableThemeId)) || tableTheme.isExclusive) return;

    if (session.user.gold >= tableTheme.price) {
      session.user.gold -= tableTheme.price;
      if (!session.user.tableInventory) session.user.tableInventory = ["classic_green"];
      session.user.tableInventory.push(tableThemeId);
      session.user.selectedTableThemeId = tableThemeId;

      if (!session.isGuest) {
        DBManager.updateUser(session.user);
      }
      socket.emit("profile_data", { user: session.user, themes: DECK_THEMES, tableThemes: TABLE_THEMES, achievements: ACHIEVEMENTS, isGuest: session.isGuest });
    }
  });

  socket.on("select_table_theme", ({ tableThemeId }: { tableThemeId: string }) => {
    const session = getSessionUser(socket.id);
    if (session && session.user.tableInventory && session.user.tableInventory.includes(tableThemeId)) {
      session.user.selectedTableThemeId = tableThemeId;
      if (!session.isGuest) {
        DBManager.updateUser(session.user);
      }
      socket.emit("profile_data", { user: session.user, themes: DECK_THEMES, tableThemes: TABLE_THEMES, achievements: ACHIEVEMENTS, isGuest: session.isGuest });
    }
  });

  socket.on("join_room", ({ roomId, mode, targetScore, variant }: { roomId: string; mode: "1v1" | "2v2"; targetScore?: number; variant?: GameVariant }) => {
    const session = getSessionUser(socket.id);
    if (!session) {
      socket.emit("error_message", "Lütfen önce giriş yapın veya misafir olarak devam edin.");
      return;
    }

    const finalTargetScore = targetScore !== undefined ? Number(targetScore) : 51;
    const finalVariant: GameVariant = variant || "standard";

    let room = rooms.get(roomId);
    if (!room) {
      room = new GameRoom(roomId, mode, finalTargetScore, finalVariant, (rId) => {
        const targetRoom = rooms.get(rId);
        if (targetRoom) broadcastRoomState(targetRoom);
      });
      rooms.set(roomId, room);
    }

    const existingPlayer = room.players.find((p) => p.username === session.user.username);
    if (existingPlayer) {
      socket.join(roomId);
      room.handleReconnect(session.user.username, socket.id);
      broadcastRoomState(room);
      return;
    }

    const joined = room.addPlayer(socket.id, session.user.username, session.user.username);
    if (!joined) {
      socket.emit("error_message", "Oda dolu veya oyun zaten başlamış.");
      return;
    }

    socket.join(roomId);
    broadcastRoomState(room);
  });

  socket.on("add_bot", ({ roomId }: { roomId: string }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const added = room.addBot();
    if (added) {
      broadcastRoomState(room);
    } else {
      socket.emit("error_message", "Oda dolu veya oyun başlamış durumda.");
    }
  });

  socket.on("leave_room", ({ roomId }: { roomId: string }) => {
    const room = rooms.get(roomId);
    if (room) {
      room.removePlayer(socket.id);
      socket.leave(roomId);
      if (room.players.length === 0 || room.players.every((p) => p.isBot)) {
        rooms.delete(roomId);
      } else {
        broadcastRoomState(room);
      }
    }
  });

  socket.on("send_emote", ({ roomId, emote }: { roomId: string; emote: string }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    io.to(roomId).emit("player_emote", { slot: player.slot, emote });
  });

  // Sesli Replik Gönderme (Soundboard)
  socket.on("send_voice_line", ({ roomId, lineKey, text }: { roomId: string; lineKey: string; text: string }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;

    io.to(roomId).emit("voice_line_played", {
      slot: player.slot,
      lineKey,
      text,
    });
  });

  socket.on("throw_object", ({ roomId, targetSlot, item }: { roomId: string; targetSlot: number; item: string }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;

    io.to(roomId).emit("object_thrown", {
      fromSlot: player.slot,
      targetSlot,
      item,
    });
  });

  socket.on("send_chat", ({ roomId, text, isTeamOnly }: { roomId: string; text: string; isTeamOnly?: boolean }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.players.find((p) => p.socketId === socket.id);
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
      time: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
    };

    if (isTeamOnly && room.mode === "2v2") {
      const myTeam = player.slot % 2;
      for (const p of room.players) {
        if (!p.isBot && p.slot % 2 === myTeam) {
          io.to(p.socketId).emit("chat_message", msgPayload);
        }
      }
    } else {
      io.to(roomId).emit("chat_message", msgPayload);
    }
  });

  socket.on("play_card", ({ roomId, cardIndex }: { roomId: string; cardIndex: number }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const playResult = room.playCard(socket.id, cardIndex);
    if (!playResult) {
      socket.emit("error_message", "Sıra sizde değil veya geçersiz hamle.");
      return;
    }

    const currentPlayer = room.players.find((p) => p.socketId === socket.id);
    if (currentPlayer && !currentPlayer.isBot) {
      if (playResult.result.isPishti) {
        DBManager.addStats(currentPlayer.username, {
          totalPishtis: 1,
          totalJackPishtis: playResult.result.isJackPishti ? 1 : 0,
        });
      }
      if (playResult.result.captured) {
        DBManager.addStats(currentPlayer.username, {
          totalCardsCaptured: room.middleCards.length > 0 ? room.middleCards.length : 2,
        });
      }
    }

    if (playResult.result.isPishti) {
      const pishtiVal = room.variant === "bloody" ? (playResult.result.isJackPishti ? "+40" : "+20") : (playResult.result.isJackPishti ? "+20" : "+10");
      io.to(roomId).emit("game_event", {
        type: "PISHTI",
        message: playResult.result.isJackPishti ? `🔥 SÜPER VALE PİŞTİ! (${pishtiVal})` : `⚡ PİŞTİ! (${pishtiVal})`,
      });
    }

    if (room.status === "FINISHED") {
      const isTeamAWinner = room.cumulativeScores.teamA >= room.cumulativeScores.teamB;
      for (const player of room.players) {
        if (player.isBot) continue;
        const isTeamA = player.slot % 2 === 0;
        const won = (isTeamA && isTeamAWinner) || (!isTeamA && !isTeamAWinner);
        const goldGain = won ? 150 : 50;

        DBManager.addStats(player.username, { totalMatches: 1, totalWins: won ? 1 : 0 });
        DBManager.addGold(player.username, goldGain);

        const updatedUser = DBManager.getUser(player.username);
        const session = getSessionUser(player.socketId);
        if (session && updatedUser) {
          session.user = updatedUser;
          io.to(player.socketId).emit("profile_data", { user: session.user, themes: DECK_THEMES, tableThemes: TABLE_THEMES, achievements: ACHIEVEMENTS, isGuest: session.isGuest });
        }
      }
    }

    broadcastRoomState(room);
  });

  socket.on("disconnect", () => {
    for (const [roomId, room] of rooms.entries()) {
      room.handleDisconnect(socket.id);
      if (room.players.length === 0 || room.players.every((p) => p.isBot)) {
        rooms.delete(roomId);
      } else {
        broadcastRoomState(room);
      }
    }
    activeSessions.delete(socket.id);
  });
});

const PORT = Number(process.env.PORT) || 3001;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Pişti Sunucusu aktif: Port ${PORT}`);
});