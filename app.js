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

/* ===== AUTH ===== */
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect("/");
  next();
}

// Login POST
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const usersPath = path.join(__dirname, "users.json");
  const users = JSON.parse(fs.readFileSync(usersPath, "utf-8") || "[]");

  const user = users.find(u => u.username === username);
  if (!user) return res.status(401).send("User not found");

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).send("Wrong password");

  req.session.user = { username };
  res.redirect("/dashboard");
});

// Register POST
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  const usersPath = path.join(__dirname, "users.json");
  const users = JSON.parse(fs.readFileSync(usersPath, "utf-8") || "[]");

  if (users.find(u => u.username === username)) {
    return res.status(400).send("User exists");
  }

  const hash = await bcrypt.hash(password, 10);
  users.push({ username, password: hash });
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));

  res.redirect("/");
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// Dashboard protejat
app.get("/dashboard", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "protected", "dashboard.html"));
});

/* ===== SOCKET.IO ===== */

let queue = [];
let match = null;

io.on("connection", socket => {
  socket.on("joinQueue", username => {
    if (!queue.includes(username)) {
      queue.push(username);
      io.emit("queueUpdate", queue);

      if (queue.length === 10) startMatch();
    }
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
server.listen(PORT, () => console.log("Server running on port", PORT));
