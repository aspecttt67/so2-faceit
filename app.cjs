// ===== IMPORTURI =====
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const { Pool } = require("pg");

// ===== SERVER =====
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ===== MIDDLEWARE =====
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

// ===== DATABASE POSTGRES =====
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ===== DEBUG CONEXIUNE =====
pool.query("SELECT NOW()")
  .then(r => console.log("✅ DB connected:", r.rows))
  .catch(e => console.error("❌ DB connection error:", e));

// ===== FUNCTII UTILE =====
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect("/");
  next();
}

// ===== CREARE TABEL AUTOMAT CU DEBUG =====
async function createUsersTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        elo INTEGER DEFAULT 1000
      );
    `);
    console.log("✅ Tabelul users este gata!");
  } catch (err) {
    console.error("❌ Eroare la crearea tabelului users:", err);
  }
}
createUsersTable();

// ===== ROUTES =====
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

// ===== AUTH cu debug complet =====
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    const result = await pool.query(
      "INSERT INTO users (username,password) VALUES ($1,$2) RETURNING *",
      [username, hash]
    );
    console.log("✅ User creat:", result.rows[0]);
    req.session.user = { username };
    res.redirect("/dashboard");
  } catch (err) {
    console.error("❌ Eroare register:", err);
    res.status(400).send("Database error (check logs)");
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const r = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
    console.log("🔍 Query login result:", r.rows);

    if (r.rows.length === 0) return res.status(401).send("User not found");

    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).send("Wrong password");

    req.session.user = { username };
    res.redirect("/dashboard");
  } catch (err) {
    console.error("❌ Eroare login:", err);
    res.status(500).send("Database error (check logs)");
  }
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("✅ Server running on port", PORT);
});