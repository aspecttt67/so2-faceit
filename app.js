import express from "express";
import session from "express-session";
import bcrypt from "bcrypt";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import pkg from "pg";
import { fileURLToPath } from "url";

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

/* ===== MIDDLEWARE ===== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "super-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true },
  })
);
app.use("/public", express.static(path.join(__dirname, "public")));

/* ===== DATABASE POSTGRES ===== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* ===== FUNCTII UTILE ===== */
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect("/");
  next();
}

/* ===== ROUTES ===== */
app.get("/", (req, res) => {
  if (req.session.user) return res.redirect("/dashboard");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "register.html"));
});

app.get("/dashboard", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "protected", "dashboard.html"));
});

app.get("/players", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "protected", "players.html"));
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

/* ===== AUTH ===== */
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    await pool.query(
      "INSERT INTO users (username,password) VALUES ($1,$2)",
      [username, hash]
    );
    req.session.user = { username };
    res.redirect("/dashboard");
  } catch (err) {
    console.error(err);
    res.status(400).send("User exists");
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const r = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
  if (r.rows.length === 0) return res.status(401).send("User not found");

  const user = r.rows[0];
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).send("Wrong password");

  req.session.user = { username };
  res.redirect("/dashboard");
});

/* ===== API PLAYERI ===== */
app.get("/api/players", requireAuth, async (req, res) => {
  const r = await pool.query("SELECT username, elo FROM users ORDER BY elo DESC");
  res.json(r.rows);
});

app.post("/api/players/elo", requireAuth, async (req, res) => {
  const { username, elo } = req.body;
  await pool.query("UPDATE users SET elo=$1 WHERE username=$2", [elo, username]);
  res.json({ success: true });
});

/* ===== SOCKET.IO ===== */
let onlinePlayers = [];
let match = null;
const maps = ["sandstone", "rust", "province", "hanami", "dune", "zone7", "breeze"];

io.on("connection", (socket) => {
  async function sendLeaderboard() {
    const r = await pool.query("SELECT username, elo FROM users ORDER BY elo DESC LIMIT 10");
    socket.emit("updateLeaderboard", r.rows);
  }
  sendLeaderboard();
  const interval = setInterval(sendLeaderboard, 10000);
  socket.on("disconnect", () => clearInterval(interval));

  socket.on("joinMatch", async ({ username, mode }) => {
    if (!username) return;
    if (!onlinePlayers.includes(username)) onlinePlayers.push(username);
    createMatch(username, mode);
  });

  socket.on("pickPlayer", ({ captain, player }) => {
    if (!match) return;
    const poolIndex = match.pool.findIndex((p) => p.username === player);
    if (poolIndex === -1) return;

    if (match.captains[0] === captain) match.team1.push(match.pool[poolIndex]);
    else if (match.captains[1] === captain) match.team2.push(match.pool[poolIndex]);

    match.pool.splice(poolIndex, 1);
    io.emit("updateDraft", match);
  });

  socket.on("banMap", ({ map }) => {
    if (!match) return;
    if (!match.bannedMaps.includes(map)) match.bannedMaps.push(map);
    io.emit("updateDraft", match);

    const available = match.maps.filter((m) => !match.bannedMaps.includes(m));
    if (available.length === 1) {
      match.finalMap = available[0];
      io.emit("matchStart", match);
      match = null;
    }
  });
});

/* ===== Creează match ===== */
async function createMatch(username, mode) {
  const r = await pool.query("SELECT username, elo FROM users");
  const allUsers = r.rows;

  if (mode === "1v1") {
    let players = [username];
    while (players.length < 2) players.push("Bot" + (players.length + 1));

    match = {
      captains: [players[0], players[1]],
      team1: [{ username: players[0], elo: allUsers.find((u) => u.username === players[0])?.elo || 1000 }],
      team2: [{ username: players[1], elo: allUsers.find((u) => u.username === players[1])?.elo || 1000 }],
      pool: [],
      maps: [...maps],
      bannedMaps: [],
    };
    io.emit("matchDraft", match);
  } else if (mode === "5v5") {
    let players = [username];
    while (players.length < 10) players.push("Bot" + (players.length + 1));
    const playersWithElo = players.map((u) => ({ username: u, elo: allUsers.find((x) => x.username === u)?.elo || 1000 }));
    playersWithElo.sort((a, b) => b.elo - a.elo);

    match = {
      captains: [playersWithElo[0].username, playersWithElo[1].username],
      team1: [playersWithElo[0]],
      team2: [playersWithElo[1]],
      pool: playersWithElo.slice(2),
      maps: [...maps],
      bannedMaps: [],
    };
    io.emit("matchDraft", match);
  }
}

/* ===== START SERVER ===== */
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log("Server running on port", PORT);

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        elo INTEGER DEFAULT 1000
      );
    `);
    console.log("Tabelul users este gata!");
  } catch (err) {
    console.error("Eroare la crearea tabelului users:", err);
  }
});