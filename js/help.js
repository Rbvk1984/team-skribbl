// =========================================================
// help.js — floating ? button + context-aware slide-out panel
// Load this on every page. Detects current page from
// document.body.dataset.page and shows relevant rules.
// Shows an extra Admin tab if ts_role === 'admin'.
// =========================================================

const CONTENT = {

  landing: {
    title: "TeamPlay",
    tabs: ["About"],
    sections: [`
      <div class="help-game-badge">Welcome</div>
      <p class="help-p">TeamPlay is a private multiplayer games platform for your team. No app download, no account — just a passcode and a browser.</p>
      <p class="help-h">5 games available</p>
      <ul class="help-ul">
        <li><strong>Doodle Rush</strong> — draw it, guess it (2–12 players)</li>
        <li><strong>Agent Grid</strong> — one word clues, find your agents (4–10)</li>
        <li><strong>Odd One Out</strong> — everyone knows the location except the spy (3–8)</li>
        <li><strong>Shadow Vote</strong> — hidden roles, bluffing, policy wars (5–10)</li>
        <li><strong>Sketch Chain</strong> — drawing telephone game (3–8)</li>
      </ul>
      <p class="help-h">Getting in</p>
      <p class="help-p">You need a personal passcode from your admin. Each person gets their own. Click "Enter with passcode" and type it in.</p>
    `]
  },

  access: {
    title: "Entering the app",
    tabs: ["How to get in"],
    sections: [`
      <p class="help-h">You need a passcode</p>
      <p class="help-p">Ask your team admin (the person who set up TeamPlay) for your personal passcode. Each team member gets their own unique code.</p>
      <div class="help-tip"><strong>Tip:</strong> Your passcode is personal — don't share it. The admin can deactivate it instantly if needed.</div>
      <p class="help-h">What happens after</p>
      <p class="help-p">Once you enter a valid passcode you'll land in the game lobby where you can join or create a room.</p>
    `]
  },

  lobby: {
    title: "The Lobby",
    tabs: ["Joining a game"],
    sections: [`
      <p class="help-h">Creating a room</p>
      <ul class="help-ul">
        <li>Pick a game by clicking one of the cards</li>
        <li>Type your display name</li>
        <li>Click <strong>Create room</strong> — you become the host</li>
        <li>Share the room code with your team (use the Share button)</li>
        <li>Once everyone's joined, click <strong>Start game</strong></li>
      </ul>
      <p class="help-h">Joining someone else's room</p>
      <ul class="help-ul">
        <li>Type your display name</li>
        <li>Enter the room code the host sent you (e.g. FOX-427)</li>
        <li>Click <strong>Join room</strong> and wait for the host to start</li>
      </ul>
      <div class="help-tip"><strong>Tip:</strong> Only the host sees the Start game button. Everyone else waits on the same screen.</div>
    `]
  },

  skribbl: {
    title: "Doodle Rush",
    tabs: ["How to play"],
    sections: [`
      <div class="help-game-badge" style="color:#3dd68c;background:rgba(61,214,140,0.1);border-color:rgba(61,214,140,0.25)">🎨 Doodle Rush · 2–12 players</div>
      <p class="help-h">The idea</p>
      <p class="help-p">One player draws a secret word on their screen. Everyone else races to type the correct guess in the chat. Guess it faster = more points.</p>
      <p class="help-h">As the drawer</p>
      <ul class="help-ul">
        <li>You're given 3 words to choose from — pick one</li>
        <li>Draw it on the canvas using the colour picker and brush sizes</li>
        <li>You can see "Draw: <em>word</em>" at the top — others only see the letter count</li>
        <li>You earn 10 points every time someone guesses correctly</li>
      </ul>
      <p class="help-h">As a guesser</p>
      <ul class="help-ul">
        <li>Type your guesses in the box at the bottom</li>
        <li>Correct guess = 50 base points + up to 50 bonus for being fast</li>
        <li>Once you guess correctly you can still chat but the word is hidden from others</li>
      </ul>
      <p class="help-h">Round flow</p>
      <ul class="help-ul">
        <li>Round ends when the timer runs out or everyone has guessed</li>
        <li>The word is revealed to everyone</li>
        <li>Next player becomes the drawer — roles rotate through everyone</li>
      </ul>
      <div class="help-tip"><strong>Tip:</strong> Don't write the actual word in your drawing — that's cheating! Use symbols, arrows, and actions instead.</div>
    `]
  },

  codenames: {
    title: "Agent Grid",
    tabs: ["How to play"],
    sections: [`
      <div class="help-game-badge" style="color:#3a9edc;background:rgba(58,158,220,0.1);border-color:rgba(58,158,220,0.25)">🕵️ Agent Grid · 4–10 players</div>
      <p class="help-h">The idea</p>
      <p class="help-p">Two teams (Red and Blue). A 5×5 grid of words. Each team's Spymaster knows which words belong to their team. Give one-word clues to help your operatives find them — before the other team finds theirs.</p>
      <p class="help-h">Roles</p>
      <div class="help-rule-block">
        <p class="help-rule-title">Spymaster (1 per team)</p>
        <p class="help-rule-desc">You can see the full colour key. Give a one-word clue + a number ("Animal, 3") hinting at multiple cards at once. You cannot point, gesture, or say anything else.</p>
      </div>
      <div class="help-rule-block">
        <p class="help-rule-title">Operatives (everyone else)</p>
        <p class="help-rule-desc">Discuss the clue with your team and tap cards you think match. A correct card stays revealed in your colour. Wrong card ends your turn immediately.</p>
      </div>
      <p class="help-h">The Assassin card</p>
      <p class="help-p">One card on the board is the Assassin (black). If your team taps it, you lose instantly — no matter how many cards you had left.</p>
      <div class="help-win-block help-win-green">✅ Win: reveal all your team's cards first</div>
      <div class="help-win-block help-win-red">❌ Lose: tap the Assassin card, or the other team finishes first</div>
    `]
  },

  spyfall: {
    title: "Odd One Out",
    tabs: ["How to play"],
    sections: [`
      <div class="help-game-badge" style="color:#9b7fe8;background:rgba(155,127,232,0.1);border-color:rgba(155,127,232,0.25)">👁️ Odd One Out · 3–8 players</div>
      <p class="help-h">The idea</p>
      <p class="help-p">Everyone gets a card showing the same secret location (e.g. "Casino") — except one random player, the Spy, whose card is blank. The Spy must bluff. Everyone else must find the Spy without giving the location away too obviously.</p>
      <p class="help-h">As a regular player</p>
      <ul class="help-ul">
        <li>You know the location — answer questions in a way that proves you know it</li>
        <li>But don't be too obvious — the Spy is listening and will guess the location</li>
        <li>Tap another player's name to register a suspicion vote against them</li>
      </ul>
      <p class="help-h">As the Spy</p>
      <ul class="help-ul">
        <li>You don't know the location — listen to clues in everyone's answers</li>
        <li>Ask vague questions, give vague answers, blend in</li>
        <li>If you think you've figured out the location, tap "Guess location" for an instant win — but you only get one shot</li>
      </ul>
      <p class="help-h">Ending the round</p>
      <ul class="help-ul">
        <li>The host clicks "End round" when the timer runs out or the group is ready to vote</li>
        <li>The player with the most suspicion votes is compared to the actual Spy</li>
      </ul>
      <div class="help-win-block help-win-green">✅ Spy wins: guesses the location correctly, or the wrong person is accused</div>
      <div class="help-win-block help-win-red">❌ Spy loses: correctly identified by the group's votes</div>
    `]
  },

  secrethitler: {
    title: "Shadow Vote",
    tabs: ["How to play"],
    sections: [`
      <div class="help-game-badge" style="color:#e85d4e;background:rgba(232,93,78,0.1);border-color:rgba(232,93,78,0.25)">🗳️ Shadow Vote · 5–10 players</div>
      <p class="help-h">The idea</p>
      <p class="help-p">Hidden roles — Liberals vs Fascists (plus one Hitler). Each round a President nominates a Chancellor, everyone votes on the government, and if it passes they enact a policy. Fascists know each other. Liberals must find and stop them.</p>
      <p class="help-h">Your role card tells you</p>
      <div class="help-rule-block">
        <p class="help-rule-title">Liberal 🔵</p>
        <p class="help-rule-desc">You know nothing about others. Trust your instincts, watch who votes how, and try to build a government you believe in.</p>
      </div>
      <div class="help-rule-block">
        <p class="help-rule-title">Fascist 🔴</p>
        <p class="help-rule-desc">You know your fellow Fascists and who Hitler is. Help fascist policies get enacted without being caught. Protect Hitler.</p>
      </div>
      <div class="help-rule-block">
        <p class="help-rule-title">Hitler 💀</p>
        <p class="help-rule-desc">You don't know your team (in 7+ player games). Play as a Liberal to stay hidden. If elected Chancellor after 3 Fascist policies — Fascists win.</p>
      </div>
      <p class="help-h">The policy phase</p>
      <ul class="help-ul">
        <li>President draws 3 policy cards privately, discards 1, passes 2 to Chancellor</li>
        <li>Chancellor enacts 1 of the 2 — the other is discarded</li>
        <li>Nobody else sees which cards were available — this is where the bluffing happens</li>
      </ul>
      <div class="help-win-block help-win-green">✅ Liberals win: 5 Liberal policies enacted, or Hitler is executed</div>
      <div class="help-win-block help-win-red">❌ Fascists win: 6 Fascist policies enacted, or Hitler elected Chancellor after 3 Fascist policies</div>
      <div class="help-tip"><strong>Executive powers:</strong> As Fascist policies pile up, the President unlocks powers — investigate a player's party, call a special election, or execute a player.</div>
    `]
  },

  garticphone: {
    title: "Sketch Chain",
    tabs: ["How to play"],
    sections: [`
      <div class="help-game-badge" style="color:#2dcaa5;background:rgba(45,202,165,0.1);border-color:rgba(45,202,165,0.25)">📞 Sketch Chain · 3–8 players</div>
      <p class="help-h">The idea</p>
      <p class="help-p">A drawing version of the telephone game. Each player starts a "book" with a written prompt. Books pass around — the next person draws the prompt, the next person describes the drawing, and so on. The reveal at the end is where the fun happens.</p>
      <p class="help-h">Round by round</p>
      <ul class="help-ul">
        <li><strong>Round 1 (Writing):</strong> Everyone writes a starting prompt — be creative!</li>
        <li><strong>Round 2 (Drawing):</strong> You receive someone else's prompt. Draw it as best you can</li>
        <li><strong>Round 3 (Writing):</strong> You receive a drawing. Type what you think it is</li>
        <li>This alternates until every book has been around the full circle</li>
      </ul>
      <p class="help-h">The reveal</p>
      <ul class="help-ul">
        <li>Each book plays back one entry at a time — everyone watches together</li>
        <li>Host clicks "Next" to step through each entry</li>
        <li>After the last entry, host moves to the next book</li>
      </ul>
      <div class="help-tip"><strong>Tip:</strong> Your drawing is completely private — nobody sees it while you're working. Submit when you're happy (or the timer runs out). Terrible drawings make for the best reveals!</div>
      <p class="help-h">Drawing tools</p>
      <ul class="help-ul">
        <li>Colour picker — choose any colour</li>
        <li>Three brush sizes — dot · circle · big</li>
        <li>Eraser — switch to white to erase</li>
        <li>Clear — wipe the whole canvas and start again</li>
      </ul>
    `]
  },

  admin: {
    title: "Admin Guide",
    tabs: ["Managing access", "Running games"],
    sections: [
      `
      <div class="help-game-badge" style="color:#f2c14e;background:rgba(242,193,78,0.1);border-color:rgba(242,193,78,0.25)">🔑 Admin · Access control</div>
      <p class="help-h">Creating a passcode for a team member</p>
      <div class="admin-step">
        <div class="admin-step-num">1</div>
        <div class="admin-step-text">
          <p class="admin-step-title">Go to the Admin page</p>
          <p class="admin-step-desc">Navigate to /admin.html — you can get there from the "Go to lobby →" link, or type it directly in the browser.</p>
        </div>
      </div>
      <div class="admin-step">
        <div class="admin-step-num">2</div>
        <div class="admin-step-text">
          <p class="admin-step-title">Fill in the form</p>
          <p class="admin-step-desc">Enter the team member's name and choose a passcode for them — something simple and memorable. Don't tick "Grant admin access" unless you want them to have admin powers.</p>
        </div>
      </div>
      <div class="admin-step">
        <div class="admin-step-num">3</div>
        <div class="admin-step-text">
          <p class="admin-step-title">Click Create passcode</p>
          <p class="admin-step-desc">The yellow banner shows the passcode one time only. Write it down — it is never stored in plain text anywhere. Send it to the team member privately (WhatsApp, email, in person).</p>
        </div>
      </div>
      <div class="help-divider"></div>
      <p class="help-h">Deactivating someone</p>
      <p class="help-p">Click <strong>Deactivate</strong> next to their name in "Existing passcodes". Takes effect immediately — their passcode stops working right away, even mid-session.</p>
      <p class="help-h">Reactivating someone</p>
      <p class="help-p">Click <strong>Reactivate</strong> next to their name. Their original passcode starts working again — you don't need to create a new one.</p>
      <div class="help-tip"><strong>Security note:</strong> The website URL is not a secret — anyone can see it. Security comes entirely from the passcode system. Never share your admin passcode.</div>
      `,
      `
      <div class="help-game-badge" style="color:#f2c14e;background:rgba(242,193,78,0.1);border-color:rgba(242,193,78,0.25)">🎮 Admin · Running a game session</div>
      <p class="help-h">Starting a session</p>
      <div class="admin-step">
        <div class="admin-step-num">1</div>
        <div class="admin-step-text">
          <p class="admin-step-title">Share the site link + passcodes</p>
          <p class="admin-step-desc">Send everyone: the site URL (rbvk1984.github.io/team-skribbl/) and their individual passcode. Do this before the session so they're ready.</p>
        </div>
      </div>
      <div class="admin-step">
        <div class="admin-step-num">2</div>
        <div class="admin-step-text">
          <p class="admin-step-title">Create the room</p>
          <p class="admin-step-desc">In the lobby, pick a game, type your name, and click Create room. You become the host and see the Start game button.</p>
        </div>
      </div>
      <div class="admin-step">
        <div class="admin-step-num">3</div>
        <div class="admin-step-text">
          <p class="admin-step-title">Share the room code</p>
          <p class="admin-step-desc">Use the green Share button — on phones this opens the native share sheet (WhatsApp, iMessage etc). On desktop it copies the code to clipboard.</p>
        </div>
      </div>
      <div class="admin-step">
        <div class="admin-step-num">4</div>
        <div class="admin-step-text">
          <p class="admin-step-title">Start when everyone's joined</p>
          <p class="admin-step-desc">Watch the player list — once everyone appears, click Start game. The game opens simultaneously on all screens.</p>
        </div>
      </div>
      <div class="help-divider"></div>
      <p class="help-h">Player count minimums</p>
      <ul class="help-ul">
        <li>Doodle Rush — 2 players minimum (fun from 4+)</li>
        <li>Agent Grid — 4 players minimum (needs 2 per team + spymasters)</li>
        <li>Odd One Out — 3 players minimum</li>
        <li>Shadow Vote — 5 players minimum</li>
        <li>Sketch Chain — 3 players minimum (best with 5–7)</li>
      </ul>
      <div class="help-tip"><strong>If Supabase is waking up:</strong> The first request after a quiet period (7+ days) can take 20–30 seconds. Just wait — subsequent requests are instant.</div>
      `
    ]
  }
};

function buildHelp(pageKey) {
  const isAdmin = localStorage.getItem("ts_role") === "admin";
  const data = CONTENT[pageKey] || CONTENT.lobby;
  const adminData = CONTENT.admin;

  // Create trigger button
  const trigger = document.createElement("button");
  trigger.className = "help-trigger";
  trigger.innerHTML = "?";
  trigger.setAttribute("aria-label", "Help & rules");

  // Create overlay
  const overlay = document.createElement("div");
  overlay.className = "help-overlay";

  // Create panel
  const panel = document.createElement("div");
  panel.className = "help-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");

  // Combine tabs
  const allTabs = [...data.tabs];
  const allSections = [...data.sections];
  if (isAdmin && pageKey !== "admin") {
    allTabs.push("Admin guide");
    allSections.push(`
      <p class="help-h">Managing access</p>
      <p class="help-p">As admin you control who can use this app. Go to <strong>/admin.html</strong> for full controls.</p>
      <ul class="help-ul">
        <li>Create a passcode for each team member</li>
        <li>Send them the site link + their passcode privately</li>
        <li>Deactivate someone instantly with one click</li>
        <li>Only you see the Start game button when you create a room</li>
      </ul>
      <p class="help-p">Tap the Admin guide tab on the admin page for the full step-by-step guide.</p>
    `);
  }
  if (pageKey === "admin") {
    allTabs.push(...adminData.tabs);
    allSections.push(...adminData.sections);
  }

  panel.innerHTML = `
    <div class="help-header">
      <span class="help-title">${pageKey === "admin" ? adminData.title : data.title}</span>
      <button class="help-close" aria-label="Close">✕</button>
    </div>
    <div class="help-tabs">
      ${allTabs.map((t, i) => `<button class="help-tab${i === 0 ? " active" : ""}${t === "Admin guide" || (pageKey === "admin" && i > 0) ? " admin-tab" : ""}" data-tab="${i}">${t}</button>`).join("")}
    </div>
    <div class="help-body">
      ${allSections.map((s, i) => `<div class="help-section${i === 0 ? " active" : ""}" data-section="${i}">${s}</div>`).join("")}
    </div>
  `;

  document.body.appendChild(trigger);
  document.body.appendChild(overlay);
  document.body.appendChild(panel);

  // Events
  function openPanel() {
    overlay.classList.add("open");
    panel.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closePanel() {
    overlay.classList.remove("open");
    panel.classList.remove("open");
    document.body.style.overflow = "";
  }

  trigger.addEventListener("click", openPanel);
  overlay.addEventListener("click", closePanel);
  panel.querySelector(".help-close").addEventListener("click", closePanel);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closePanel(); });

  panel.querySelectorAll(".help-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const idx = Number(tab.dataset.tab);
      panel.querySelectorAll(".help-tab").forEach(t => t.classList.remove("active"));
      panel.querySelectorAll(".help-section").forEach(s => s.classList.remove("active"));
      tab.classList.add("active");
      panel.querySelector(`.help-section[data-section="${idx}"]`).classList.add("active");
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page || "lobby";
  buildHelp(page);
});
