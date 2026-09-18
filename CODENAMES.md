# Adding Codenames

Codenames reuses everything from the original setup — same Supabase project, same
passcodes, same `rooms`/`players` tables. You do NOT need a second Supabase project or a
second GitHub Pages site.

## One-time setup

In the Supabase SQL editor, run these four new files, **in order**, the same way you ran
the original ones (copy the whole file, paste, Run, wait for success before the next):

1. `supabase/06_multi_game_foundation.sql`
2. `supabase/07_codenames_schema.sql`
3. `supabase/08_codenames_functions.sql`
4. `supabase/09_codenames_rls.sql`

Nothing else needs to change — your existing `js/config.js` (Supabase URL + anon key) and
your existing admin passcode all keep working exactly as before.

## If team setup or the board doesn't update live for other players

Supabase usually turns Realtime on for new tables automatically. If it doesn't for you:
Supabase dashboard → **Database → Replication**, and make sure `codenames_players` and
`codenames_games` are toggled on. (`codenames_cards` is deliberately **not** included here
— see "Why the board doesn't use Realtime the same way" below.)

## How it works (for the curious)

- **Same room/player/passcode plumbing.** A room now has a `game_type` column
  (`skribbl` or `codenames`), chosen when it's created in the lobby. Everything about
  logging in, creating a room, and the player list is identical to Skribbl.
- **Team & role selection** (`codenames_players`) is plain, non-secret data — anyone can
  read who's on which team. A database rule guarantees at most one spymaster per team
  (`create unique index ... where role = 'spymaster'`), so you can't accidentally end up
  with two.
- **The hidden part** is only the card colors, not the words. Every player always sees
  all 25 words; `codenames_cards_public` (a view, same pattern as Skribbl's hidden-word
  view) only fills in the `color` column for cards that are revealed, or for whoever is
  a spymaster. The frontend only ever reads through this view, never the raw table.
- **The rules are enforced server-side.** `codenames_reveal_card()` is a
  `SECURITY DEFINER` Postgres function — it's the only way a card ever gets revealed, and
  it's what actually decides whose turn it is next, whether a team just won, or whether
  someone just handed the other team the game by revealing their last card by mistake.
  A player calling it directly can't cheat by, say, revealing a card out of turn or as
  the wrong role — the function checks all of that itself.

### Why the board doesn't use Realtime the same way

Skribbl's drawing strokes and Codenames' card colors are both "shouldn't be visible to
everyone" data, but they need different treatment:

- Drawing strokes aren't secret once drawn — everyone's *supposed* to see them live. They
  use Realtime **Broadcast**, which is just fast pub/sub with nothing persisted.
- Card colors ARE secret until revealed. Supabase Realtime's other feature, "Postgres
  Changes," sends the *entire changed row* to every subscriber whose RLS policy allows
  them to see that row — there's no way to redact just the `color` column from that
  payload. So subscribing directly to `codenames_cards` would either block everyone (if
  we keep RLS strict, which we do) or leak every color the instant a card is inserted (if
  we loosened RLS to make the subscription work).

The fix: `codenames_games` (whose turn it is, the clue, the winner) has nothing secret in
it, so it's safe to subscribe to directly — and because almost every card reveal also
updates that table, the frontend just listens for *that* change and re-fetches the board
through the safe `codenames_cards_public` view each time. Simpler than it sounds, and it
avoids ever sending secret data down a channel that can't filter it.
