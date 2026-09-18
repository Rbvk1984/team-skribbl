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

  channel.subscribe();

  return {
    channel,
    broadcastStroke(stroke) {
      channel.send({ type: "broadcast", event: "stroke", payload: stroke });
    },
    disconnect() {
      supabase.removeChannel(channel);
    },
  };
}
