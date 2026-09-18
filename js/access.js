import { supabase, ensureAnonymousSession } from "./supabaseClient.js";

const form = document.getElementById("access-form");
const input = document.getElementById("passcode-input");
const errorEl = document.getElementById("access-error");
const submitBtn = document.getElementById("access-submit");

// If this browser already redeemed a code before, skip straight through.
(async function checkExistingAccess() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;

  const { data: rows, error } = await supabase
    .from("player_access")
    .select("access_code_id")
    .eq("user_id", data.session.user.id)
    .maybeSingle();

  if (!error && rows) {
    // We can't read is_admin directly (RLS blocks access_codes), so we
    // just try the redeem check again with a cheap call — or simplest,
    // route to lobby and let lobby/admin links be shown based on a
    // stored flag from the original redemption.
    const cachedRole = localStorage.getItem("ts_role");
    goToApp(cachedRole);
  }
})();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  submitBtn.disabled = true;
  submitBtn.textContent = "Checking...";

  try {
    await ensureAnonymousSession();

    const code = input.value.trim();
    const { data, error } = await supabase.rpc("redeem_access_code", { p_code: code });

    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;

    if (!result || !result.success) {
      errorEl.textContent = "That passcode isn't valid or has been deactivated. Check with your admin.";
      submitBtn.disabled = false;
      submitBtn.textContent = "Enter";
      return;
    }

    localStorage.setItem("ts_role", result.is_admin ? "admin" : "player");
    localStorage.setItem("ts_label", result.label || "");
    goToApp(result.is_admin ? "admin" : "player");
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Something went wrong. Please try again.";
    submitBtn.disabled = false;
    submitBtn.textContent = "Enter";
  }
});

function goToApp(role) {
  window.location.href = role === "admin" ? "admin.html" : "lobby.html";
}
