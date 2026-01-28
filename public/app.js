const socket = io();

// Ascunde Join Queue până după login
const joinBtn = document.getElementById("join");
joinBtn.style.display = "block"; // deja afisat dupa login

// Join queue
joinBtn.addEventListener("click", () => {
  const username = prompt("Introdu username-ul tău");
  if (!username) return;
  socket.emit("joinQueue", username);
});

// Functie level
function getLevel(elo) {
  if (elo < 1150) return 1;
  if (elo < 1300) return 2;
  if (elo < 1500) return 3;
  if (elo < 1700) return 4;
  if (elo < 1900) return 5;
  if (elo < 2200) return 6;
  if (elo < 2500) return 7;
  if (elo < 2700) return 8;
  if (elo < 3000) return 9;
  return 10;
}

// Update queue
socket.on("queueUpdate", queue => {
  const queueText = document.getElementById("queueText");
  queueText.style.display = "block";
  queueText.innerText = `Queue: ${queue.length}/10`;
});

// Draft match
socket.on("matchDraft", draft => {
  const matchDiv = document.getElementById("match");
  matchDiv.style.display = "block";

  // Pool
  const poolEl = document.getElementById("pool");
  poolEl.innerHTML = "";
  draft.pool.forEach(player => {
    const li = document.createElement("li");
    li.textContent = `${player.username} (ELO: ${player.elo}, Lvl ${getLevel(player.elo)})`;
    li.classList.add("pickable");
    li.addEventListener("click", () => {
      const captain = prompt("Username captain care face pick-ul");
      socket.emit("pickPlayer", { captain, player: player.username });
    });
    poolEl.appendChild(li);
  });

  // Teams
  const team1El = document.getElementById("team1");
  const team2El = document.getElementById("team2");
  team1El.innerHTML = "";
  team2El.innerHTML = "";

  draft.team1.forEach(p => {
    const li = document.createElement("li");
    li.textContent = `${p.username} (Lvl ${getLevel(p.elo)})`;
    li.style.background = "#1e40af"; // echipa albastra
    team1El.appendChild(li);
  });

  draft.team2.forEach(p => {
    const li = document.createElement("li");
    li.textContent = `${p.username} (Lvl ${getLevel(p.elo)})`;
    li.style.background = "#dc2626"; // echipa rosie
    team2El.appendChild(li);
  });

  // Maps
  let mapsEl = document.getElementById("maps");
  if (!mapsEl) {
    const div = document.createElement("div");
    div.innerHTML = `<h3>Maps:</h3><ul id="mapsList"></ul>`;
    matchDiv.appendChild(div);
    mapsEl = document.getElementById("mapsList");
  }

  mapsEl.innerHTML = "";
  draft.maps.forEach(map => {
    const li = document.createElement("li");
    li.textContent = map;
    li.style.cursor = "pointer";
    li.style.margin = "5px";
    li.style.padding = "5px";
    li.style.display = "inline-block";
    li.style.background = "#f97316";
    li.style.borderRadius = "5px";
    li.addEventListener("click", () => {
      const captain = prompt("Introdu username-ul captain care baneeaza map-ul");
      socket.emit("banMap", { captain, map });
    });
    mapsEl.appendChild(li);
  });

  // Highlight banned maps
  draft.bannedMaps.forEach(map => {
    const li = Array.from(mapsEl.children).find(x => x.textContent === map);
    if (li) {
      li.style.textDecoration = "line-through";
      li.style.background = "#000";
      li.style.color = "#f00";
    }
  });

});

// Match start
socket.on("matchStart", match => {
  alert(`Match start! Harta finala: ${match.finalMap}`);
  document.getElementById("match").style.display = "none";
  document.getElementById("queueText").innerText = "Queue: 0/10";
});