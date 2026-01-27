const socket = io();

const joinBtn = document.getElementById("join");
const queueText = document.getElementById("queueText");
const matchBox = document.getElementById("match");
const team1El = document.getElementById("team1");
const team2El = document.getElementById("team2");
const poolEl = document.getElementById("pool");
const hostEl = document.getElementById("host");

let username = "";

joinBtn.onclick = () => {
  username = prompt("Username?");
  if (!username) return;
  socket.emit("joinQueue", username);
};

socket.on("queueUpdate", q => {
  queueText.innerText = `Queue: ${q.length}/10`;
});

socket.on("matchStart", match => {
  matchBox.style.display = "block";
  hostEl.innerText = "Host: " + match.host;
  render(match);
});

socket.on("draftUpdate", match => {
  render(match);
});

function render(match) {
  team1El.innerHTML = match.team1.map(p => `<li>${p}</li>`).join("");
  team2El.innerHTML = match.team2.map(p => `<li>${p}</li>`).join("");
  poolEl.innerHTML = match.pool
    .map(p => `<li class="pickable" onclick="pick('${p}')">${p}</li>`)
    .join("");
}

function pick(player) {
  // momentan toți pot da pick (simplu)
  socket.emit("pick", { team: "team1", player });
}
