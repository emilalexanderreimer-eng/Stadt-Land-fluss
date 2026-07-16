"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { WebSocketServer } = require("ws");

const PORT = parseInt(process.env.PORT, 10) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const DEFAULT_CATEGORIES = ["Stadt", "Land", "Fluss", "Name", "Tier", "Beruf"];
const ALPHABET = [..."ABCDEFGHIJKLMNOPRSTUVWZ"]; // ohne Q, X, Y
const COLLECT_GRACE_MS = 2500; // Wartezeit auf letzte Antworten nach Rundenende
const SPLASH_MS = 3000;        // Buchstaben-Animation auf den Clients

// ─── Statischer HTTP-Server ──────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});

// ─── Spielzustand (ein Spiel pro Server) ─────────────────────────────
const game = {
  phase: "lobby", // lobby | play | scoring | scoreboard | gameover
  categories: [...DEFAULT_CATEGORIES],
  roundSeconds: 60,
  totalRounds: 5,
  round: 0,
  usedLetters: [],
  letter: null,
  endsAt: null,
  hostName: null,
  finishedBy: null,
  players: [], // { name, ws, connected, score, inRound, answers[], invalid[] }
  roundTimer: null,
  collecting: false,
  collectTimer: null,
  pending: new Set(),
};

function lanUrls() {
  const addrs = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => `http://${i.address}:${PORT}`);
  return addrs.length ? addrs : [`http://localhost:${PORT}`];
}

function normalize(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, " ");
}

function playerByName(name) {
  return game.players.find((p) => normalize(p.name) === normalize(name));
}

function ensureHost() {
  const host = game.players.find((p) => p.name === game.hostName && p.connected);
  if (!host) {
    const next = game.players.find((p) => p.connected);
    game.hostName = next ? next.name : null;
  }
}

// ─── Punktelogik (klassische Regeln) ─────────────────────────────────
function startsWithLetter(normalized) {
  return normalized.length > 0 && normalized[0].toUpperCase() === game.letter;
}

function answerCounts(catIdx) {
  const counts = {};
  for (const p of game.players) {
    if (!p.inRound || p.invalid[catIdx]) continue;
    const a = normalize(p.answers[catIdx] || "");
    if (!a || !startsWithLetter(a)) continue;
    counts[a] = (counts[a] || 0) + 1;
  }
  return counts;
}

function pointsFor(p, catIdx, counts) {
  if (!p.inRound || p.invalid[catIdx]) return 0;
  const a = normalize(p.answers[catIdx] || "");
  if (!a || !startsWithLetter(a)) return 0;
  const validAnswerers = Object.values(counts).reduce((s, c) => s + c, 0);
  if (counts[a] > 1) return 5;
  if (validAnswerers === 1) return 20;
  return 10;
}

function scoringMatrix() {
  const points = {};
  const totals = {};
  for (const p of game.players) {
    points[p.name] = [];
    totals[p.name] = 0;
  }
  game.categories.forEach((_, ci) => {
    const counts = answerCounts(ci);
    for (const p of game.players) {
      const pts = pointsFor(p, ci, counts);
      points[p.name][ci] = pts;
      totals[p.name] += pts;
    }
  });
  return { points, totals };
}

// ─── State-Broadcast ─────────────────────────────────────────────────
function stateFor(p) {
  const base = {
    type: "state",
    phase: game.phase,
    you: p.name,
    isHost: p.name === game.hostName,
    hostName: game.hostName,
    urls: lanUrls(),
    round: game.round,
    totalRounds: game.totalRounds,
    roundSeconds: game.roundSeconds,
    categories: game.categories,
    letter: game.letter,
    endsAt: game.endsAt,
    finishedBy: game.finishedBy,
    players: game.players.map((q) => ({
      name: q.name,
      score: q.score,
      connected: q.connected,
      inRound: q.inRound,
    })),
  };
  if (game.phase === "scoring") {
    const { points, totals } = scoringMatrix();
    const inRound = game.players.filter((q) => q.inRound);
    base.answers = Object.fromEntries(inRound.map((q) => [q.name, q.answers]));
    base.invalid = Object.fromEntries(inRound.map((q) => [q.name, q.invalid]));
    base.points = points;
    base.roundTotals = totals;
  }
  return base;
}

function broadcast() {
  for (const p of game.players) {
    if (p.ws && p.ws.readyState === 1) {
      p.ws.send(JSON.stringify(stateFor(p)));
    }
  }
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

// ─── Rundenablauf ────────────────────────────────────────────────────
function startRound() {
  game.round += 1;
  game.finishedBy = null;
  game.collecting = false;
  clearTimeout(game.collectTimer);

  const available = ALPHABET.filter((l) => !game.usedLetters.includes(l));
  const pool = available.length ? available : ALPHABET;
  game.letter = pool[Math.floor(Math.random() * pool.length)];
  game.usedLetters.push(game.letter);

  for (const p of game.players) {
    p.inRound = true;
    p.answers = game.categories.map(() => "");
    p.invalid = game.categories.map(() => false);
  }

  game.phase = "play";
  game.endsAt = Date.now() + SPLASH_MS + game.roundSeconds * 1000;
  clearTimeout(game.roundTimer);
  game.roundTimer = setTimeout(() => endRound(null), game.endsAt - Date.now());
  broadcast();
}

function endRound(byName) {
  if (game.phase !== "play" || game.collecting) return;
  clearTimeout(game.roundTimer);
  game.finishedBy = byName || null;
  game.collecting = true;
  game.endsAt = null;

  // letzte Antworten von allen einsammeln
  game.pending = new Set(
    game.players.filter((p) => p.inRound && p.connected && normalize(p.name) !== normalize(byName || "")).map((p) => p.name)
  );
  for (const p of game.players) {
    if (p.inRound) send(p.ws, { type: "collect" });
  }
  if (game.pending.size === 0) {
    finishCollect();
  } else {
    game.collectTimer = setTimeout(finishCollect, COLLECT_GRACE_MS);
  }
}

function finishCollect() {
  if (!game.collecting) return;
  game.collecting = false;
  clearTimeout(game.collectTimer);
  game.phase = "scoring";
  broadcast();
}

function resetGame() {
  clearTimeout(game.roundTimer);
  clearTimeout(game.collectTimer);
  game.phase = "lobby";
  game.round = 0;
  game.usedLetters = [];
  game.letter = null;
  game.endsAt = null;
  game.hostName = null;
  game.finishedBy = null;
  game.players = [];
  game.collecting = false;
  game.pending = new Set();
}

function sanitizeAnswers(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return game.categories.map((_, i) => String(arr[i] ?? "").slice(0, 40));
}

// ─── WebSocket-Handling ──────────────────────────────────────────────
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  let me = null;

  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }

    // ── Beitreten / Wiederverbinden ──
    if (msg.type === "join") {
      const name = String(msg.name || "").trim().slice(0, 20);
      if (!name) {
        send(ws, { type: "error", msg: "Bitte einen Namen eingeben." });
        return;
      }
      const existing = playerByName(name);
      if (existing && existing.connected) {
        send(ws, { type: "error", msg: "Dieser Name ist schon vergeben." });
        return;
      }
      if (existing) {
        // Wiederverbinden: Platz und Punkte übernehmen
        existing.ws = ws;
        existing.connected = true;
        me = existing;
      } else {
        if (game.players.length >= 8) {
          send(ws, { type: "error", msg: "Das Spiel ist voll (max. 8 Spieler)." });
          return;
        }
        me = {
          name,
          ws,
          connected: true,
          score: 0,
          inRound: false, // steigt ab der nächsten Runde ein
          answers: game.categories.map(() => ""),
          invalid: game.categories.map(() => false),
        };
        game.players.push(me);
      }
      if (!game.hostName) game.hostName = me.name;
      ensureHost();
      send(ws, { type: "joined", name: me.name });
      broadcast();
      return;
    }

    if (!me) return;
    const isHost = me.name === game.hostName;

    switch (msg.type) {
      // ── Lobby: Konfiguration (nur Spielleiter) ──
      case "config": {
        if (!isHost || game.phase !== "lobby") return;
        if (Array.isArray(msg.categories)) {
          const cats = [];
          for (const c of msg.categories) {
            const name = String(c).trim().slice(0, 30);
            if (name && !cats.some((x) => normalize(x) === normalize(name))) cats.push(name);
            if (cats.length >= 12) break;
          }
          if (cats.length >= 2) game.categories = cats;
        }
        if (msg.roundSeconds !== undefined) {
          game.roundSeconds = Math.min(600, Math.max(10, parseInt(msg.roundSeconds, 10) || 60));
        }
        if (msg.totalRounds !== undefined) {
          game.totalRounds = Math.min(26, Math.max(1, parseInt(msg.totalRounds, 10) || 5));
        }
        broadcast();
        return;
      }

      case "start": {
        if (!isHost || game.phase !== "lobby") return;
        if (game.players.filter((p) => p.connected).length < 1) return;
        game.round = 0;
        game.usedLetters = [];
        for (const p of game.players) p.score = 0;
        startRound();
        return;
      }

      // ── Spielphase ──
      case "answers": {
        if (game.phase !== "play" || !me.inRound) return;
        me.answers = sanitizeAnswers(msg.answers);
        if (game.collecting) {
          game.pending.delete(me.name);
          if (game.pending.size === 0) finishCollect();
        }
        return;
      }

      case "finish": {
        if (game.phase !== "play" || game.collecting || !me.inRound) return;
        me.answers = sanitizeAnswers(msg.answers);
        if (!me.answers.every((a) => a.trim() !== "")) {
          send(ws, { type: "error", msg: "Erst alle Felder ausfüllen!" });
          return;
        }
        endRound(me.name);
        return;
      }

      // ── Auswertung (nur Spielleiter) ──
      case "toggleInvalid": {
        if (!isHost || game.phase !== "scoring") return;
        const target = playerByName(String(msg.player || ""));
        const ci = parseInt(msg.catIdx, 10);
        if (!target || !target.inRound || !(ci >= 0 && ci < game.categories.length)) return;
        target.invalid[ci] = !target.invalid[ci];
        broadcast();
        return;
      }

      case "confirmScores": {
        if (!isHost || game.phase !== "scoring") return;
        const { totals } = scoringMatrix();
        for (const p of game.players) p.score += totals[p.name] || 0;
        game.phase = "scoreboard";
        broadcast();
        return;
      }

      // ── Rundenwechsel / Spielende (nur Spielleiter) ──
      case "nextRound": {
        if (!isHost || game.phase !== "scoreboard" || game.round >= game.totalRounds) return;
        startRound();
        return;
      }

      case "endGame": {
        if (!isHost || game.phase !== "scoreboard") return;
        game.phase = "gameover";
        broadcast();
        return;
      }

      case "playAgain": {
        if (!isHost || game.phase !== "gameover") return;
        game.phase = "lobby";
        game.round = 0;
        game.usedLetters = [];
        game.letter = null;
        game.finishedBy = null;
        for (const p of game.players) {
          p.score = 0;
          p.inRound = false;
        }
        // Getrennte Spieler aus der Lobby entfernen
        game.players = game.players.filter((p) => p.connected);
        ensureHost();
        broadcast();
        return;
      }
    }
  });

  ws.on("close", () => {
    if (!me) return;
    me.connected = false;
    me.ws = null;
    if (game.phase === "lobby") {
      // in der Lobby direkt entfernen — nach Spielstart bleibt der Platz für Reconnect
      game.players = game.players.filter((p) => p !== me);
    }
    if (game.collecting) {
      game.pending.delete(me.name);
      if (game.pending.size === 0) finishCollect();
    }
    // Wenn niemand mehr verbunden ist, Spiel komplett zurücksetzen
    if (!game.players.some((p) => p.connected)) {
      resetGame();
      return;
    }
    ensureHost();
    broadcast();
  });
});

// ─── Start ───────────────────────────────────────────────────────────
server.listen(PORT, "0.0.0.0", () => {
  console.log("Stadt Land Fluss läuft!\n");
  console.log("Mitspieler im gleichen WLAN öffnen im Browser:");
  for (const url of lanUrls()) console.log(`  ${url}`);
  console.log(`\n(lokal: http://localhost:${PORT})`);
});
