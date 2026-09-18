import { supabase } from "./supabaseClient.js";
import { requireAccess } from "./guard.js";
import { connectRoomChannel } from "./realtime.js";

const session = await requireAccess();
if (!session) throw new Error("no access"); // requireAccess already redirected

const createForm = document.getElementById("create-form");
const joinForm = document.getElementById("join-form");
const nameInput = document.getElementById("display-name");
const gameTypeSelect = document.getElementById("game-type-select");
const joinCodeInput = document.getElementById("join-code");
const waitingRoom = document.getElementById("waiting-room");
const setupPanel = document.getElementById("setup-panel");
const playerList = document.getElementById("player-list");
const roomCodeLabel = document.getElementById("room-code-label");
const startBtn = document.getElementById("start-btn");
const errorEl = document.getElementById("lobby-error");

let currentRoomId = null;
let currentGameType = "skribbl";
let isHost = false;
let roomChannel = null;

document.getElementById("player-label").textContent =
  localStorage.getItem("ts_label") ? `Playing as ${localStorage.getItem("ts_label")}` : "";

createForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomRoomCode();
    const { data: room, error } = await supabase
      .from("rooms")
      .insert({ room_code: code, host_user_id: session.user.id, game_type: gameTypeSelect.value })
      .select()
      .single();

    if (!error) {
      isHost = true;
      await joinAsPlayer(room.id, name);
      return;
    }
    if (error.code !== "23505") { // not a unique-violation, something else is wrong
      showError(error.message);
      return;
    }
  }
  showError("Couldn't generate a free room code, please try again.");
});

joinForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!name || !code) return;

  const { data: room, error } = await supabase
    .from("rooms")
    .select("id, status, game_type")
    .eq("room_code", code)
    .maybeSingle();

  if (error || !room) {
    showError("No room found with that code.");
    return;
  }
  if (room.status !== "lobby") {
    showError("That game has already started.");
    return;
  }

  isHost = false;
  await joinAsPlayer(room.id, name);
});

async function joinAsPlayer(roomId, displayName) {
  const { error } = await supabase
    .from("players")
    .insert({ room_id: roomId, user_id: session.user.id, display_name: displayName });

  if (error && error.code !== "23505") { // ignore "already joined" on reconnect
    showError(error.message);
    return;
  }

  currentRoomId = roomId;
  setupPanel.classList.add("hidden");
  waitingRoom.classList.remove("hidden");
  startBtn.classList.toggle("hidden", !isHost);

  const { data: room } = await supabase.from("rooms").select("room_code, game_type").eq("id", roomId).single();
  roomCodeLabel.textContent = room.room_code;
  currentGameType = room.game_type;

  await refreshPlayers();

  roomChannel = connectRoomChannel(roomId, {
    onPlayersChange: refreshPlayers,
    onRoomChange: (payload) => {
      const status = payload.new.status;
      if (currentGameType === "skribbl" && (status === "choosing" || status === "drawing")) {
        window.location.href = `game.html?room=${roomId}`;
      }
      if (currentGameType === "codenames" && status === "team_setup") {
        window.location.href = `codenames.html?room=${roomId}`;
      }
    },
  });
}

async function refreshPlayers() {
  const { data: players } = await supabase
    .from("players")
    .select("display_name, score")
    .eq("room_id", currentRoomId)
    .order("joined_at", { ascending: true });

  playerList.innerHTML = "";
  (players || []).forEach((p) => {
    const li = document.createElement("li");
    li.textContent = p.display_name;
    playerList.appendChild(li);
  });
}

startBtn.addEventListener("click", async () => {
  if (currentGameType === "codenames") {
    await supabase.from("rooms").update({ status: "team_setup" }).eq("id", currentRoomId);
    window.location.href = `codenames.html?room=${currentRoomId}`;
  } else {
    window.location.href = `game.html?room=${currentRoomId}&start=1`;
  }
});

function randomRoomCode() {
  const words = ["FOX", "OWL", "ELK", "RAY", "JAY", "COD", "ANT", "BEE"];
  const word = words[Math.floor(Math.random() * words.length)];
  const digits = Math.floor(100 + Math.random() * 900);
  return `${word}-${digits}`;
}

function showError(msg) {
  errorEl.textContent = msg;
}
