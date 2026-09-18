import { supabase } from "./supabaseClient.js";
import { requireAccess } from "./guard.js";
import { connectRoomChannel } from "./realtime.js";

const session = await requireAccess();
if (!session) throw new Error("no access");

// Elements
const setupScreen  = document.getElementById("setup-screen");
const waitingRoom  = document.getElementById("waiting-room");
const nameInput    = document.getElementById("display-name");
const createBtn    = document.getElementById("create-btn");
const joinCodeInput= document.getElementById("join-code");
const joinBtn      = document.getElementById("join-btn");
const playerList   = document.getElementById("player-list");
const roomCodeLabel= document.getElementById("room-code-label");
const waitingGameLabel = document.getElementById("waiting-game-label");
const startBtn     = document.getElementById("start-btn");
const shareBtn     = document.getElementById("share-btn");
const errorEl      = document.getElementById("lobby-error");
const startErrorEl = document.getElementById("start-error");
const hintEl       = document.getElementById("selection-hint");
const playerLabel  = document.getElementById("player-label");

// State
let selectedGameType = null;
let currentRoomId    = null;
let currentGameType  = null;
let isHost           = false;
let roomChannel      = null;

playerLabel.textContent =
  localStorage.getItem("ts_label") ? `Playing as ${localStorage.getItem("ts_label")}` : "";

// ---------- Game card selection ----------

document.querySelectorAll(".game-card").forEach(card => {
  card.addEventListener("click", (e) => selectCard(card, e));
  card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") selectCard(card, e); });
});

function selectCard(card, event) {
  document.querySelectorAll(".game-card").forEach(c => c.classList.remove("selected"));
  card.classList.add("selected");
  selectedGameType = card.dataset.game;

  hintEl.textContent = `${card.dataset.name} selected — enter your name and create a room`;
  hintEl.classList.add("visible");
  createBtn.disabled = false;

  // Ripple
  if (event && event.clientX) {
    const rect = card.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.cssText =
      `left:${event.clientX - rect.left}px;top:${event.clientY - rect.top}px;width:60px;height:60px;margin-left:-30px;margin-top:-30px`;
    card.appendChild(ripple);
    setTimeout(() => ripple.remove(), 520);
  }
}

// ---------- Create room ----------

createBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  if (!name) { showError("Enter your display name first."); return; }
  if (!selectedGameType) { showError("Pick a game first."); return; }

  createBtn.disabled = true;
  createBtn.textContent = "Creating...";

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomRoomCode();
    const { data: room, error } = await supabase
      .from("rooms")
      .insert({ room_code: code, host_user_id: session.user.id, game_type: selectedGameType })
      .select()
      .single();

    if (!error) {
      isHost = true;
      await joinAsPlayer(room.id, name);
      return;
    }
    if (error.code !== "23505") {
      showError(error.message);
      createBtn.disabled = false;
      createBtn.textContent = "Create room";
      return;
    }
  }
  showError("Couldn't generate a room code — please try again.");
  createBtn.disabled = false;
  createBtn.textContent = "Create room";
});

// ---------- Join room ----------

joinBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!name) { showError("Enter your display name first."); return; }
  if (!code)  { showError("Enter a room code to join."); return; }

  joinBtn.disabled = true;
  joinBtn.textContent = "Joining...";

  const { data: room, error } = await supabase
    .from("rooms")
    .select("id, status, game_type")
    .eq("room_code", code)
    .maybeSingle();

  if (error || !room) {
    showError("No room found with that code.");
    joinBtn.disabled = false;
    joinBtn.textContent = "Join room";
    return;
  }
  if (room.status !== "lobby") {
    showError("That game has already started.");
    joinBtn.disabled = false;
    joinBtn.textContent = "Join room";
    return;
  }

  isHost = false;
  await joinAsPlayer(room.id, name);
});

// ---------- Join as player ----------

async function joinAsPlayer(roomId, displayName) {
  const { error } = await supabase
    .from("players")
    .insert({ room_id: roomId, user_id: session.user.id, display_name: displayName });

  if (error && error.code !== "23505") {
    showError(error.message);
    return;
  }

  currentRoomId = roomId;

  const { data: room } = await supabase
    .from("rooms")
    .select("room_code, game_type")
    .eq("id", roomId)
    .single();

  currentGameType  = room.game_type;
  roomCodeLabel.textContent = room.room_code;
  waitingGameLabel.textContent = gameName(currentGameType);

  // Share button — uses native share sheet on mobile, falls back to clipboard on desktop
  shareBtn.addEventListener("click", async () => {
    const text = `Join my ${gameName(currentGameType)} game! Room code: ${room.room_code}\n${window.location.origin}/team-skribbl/lobby.html`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Team Games", text });
      } catch (_) { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(room.room_code);
      shareBtn.textContent = "✓ Code copied!";
      setTimeout(() => { shareBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="14" cy="3" r="2" stroke="#3dd68c" stroke-width="1.5"/><circle cx="14" cy="15" r="2" stroke="#3dd68c" stroke-width="1.5"/><circle cx="4" cy="9" r="2" stroke="#3dd68c" stroke-width="1.5"/><line x1="6" y1="8" x2="12" y2="4.2" stroke="#3dd68c" stroke-width="1.5" stroke-linecap="round"/><line x1="6" y1="10" x2="12" y2="13.8" stroke="#3dd68c" stroke-width="1.5" stroke-linecap="round"/></svg> Share room code`; }, 2000);
    }
  });

  setupScreen.classList.add("hidden");
  waitingRoom.classList.remove("hidden");
  startBtn.classList.toggle("hidden", !isHost);

  await refreshPlayers();

  roomChannel = connectRoomChannel(roomId, {
    onPlayersChange: refreshPlayers,
    onRoomChange: (payload) => {
      const status = payload.new.status;
      if (currentGameType === "skribbl" && (status === "choosing" || status === "drawing"))
        window.location.href = `game.html?room=${roomId}`;
      if (currentGameType === "codenames" && status === "team_setup")
        window.location.href = `codenames.html?room=${roomId}`;
      if (currentGameType === "spyfall" && status === "active")
        window.location.href = `spyfall.html?room=${roomId}`;
      if (currentGameType === "secret_hitler" && status === "active")
        window.location.href = `secrethitler.html?room=${roomId}`;
      if (currentGameType === "gartic_phone" && status === "active")
        window.location.href = `garticphone.html?room=${roomId}`;
    },
  });
}

async function refreshPlayers() {
  const { data: players } = await supabase
    .from("players")
    .select("display_name")
    .eq("room_id", currentRoomId)
    .order("joined_at", { ascending: true });

  const bubbleContainer = document.getElementById("player-bubbles");
  const waitingHint = document.getElementById("waiting-hint");
  if (!bubbleContainer) return;

  const avatarColors = ["#3dd68c","#3a9edc","#9b7fe8","#e85d4e","#2dcaa5","#f2c14e"];
  bubbleContainer.innerHTML = "";

  (players || []).forEach((p, i) => {
    const bubble = document.createElement("div");
    bubble.className = "player-bubble";
    bubble.style.animationDelay = `${i * 0.06}s`;

    const initial = p.display_name.trim()[0].toUpperCase();
    const color = avatarColors[i % avatarColors.length];

    bubble.innerHTML = `
      <div class="player-bubble-avatar" style="background:${color}">${initial}</div>
      <span class="player-bubble-name">${escapeHtml(p.display_name)}</span>
    `;
    bubbleContainer.appendChild(bubble);
  });

  if (waitingHint) {
    waitingHint.textContent = players?.length === 1
      ? "Waiting for more players to join..."
      : `${players?.length} players joined — waiting for host to start`;
  }
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ---------- Start game ----------

startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  startBtn.textContent = "Starting...";
  startErrorEl.textContent = "";

  let error = null;

  if (currentGameType === "codenames") {
    await supabase.from("rooms").update({ status: "team_setup" }).eq("id", currentRoomId);
    window.location.href = `codenames.html?room=${currentRoomId}`;
    return;
  }
  if (currentGameType === "spyfall") {
    ({ error } = await supabase.rpc("spyfall_start_round", { p_room_id: currentRoomId }));
    if (!error) { window.location.href = `spyfall.html?room=${currentRoomId}`; return; }
  }
  if (currentGameType === "secret_hitler") {
    ({ error } = await supabase.rpc("sh_start_game", { p_room_id: currentRoomId }));
    if (!error) { window.location.href = `secrethitler.html?room=${currentRoomId}`; return; }
  }
  if (currentGameType === "gartic_phone") {
    ({ error } = await supabase.rpc("gp_start_game", { p_room_id: currentRoomId }));
    if (!error) { window.location.href = `garticphone.html?room=${currentRoomId}`; return; }
  }
  if (currentGameType === "skribbl") {
    window.location.href = `game.html?room=${currentRoomId}&start=1`;
    return;
  }

  if (error) {
    startErrorEl.textContent = error.message;
    startBtn.disabled = false;
    startBtn.textContent = "Start game";
  }
});

// ---------- Helpers ----------

function randomRoomCode() {
  const words = ["FOX","OWL","ELK","RAY","JAY","COD","ANT","BEE"];
  return `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(100 + Math.random() * 900)}`;
}

function gameName(type) {
  return { skribbl:"Doodle Rush", codenames:"Agent Grid", spyfall:"Odd One Out",
           secret_hitler:"Shadow Vote", gartic_phone:"Sketch Chain" }[type] || type;
}

function showError(msg) { errorEl.textContent = msg; }
