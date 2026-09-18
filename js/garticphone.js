import { supabase } from "./supabaseClient.js";
import { requireAccess } from "./guard.js";
import { connectRoomChannel } from "./realtime.js";
import { createGarticBoard } from "./garticcanvas.js";

const session = await requireAccess();
if (!session) throw new Error("no access");

const params   = new URLSearchParams(window.location.search);
const roomId   = params.get("room");

const els = {
  writeScreen:   document.getElementById("write-screen"),
  drawScreen:    document.getElementById("draw-screen"),
  revealScreen:  document.getElementById("reveal-screen"),
  endScreen:     document.getElementById("gp-end-screen"),
  writeHeading:  document.getElementById("gp-write-heading"),
  writeSubhead:  document.getElementById("gp-write-subheading"),
  prevDrawingBox:document.getElementById("gp-prev-drawing-box"),
  prevCanvas:    document.getElementById("gp-prev-canvas"),
  textInput:     document.getElementById("gp-text-input"),
  submitTextBtn: document.getElementById("gp-submit-text-btn"),
  writeWaiting:  document.getElementById("gp-waiting-msg"),
  writeProgress: document.getElementById("gp-progress"),
  writeError:    document.getElementById("gp-write-error"),
  drawPrompt:    document.getElementById("gp-draw-prompt"),
  canvas:        document.getElementById("gp-canvas"),
  gpColor:       document.getElementById("gp-color"),
  brushBtns:     document.querySelectorAll(".gp-brush-btn"),
  eraserBtn:     document.getElementById("gp-eraser-btn"),
  clearBtn:      document.getElementById("gp-clear-btn"),
  submitDrawBtn: document.getElementById("gp-submit-draw-btn"),
  drawWaiting:   document.getElementById("gp-draw-waiting"),
  drawProgress:  document.getElementById("gp-draw-progress"),
  drawError:     document.getElementById("gp-draw-error"),
  revealTitle:   document.getElementById("gp-reveal-title"),
  slideshow:     document.getElementById("gp-slideshow"),
  nextEntryBtn:  document.getElementById("gp-next-entry-btn"),
  nextBookBtn:   document.getElementById("gp-next-book-btn"),
};

let myPlayerId = null;
let isHost = false;
let board = null;
let revealEntries = [];
let revealStep = 0;

await init();

async function init() {
  const { data: playerRow } = await supabase
    .from("players").select("id")
    .eq("room_id", roomId).eq("user_id", session.user.id).single();
  if (!playerRow) { window.location.href = "lobby.html"; return; }
  myPlayerId = playerRow.id;

  const { data: room } = await supabase.from("rooms").select("host_user_id").eq("id", roomId).single();
  isHost = room.host_user_id === session.user.id;

  board = createGarticBoard(els.canvas);

  connectRoomChannel(roomId, {
    onGPGameChange: renderGameState,
  });

  await renderGameState();

  els.submitTextBtn.addEventListener("click", submitText);
  els.submitDrawBtn.addEventListener("click", submitDrawing);
  els.gpColor.addEventListener("change", e => board.setColor(e.target.value));
  els.brushBtns.forEach(btn =>
    btn.addEventListener("click", () => board.setWidth(Number(btn.dataset.size)))
  );
  els.eraserBtn.addEventListener("click", () => board.setColor("#ffffff"));
  els.clearBtn.addEventListener("click", () => board.clear());
  els.nextEntryBtn.addEventListener("click", nextRevealEntry);
  els.nextBookBtn.addEventListener("click", advanceBook);
}

// ---- Render state ----

async function renderGameState() {
  const { data: game } = await supabase.from("gp_games").select("*").eq("room_id", roomId).maybeSingle();
  if (!game) return;

  hideAll();

  if (game.status === "ended") {
    els.endScreen.classList.remove("hidden");
    return;
  }

  if (game.status === "reveal") {
    await loadReveal(game);
    return;
  }

  const submitted = await supabase.rpc("gp_have_i_submitted", { p_room_id: roomId });
  const haveSubmitted = submitted.data === true;
  const progress = `${game.submissions_this_round} / ${game.total_rounds} submitted`;

  if (game.status === "writing") {
    els.writeScreen.classList.remove("hidden");
    if (game.current_round === 1) {
      els.writeHeading.textContent = "Round 1 — Write a starting prompt";
      els.writeSubhead.textContent = "Be creative! Your team will draw it in the next round.";
      els.prevDrawingBox.classList.add("hidden");
    } else {
      els.writeHeading.textContent = `Round ${game.current_round} — What is this drawing?`;
      els.writeSubhead.textContent = "Type your best guess as a caption:";
      await showPrevDrawing();
    }
    els.textInput.value = "";
    els.writeProgress.textContent = progress;
    if (haveSubmitted) setWriteWaiting(progress);

  } else if (game.status === "drawing") {
    els.drawScreen.classList.remove("hidden");
    board.clear();
    board.setColor("#1c1c1c");
    board.setWidth(4);
    els.drawProgress.textContent = progress;

    const { data: prompt } = await supabase.rpc("gp_get_my_prompt", { p_room_id: roomId });
    const entry = Array.isArray(prompt) ? prompt[0] : prompt;
    els.drawPrompt.textContent = entry?.content || "(no prompt found)";

    if (haveSubmitted) setDrawWaiting(progress);
  }
}

async function showPrevDrawing() {
  const { data: prompt } = await supabase.rpc("gp_get_my_prompt", { p_room_id: roomId });
  const entry = Array.isArray(prompt) ? prompt[0] : prompt;
  if (!entry || entry.entry_type !== "drawing") {
    els.prevDrawingBox.classList.add("hidden");
    return;
  }
  els.prevDrawingBox.classList.remove("hidden");
  const previewBoard = createGarticBoard(els.prevCanvas);
  previewBoard.replayStrokes(entry.content);
}

// ---- Submission ----

async function submitText() {
  const text = els.textInput.value.trim();
  if (!text) { els.writeError.textContent = "Please write something first."; return; }
  els.submitTextBtn.disabled = true;

  const { error } = await supabase.rpc("gp_submit_entry", { p_room_id: roomId, p_content: text });
  if (error) {
    els.writeError.textContent = error.message;
    els.submitTextBtn.disabled = false;
    return;
  }
  setWriteWaiting("Waiting for others...");
}

async function submitDrawing() {
  if (!board.hasStrokes()) { els.drawError.textContent = "Draw something first!"; return; }
  els.submitDrawBtn.disabled = true;

  const { error } = await supabase.rpc("gp_submit_entry", {
    p_room_id: roomId,
    p_content: board.getStrokesJson(),
  });
  if (error) {
    els.drawError.textContent = error.message;
    els.submitDrawBtn.disabled = false;
    return;
  }
  setDrawWaiting("Drawing submitted! Waiting for others...");
}

// ---- Reveal ----

async function loadReveal(game) {
  els.revealScreen.classList.remove("hidden");

  const { data: entries, error } = await supabase.rpc("gp_get_reveal_entries", { p_room_id: roomId });
  if (error) { console.error(error); return; }

  revealEntries = entries || [];
  revealStep = 0;
  els.slideshow.innerHTML = "";
  els.nextEntryBtn.classList.remove("hidden");
  els.nextBookBtn.classList.add("hidden");

  // Show the book title (original prompt owner)
  const { data: books } = await supabase.from("gp_books").select("owner_player_id, book_order").eq("room_id", roomId);
  const { data: players } = await supabase.from("players").select("id, display_name").eq("room_id", roomId);
  const currentBook = books?.find(b => b.book_order === game.reveal_book_index);
  const owner = players?.find(p => p.id === currentBook?.owner_player_id);
  els.revealTitle.textContent = `📖 ${owner?.display_name || "Someone"}'s book`;

  // Show first entry immediately
  showRevealEntry();
}

function showRevealEntry() {
  if (revealStep >= revealEntries.length) {
    // All entries shown — show "next book" button
    els.nextEntryBtn.classList.add("hidden");
    els.nextBookBtn.classList.remove("hidden");
    return;
  }

  const entry = revealEntries[revealStep];
  const slide = document.createElement("div");
  slide.className = "gp-slide";

  const authorLabel = document.createElement("p");
  authorLabel.className = "gp-slide-author";
  authorLabel.textContent = `Round ${entry.round_number} — ${entry.author_name}`;
  slide.appendChild(authorLabel);

  if (entry.entry_type === "text") {
    const textEl = document.createElement("p");
    textEl.className = "gp-slide-text";
    textEl.textContent = entry.content;
    slide.appendChild(textEl);
  } else {
    const canvasEl = document.createElement("canvas");
    canvasEl.className = "gp-slide-canvas";
    slide.appendChild(canvasEl);
    // Render after appending so getBoundingClientRect works
    requestAnimationFrame(() => {
      const b = createGarticBoard(canvasEl);
      b.replayStrokes(entry.content);
    });
  }

  els.slideshow.appendChild(slide);
  slide.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function nextRevealEntry() {
  revealStep++;
  showRevealEntry();
}

async function advanceBook() {
  if (!isHost) {
    // Non-hosts just wait — host drives the reveal
    els.nextBookBtn.textContent = "Waiting for host...";
    els.nextBookBtn.disabled = true;
    return;
  }
  const { error } = await supabase.rpc("gp_advance_reveal", { p_room_id: roomId });
  if (error) console.error(error);
  // The gp_games change will fire renderGameState for everyone
}

// ---- Helpers ----

function hideAll() {
  [els.writeScreen, els.drawScreen, els.revealScreen, els.endScreen]
    .forEach(el => el.classList.add("hidden"));
}

function setWriteWaiting(msg) {
  els.textInput.disabled = true;
  els.submitTextBtn.disabled = true;
  els.writeWaiting.textContent = msg;
  els.writeWaiting.classList.remove("hidden");
}

function setDrawWaiting(msg) {
  els.submitDrawBtn.disabled = true;
  els.drawWaiting.textContent = msg;
  els.drawWaiting.classList.remove("hidden");
}
