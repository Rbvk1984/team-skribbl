# Adding Spyfall

Same deal as Codenames — same Supabase project, same passcodes, same GitHub Pages site.
Nothing to duplicate.

## One-time setup

Run these five new files in the Supabase SQL editor, **in order**:

1. `supabase/10_spyfall_foundation.sql`
2. `supabase/11_spyfall_schema.sql`
3. `supabase/12_spyfall_functions.sql`
4. `supabase/13_spyfall_rls.sql`
5. `supabase/14_fix_view_room_scoping.sql`

That last one isn't Spyfall-specific — it's a small security tightening to two views from
the earlier games (see "A note on what #14 fixes" below). Run it too; it's safe and quick.

## How to play

1. From the lobby, pick "Spyfall" from the Game dropdown and create a room (needs **3+
   players** to start — it's not really a bluffing game with 1-2 people).
2. Host clicks "Start game." Everyone gets a role: one random player is the Spy (they see
   no location, just a warning that they're the spy); everyone else sees the same real
   location.
3. Players ask each other in-character questions out loud (this app doesn't manage the
   actual conversation — that part is you and your team talking, same as playing in
   person). Anyone can tap another player's name at any time to accuse them; a live vote
   count shows next to each name.
4. The spy can submit **one** location guess at any time — guess right and the spy wins
   instantly; guess wrong and the round ends in the other team's favor.
5. Alternatively, the host can click "End round & reveal" whenever the group's ready
   (e.g., after a set amount of real-world talking time) — whoever has the most accusation
   votes is compared against the actual spy to decide the winner.
6. The reveal screen shows who the spy really was and what the location was. Host can
   click "Play again" for a fresh round with a new spy and location.

## How the hidden information works

Same principle as the other two games, applied to a new wrinkle — see the comments in
`supabase/12_spyfall_functions.sql` and `13_spyfall_rls.sql` for the full reasoning, but
briefly:

- The location and the spy's identity both live in one row per room
  (`spyfall_games`), and neither column is ever selected directly by any player.
  `spyfall_my_role()` is a function that returns only what YOU should know about YOUR OWN
  role — never anyone else's.
- Unlike Skribbl's rounds or Codenames' cards, Spyfall's live-updating "is a round
  running, how much time is left" info couldn't safely use a masking view over Realtime's
  Postgres Changes feature — Realtime always sends the whole row to subscribers, so
  watching `spyfall_games` directly would either be blocked completely (safe, useless) or
  leak the spy's identity the instant a round starts (unsafe). Instead, whoever changes
  the round (host starting/ending it, or the spy guessing) sends a content-free "something
  changed" signal over Realtime Broadcast, and every client just re-fetches its own safe
  view of the state in response. Nothing secret ever travels over that channel — the
  channel just says "go check," not "here's what changed."

## A note on what #14 fixes

While building this, a small gap surfaced in the two earlier games' "masking views"
(`rounds_public` for Skribbl, `codenames_cards_public` for Codenames): they correctly hid
the secret column from anyone who shouldn't see it, but didn't check that the viewer was
actually in that room at all. In practice, this meant the truly secret data (the word, the
color) never leaked — but a signed-in user could look up non-secret board metadata (words,
round status) for a room they aren't even playing in, just by knowing its room ID.
`14_fix_view_room_scoping.sql` closes that by adding the same room-membership check
`spyfall_games_public` uses from the start.
