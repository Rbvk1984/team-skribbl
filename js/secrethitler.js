import { supabase } from "./supabaseClient.js";
import { requireAccess } from "./guard.js";
import { connectRoomChannel } from "./realtime.js";

const session = await requireAccess();
if (!session) throw new Error("no access");

const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");

const els = {
  gameScreen: document.getElementById("game-screen"),
  endScreen: document.getElementById("sh-end-screen"),
  liberalTrack: document.getElementById("sh-liberal-track"),
  fascistTrack: document.getElementById("sh-fascist-track"),
  electionPips: document.getElementById("sh-election-pips"),
  status: document.getElementById("sh-status"),
  roleCard: document.getElementById("sh-role-card"),
  roleLabel: document.getElementById("sh-role-label"),
  roleDetail: document.getElementById("sh-role-detail"),
  playerList: document.getElementById("sh-player-list"),
  nominatePanel: document.getElementById("sh-nominate-panel"),
  nominateList: document.getElementById("sh-nominate-list"),
  votePanel: document.getElementById("sh-vote-panel"),
  votePrompt: document.getElementById("sh-vote-prompt"),
  voteJa: document.getElementById("sh-vote-ja"),
  voteNein: document.getElementById("sh-vote-nein"),
  voteWaiting: document.getElementById("sh-vote-waiting"),
  presDiscardPanel: document.getElementById("sh-president-discard-panel"),
  presCards: document.getElementById("sh-pres-cards"),
  chanEnactPanel: document.getElementById("sh-chancellor-enact-panel"),
  chanCards: document.getElementById("sh-chan-cards"),
  executivePanel: document.getElementById("sh-executive-panel"),
  executivePrompt: document.getElementById("sh-executive-prompt"),
  executiveList: document.getElementById("sh-executive-list"),
  voteResult: document.getElementById("sh-vote-result"),
  voteResultText: document.getElementById("sh-vote-result-text"),
  error: document.getElementById("sh-error"),
  winnerLabel: document.getElementById("sh-winner-label"),
  winReason: document.getElementById("sh-win-reason"),
  rolesReveal: document.getElementById("sh-roles-reveal"),
};

let myPlayerId = null;
let players = [];
let myRole = null;
let myKnownFascists = [];
let hasVotedThisRound = false;
let lastRoundSeen = 0;

await init();

async function init() {
  const { data: playerRow } = await supabase
    .from("players").select("id")
    .eq("room_id", roomId).eq("user_id", session.user.id).single();

  if (!playerRow) { window.location.href = "lobby.html"; return; }
  myPlayerId = playerRow.id;

  await loadMyRole();
  await refreshPlayers();
  await renderGameState();

  connectRoomChannel(roomId, {
    onPlayersChange: async () => { await refreshPlayers(); await renderGameState(); },
    onRoundsChange: async () => { hasVotedThisRound = false; await renderGameState(); },
    onSHGameChange: async () => { await renderGameState(); },
  });

  els.voteJa.addEventListener("click", () => castVote("ja"));
  els.voteNein.addEventListener("click", () => castVote("nein"));
}

async function loadMyRole() {
  const { data } = await supabase.rpc("sh_my_role", { p_room_id: roomId });
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) return;
  myRole = result.role;
  myKnownFascists = result.known_fascists || [];

  els.roleCard.classList.remove("hidden", "sh-role-fascist", "sh-role-hitler");
  if (myRole === "fascist") els.roleCard.classList.add("sh-role-fascist");
  if (myRole === "hitler")  els.roleCard.classList.add("sh-role-hitler");

  const roleNames = { liberal: "🔵 You are a Liberal", fascist: "🔴 You are a Fascist", hitler: "💀 You are Hitler" };
  els.roleLabel.textContent = roleNames[myRole] || myRole;

  if (myRole === "fascist" && myKnownFascists.length > 0) {
    const names = myKnownFascists.map(f => {
      const p = players.find(pl => pl.id === f.player_id);
      return p ? `${p.display_name} (${f.role})` : f.player_id;
    });
    els.roleDetail.textContent = `Your team: ${names.join(", ")}`;
  } else if (myRole === "liberal") {
    els.roleDetail.textContent = "Find the Fascists and Hitler. Vote carefully!";
  } else if (myRole === "hitler") {
    els.roleDetail.textContent = "Blend in. Get elected Chancellor after 3 Fascist policies win.";
  }
}

async function refreshPlayers() {
  const { data } = await supabase.from("players").select("id, display_name")
    .eq("room_id", roomId).order("joined_at", { ascending: true });
  players = data || [];
  // Update role detail names now that players are loaded
  if (myRole === "fascist" && myKnownFascists.length > 0) {
    const names = myKnownFascists.map(f => {
      const p = players.find(pl => pl.id === f.player_id);
      return p ? `${p.display_name} (${f.role})` : "?";
    });
    els.roleDetail.textContent = `Your team: ${names.join(", ")}`;
  }
}

async function renderGameState() {
  const { data: game } = await supabase.from("sh_games_public").select("*").eq("room_id", roomId).maybeSingle();
  if (!game) return;

  // Check if game ended
  if (game.status === "ended") {
    showEndScreen(game);
    return;
  }

  // Detect new round — reset voted flag
  if (game.round_number !== lastRoundSeen) {
    lastRoundSeen = game.round_number;
    hasVotedThisRound = false;
    els.voteResult.classList.add("hidden");
  }

  // Fetch alive status
  const { data: rounds } = await supabase.from("sh_rounds").select("*")
    .eq("room_id", roomId).order("round_number", { ascending: false }).limit(3);

  const lastRound = rounds?.[0];
  const prevRound = rounds?.[1];

  // Show vote result banner if last round just resolved
  if (prevRound?.vote_result && prevRound.round_number === game.round_number - 1) {
    const pres = players.find(p => p.id === prevRound.president_id)?.display_name || "?";
    const chan = players.find(p => p.id === prevRound.chancellor_id)?.display_name || "?";
    const result = prevRound.vote_result === "passed" ? "✅ Passed" : "❌ Failed";
    els.voteResultText.textContent = `Round ${prevRound.round_number}: ${pres} + ${chan} — ${result}${prevRound.policy_enacted ? ` — ${prevRound.policy_enacted} policy enacted` : ""}`;
    els.voteResult.classList.remove("hidden");
  }

  // Render policy tracks
  renderTrack(els.liberalTrack, game.liberal_policies, 5, "liberal");
  renderTrack(els.fascistTrack, game.fascist_policies, 6, "fascist");
  renderElectionPips(game.election_tracker);

  // Status bar
  const presName = players.find(p => p.id === game.presidential_player_id)?.display_name || "?";
  const chanName = game.chancellor_player_id ? players.find(p => p.id === game.chancellor_player_id)?.display_name : null;
  const statusTexts = {
    nominating: `${presName} is President — nominating a Chancellor`,
    voting: `Vote: ${presName} + ${chanName || "?"}`,
    president_discard: `${presName} is choosing a policy to discard`,
    chancellor_enact: `${chanName || "?"} is enacting a policy`,
    executive_action: `${presName} uses executive power: ${game.pending_power}`,
  };
  els.status.textContent = statusTexts[game.status] || game.status;

  // Render player list
  renderPlayerList(game);

  // Show/hide panels
  hideAllPanels();
  const amPresident = game.presidential_player_id === myPlayerId;
  const amChancellor = game.chancellor_player_id === myPlayerId;

  if (game.status === "nominating" && amPresident) {
    showNominatePanel(game);
  } else if (game.status === "voting" && !hasVotedThisRound) {
    showVotePanel(game);
  } else if (game.status === "president_discard" && amPresident) {
    await showPresidentCards(game);
  } else if (game.status === "chancellor_enact" && amChancellor) {
    await showChancellorCards(game);
  } else if (game.status === "executive_action" && amPresident) {
    showExecutivePanel(game);
  }
}

function renderTrack(container, filled, total, type) {
  container.innerHTML = "";
  for (let i = 0; i < total; i++) {
    const pip = document.createElement("div");
    pip.className = `sh-pip${i < filled ? ` filled-${type}` : ""}`;
    container.appendChild(pip);
  }
}

function renderElectionPips(count) {
  els.electionPips.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const pip = document.createElement("div");
    pip.className = `sh-pip${i < count ? " filled-election" : ""}`;
    els.electionPips.appendChild(pip);
  }
}

function renderPlayerList(game) {
  els.playerList.innerHTML = "";
  players.forEach(p => {
    const li = document.createElement("li");
    li.className = "sh-player-row";

    const name = document.createElement("span");
    name.textContent = p.display_name;
    li.appendChild(name);

    const tags = document.createElement("div");
    tags.style.display = "flex"; tags.style.gap = "6px";
    if (p.id === game.presidential_player_id) tags.innerHTML += `<span class="sh-tag sh-tag-president">President</span>`;
    if (p.id === game.chancellor_player_id)   tags.innerHTML += `<span class="sh-tag sh-tag-chancellor">Chancellor</span>`;
    if (p.id === game.last_president_id || p.id === game.last_chancellor_id)
      tags.innerHTML += `<span class="sh-tag sh-tag-termlimit">term-limited</span>`;
    li.appendChild(tags);
    els.playerList.appendChild(li);
  });
}

function hideAllPanels() {
  [els.nominatePanel, els.votePanel, els.presDiscardPanel,
   els.chanEnactPanel, els.executivePanel].forEach(p => p.classList.add("hidden"));
}

function showNominatePanel(game) {
  els.nominatePanel.classList.remove("hidden");
  els.nominateList.innerHTML = "";
  players.forEach(p => {
    if (p.id === myPlayerId) return;
    if (p.id === game.last_president_id || p.id === game.last_chancellor_id) return;
    const li = document.createElement("li");
    li.className = "sh-player-row sh-clickable";
    li.textContent = p.display_name;
    li.addEventListener("click", () => nominate(p.id));
    els.nominateList.appendChild(li);
  });
}

async function nominate(chancellorId) {
  const { error } = await supabase.rpc("sh_nominate_chancellor", { p_room_id: roomId, p_chancellor_id: chancellorId });
  if (error) els.error.textContent = error.message;
}

function showVotePanel(game) {
  els.votePanel.classList.remove("hidden");
  const presName = players.find(p => p.id === game.presidential_player_id)?.display_name || "?";
  const chanName = players.find(p => p.id === game.chancellor_player_id)?.display_name || "?";
  els.votePrompt.textContent = `Should ${presName} & ${chanName} form the government?`;
  els.voteJa.disabled = false;
  els.voteNein.disabled = false;
  els.voteWaiting.classList.add("hidden");
}

async function castVote(vote) {
  const { error } = await supabase.rpc("sh_cast_vote", { p_room_id: roomId, p_vote: vote });
  if (error) { els.error.textContent = error.message; return; }
  hasVotedThisRound = true;
  els.voteJa.disabled = true;
  els.voteNein.disabled = true;
  els.voteWaiting.textContent = `You voted ${vote === "ja" ? "Ja! ✓" : "Nein! ✗"} — waiting for others...`;
  els.voteWaiting.classList.remove("hidden");
}

async function showPresidentCards() {
  const { data, error } = await supabase.rpc("sh_get_president_hand", { p_room_id: roomId });
  if (error) { els.error.textContent = error.message; return; }
  const hand = data || [];

  els.presDiscardPanel.classList.remove("hidden");
  els.presCards.innerHTML = "";
  hand.forEach((card, i) => {
    const div = document.createElement("div");
    div.className = `sh-card sh-card-${card}`;
    div.textContent = card === "liberal" ? "🔵 Liberal" : "🔴 Fascist";
    div.addEventListener("click", () => presidentDiscard(i));
    els.presCards.appendChild(div);
  });
}

async function showChancellorCards() {
  const { data, error } = await supabase.rpc("sh_get_chancellor_hand", { p_room_id: roomId });
  if (error) { els.error.textContent = error.message; return; }
  const hand = data || [];

  els.chanEnactPanel.classList.remove("hidden");
  els.chanCards.innerHTML = "";
  hand.forEach((card, i) => {
    const div = document.createElement("div");
    div.className = `sh-card sh-card-${card}`;
    div.textContent = card === "liberal" ? "🔵 Liberal" : "🔴 Fascist";
    div.addEventListener("click", () => chancellorEnact(i));
    els.chanCards.appendChild(div);
  });
}

async function presidentDiscard(index) {
  const { error } = await supabase.rpc("sh_president_discard", { p_room_id: roomId, p_discard_index: index });
  if (error) els.error.textContent = error.message;
}

async function chancellorEnact(index) {
  const { error } = await supabase.rpc("sh_chancellor_enact", { p_room_id: roomId, p_enact_index: index });
  if (error) els.error.textContent = error.message;
}

function showExecutivePanel(game) {
  els.executivePanel.classList.remove("hidden");
  const powerLabels = {
    investigate: "Investigate a player's party membership:",
    special_election: "Pick the next Presidential candidate:",
    execute: "Execute a player:",
  };
  els.executivePrompt.textContent = powerLabels[game.pending_power] || game.pending_power;

  els.executiveList.innerHTML = "";
  players.forEach(p => {
    if (p.id === myPlayerId) return;
    const li = document.createElement("li");
    li.className = "sh-player-row sh-clickable";
    li.textContent = p.display_name;
    li.addEventListener("click", () => useExecutivePower(game.pending_power, p.id, p.display_name));
    els.executiveList.appendChild(li);
  });
}

async function useExecutivePower(power, targetId, targetName) {
  if (power === "investigate") {
    const { data, error } = await supabase.rpc("sh_investigate_player", { p_room_id: roomId, p_target_player_id: targetId });
    if (error) { els.error.textContent = error.message; return; }
    alert(`Investigation result: ${targetName} is a ${data === "liberal" ? "🔵 Liberal" : "🔴 Fascist"} (party only, not exact role)`);
  } else if (power === "special_election") {
    const { error } = await supabase.rpc("sh_special_election", { p_room_id: roomId, p_new_president_id: targetId });
    if (error) els.error.textContent = error.message;
  } else if (power === "execute") {
    if (!confirm(`Are you sure you want to execute ${targetName}? This cannot be undone.`)) return;
    const { data, error } = await supabase.rpc("sh_execute_player", { p_room_id: roomId, p_target_player_id: targetId });
    if (error) { els.error.textContent = error.message; return; }
    const result = Array.isArray(data) ? data[0] : data;
    if (result?.was_hitler) alert("You executed Hitler! Liberals win!");
    else alert(`${targetName} was executed. They were NOT Hitler.`);
  }
}

async function showEndScreen(game) {
  els.gameScreen.classList.add("hidden");
  els.endScreen.classList.remove("hidden");
  els.winnerLabel.textContent = game.winner === "liberals" ? "🔵 Liberals Win!" : "🔴 Fascists Win!";
  els.winReason.textContent = game.win_reason || "";

  const { data: roles } = await supabase.rpc("sh_reveal_all_roles", { p_room_id: roomId });
  if (roles) {
    els.rolesReveal.innerHTML = "<strong>All roles revealed:</strong>";
    const ul = document.createElement("ul");
    ul.className = "sh-player-list";
    ul.style.marginTop = "10px";
    roles.forEach(r => {
      const li = document.createElement("li");
      li.className = "sh-player-row";
      li.innerHTML = `<span>${escapeHtml(r.display_name)}${!r.alive ? " ☠️" : ""}</span><span>${r.role}</span>`;
      ul.appendChild(li);
    });
    els.rolesReveal.appendChild(ul);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
