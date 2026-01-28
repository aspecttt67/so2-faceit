const socket = io();

let username = ""; // va fi setat de server din sesiune

// Primesc username din sesiune
socket.on("yourUsername", name => { username = name; });

// Elemente
const playBtn = document.getElementById("playBtn");
const modeSelect = document.getElementById("modeSelect");
const matchDiv = document.getElementById("match");
const team1El = document.getElementById("team1");
const team2El = document.getElementById("team2");
const mapsEl = document.getElementById("mapsList");
const leaderboardEl = document.getElementById("leaderboardList");

// Level
function getLevel(elo){
  if(elo<1150) return 1;
  if(elo<1300) return 2;
  if(elo<1500) return 3;
  if(elo<1700) return 4;
  if(elo<1900) return 5;
  if(elo<2200) return 6;
  if(elo<2500) return 7;
  if(elo<2700) return 8;
  if(elo<3000) return 9;
  return 10;
}

// Tabs
const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
tabButtons.forEach(btn=>{
  btn.addEventListener("click", ()=>{
    tabButtons.forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    const tab=btn.dataset.tab;
    tabContents.forEach(tc=>{ tc.style.display = tc.id===tab ? "block" : "none"; });
  });
});
tabButtons[0].click();

// Play
playBtn.addEventListener("click", ()=>{
  const mode = modeSelect.value;
  if(!username) return alert("Username nu a fost setat!");
  socket.emit("joinMatch",{username,mode});
});

// Draft
socket.on("matchDraft", draft=>{
  matchDiv.style.display="block";

  // Teams
  team1El.innerHTML=""; team2El.innerHTML="";
  draft.team1.forEach(p=>{
    const li=document.createElement("li");
    li.textContent=`${p.username} (Lvl ${getLevel(p.elo||1000)})`;
    li.style.background="#1e40af";
    team1El.appendChild(li);
  });
  draft.team2.forEach(p=>{
    const li=document.createElement("li");
    li.textContent=`${p.username} (Lvl ${getLevel(p.elo||1000)})`;
    li.style.background="#dc2626";
    team2El.appendChild(li);
  });

  // Maps
  mapsEl.innerHTML="";
  draft.maps.forEach(map=>{
    const li=document.createElement("li");
    li.textContent=map;
    li.style.cursor="pointer";
    li.style.margin="5px";
    li.style.padding="5px";
    li.style.display="inline-block";
    li.style.background="#f97316";
    li.style.borderRadius="5px";
    li.addEventListener("click", ()=>{
      socket.emit("banMap",{map});
    });
    mapsEl.appendChild(li);
  });

  // Highlight banned
  draft.bannedMaps.forEach(map=>{
    const li = Array.from(mapsEl.children).find(x=>x.textContent===map);
    if(li){ li.style.textDecoration="line-through"; li.style.background="#000"; li.style.color="#f00"; }
  });
});

// Match start
socket.on("matchStart", match=>{
  alert(`Match start! Harta finala: ${match.finalMap}`);
  matchDiv.style.display="none";
});

// Leaderboard
socket.on("updateLeaderboard", users=>{
  leaderboardEl.innerHTML="";
  users.forEach(u=>{
    const li=document.createElement("li");
    li.textContent=`${u.username} - ELO: ${u.elo} (Lvl ${getLevel(u.elo)})`;
    leaderboardEl.appendChild(li);
  });
});