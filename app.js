import express from "express";
import session from "express-session";
import bcrypt from "bcrypt";
import fs from "fs";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import { fileURLToPath } from "url";

/* ===== SETUP ===== */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

/* ===== MIDDLEWARE ===== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// SESSION PERSISTENT 7 ZILE
app.use(
  session({
    secret: process.env.SESSION_SECRET || "super-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: { 
      secure: false, 
      httpOnly: true, 
      maxAge: 1000 * 60 * 60 * 24 * 7 // 7 zile
    }
  })
);

// SERVE STATIC FILES
app.use(express.static(path.join(__dirname, "public")));

/* ===== USERS HELPERS ===== */
const usersPath = path.join(__dirname, "users.json");

function loadUsers() {
  if (!fs.existsSync(usersPath)) return [];
  return JSON.parse(fs.readFileSync(usersPath, "utf-8"));
}

function saveUsers(users) {
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
}

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect("/");
  next();
}

function getLevel(elo) {
  if (elo < 1150) return 1;
  if (elo < 1300) return 2;
  if (elo < 1500) return 3;
  if (elo < 1700) return 4;
  if (elo < 1900) return 5;
  if (elo < 2200) return 6;
  if (elo < 2500) return 7;
  if (elo < 2700) return 8;
  if (elo < 3000) return 9;
  return 10;
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

// Dashboard (protected)
app.get("/dashboard", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "protected", "dashboard.html"));
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// Register POST
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).send("Missing fields");

  const users = loadUsers();
  if (users.find(u => u.username === username)) return res.status(400).send("User already exists");

  const hash = await bcrypt.hash(password, 10);
  users.push({ username, password: hash, elo: 1000 }); // 1000 initial ELO
  saveUsers(users);

  req.session.user = { username }; // logheaza automat dupa register
  res.redirect("/dashboard");
});

// Login POST
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

/* ===== SOCKET.IO MATCHMAKING ===== */

let queue = [];
let draftMatch = null;
const maps = ["Sandstone", "Rust", "Province", "Hanami", "Dune", "Zone7", "Breeze"];

function startDraft(queue) {
  const users = loadUsers();

  // Sortează jucătorii după ELO descrescător
  const sorted = queue.map(u => users.find(x => x.username === u)).sort((a,b) => b.elo - a.elo);

  const captain1 = sorted[0];
  const captain2 = sorted[1];
  const pool = sorted.slice(2);

  return {
    captains: [captain1, captain2],
    team1: [],
    team2: [],
    pool: pool,
    maps: [...maps],
    bannedMaps: []
  };
}

io.on("connection", socket => {

  socket.on("joinQueue", username => {
    if (!queue.includes(username)) queue.push(username);
    io.emit("queueUpdate", queue);

    if (queue.length === 10) {
      draftMatch = startDraft(queue);
      queue = [];
      io.emit("matchDraft", draftMatch);
    }
  });

  // Captain alege jucător din pool
  socket.on("pickPlayer", ({ captain, player }) => {
    if (!draftMatch) return;
    const index = draftMatch.pool.findIndex(u => u.username === player);
    if (index === -1) return;

    if (captain === draftMatch.captains[0].username) draftMatch.team1.push(draftMatch.pool[index]);
    else if (captain === draftMatch.captains[1].username) draftMatch.team2.push(draftMatch.pool[index]);

    draftMatch.pool.splice(index, 1);
    io.emit("matchDraft", draftMatch);
  });

  // Captain baneează hartă
  socket.on("banMap", ({ captain, map }) => {
    if (!draftMatch) return;
    if (!draftMatch.maps.includes(map)) return;

    draftMatch.bannedMaps.push(map);
    draftMatch.maps = draftMatch.maps.filter(m => m !== map);

    // Daca ramane doar 1 map → start match
    if (draftMatch.maps.length === 1) {
      draftMatch.finalMap = draftMatch.maps[0];
      io.emit("matchStart", draftMatch);
      draftMatch = null;
    } else {
      io.emit("matchDraft", draftMatch);
    }
  });

});

/* ===== START SERVER ===== */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on port", PORT));