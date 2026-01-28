const socket = io();

// Join queue
document.getElementById("join").addEventListener("click", () => {
  const username = prompt("Enter username");
  if (!username) return;
  socket.emit("joinQueue", username);
});

// Update queue count
socket.on("queueUpdate", queue => {
  document.getElementById("queueText").innerText = `Queue: ${queue.length}/10`;
});

// Show match draft
socket.on("matchStart", match => {
  document.getElementById("match").style.display = "block";

  const team1El = document.getElementById("team1");
  const team2El = document.getElementById("team2");
  const poolEl = document.getElementById("pool");

  // Clear existing
  team1El.innerHTML = "";
  team2El.innerHTML = "";
  poolEl.innerHTML = "";

  match.team1.forEach(player => {
    const li = document.createElement("li");
    li.textContent = player;
    team1El.appendChild(li);
  });

  match.team2.forEach(player => {
    const li = document.createElement("li");
    li.textContent = player;
    team2El.appendChild(li);
  });

  match.pool.forEach(player => {
    const li = document.createElement("li");
    li.textContent = player;
    li.classList.add("pickable");
    poolEl.appendChild(li);
  });
});
