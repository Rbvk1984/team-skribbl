# Team Skribbl

A private drawing-and-guessing game for your team. Nobody can join just by having the
link — you control who gets in with passcodes you hand out yourself.

Everything here runs on free services (GitHub Pages + Supabase's free tier). See
`ARCHITECTURE.md` if you want the full technical explanation of every decision.

---

## One-time setup (about 15 minutes)

### Step 1 — Create your Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free account.
2. Create a new project. Pick any name/password (save the database password somewhere
   safe, though you won't need it day-to-day).
3. Wait for the project to finish provisioning (a minute or two).

### Step 2 — Set up the database

1. In your Supabase project, open the **SQL Editor** (left sidebar).
2. Open `supabase/01_schema.sql` from this repo, copy its entire contents, paste into the
   SQL editor, and click **Run**.
3. Do the same, in order, for:
   - `supabase/02_functions.sql`
   - `supabase/03_rls_policies.sql`
   - `supabase/04_seed_words.sql`
4. Open `supabase/05_bootstrap_admin.sql`. Before running it, replace
   `CHANGE-ME-TO-YOUR-OWN-SECRET-PHRASE` with a passcode only you will know. Then run it.
   This is **your own admin passcode** — write it down somewhere safe before you close the
   tab.

### Step 3 — Connect the app to your project

1. In Supabase, go to **Settings → API**.
2. Copy the **Project URL** and the **`anon` `public`** key (NOT the `service_role` key —
   never use that one here).
3. Open `js/config.js` in this repo and paste them in:
   ```js
   export const SUPABASE_URL = "https://your-project-ref.supabase.co";
   export const SUPABASE_ANON_KEY = "your-anon-key-here";
   ```

### Step 4 — Enable Anonymous sign-in

1. In Supabase, go to **Authentication → Providers**.
2. Find **Anonymous** and turn it on.
   (This just lets each visitor's browser get a private ID — it does not let anyone in
   without a passcode; that's still enforced separately.)

### Step 5 — Put it on GitHub Pages

1. Create a new GitHub repository and push everything in this folder to it.
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment," set **Source** to "Deploy from a branch," choose your
   main branch and the `/ (root)` folder, and save.
4. GitHub will give you a URL like `https://yourusername.github.io/your-repo/`. That's
   your game's address — but remember, nobody can actually use it until they have a
   passcode from you.

### Step 6 — Try it yourself

1. Open your GitHub Pages URL.
2. Enter the admin passcode you created in Step 2.4.
3. You should land on the **Admin** page. Create a passcode for a team member (or for
   yourself again, to test as a "player").
4. Go to the lobby, create a room, share the room code, and play.

---

## Everyday use

- **Adding a team member**: go to `/admin.html`, enter their name and a passcode, and give
  them the passcode directly (Slack, in person, however you'd share any password). It's
  only ever shown to you once — Supabase never stores the plain text, only a scrambled
  (hashed) version.
- **Removing someone's access**: on the Admin page, click "Deactivate" next to their name.
  It takes effect immediately.
- **Starting a game**: anyone with a valid passcode can create a room from the lobby and
  share the room code with teammates, who join from their own lobby screen.

## If something looks broken

- **"That passcode isn't valid"** — double check you copied it exactly, and that it hasn't
  been deactivated from the Admin page.
- **The app seems slow the first time you open it after a while** — if nobody has used the
  app in about a week, Supabase's free tier "pauses" the project to save resources. The
  first request wakes it back up and takes 10–30 seconds; everything works normally after
  that. See `ARCHITECTURE.md` §8 if you want to avoid this with a free automated
  keep-alive ping.
- **A round seems stuck** — refreshing the page is safe; the app re-loads the current
  round's state from the database.

## What's intentionally NOT included yet

Per the plan, this first version is just the drawing game plus the reusable
room/player/passcode system underneath it. Other games (Codenames, Spyfall, Secret
Hitler-style, etc.) can be added later on top of the same foundation without rebuilding
login or room handling.
