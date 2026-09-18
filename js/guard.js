import { supabase } from "./supabaseClient.js";

// This is a UX convenience, NOT the real security boundary. Even if
// someone bypassed this check with dev tools, every gameplay table is
// still protected by RLS policies that require an active access_code
// linked to their auth.uid(). This just avoids showing them a broken
// page before the database says no.
export async function requireAccess({ adminOnly = false } = {}) {
  const { data: sessionData } = await supabase.auth.getSession();

  if (!sessionData.session) {
    window.location.href = "access.html";
    return null;
  }

  const { data: rows, error } = await supabase
    .from("player_access")
    .select("access_code_id")
    .eq("user_id", sessionData.session.user.id)
    .maybeSingle();

  if (error || !rows) {
    window.location.href = "access.html";
    return null;
  }

  const role = localStorage.getItem("ts_role");
  if (adminOnly && role !== "admin") {
    window.location.href = "lobby.html";
    return null;
  }

  return sessionData.session;
}
