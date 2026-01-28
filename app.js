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

app.use(
  session({
    secret: process.env.SESSION_SECRET || "super-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true }
  })
);

// SERVE PUBLIC FOLDER CORECT
app.use(express.static(path.join(__dirname, "public")));

/* ===== HELPERS ===== */
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

/* ===== AUTH ===== */

// REGISTER
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).send("Missing fields");
  }

  const users = loadUsers();
  if (users.find(u => u.username === username)) {
    return res.status(400).send("User already exists");
  }

  const hash = await bcrypt.hash(password, 10);
  users.push({ username, password: hash });
  saveUsers(users);

  res.redirect("/");
});

// LOGIN
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();

  const user = users.find(u => u.username === username);
  if (!user) {
    return res.status(401).send("User not found");
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    return res.status(401).send("Wrong password");
  }

  req.session.user = { username };
  res.redirect("/dashboard");
});

/* ===== SOCKET.IO MATCHMAKING ===== */

let queue = [];
let match = null;

io.on("connection", socket => {
  socket.on("joinQueue", username => {
    if (!username) return;
    if (queue.includes(username)) return;

    queue.push(username);
    io.emit("queueUpdate", queue);

    if (queue.length === 10) {
      startMatch();
    }
  });

  socket.on("disconnect", () => {
    // optional cleanup
  });
});

function startMatch() {
  const players = [...queue];
  queue = [];

  match = {
    captains: [players[0], players[1]],
    team1: [players[0]],
    team2: [players[1]],
    pool: players.slice(2)
  };

  io.emit("matchStart", match);
}

/* ===== START SERVER ===== */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});