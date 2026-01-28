import express from "express";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// 🔥 static files
app.use(express.static(path.join(__dirname, "public")));

// home
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

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

  socket.on("pick", ({ team, player }) => {
    if (!match) return;
    match[team].push(player);
    match.pool = match.pool.filter(p => p !== player);
    io.emit("draftUpdate", match);
  });

  socket.on("rehost", () => io.emit("rehosted"));
});

function startMatch() {
  const players = [...queue];
  queue = [];

  match = {
    captains: [players[0], players[1]],
    team1: [players[0]],
    team2: [players[1]],
    pool: players.slice(2),
    host: players[Math.floor(Math.random() * 2)]
  };

  io.emit("matchStart", match);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});