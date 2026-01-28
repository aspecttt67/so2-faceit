import express from "express";
import session from "express-session";
import bcrypt from "bcrypt";
import fs from "fs";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import { fileURLToPath } from "url";

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
    cookie: { secure: false, httpOnly: true }
  })
);

// Serve static files
app.use("/public", express.static(path.join(__dirname, "public")));

/* ===== AUTH ===== */
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect("/");
  next();
}

// Load users from JSON
function loadUsers() {
  const usersPath = path.join(__dirname, "users.json");
  if (!fs.existsSync(usersPath)) return [];
  const data = fs.readFileSync(usersPath, "utf-8");
  if (!data) return [];
  return JSON.parse(data);
}

// Save users to JSON
function saveUsers(users) {
  const usersPath = path.join(__dirname, "users.json");
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
}

/* ===== ROUTES ===== */

// Login page
app.get("/", (req, res) => {
  if (req.session.user) return res.redirect("/dashboard");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Register page
app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "register.html"));
});

// Dashboard
app.get("/dashboard", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "protected", "dashboard.html"));
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

/* ===== AUTH ROUTES ===== */

// Register
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  let users = loadUsers();

  if (users.find(u => u.username === username)) {
    return res.status(400).send("User exists");
  }

  const hash = await bcrypt.hash(password, 10);
  users.push({ username, password: hash, elo: 1000 }); // ELO inițial
  saveUsers(users);

  // Set session imediat după register
  req.session.user = { username };
  res.redirect("/dashboard");
});

// Login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();

  const user = users.find(u => u.username === username);
  if (!user) return res.status(401).send("User not found");

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).send("Wrong password");

  req.session.user = { username };
  res.redirect("/dashboard");
});

/* ===== SOCKET.IO ===== */

let queue = [];
let match = null;

// Mapele disponibile
const maps = ["sandstone", "rust", "province", "hanami", "dune", "zone7", "breeze"];

io.on("connection", socket => {
  // Trimite leaderboard la conectare și periodic
  function sendLeaderboard() {
    const users = loadUsers()
      .sort((a,b) => b.elo - a.elo)
      .slice(0,10);
    socket.emit("updateLeaderboard", users);
  }
  sendLeaderboard();
  const interval = setInterval(sendLeaderboard, 10000);
  socket.on("disconnect", () => clearInterval(interval));

  // Join Queue
  socket.on("joinQueue", username => {
    if (!queue.includes(username)) queue.push(username);
    io.emit("queueUpdate", queue);

    if (queue.length >= 10) startMatch();
  });

  // Pick player (de către căpitani)
  socket.on("pickPlayer", ({ captain, player }) => {
    if (!match) return;
    if (match.pool.includes(player)) {
      if (match.captains[0] === captain) match.team1.push(player);
      else if (match.captains[1] === captain) match.team2.push(player);
      match.pool = match.pool.filter(p => p !== player);
      io.emit("matchDraft", match);
    }
  });

  // Ban map
  socket.on("banMap", ({ captain, map }) => {
    if (!match) return;
    if (!match.bannedMaps.includes(map)) {
      match.bannedMaps.push(map);
      io.emit("matchDraft", match);
      // Dacă rămâne o singură hartă, finalizează meciul
      const availableMaps = match.maps.filter(m => !match.bannedMaps.includes(m));
      if (availableMaps.length === 1) {
        match.finalMap = availableMaps[0];
        io.emit("matchStart", match);
        queue = [];
        match = null;
      }
    }
  });
});

// Start match
function startMatch() {
  const players = [...queue];
  queue = [];

  // Alege cei 2 cu ELO cel mai mare ca căpitani
  const allUsers = loadUsers();
  const playersWithElo = players.map(u => {
    const user = allUsers.find(x => x.username === u);
    return { username: u, elo: user ? user.elo : 1000 };
  }).sort((a,b) => b.elo - a.elo);

  match = {
    captains: [playersWithElo[0].username, playersWithElo[1].username],
    team1: [playersWithElo[0].username],
    team2: [playersWithElo[1].username],
    pool: playersWithElo.slice(2).map(p => p.username),
    maps: [...maps],
    bannedMaps: []
  };

  io.emit("matchDraft", match);
}

/* ===== START SERVER ===== */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on port", PORT));