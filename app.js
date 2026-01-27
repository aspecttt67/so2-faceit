import express from "express";
import fs from "fs";
import bcrypt from "bcrypt";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: "so2-faceit-secret",
  resave: false,
  saveUninitialized: true
}));

// 🔽 PAGINA PRINCIPALĂ
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const USERS_FILE = "./users.json";

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Missing" });

  const users = loadUsers();
  if (users.find(u => u.username === username))
    return res.status(400).json({ error: "User exists" });

  const hash = await bcrypt.hash(password, 10);
  users.push({ username, password: hash });
  saveUsers(users);

  res.json({ success: true });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();
  const user = users.find(u => u.username === username);
  if (!user) return res.status(400).json({ error: "Invalid" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ error: "Invalid" });

  req.session.user = { username };
  res.json({ success: true });
});

app.get("/me", (req, res) => {
  if (!req.session.user) return res.status(401).json(null);
  res.json(req.session.user);
});

// 🔽 PORNIRE CORECTĂ PENTRU RAILWAY
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
