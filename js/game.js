import { supabase } from "./supabaseClient.js";
import { requireAccess } from "./guard.js";
import { connectRoomChannel } from "./realtime.js";
import { createDrawingBoard } from "./canvas.js";
import { startCountdown } from "./timer.js";

const session = await requireAccess();
if (!session) throw new Error("no access");

const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");
const shouldStart = params.get("start") === "1";

const els = {
  canvas: document.getElementById("board"),
  wordChoiceModal: document.getElementById("word-choice-modal"),
  wordChoices: document.getElementById("word-choices"),
  statusBar: document.getElementById("status-text"),
  timer: document.getElementById("timer"),
  wordHint: document.getElementById("word-hint"),
  guessForm: document.getElementById("guess-form"),
  guessInput: document.getElementById("guess-input"),
  guessLog: document.getElementById("guess-log"),
  scoreboard: document.getElementById("scoreboard"),
  colorPicker: document.getElementById("color-picker"),
  brushSizes: document.querySelectorAll(".brush-size"),
  clearBtn: document.getElementById("clear-btn"),
  toolbar: document.getElementById("toolbar"),
  finalScreen: document.getElementById("final-screen"),
  finalScoreboard: document.getElementById("final-scoreboard"),
};

let myPlayerId = null;
let currentRound = null;
let players = [];
let stopCountdown = null;
let board = null;

await init();

async function init() {
  const { data: playerRow, error: playerErr } = await supabase
    .from("players")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", session.user.id)
    .single();

  if (playerErr || !playerRow) {
    window.location.href = "lobby.html";
    return;
  }
  myPlayerId = playerRow.id;

  board = createDrawingBoard(els.canvas, {
    isDrawer: () => currentRound && currentRound.drawer_player_id === myPlayerId,
    onStroke: (stroke) => connection.broadcastStroke(stroke),
  });

  await refreshPlayers();

  const connection = connectRoomChannel(roomId, {
    onStroke: (stroke) => board.renderRemoteStroke(stroke),
    onPlayersChange: refreshPlayers,
    onRoundChange: handleRoundRow,
    onGuess: handleGuessRow,
  });
  // `board` was created just above with an onStroke callback that closes
  // over this `connection` variable - safe because the callback only
  // fires later, once this line has already run.

  const { data: room } = await supabase.from("rooms").select("*").eq("id", roomId).single();

  if (shouldStart && room.host_user_id === session.user.id && room.status === "lobby") {
    await startRound(1);
  } else {
    // Rejoining mid-game: load the current round, if any
    const { data: round } = await supabase
      .from("rounds")
      .select("*")
      .eq("room_id", roomId)
      .order("round_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (round) applyRoundState(round);
  }

  els.guessForm.addEventListener("submit", onSubmitGuess);
  els.clearBtn.addEventListener("click", () => board.clear(true));
  els.colorPicker.addEventListener("change", (e) => board.setColor(e.target.value));
  els.brushSizes.forEach((btn) =>
    btn.addEventListener("click", () => board.setLineWidth(Number(btn.dataset.size)))
  );
}

async function refreshPlayers() {
  const { data } = await supabase
    .from("players")
    .select("id, display_name, score")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });
  players = data || [];
  renderScoreboard();
}

function renderScoreboard() {
  els.scoreboard.innerHTML = "";
  [...players]
    .sort((a, b) => b.score - a.score)
    .forEach((p) => {
      const row = document.createElement("li");
      row.innerHTML = `<span>${escapeHtml(p.display_name)}</span><span>${p.score}</span>`;
      if (currentRound && p.id === currentRound.drawer_player_id) row.classList.add("is-drawer");
      els.scoreboard.appendChild(row);
    });
}

// ---------------- Round lifecycle (host drives creation, drawer drives choosing/ending) ----------------

async function startRound(roundNumber) {
  const { data: room } = await supabase.from("rooms").select("*").eq("id", roomId).single();
  if (roundNumber > room.total_rounds) {
    await supabase.from("rooms").update({ status: "finished" }).eq("id", roomId);
    return;
  }

  const drawer = players[(roundNumber - 1) % players.length];

  const { data: round, error } = await supabase
    .from("rounds")
    .insert({ room_id: roomId, round_number: roundNumber, drawer_player_id: drawer.id, status: "choosing" })
    .select()
    .single();

  if (error) {
    console.error(error);
    return;
  }

  await supabase.from("rooms").update({ status: "choosing", current_round: roundNumber }).eq("id", roomId);
  applyRoundState(round);
}

function handleRoundRow(payload) {
  if (payload.eventType === "DELETE") return;
  applyRoundState(payload.new);
}

async function applyRoundState(round) {
  currentRound = round;
  renderScoreboard();

  const amDrawer = round.drawer_player_id === myPlayerId;

  if (round.status === "choosing") {
    els.wordChoiceModal.classList.add("hidden");
    els.toolbar.classList.toggle("hidden", !amDrawer);
    els.guessForm.classList.toggle("hidden", amDrawer);
    setStatus(amDrawer ? "Pick a word to draw" : `${drawerName(round)} is choosing a word...`);

    if (amDrawer) {
      const { data: choices } = await supabase.rpc("get_word_choices");
      els.wordChoices.innerHTML = "";
      (choices || []).forEach(({ word }) => {
        const btn = document.createElement("button");
        btn.textContent = word;
        btn.className = "word-choice-btn";
        btn.addEventListener("click", () => chooseWord(word));
        els.wordChoices.appendChild(btn);
      });
      els.wordChoiceModal.classList.remove("hidden");
    }
  }

  if (round.status === "drawing") {
    els.wordChoiceModal.classList.add("hidden");
    board.clear(false);
    els.guessLog.innerHTML = "";

    if (amDrawer) {
      els.wordHint.textContent = `Draw: ${round.selected_word}`;
    } else {
      els.wordHint.textContent = `${round.selected_word.length} letters`;
    }
    setStatus(amDrawer ? "Your turn to draw!" : `Guess what ${drawerName(round)} is drawing`);

    if (stopCountdown) stopCountdown();
    stopCountdown = startCountdown(
      round.ends_at,
      (secondsLeft) => (els.timer.textContent = secondsLeft),
      async () => {
        if (amDrawer) await endRound(round.id);
      }
    );
  }

  if (round.status === "ended") {
    if (stopCountdown) stopCountdown();
    els.wordHint.textContent = `The word was: ${round.selected_word}`;
    setStatus("Round over — next round starting soon...");

    // The host advances to the next round after a short reveal pause.
    const { data: room } = await supabase.from("rooms").select("*").eq("id", roomId).single();
    if (room.host_user_id === session.user.id) {
      setTimeout(() => startRound(round.round_number + 1), 4000);
    }
    if (room.status === "finished") {
      showFinalScreen();
    }
  }
}

async function chooseWord(word) {
  const startedAt = new Date();
  const { data: room, error: roomReadErr } = await supabase
    .from("rooms")
    .select("round_seconds")
    .eq("id", roomId)
    .single();
  if (roomReadErr) {
    console.error("Failed to read room:", roomReadErr);
    alert(`Couldn't start the round: ${roomReadErr.message}`);
    return;
  }
  const endsAt = new Date(startedAt.getTime() + room.round_seconds * 1000);

  const { error: roundErr } = await supabase
    .from("rounds")
    .update({
      selected_word: word,
      status: "drawing",
      started_at: startedAt.toISOString(),
      ends_at: endsAt.toISOString(),
    })
    .eq("id", currentRound.id);
  if (roundErr) {
    console.error("Failed to update round:", roundErr);
    alert(`Couldn't select that word: ${roundErr.message}`);
    return;
  }

  const { error: roomErr } = await supabase.from("rooms").update({ status: "drawing" }).eq("id", roomId);
  if (roomErr) {
    console.error("Failed to update room status:", roomErr);
    alert(`Round started, but room status didn't update: ${roomErr.message}`);
  }
}

async function endRound(roundId) {
  await supabase.from("rounds").update({ status: "ended" }).eq("id", roundId);
}

// ---------------- Guessing ----------------

async function onSubmitGuess(e) {
  e.preventDefault();
  const guess = els.guessInput.value.trim();
  if (!guess || !currentRound) return;
  els.guessInput.value = "";

  const { data, error } = await supabase.rpc("submit_guess", {
    p_round_id: currentRound.id,
    p_guess: guess,
  });
  if (error) {
    console.error(error);
    return;
  }
  const result = Array.isArray(data) ? data[0] : data;
  logGuess("You", guess, result.correct);
  if (result.correct) await refreshPlayers();
}

function handleGuessRow(payload) {
  const row = payload.new;
  if (row.player_id === myPlayerId) return; // we already logged our own above
  const player = players.find((p) => p.id === row.player_id);
  logGuess(player ? player.display_name : "Someone", row.correct ? "guessed it!" : row.guess_text, row.correct);
  if (row.correct) refreshPlayers();
}

function logGuess(who, text, correct) {
  const li = document.createElement("li");
  li.textContent = `${who}: ${text}`;
  if (correct) li.classList.add("correct-guess");
  els.guessLog.appendChild(li);
  els.guessLog.scrollTop = els.guessLog.scrollHeight;
}

// ---------------- Helpers ----------------

function drawerName(round) {
  const drawer = players.find((p) => p.id === round.drawer_player_id);
  return drawer ? drawer.display_name : "someone";
}

function setStatus(text) {
  els.statusBar.textContent = text;
}

function showFinalScreen() {
  document.getElementById("game-screen").classList.add("hidden");
  els.finalScreen.classList.remove("hidden");
  els.finalScoreboard.innerHTML = "";
  [...players]
    .sort((a, b) => b.score - a.score)
    .forEach((p, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>#${i + 1} ${escapeHtml(p.display_name)}</span><span>${p.score}</span>`;
      els.finalScoreboard.appendChild(li);
    });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}