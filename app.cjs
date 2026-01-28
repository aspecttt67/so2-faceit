const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

/* =======================
   MIDDLEWARE
======================= */
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: "super-secret",
    resave: false,
    saveUninitialized: false,
  })
);

app.use("/public", express.static(path.join(__dirname, "public")));

/* =======================
   DATABASE
======================= */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        elo INTEGER DEFAULT 1000
      );
    `);
    console.log("✅ Tabela users este gata");
  } catch (err) {
    console.error("❌ Eroare DB init:", err);
  }
}

initDB();

/* =======================
   AUTH MIDDLEWARE
======================= */
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect("/");
  next();
}

/* =======================
   ROUTES
======================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "register.html"));
});

app.get("/dashboard", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

/* =======================
   REGISTER
======================= */
app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).send("Missing data");

    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2)",
      [username, hash]
    );

    req.session.user = { username };
    res.redirect("/dashboard");
  } catch (err) {
    console.error("❌ Register error:", err);
    res.status(500).send("Database error");
  }
});

/* =======================
   LOGIN
======================= */
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).send("User not found");
    }

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password);

    if (!ok) {
      return res.status(401).send("Wrong password");
    }

    req.session.user = { username: user.username };
    res.redirect("/dashboard");
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).send("Database error");
  }
});

/* =======================
   ADMIN – VIEW USERS
======================= */
app.get("/api/users", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, elo FROM users ORDER BY elo DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "DB error" });
  }
});

/* =======================
   START SERVER
======================= */
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});