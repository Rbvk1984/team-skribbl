import { supabase } from "./supabaseClient.js";
import { requireAccess } from "./guard.js";
import { connectRoomChannel } from "./realtime.js";
import { startCountdown } from "./timer.js";

const session = await requireAccess();
if (!session) throw new Error("no access");

const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");

const els = {
  roundScreen: document.getElementById("round-screen"),
  revealScreen: document.getElementById("reveal-screen"),
  timer: document.getElementById("sf-timer"),
  roleBox: document.getElementById("sf-role-box"),
  roleLabel: document.getElementById("sf-role-label"),
  playerList: document.getElementById("sf-player-list"),
  guessForm: document.getElementById("sf-guess-form"),
  guessInput: document.getElementById("sf-guess-input"),
  locationOptions: document.getElementById("sf-location-options"),
  endRoundBtn: document.getElementById("sf-end-round-btn"),
  error: document.getElementById("sf-error"),
  winnerLabel: document.getElementById("sf-winner-label"),
  revealDetail: document.getElementById("sf-reveal-detail"),
  playAgainBtn: document.getElementById("sf-play-again-btn"),
};

let myPlayerId = null;
let isHost = false;
let players = [];
let myVoteAccusedId = null;
let stopCountdown = null;
let connection = null;

await init();

async function init() {
  const { data: playerRow } = await supabase
    .from("players")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", session.user.id)
    .single();

  if (!playerRow) {
    window.location.href = "lobby.html";
    return;
  }
  myPlayerId = playerRow.id;

  const { data: room } = await supabase.from("rooms").select("host_user_id").eq("id", roomId).single();
  isHost = room.host_user_id === session.user.id;
  els.endRoundBtn.classList.toggle("hidden", !isHost);

  await loadLocationOptions();
  await refreshPlayers();

  connection = connectRoomChannel(roomId, {
    onPlayersChange: refreshPlayers,
    onOdd One OutSignal: loadRoundState,
    onOdd One OutVotesChange: refreshVotes,
  });

  await loadRoundState();

  els.guessForm.addEventListener("submit", guessLocation);
  els.endRoundBtn.addEventListener("click", endRound);
  els.playAgainBtn.addEventListener("click", playAgain);
}

async function loadLocationOptions() {
  const { data } = await supabase.from("spyfall_locations").select("name").eq("active", true).order("name");
  els.locationOptions.innerHTML = "";
  (data || []).forEach(({ name }) => {
    const opt = document.createElement("option");
    opt.value = name;
    els.locationOptions.appendChild(opt);
  });
}

async function refreshPlayers() {
  const { data } = await supabase
    .from("players")
    .select("id, display_name")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });
  players = data || [];
  await refreshVotes();
}

async function refreshVotes() {
  const { data: votes } = await supabase
    .from("spyfall_votes")
    .select("voter_player_id, accused_player_id")
    .eq("room_id", roomId);

  const tally = {};
  (votes || []).forEach((v) => {
    tally[v.accused_player_id] = (tally[v.accused_player_id] || 0) + 1;
    if (v.voter_player_id === myPlayerId) myVoteAccusedId = v.accused_player_id;
  });

  renderPlayerList(tally);
}

function renderPlayerList(tally) {
  els.playerList.innerHTML = "";
  players
    .filter((p) => p.id !== myPlayerId)
    .forEach((p) => {
      const li = document.createElement("li");
      li.className = "sf-player-row";
      if (p.id === myVoteAccusedId) li.classList.add("sf-accused-by-me");

      const name = document.createElement("span");
      name.textContent = p.display_name;
      const count = document.createElement("span");
      count.className = "sf-vote-count";
      count.textContent = tally[p.id] || 0;

      li.appendChild(name);
      li.appendChild(count);
      li.addEventListener("click", () => castVote(p.id));
      els.playerList.appendChild(li);
    });
}

async function castVote(accusedPlayerId) {
  const { error } = await supabase.rpc("spyfall_cast_vote", {
    p_room_id: roomId,
    p_accused_player_id: accusedPlayerId,
  });
  if (error) els.error.textContent = error.message;
}

// ---------------- Round state ----------------

async function loadRoundState() {
  const { data: game } = await supabase.from("spyfall_games_public").select("*").eq("room_id", roomId).maybeSingle();
  if (!game) return;

  if (game.status === "ended") {
    showReveal(game);
    return;
  }

  els.roundScreen.classList.remove("hidden");
  els.revealScreen.classList.add("hidden");

  const { data: roleData, error } = await supabase.rpc("spyfall_my_role", { p_room_id: roomId });
  const role = Array.isArray(roleData) ? roleData[0] : roleData;
  if (error || !role) return;

  els.guessForm.classList.toggle("hidden", !role.am_i_spy);
  els.roleBox.classList.toggle("sf-is-spy", !!role.am_i_spy);
  els.roleLabel.textContent = role.am_i_spy
    ? "You are the SPY. Blend in, don't get caught, or guess the location."
    : `Location: ${role.location}`;

  if (stopCountdown) stopCountdown();
  stopCountdown = startCountdown(
    game.ends_at,
    (secondsLeft) => {
      const m = Math.floor(secondsLeft / 60);
      const s = String(secondsLeft % 60).padStart(2, "0");
      els.timer.textContent = `${m}:${s}`;
    },
    () => {
      els.timer.textContent = "Time's up!";
    }
  );
}

async function guessLocation(e) {
  e.preventDefault();
  const guess = els.guessInput.value.trim();
  if (!guess) return;

  const { data, error } = await supabase.rpc("spyfall_guess_location", { p_room_id: roomId, p_guess: guess });
  if (error) {
    els.error.textContent = error.message;
    return;
  }
  connection.broadcastOdd One OutSignal();
  await loadRoundState();
}

async function endRound() {
  const { error } = await supabase.rpc("spyfall_end_round", { p_room_id: roomId });
  if (error) {
    els.error.textContent = error.message;
    return;
  }
  connection.broadcastOdd One OutSignal();
  await loadRoundState();
}

async function playAgain() {
  const { error } = await supabase.rpc("spyfall_start_round", { p_room_id: roomId });
  if (error) {
    els.error.textContent = error.message;
    return;
  }
  connection.broadcastOdd One OutSignal();
  await loadRoundState();
}

function showReveal(game) {
  if (stopCountdown) stopCountdown();
  els.roundScreen.classList.add("hidden");
  els.revealScreen.classList.remove("hidden");

  const spyName = players.find((p) => p.id === game.revealed_spy_player_id)?.display_name || "Unknown";
  const wonLabel = game.winner === "spy" ? "The spy got away with it! 🕵️" : "The spy was caught! 🎉";

  els.winnerLabel.textContent = wonLabel;
  els.revealDetail.textContent = `The spy was ${spyName}. The location was ${game.revealed_location}.`;
  els.playAgainBtn.classList.toggle("hidden", !isHost);
}
