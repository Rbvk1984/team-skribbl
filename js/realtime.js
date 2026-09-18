import { supabase } from "./supabaseClient.js";

// One Realtime channel per room handles BOTH concerns, kept clearly
// separate per ARCHITECTURE.md:
//   - "broadcast" events for high-frequency, ephemeral drawing strokes
//     (never written to Postgres)
//   - "postgres_changes" listeners for durable state (players, rounds,
//     guesses) so the UI updates live without polling or refresh

export function connectRoomChannel(roomId, handlers = {}) {
  const channel = supabase.channel(`room:${roomId}`, {
    config: { broadcast: { self: false } },
  });

  if (handlers.onStroke) {
    channel.on("broadcast", { event: "stroke" }, (payload) => {
      handlers.onStroke(payload.payload);
    });
  }

  if (handlers.onPlayersChange) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` },
      handlers.onPlayersChange
    );
  }

  if (handlers.onRoomChange) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
      handlers.onRoomChange
    );
  }

  if (handlers.onRoundChange) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rounds", filter: `room_id=eq.${roomId}` },
      handlers.onRoundChange
    );
  }

  if (handlers.onGuess) {
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "guesses" },
      handlers.onGuess
    );
  }

  // Codenames: team/role assignments and turn state are never secret,
  // so (unlike codenames_cards, which holds the hidden colors) these
  // are safe to subscribe to directly.
  if (handlers.onCodenamesPlayersChange) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "codenames_players", filter: `room_id=eq.${roomId}` },
      handlers.onCodenamesPlayersChange
    );
  }

  if (handlers.onGamesChange) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "codenames_games", filter: `room_id=eq.${roomId}` },
      handlers.onGamesChange
    );
  }

  // Spyfall: round start/end touches spyfall_games, which holds the
  // secret spy identity and location. Realtime's "Postgres Changes"
  // always sends the FULL row to subscribers, so watching that table
  // directly would either be blocked entirely by RLS (safe but
  // useless) or leak the secret the instant it changed (unsafe) —
  // there's no way to get it to send only the safe columns. Instead,
  // whoever triggers a round change (host starting/ending it, or the
  // spy guessing) sends a content-free "something changed" broadcast,
  // and every client reacts by re-fetching through the safe
  // spyfall_games_public view / spyfall_my_role() function themselves.
  if (handlers.onSpyfallSignal) {
    channel.on("broadcast", { event: "spyfall_signal" }, handlers.onSpyfallSignal);
  }

  // Suspicion votes have nothing secret in them, so a normal
  // Postgres Changes subscription is fine here.
  if (handlers.onSpyfallVotesChange) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "spyfall_votes", filter: `room_id=eq.${roomId}` },
      handlers.onSpyfallVotesChange
    );
  }

  // Secret Hitler: sh_rounds is non-secret (public game log).
  // sh_games uses the same broadcast-signal pattern as Spyfall
  // since it holds secret deck/hand data that Realtime would leak.
  if (handlers.onRoundsChange) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "sh_rounds", filter: `room_id=eq.${roomId}` },
      handlers.onRoundsChange
    );
  }

  if (handlers.onSHGameChange) {
    channel.on("broadcast", { event: "sh_game_signal" }, handlers.onSHGameChange);
  }

  // Gartic Phone: gp_games holds no secrets (just round number,
  // status, submission count) so a normal Postgres Changes
  // subscription is safe here — no broadcast workaround needed.
  if (handlers.onGPGameChange) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "gp_games", filter: `room_id=eq.${roomId}` },
      handlers.onGPGameChange
    );
  }

  channel.subscribe();

  return {
    channel,
    broadcastStroke(stroke) {
      channel.send({ type: "broadcast", event: "stroke", payload: stroke });
    },
    broadcastSpyfallSignal() {
      channel.send({ type: "broadcast", event: "spyfall_signal", payload: {} });
    },
    broadcastSHSignal() {
      channel.send({ type: "broadcast", event: "sh_game_signal", payload: {} });
    },
    disconnect() {
      supabase.removeChannel(channel);
    },
  };
}
