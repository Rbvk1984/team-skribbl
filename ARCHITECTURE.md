# Team Skribbl — Architecture

An internal drawing-and-guessing game for one small team, built to run entirely on
free-tier infrastructure: **GitHub Pages** (static hosting) + **Supabase** (database,
auth, realtime).

This is an original implementation — its own UI, branding, word lists, and scoring
rules. It is not, and does not contain, any of Skribbl.io's proprietary code, art, or
branding.

---

## 1. High-level architecture

```
Browser
  │
  ├── GitHub Pages ── serves static HTML/CSS/JS (no server to run or pay for)
  │
  └── Supabase
        ├── PostgreSQL          (rooms, players, rounds, guesses, words, access codes)
        ├── Auth                (anonymous sign-in — every browser gets an identity)
        ├── Row Level Security  (the actual security boundary — see §5)
        └── Realtime
              ├── Broadcast          → high-frequency drawing strokes (never stored)
              └── Postgres Changes   → durable state (players joining, round changes, guesses)
```

Two clearly separate data flows, per the "don't store every mouse movement" requirement:

```
Ephemeral (drawing strokes, timer ticks):
  Browser → Supabase Realtime Broadcast → other browsers        (never touches Postgres)

Durable (rooms, players, rounds, scores, guesses):
  Browser → Supabase Postgres (via RLS-protected queries/RPCs) → Realtime "Postgres Changes" → other browsers
```

---

## 2. Why this stack, and what's free about it

| Decision | What | Why | Free? | What to watch |
|---|---|---|---|---|
| Hosting | GitHub Pages | Static site, no server process, no build step required | Yes, unlimited for public/reasonable use | None for this scale |
| Backend | Supabase (single project) | Gives Postgres + Auth + Realtime + RLS in one free product, no separate services to wire together | Yes, free tier | Free projects **pause after 7 days with no API traffic** — see §8 |
| Auth | Supabase Anonymous Sign-in | We don't need real email/password accounts, just a stable per-browser identity to attach a passcode to | Yes, included | None known |
| Realtime sync | Supabase Realtime (Broadcast + Postgres Changes) | Free tier allows 200 concurrent connections / 2M messages a month — enormously more than a small team needs | Yes | Only matters if usage grows far beyond "internal team" scale |
| Access control | Passcodes + RLS (see §5), no Edge Functions | A `SECURITY DEFINER` Postgres function can safely hash-check a passcode and gate access without needing a separate Edge Function deployment | Yes | — |
| Drawing sync | Realtime **Broadcast**, not database writes | Broadcast messages are ephemeral (not persisted), so a fast drawer doesn't burn through the 500 MB database limit or write quota | Yes | — |

**Nothing in this design requires a paid service at the stated scale** (a handful of
rooms, occasional sessions every 1–2 weeks, a small team). If any future feature would
require something paid, that will be called out explicitly before it's added — per your
requirement, we don't silently introduce anything that can generate charges.

## 3. Why not Edge Functions

Edge Functions are Supabase's way to run server-side code with real secrets (e.g. calling
a paid third-party API with a private key). This app doesn't call any external paid
service, so there's no secret that needs an Edge Function's isolation.

Instead, sensitive logic (passcode checking, hidden-word checking, scoring) lives in
plain Postgres functions marked `SECURITY DEFINER`. These run with elevated database
privilege *inside* Postgres, which is enough to:
- hash-compare a passcode without ever returning the hash to the browser,
- check a round's secret word against a guess without ever sending the word to a
  non-drawer's browser,
- update scores atomically so a client can't just `UPDATE players SET score = 999999`.

This keeps the whole backend inside "one Supabase project, no extra services to deploy or
monitor," which matches the "avoid unnecessary infrastructure" requirement. If a future
game genuinely needs an external paid API, that's the point where an Edge Function (and
a cost conversation) would come back into play.

## 4. Admin-controlled access (nobody gets in just by knowing the URL)

The GitHub Pages URL is not a secret — anyone could find it. So visiting it must not, by
itself, grant any access. The flow:

1. Browser loads `index.html` and calls `supabase.auth.signInAnonymously()`. This creates
   an identity (`auth.uid()`) but **grants zero access to any gameplay data** — it's just
   a name tag, not a key.
2. The person enters a passcode you gave them. The frontend calls the `redeem_access_code`
   Postgres function.
3. That function hashes the entered passcode and checks it against `access_codes.code_hash`.
   If it matches an **active** code, it links `auth.uid()` to that code in `player_access`.
4. From then on, every Row Level Security policy on every gameplay table checks: *"does
   this `auth.uid()` have a row in `player_access` pointing at a still-active access
   code?"* (via the `has_active_access()` helper). If you deactivate a code from the Admin
   page, that check starts failing **immediately** — no cache, no delay — for everyone who
   redeemed it.

The Main Admin's own passcode is created once, directly in SQL
(`05_bootstrap_admin.sql`), because the normal "create a passcode" feature requires you to
already be an admin. Every other passcode (team members or additional admins) is created
afterward from the in-app Admin page.

**Nothing about this depends on hiding JavaScript.** A technically savvy person could read
every line of the frontend code and still could not grant themselves access — the checks
happen in the database, enforced by RLS, not by the browser choosing to be polite.

## 5. Row Level Security — the real security boundary

RLS policies are defined in `supabase/03_rls_policies.sql`. Summary of the rules:

- **`access_codes`**: no direct access for anyone. All reads/writes go through
  `SECURITY DEFINER` functions (`admin_create_access_code`, `admin_set_code_active`,
  `admin_list_access_codes`) which themselves check `is_admin_user()` first.
- **`player_access`**: a user can read only their own row. Writes only happen via
  `redeem_access_code()`.
- **`rooms` / `players`**: readable/writable only by users with `has_active_access()`,
  scoped to rooms they're actually in.
- **`rounds`**: this is where the hidden-word requirement lives (see §6).
- **`guesses`**: readable by room members; insertable only via `submit_guess()`, which
  checks the guess server-side rather than trusting the client to self-report "I got it
  right."
- **`words`**: no direct access; the word list itself isn't secret, but there's no reason
  to expose it wholesale either — the drawer only ever sees 3 random choices via
  `get_word_choices()`.

## 6. Hidden word — how it's actually kept secret

Requirement: everyone except the drawer must be unable to read the secret word before the
round ends.

- `rounds.selected_word` starts `NULL` and is set by the drawer's own browser (allowed
  because RLS lets a player update a round **only if they are its `drawer_player_id`**).
- The `SELECT` policy on `rounds` only returns a row's real content if the requester is
  that round's drawer, **or** the round's `status = 'ended'`. Everyone else's query for
  that round is filtered out at the row level.
- As a belt-and-suspenders safety net (row-level filtering is coarse; a stray future query
  that selects `rounds.*` for a spectator mid-round should still not leak the word), there
  is also a `rounds_public` view that explicitly nulls out `selected_word` unless the
  viewer is the drawer or the round has ended. The frontend uses this pattern deliberately.
- Guess checking (`submit_guess`) happens **inside** the database via a
  `SECURITY DEFINER` function — the word is compared server-side, and only the result
  (`correct: true/false`, `points_awarded`) is returned to the browser. The secret word
  itself is never sent to a guesser's browser until the round ends.

## 7. Realtime design

- **Drawing strokes**: sent via `supabase.channel(...).send({ type: "broadcast", ... })`.
  These are ephemeral pub/sub messages — they reach other browsers in the same room in
  real time but are **never written to Postgres**. This is what keeps database writes low
  even with a fast drawer generating hundreds of stroke segments a minute.
- **Timer**: the database stores one authoritative `ends_at` timestamp per round. Every
  client computes its own countdown display from that same timestamp (`js/timer.js`),
  rather than trusting a locally-started `setInterval` to stay in sync with everyone
  else's.
- **Player list / round state / scores**: these use Supabase Realtime's "Postgres
  Changes" feature — the frontend subscribes to `INSERT/UPDATE` events on `players`,
  `rooms`, `rounds`, and `guesses` for the current room, so the UI updates live without
  polling or manual refresh.

## 8. Free-tier limits that actually matter here

- **Database size**: 500 MB. This app's tables are tiny (short-lived rounds/guesses for a
  small team) — this will not be a practical concern.
- **Realtime connections**: 200 concurrent, 2M messages/month on the free tier — far more
  than a small internal team playing occasionally will use.
- **Project auto-pause**: free Supabase projects pause after **7 days with no API
  requests**. Since this team plays roughly every 1–2 weeks, the project could pause
  between sessions. Two options, both free:
  1. Just expect it: the first request after a pause takes ~10–30 seconds to "wake up" the
     database, then everything works normally. Fine for a casual internal tool.
  2. Add a free scheduled "keep-alive" ping using **GitHub Actions** (a `.yml` workflow
     that runs on a schedule and makes one lightweight request to your Supabase project
     every few days). Not included by default in this repo to avoid unnecessary
     infrastructure per your instructions — add it later if the pause becomes annoying.
- **No paid APIs are used anywhere in this app.**

## 9. Environment variables / secrets

| Value | Where it lives | Secret? |
|---|---|---|
| `SUPABASE_URL` | `js/config.js`, committed to the repo | No — this is just your project's address |
| `SUPABASE_ANON_KEY` | `js/config.js`, committed to the repo | No — this key is *meant* to be public; RLS is what protects your data |
| `service_role` key | **Nowhere in this repo.** Not needed by this app at all. | **Yes — never commit this anywhere** |
| Admin/team passcodes | Only in your head / however you privately share them with your team; stored in the database only as a SHA-256 hash | Yes |

## 10. Known limitations (first version, intentionally simple)

- Turn rotation is fixed round-robin by join order; no reconnect/rejoin-mid-round polish
  beyond loading the current round state.
- No reconnect grace period if the drawer's browser closes mid-round (the round will just
  run out its timer).
- No profanity filter on custom words or guesses.
- Room codes are simple `WORD-###` strings; not cryptographically unguessable, but access
  is already gated by the passcode system before someone ever gets to a room screen.
- One drawing game only. Additional games (Codenames, Spyfall, Secret Hitler, etc.) are
  intentionally deferred — they can reuse the same rooms/players/passcode foundation.

## 11. Future expansion

The `rooms` / `players` / passcode-gated-access foundation is deliberately game-agnostic.
A future game just needs its own tables (e.g. `codenames_boards`, `spyfall_roles`) plus
its own RLS policies — the login, room, and player-list plumbing doesn't need to be
rebuilt.
