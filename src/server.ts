import express from "express";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import { GameRoom } from "./room";
import { DECK_THEMES, TABLE_THEMES, MASCOTS, FRAMES } from "./themes";
import { DBManager, ACHIEVEMENTS } from "./db";
import { GameVariant, UserProfile, UserStats, MatchRecord } from "./types";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(process.cwd(), "public")));

const rooms = new Map<string, GameRoom>();
const activeSessions = new Map<string, { user: UserProfile; isGuest: boolean }>();

function getSessionUser(socketId: string): { user: UserProfile; isGuest: boolean } | null {
  return activeSessions.get(socketId) || null;
}

function sendProfileUpdate(socketId: string) {
  const session = getSessionUser(socketId);
  if (!session) return;

  io.to(socketId).emit("profile_data", {
    user: session.user,
    themes: DECK_THEMES,
    tableThemes: TABLE_THEMES,
    mascots: MASCOTS,
    frames: FRAMES,
    achievements: ACHIEVEMENTS,
    isGuest: session.isGuest,
  });
}

function checkMatchEnd(room: GameRoom) {
  if (room.status === "FINISHED" && !(room as any).matchStatsProcessed) {
    (room as any).matchStatsProcessed = true;
    const isTeamAWinner = room.cumulativeScores.teamA >= room.cumulativeScores.teamB;
    const finalScoreLabel = `${room.cumulativeScores.teamA} - ${room.cumulativeScores.teamB}`;

    for (const player of room.players) {
      if (player.isBot) continue;
      
      const pSession = getSessionUser(player.socketId);
      if (!pSession) continue;

      const isTeamA = player.slot % 2 === 0;
      const won = (isTeamA && isTeamAWinner) || (!isTeamA && !isTeamAWinner);

      const goldGain = won ? 150 : 50;
      const matchXp = (won ? 100 : 0) + 30;

      const matchRecord: MatchRecord = {
        id: Date.now().toString() + "_" + player.slot,
        date: new Date().toLocaleString('tr-TR', { hour: '2-digit', minute:'2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }),
        mode: room.mode,
        variant: room.variant,
        result: won ? "WIN" : "LOSS",
        score: finalScoreLabel
      };

      if (!pSession.isGuest) {
        DBManager.addMatchRecord(player.username, matchRecord);
        const updatedUser = DBManager.getUser(player.username);
        
        if (updatedUser) {
          updatedUser.stats.totalMatches = (updatedUser.stats.totalMatches || 0) + 1;
          
          if (won) {
            updatedUser.stats.totalWins = (updatedUser.stats.totalWins || 0) + 1;
            updatedUser.stats.winStreak = (updatedUser.stats.winStreak || 0) + 1;
          } else {
            updatedUser.stats.winStreak = 0;
          }
          
          updatedUser.gold += goldGain;
          DBManager.updateUser(updatedUser);
          pSession.user = updatedUser;
        }
      } else {
        pSession.user.matchHistory.unshift(matchRecord);
        if (pSession.user.matchHistory.length > 10) {
          pSession.user.matchHistory.pop();
        }
        
        pSession.user.stats.totalMatches = (pSession.user.stats.totalMatches || 0) + 1;
        
        if (won) {
          pSession.user.stats.totalWins = (pSession.user.stats.totalWins || 0) + 1;
          pSession.user.stats.winStreak = (pSession.user.stats.winStreak || 0) + 1;
        } else {
          pSession.user.stats.winStreak = 0;
        }
        
        pSession.user.gold += goldGain;
      }

      io.to(player.socketId).emit("xp_gained", { 
        amount: matchXp, 
        message: won ? "Galibiyet!" : "Maç Tamamlandı" 
      });
      sendProfileUpdate(player.socketId);
    }
  }
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
        if (p.isBot) {
          return { 
            slot: p.slot, 
            avatar: "🤖", 
            username: p.username, 
            winStreak: 0, 
            mascotId: "default_cat", 
            frameClass: "border-slate-700" 
          };
        }
        
        const pSession = getSessionUser(p.socketId);
        return {
          slot: p.slot,
          avatar: pSession ? pSession.user.avatar : "👑",
          username: p.username,
          winStreak: pSession ? (pSession.user.stats.winStreak || 0) : 0,
          mascotId: pSession ? pSession.user.selectedMascotId : "default_cat",
          frameClass: pSession ? (FRAMES[pSession.user.selectedFrameId]?.cssClass || "border-slate-700") : "border-slate-700"
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
    sendProfileUpdate(socket.id);

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
      mascotInventory: ["default_cat"],
      selectedMascotId: "default_cat",
      frameInventory: ["default_frame"],
      selectedFrameId: "default_frame",
      matchHistory: [],
      stats: { totalWins: 0, totalMatches: 0, totalPishtis: 0, totalJackPishtis: 0, totalCardsCaptured: 0, winStreak: 0 },
      claimedAchievements: [],
    };

    activeSessions.set(socket.id, { user: guestUser, isGuest: true });
    socket.emit("auth_success", { user: guestUser, isGuest: true });
    sendProfileUpdate(socket.id);
  });

  socket.on("logout", () => {
    activeSessions.delete(socket.id);
    socket.emit("logout_success");
  });

  socket.on("claim_achievement", ({ achievementId }: { achievementId: string }) => {
    const session = getSessionUser(socket.id);
    if (!session) return;

    if (session.isGuest) {
      const ach = ACHIEVEMENTS.find((a) => a.id === achievementId);
      if (!ach) return;
      
      if (session.user.claimedAchievements.includes(achievementId)) {
        socket.emit("error_message", "Bu ödül zaten alındı.");
        return;
      }
      
      const cur = session.user.stats[ach.statKey] || 0;
      if (cur < ach.target) {
        socket.emit("error_message", "Görev henüz tamamlanmadı.");
        return;
      }
      
      session.user.gold += ach.rewardGold;
      session.user.claimedAchievements.push(achievementId);
      
      socket.emit("achievement_claimed", { 
        achievementId, 
        rewardGold: ach.rewardGold, 
        message: `Tebrikler! ${ach.rewardGold} 🪙 kazandınız!` 
      });
      sendProfileUpdate(socket.id);
      return;
    }

    const result = DBManager.claimAchievement(session.user.username, achievementId);
    if (result.success && result.user) {
      session.user = result.user;
      socket.emit("achievement_claimed", { 
        achievementId, 
        rewardGold: result.rewardGold, 
        message: result.message 
      });
      sendProfileUpdate(socket.id);
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
    sendProfileUpdate(socket.id);
  });

  // Genel Dükkan Satın Alma Yöneticisi
  socket.on("buy_item", ({ type, itemId }: { type: "theme"|"table"|"mascot"|"frame", itemId: string }) => {
    const session = getSessionUser(socket.id);
    if (!session) return;
    
    let catalog: any, inventoryKey: keyof UserProfile, selectedKey: keyof UserProfile;
    
    if (type === "theme") { 
      catalog = DECK_THEMES; inventoryKey = "inventory"; selectedKey = "selectedThemeId"; 
    } else if (type === "table") { 
      catalog = TABLE_THEMES; inventoryKey = "tableInventory"; selectedKey = "selectedTableThemeId"; 
    } else if (type === "mascot") { 
      catalog = MASCOTS; inventoryKey = "mascotInventory"; selectedKey = "selectedMascotId"; 
    } else if (type === "frame") { 
      catalog = FRAMES; inventoryKey = "frameInventory"; selectedKey = "selectedFrameId"; 
    } else {
      return;
    }

    const item = catalog[itemId];
    
    if (!item || (session.user[inventoryKey] as string[]).includes(itemId) || item.isExclusive) {
      return;
    }

    if (session.user.gold >= item.price) {
      session.user.gold -= item.price;
      (session.user[inventoryKey] as string[]).push(itemId);
      (session.user[selectedKey] as string) = itemId;
      
      if (!session.isGuest) {
        DBManager.updateUser(session.user);
      }
      sendProfileUpdate(socket.id);
    }
  });

  // Genel Dükkan Seçim Yöneticisi
  socket.on("select_item", ({ type, itemId }: { type: "theme"|"table"|"mascot"|"frame", itemId: string }) => {
    const session = getSessionUser(socket.id);
    if (!session) return;

    let inventoryKey: keyof UserProfile, selectedKey: keyof UserProfile;
    
    if (type === "theme") { 
      inventoryKey = "inventory"; selectedKey = "selectedThemeId"; 
    } else if (type === "table") { 
      inventoryKey = "tableInventory"; selectedKey = "selectedTableThemeId"; 
    } else if (type === "mascot") { 
      inventoryKey = "mascotInventory"; selectedKey = "selectedMascotId"; 
    } else if (type === "frame") { 
      inventoryKey = "frameInventory"; selectedKey = "selectedFrameId"; 
    } else {
      return;
    }

    if ((session.user[inventoryKey] as string[]).includes(itemId)) {
      (session.user[selectedKey] as string) = itemId;
      if (!session.isGuest) {
        DBManager.updateUser(session.user);
      }
      sendProfileUpdate(socket.id);
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
        if (targetRoom) {
          checkMatchEnd(targetRoom);
          broadcastRoomState(targetRoom);
        }
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
    const session = getSessionUser(socket.id);

    if (currentPlayer && !currentPlayer.isBot && session) {
      const delta: Partial<UserStats> = {};
      
      if (playResult.result.isPishti) {
        delta.totalPishtis = 1;
        if (playResult.result.isJackPishti) {
          delta.totalJackPishtis = 1;
        }
      }
      
      if (playResult.result.captured && playResult.result.capturedCount > 0) {
        delta.totalCardsCaptured = playResult.result.capturedCount;
      }

      if (Object.keys(delta).length > 0) {
        if (!session.isGuest) {
          const updated = DBManager.addStats(session.user.username, delta);
          if (updated) session.user = updated;
        } else {
          session.user.stats.totalPishtis = (session.user.stats.totalPishtis || 0) + (delta.totalPishtis || 0);
          session.user.stats.totalJackPishtis = (session.user.stats.totalJackPishtis || 0) + (delta.totalJackPishtis || 0);
          session.user.stats.totalCardsCaptured = (session.user.stats.totalCardsCaptured || 0) + (delta.totalCardsCaptured || 0);
        }

        let gainedXp = 0;
        let actionMsg = "Kart Toplandı";
        
        if (delta.totalCardsCaptured) gainedXp += delta.totalCardsCaptured * 2;
        if (delta.totalPishtis) {
          gainedXp += 25;
          actionMsg = "Pişti!";
        }
        if (delta.totalJackPishtis) {
          gainedXp += 60;
          actionMsg = "Süper Vale!";
        }

        if (gainedXp > 0) {
          io.to(socket.id).emit("xp_gained", { amount: gainedXp, message: actionMsg });
        }

        sendProfileUpdate(socket.id);
      }
    }

    // Maskot Tetiklemeleri
    if (currentPlayer) {
      if (playResult.result.isPishti) {
        io.to(roomId).emit("mascot_action", { slot: currentPlayer.slot, action: "pishti" });
      } else if (playResult.result.captured && playResult.result.capturedCount > 0) {
        io.to(roomId).emit("mascot_action", { slot: currentPlayer.slot, action: "capture" });
      } else {
        io.to(roomId).emit("mascot_action", { slot: currentPlayer.slot, action: "play" });
      }
    }

    if (playResult.result.isPishti) {
      const pishtiVal = room.variant === "bloody" ? (playResult.result.isJackPishti ? "+40" : "+20") : (playResult.result.isJackPishti ? "+20" : "+10");
      io.to(roomId).emit("game_event", {
        type: "PISHTI",
        message: playResult.result.isJackPishti ? `🔥 SÜPER VALE PİŞTİ! (${pishtiVal})` : `⚡ PİŞTİ! (${pishtiVal})`,
      });
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