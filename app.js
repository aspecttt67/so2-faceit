import express from "express";
import fs from "fs";
import bcrypt from "bcrypt";
import session from "express-session";

const app = express();
app.use(express.json());
app.use(session({
  secret: "so2-faceit-secret",
  resave: false,
  saveUninitialized: true
}));

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
  if (!username || !password) return res.status(400).json({ error: "Missing data" });

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
  if (!user) return res.status(400).json({ error: "Invalid login" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ error: "Invalid login" });

  req.session.user = { username };
  res.json({ success: true });
});

app.get("/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });
  res.json(req.session.user);
});

app.listen(8080, () => console.log("Server running on 8080"));
