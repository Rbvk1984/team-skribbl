import { supabase } from "./supabaseClient.js";
import { requireAccess } from "./guard.js";

const session = await requireAccess({ adminOnly: true });
if (!session) throw new Error("no access");

const form = document.getElementById("create-code-form");
const labelInput = document.getElementById("code-label");
const codeInput = document.getElementById("code-value");
const adminCheckbox = document.getElementById("code-is-admin");
const list = document.getElementById("code-list");
const newCodeBanner = document.getElementById("new-code-banner");

await refreshList();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const label = labelInput.value.trim();
  const code = codeInput.value.trim();
  if (!label || !code) return;

  const { error } = await supabase.rpc("admin_create_access_code", {
    p_label: label,
    p_code: code,
    p_is_admin: adminCheckbox.checked,
  });

  if (error) {
    alert(error.message);
    return;
  }

  newCodeBanner.textContent = `Created. Share this passcode with ${label} yourself — it is not stored anywhere in plain text, so write it down now: "${code}"`;
  newCodeBanner.classList.remove("hidden");

  form.reset();
  await refreshList();
});

async function refreshList() {
  const { data, error } = await supabase.rpc("admin_list_access_codes");
  if (error) {
    console.error(error);
    return;
  }

  list.innerHTML = "";
  (data || []).forEach((row) => {
    const li = document.createElement("li");
    li.className = row.active ? "code-row" : "code-row code-row-inactive";

    const info = document.createElement("span");
    info.textContent = `${row.label}${row.is_admin ? " (admin)" : ""} — ${row.active ? "active" : "deactivated"}${row.redeemed ? "" : " — not yet used"}`;

    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = row.active ? "Deactivate" : "Reactivate";
    toggleBtn.addEventListener("click", async () => {
      await supabase.rpc("admin_set_code_active", { p_access_code_id: row.id, p_active: !row.active });
      await refreshList();
    });

    li.appendChild(info);
    li.appendChild(toggleBtn);
    list.appendChild(li);
  });
}
