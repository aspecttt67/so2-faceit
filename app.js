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
app.use(session({ secret:"secret", resave:false, saveUninitialized:false }));
app.use("/public", express.static(path.join(__dirname, "public")));

// AUTH
function requireAuth(req,res,next){ if(!req.session.user) return res.redirect("/"); next(); }
function loadUsers(){ const p=path.join(__dirname,"users.json"); if(!fs.existsSync(p)) return []; const d=fs.readFileSync(p,"utf-8"); if(!d) return []; return JSON.parse(d); }
function saveUsers(u){ fs.writeFileSync(path.join(__dirname,"users.json"),JSON.stringify(u,null,2)); }

// Routes
app.get("/",(req,res)=>{ if(req.session.user) return res.redirect("/dashboard"); res.sendFile(path.join(__dirname,"public","index.html")); });
app.get("/register",(req,res)=>{ res.sendFile(path.join(__dirname,"public","register.html")); });
app.get("/dashboard",requireAuth,(req,res)=>{ res.sendFile(path.join(__dirname,"protected","dashboard.html")); });
app.get("/logout",(req,res)=>{ req.session.destroy(()=>res.redirect("/")); });

// Register/Login
app.post("/register",async(req,res)=>{
  const {username,password}=req.body;
  let users=loadUsers();
  if(users.find(u=>u.username===username)) return res.status(400).send("User exists");
  const hash=await bcrypt.hash(password,10);
  users.push({username,password:hash,elo:1000});
  saveUsers(users);
  req.session.user={username};
  res.redirect("/dashboard");
});

app.post("/login",async(req,res)=>{
  const {username,password}=req.body;
  const users=loadUsers();
  const user=users.find(u=>u.username===username);
  if(!user) return res.status(401).send("User not found");
  const ok=await bcrypt.compare(password,user.password);
  if(!ok) return res.status(401).send("Wrong password");
  req.session.user={username};
  res.redirect("/dashboard");
});

/* ===== SOCKET.IO ===== */
let onlinePlayers=[]; 
let match=null;
const maps=["sandstone","rust","province","hanami","dune","zone7","breeze"];

io.on("connection",socket=>{
  // Send username to client for automatic Play
  if(socket.handshake.headers.cookie){
    const cookies = socket.handshake.headers.cookie.split(";").map(c=>c.trim());
    const sessionCookie = cookies.find(c=>c.startsWith("connect.sid"));
    if(sessionCookie){
      socket.emit("yourUsername", socket.request.session?.user?.username || "");
    }
  }

  // Leaderboard
  function sendLeaderboard(){
    const users=loadUsers().sort((a,b)=>b.elo-a.elo).slice(0,10);
    socket.emit("updateLeaderboard",users);
  }
  sendLeaderboard();
  const interval=setInterval(sendLeaderboard,10000);
  socket.on("disconnect",()=>clearInterval(interval));

  // Join Match
  socket.on("joinMatch",({username,mode})=>{
    if(!username) return;
    if(!onlinePlayers.includes(username)) onlinePlayers.push(username);
    createMatch(username, mode);
  });

  // Ban map
  socket.on("banMap",({map})=>{
    if(!match) return;
    if(!match.bannedMaps.includes(map)) match.bannedMaps.push(map);
    io.emit("matchDraft",match);
    const available=match.maps.filter(m=>!match.bannedMaps.includes(m));
    if(available.length===1){
      match.finalMap=available[0];
      io.emit("matchStart",match);
      match=null;
    }
  });
});

// Creează match direct
function createMatch(username, mode){
  const allUsers=loadUsers();

  if(mode==="1v1"){
    let players=[username];

    // Adaugă un dummy opponent dacă ești singur
    if(players.length<2) players.push("Bot1");

    match={
      captains:[players[0],players[1]],
      team1:[{username:players[0],elo:(allUsers.find(u=>u.username===players[0])?.elo||1000)}],
      team2:[{username:players[1],elo:(allUsers.find(u=>u.username===players[1])?.elo||1000)}],
      pool:[],
      maps:[...maps],
      bannedMaps:[]
    };
    io.emit("matchDraft",match);

  } else if(mode==="5v5"){
    let players=[username];
    // Adaugă dummy players dacă nu sunt destui
    while(players.length<10) players.push("Bot"+(players.length+1));
    const playersWithElo=players.map(u=>({username:u,elo:(allUsers.find(x=>x.username===u)?.elo||1000)}));
    playersWithElo.sort((a,b)=>b.elo-a.elo);

    match={
      captains:[playersWithElo[0].username,playersWithElo[1].username],
      team1:[playersWithElo[0]],
      team2:[playersWithElo[1]],
      pool:playersWithElo.slice(2),
      maps:[...maps],
      bannedMaps:[]
    };
    io.emit("matchDraft",match);
  }
}

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log("Server running on port",PORT));