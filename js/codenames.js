import { supabase } from "./supabaseClient.js";
import { requireAccess } from "./guard.js";
import { connectRoomChannel } from "./realtime.js";

const session = await requireAccess();
if (!session) throw new Error("no access");

const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");

const els = {
  setupScreen: document.getElementById("team-setup-screen"),
  boardScreen: document.getElementById("board-screen"),
  endScreen: document.getElementById("cn-end-screen"),
  redList: document.getElementById("red-list"),
  blueList: document.getElementById("blue-list"),
  joinRedOp: document.getElementById("join-red-operative"),
  joinRedSpy: document.getElementById("join-red-spymaster"),
  joinBlueOp: document.getElementById("join-blue-operative"),
  joinBlueSpy: document.getElementById("join-blue-spymaster"),
  startBtn: document.getElementById("start-codenames-btn"),
  setupError: document.getElementById("setup-error"),
  turnLabel: document.getElementById("cn-turn-label"),
  clueLabel: document.getElementById("cn-clue-label"),
  guessesLabel: document.getElementById("cn-guesses-label"),
  board: document.getElementById("cn-board"),
  redRemaining: document.getElementById("cn-red-remaining"),
  blueRemaining: document.getElementById("cn-blue-remaining"),
  clueForm: document.getElementById("clue-form"),
  clueWord: document.getElementById("clue-word"),
  clueNumber: document.getElementById("clue-number"),
  passBtn: document.getElementById("pass-turn-btn"),
  winnerLabel: document.getElementById("cn-winner-label"),
};

let myPlayerId = null;
let isHost = false;

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

  const { data: room } = await supabase.from("rooms").select("*").eq("id", roomId).single();
  isHost = room.host_user_id === session.user.id;

  connectRoomChannel(roomId, {
    onRoomChange: (payload) => showScreenFor(payload.new.status),
    onCodenamesPlayersChange: refreshTeamLists,
    onGamesChange: onGameStateChanged,
  });

  await refreshTeamLists();
  showScreenFor(room.status);
  if (room.status === "active") {
    await loadGameState();
  }

  els.joinRedOp.addEventListener("click", () => joinTeam("red", "operative"));
  els.joinRedSpy.addEventListener("click", () => joinTeam("red", "spymaster"));
  els.joinBlueOp.addEventListener("click", () => joinTeam("blue", "operative"));
  els.joinBlueSpy.addEventListener("click", () => joinTeam("blue", "spymaster"));
  els.startBtn.addEventListener("click", startGame);
  els.clueForm.addEventListener("submit", giveClue);
  els.passBtn.addEventListener("click", passTurn);

  els.startBtn.classList.toggle("hidden", !isHost);
}

function showScreenFor(status) {
  els.setupScreen.classList.toggle("hidden", status !== "team_setup");
  els.boardScreen.classList.toggle("hidden", status !== "active");
  if (status === "active") loadGameState();
}

// ---------------- Team setup ----------------

async function joinTeam(team, role) {
  const { error } = await supabase
    .from("codenames_players")
    .upsert({ room_id: roomId, player_id: myPlayerId, team, role }, { onConflict: "room_id,player_id" });

  if (error) {
    els.setupError.textContent = error.message.includes("one_spymaster_per_team")
      ? "That team already has a spymaster."
      : error.message;
  } else {
    els.setupError.textContent = "";
  }
}

async function refreshTeamLists() {
  const { data } = await supabase
    .from("codenames_players")
    .select("team, role, players(display_name)")
    .eq("room_id", roomId);

  els.redList.innerHTML = "";
  els.blueList.innerHTML = "";

  (data || []).forEach((row) => {
    const li = document.createElement("li");
    li.textContent = row.players.display_name;
    if (row.role === "spymaster") li.classList.add("is-spymaster");
    (row.team === "red" ? els.redList : els.blueList).appendChild(li);
  });
}

async function startGame() {
  const { error } = await supabase.rpc("codenames_start_game", { p_room_id: roomId });
  if (error) {
    els.setupError.textContent = error.message;
  }
  // room status change (to 'active') arrives via Realtime and flips the screen for everyone.
}

// ---------------- Board / gameplay ----------------

let myTeam = null;
let myRole = null;

async function loadGameState() {
  const { data: mine } = await supabase
    .from("codenames_players")
    .select("team, role")
    .eq("room_id", roomId)
    .eq("player_id", myPlayerId)
    .maybeSingle();
  myTeam = mine ? mine.team : null;
  myRole = mine ? mine.role : null;

  const { data: game } = await supabase.from("codenames_games").select("*").eq("room_id", roomId).single();
  const { data: cards } = await supabase
    .from("codenames_cards_public")
    .select("*")
    .eq("room_id", roomId)
    .order("idx", { ascending: true });

  renderGame(game, cards || []);
}

function onGameStateChanged() {
  loadGameState();
}

function renderGame(game, cards) {
  if (!game) return;

  if (game.phase === "ended") {
    els.boardScreen.classList.add("hidden");
    els.endScreen.classList.remove("hidden");
    els.winnerLabel.textContent =
      game.winner === "red" ? "Team Red wins! 🔴" : game.winner === "blue" ? "Team Blue wins! 🔵" : "Game over";
    return;
  }

  els.turnLabel.textContent = `${game.current_team === "red" ? "Red" : "Blue"}'s turn — ${
    game.phase === "clue" ? "choosing a clue" : "guessing"
  }`;
  els.clueLabel.textContent = game.clue_word ? `Clue: "${game.clue_word}" (${game.clue_number})` : "";
  els.guessesLabel.textContent = game.phase === "guessing" ? `${game.guesses_remaining} guesses left` : "";

  els.redRemaining.textContent = cards.filter((c) => c.color === "red" && !c.revealed).length;
  els.blueRemaining.textContent = cards.filter((c) => c.color === "blue" && !c.revealed).length;

  const amCurrentSpymaster = myRole === "spymaster" && myTeam === game.current_team;
  const amCurrentOperative = myRole === "operative" && myTeam === game.current_team;

  els.clueForm.classList.toggle("hidden", !(amCurrentSpymaster && game.phase === "clue"));
  els.passBtn.classList.toggle("hidden", !(amCurrentOperative && game.phase === "guessing"));

  els.board.innerHTML = "";
  cards.forEach((card) => {
    const cell = document.createElement("div");
    cell.className = "cn-card";
    cell.textContent = card.word;

    if (card.revealed) {
      cell.classList.add(`cn-revealed-${card.color}`);
    } else if (myRole === "spymaster" && card.color) {
      cell.classList.add(`cn-spy-hint-${card.color}`);
    }

    const clickable = amCurrentOperative && game.phase === "guessing" && !card.revealed;
    cell.classList.add(clickable ? "cn-card-clickable" : "cn-card-disabled");
    if (clickable) cell.addEventListener("click", () => revealCard(card.idx));

    els.board.appendChild(cell);
  });
}

async function giveClue(e) {
  e.preventDefault();
  const word = els.clueWord.value.trim();
  const number = parseInt(els.clueNumber.value, 10);
  if (!word || Number.isNaN(number)) return;

  const { error } = await supabase.rpc("codenames_give_clue", { p_room_id: roomId, p_word: word, p_number: number });
  if (error) {
    alert(error.message);
    return;
  }
  els.clueWord.value = "";
  els.clueNumber.value = "";
}

async function revealCard(idx) {
  const { error } = await supabase.rpc("codenames_reveal_card", { p_room_id: roomId, p_idx: idx });
  if (error) alert(error.message);
}

async function passTurn() {
  const { error } = await supabase.rpc("codenames_pass_turn", { p_room_id: roomId });
  if (error) alert(error.message);
}
