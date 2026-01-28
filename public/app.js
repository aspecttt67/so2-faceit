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

app.use("/public", express.static(path.join(__dirname, "public")));

/* ===== AUTH ===== */
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect("/");
  next();
}

// Users
function loadUsers() {
  const usersPath = path.join(__dirname, "users.json");
  if (!fs.existsSync(usersPath)) return [];
  const data = fs.readFileSync(usersPath, "utf-8");
  if (!data) return [];
  return JSON.parse(data);
}

function saveUsers(users) {
  const usersPath = path.join(__dirname, "users.json");
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
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

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

/* ===== AUTH ROUTES ===== */
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  let users = loadUsers();

  if (users.find(u => u.username === username)) {
    return res.status(400).send("User exists");
  }

  const hash = await bcrypt.hash(password, 10);
  users.push({ username, password: hash, elo: 1000 }); // ELO inițial
  saveUsers(users);

  req.session.user = { username };
  res.redirect("/dashboard");
});

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
const maps = ["sandstone","rust","province","hanami","dune","zone7","breeze"];

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

  // Join queue
  socket.on("joinQueue", username => {
    if (!queue.includes(username)) queue.push(username);
    io.emit("queueUpdate", queue);

    if (queue.length >= 10) startMatch();
  });
});

/* ===== START MATCH ===== */
function startMatch() {
  const players = [...queue];
  queue = [];

  // Alege cei 2 cu ELO cel mai mare ca căpitani
  const allUsers = loadUsers();
  const playersWithElo = players.map(u => {
    const user = allUsers.find(x => x.username === u);
    return { username: u, elo: user ? user.elo : 1000 };
  }).sort((a,b) => b.elo - a.elo);

  // Match object
  match = {
    captains: [playersWithElo[0].username, playersWithElo[1].username],
    team1: [playersWithElo[0].username],
    team2: [playersWithElo[1].username],
    pool: playersWithElo.slice(2).map(p => p.username),
    maps: [...maps],
    bannedMaps: []
  };

  // Emit draft la toți jucătorii
  io.emit("matchDraft", match);
}

/* ===== START SERVER ===== */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on port", PORT));