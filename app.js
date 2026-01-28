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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "super-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Railway = false (nu HTTPS direct)
      httpOnly: true
    }
  })
);

// static files
app.use(express.static(path.join(__dirname, "public")));

// 🛡️ middleware de protecție
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/");
  }
  next();
}

// 🔐 LOGIN
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const users = JSON.parse(fs.readFileSync("users.json"));

  const user = users.find(u => u.username === username);
  if (!user) return res.status(401).send("User not found");

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).send("Wrong password");

  req.session.user = { username };
  res.redirect("/dashboard.html");
});

// 📝 REGISTER
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  const users = JSON.parse(fs.readFileSync("users.json"));

  if (users.find(u => u.username === username)) {
    return res.status(400).send("User exists");
  }

  const hash = await bcrypt.hash(password, 10);
  users.push({ username, password: hash });

  fs.writeFileSync("users.json", JSON.stringify(users, null, 2));
  res.redirect("/");
});

// 🚪 LOGOUT
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// 🔒 PROTECȚIE DASHBOARD
app.get("/dashboard.html", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

/* ===== Socket.IO (rămâne ca înainte) ===== */

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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log("Server running on port", PORT)
);