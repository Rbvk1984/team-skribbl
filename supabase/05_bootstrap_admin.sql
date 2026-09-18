-- =========================================================
-- Team Skribbl — Bootstrap the Main Admin
--
-- Run this ONCE, manually, in the Supabase SQL editor, after
-- running 01_schema.sql, 02_functions.sql and 03_rls_policies.sql.
--
-- Every other admin/player code is created later through the
-- Admin page in the app (which calls admin_create_access_code()).
-- But that function requires you to already BE an admin, so the
-- very first one has to be inserted directly here.
--
-- Replace 'CHANGE-ME-TO-YOUR-OWN-SECRET-PHRASE' below with your
-- own passcode before running this, then delete/forget the
-- plaintext — only you should know it.
-- =========================================================

insert into access_codes (label, code_hash, is_admin, active)
values (
  'Main Admin',
  encode(digest('CHANGE-ME-TO-YOUR-OWN-SECRET-PHRASE', 'sha256'), 'hex'),
  true,
  true
);

-- After running this, open index.html, enter the passcode you chose
-- above, and you'll land on the Admin page where you can create
-- passcodes for everyone else on the team.
