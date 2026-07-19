# Deploying Bypass

Bypass has three parts that all live under `bypass/`:

- `supabase/schema.sql` - the database schema
- `portal/` - a Next.js web app where you log in and manage clips
- `extension/` - a Chrome MV3 extension that logs in with the same
  username/password and performs the typing/scrolling

This doc covers why the login only asks for a username and password, and
the concrete steps to deploy each piece.

## Why a username, when Supabase needs an email?

Supabase Auth is built around email/password (or phone/password, or OAuth)
- there is no first-class "username" login. To give you a plain
username-and-password experience anyway, the app hides an email from you
behind the scenes:

1. When you sign up with a username (e.g. `alice`), the app deterministically
   builds a fake internal address, `alice@bypass.local`, and calls Supabase's
   normal email/password sign-up with that address and your password.
2. Your chosen username is also written to a `profiles` table
   (`user_id`, `username`) so the app can show "Signed in as alice"
   instead of the fake address anywhere it displays your identity.
3. When you log in, the app re-derives `alice@bypass.local` from the
   username you typed and calls the normal email/password sign-in. You
   never see or type an email anywhere.

This is implemented identically in both apps:

- [bypass/portal/src/lib/username.ts](bypass/portal/src/lib/username.ts)
- [bypass/extension/src/lib/username.ts](bypass/extension/src/lib/username.ts)

Because the derivation is deterministic (`username.toLowerCase()` +
`@bypass.local`), Supabase's own uniqueness constraint on `auth.users.email`
doubles as username-uniqueness enforcement - two people can't sign up with
the same username because that would mean signing up with the same fake
email twice, which Supabase already rejects. There's also a defensive
unique index on `profiles.username` in the schema.

One consequence: since `alice@bypass.local` isn't a real mailbox, **you must
disable Supabase's "Confirm email" setting** (see step 3 below), otherwise
new accounts get stuck waiting on a confirmation email that can never
arrive.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Go to **Project Settings → Data API** to find your **Project URL**
   (`https://xxxx.supabase.co`) - it's shown there regardless of which key
   system you're using.
3. Go to **Project Settings → API Keys**. Newer Supabase projects show
   **Publishable key** / **Secret key** instead of the older `anon` /
   `service_role` names. Here's how they map to what this app needs:

   | Supabase gives you | What it replaces | Used where |
   | --- | --- | --- |
   | **Publishable key** (`sb_publishable_...`) | the old `anon` key | Both `NEXT_PUBLIC_SUPABASE_ANON_KEY` (portal) and `VITE_SUPABASE_ANON_KEY` (extension) - drop it straight into that env var, no code changes needed. |
   | **Secret key** (`sb_secret_...`) | the old `service_role` key | **Not used anywhere in this app.** It has elevated access that bypasses Row Level Security - never put it in the portal or the extension, which only ever act as the logged-in user. |
   | **Database password** | - | Only needed for a direct Postgres connection (`psql`, migration CLIs, `supabase db push`). Not needed here since you'll run `schema.sql` through the Dashboard's SQL editor in the browser. |

   So: copy the **Project URL** and the **Publishable key** only. Ignore
   the secret key and DB password for this project.
4. Open the SQL editor and run the entire contents of
   [bypass/supabase/schema.sql](bypass/supabase/schema.sql). This creates:
   - `profiles` (username -> user mapping)
   - `clips` (your saved text snippets + typing settings)
   - `run_requests` (the run/pause/resume/stop queue the extension polls)
   - `user_settings` (the idle-bypass scroll toggle + tuning)
   - Row Level Security policies so every table is scoped to
     `auth.uid() = user_id`
   - A trigger that auto-creates a `user_settings` row when a new
     `auth.users` row is inserted

## 2. Turn off CAPTCHA / leaked-password checks that assume real email (optional but recommended)

Authentication → Sign In / Providers, in your Supabase dashboard:

- Leave "Email" provider **enabled** (this is what the app uses under the
  hood).
- If you enabled hCaptcha/Turnstile for auth, that's fine - it doesn't
  depend on the email being real.

## 3. Disable "Confirm email"

This is the one setting you must change, since `@bypass.local` addresses
can't receive mail:

Supabase dashboard → **Authentication** → **Sign In / Providers** →
**Email** → turn **off** "Confirm email" (in older dashboard versions this
is called "Enable email confirmations"). Save.

With this off, `supabase.auth.signUp()` returns an active session
immediately, and the portal's sign-up page redirects straight into `/clips`.

## 4. Deploy the portal

### Option A: Vercel (recommended)

1. Push this repo (or just the `bypass/` folder) to GitHub.
2. In Vercel, "Add New Project", pick the repo, and set the **Root
   Directory** to `bypass/portal`.
3. Add environment variables (Project Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase **Publishable key**
     (`sb_publishable_...`, or the legacy `anon` key if that's what your
     project shows)
4. Deploy. Vercel auto-detects Next.js; no extra build config is needed.

### Option B: Run it yourself (any Node host)

```bash
cd bypass/portal
cp .env.local.example .env.local   # fill in the two Supabase values
npm install
npm run build
npm run start                      # serves on port 3000 by default
```

Put this behind your own reverse proxy/TLS if exposing it beyond
localhost.

### Local development

```bash
cd bypass/portal
cp .env.local.example .env.local   # fill in the two Supabase values
npm install
npm run dev                        # http://localhost:3000
```

## 5. Build and load the Chrome extension

The extension is a normal Vite build that outputs a `dist/` folder you load
as an unpacked extension (or zip up for private distribution).

```bash
cd bypass/extension
cp .env.example .env               # same Supabase URL + anon key as the portal
npm install
npm run build                      # outputs bypass/extension/dist
```

Then in Chrome:

1. Go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select `bypass/extension/dist`.
4. Pin the "Bypass" icon, open the popup, and log in with the same
   username/password you used to sign up in the portal.

### Notes on distributing the extension further

- **Personal use / a small team**: zip `dist/` and share it, everyone loads
  it unpacked, or you distribute it via an internal `.crx` + Chrome
  Enterprise policy.
- **Chrome Web Store**: you can publish it "Unlisted" so only people with
  the link can install it. Be aware the manifest requests
  `host_permissions: ["<all_urls>"]` (required so the background worker can
  inject the typing/scroll script into whatever tab is active when a poll
  fires, since there's no fresh user gesture on that tab at that moment).
  Broad host permissions get extra scrutiny in Chrome Web Store review -
  expect to explain this justification if you publish it that way.
- Every time you change `.env`, rerun `npm run build` and click the reload
  icon for the extension on `chrome://extensions`.

## 6. Verify end-to-end

1. Sign up in the portal (`/signup`) with a username + password.
2. Log into the extension popup with the same credentials.
3. In the portal, create a clip with some text, a WPM range, and mistakes
   on/off.
4. On any normal webpage, click into a text input or textarea.
5. Back in the portal, click **Run** on the clip. Within a few seconds the
   extension's poll picks it up and starts typing into that focused field.
6. Try **Pause**/**Resume** (primary button on the card) and **Stop**
   (in the card's `⋮` menu, with a confirm step) while it's running.
7. In **Settings**, enable idle-bypass scrolling, and confirm the active
   tab starts randomly scrolling up/down and pausing once no clip is
   running - and stops immediately if you Run a clip.

## Environment variable summary

| App | File | Variables |
| --- | --- | --- |
| Portal | `bypass/portal/.env.local` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Extension | `bypass/extension/.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

For both `*_ANON_KEY` variables, use the **Publishable key** (or legacy
`anon` key) from Project Settings → API Keys - never the Secret key. Both
must point at the **same** Supabase project so the portal and extension
share accounts, clips, and run state.

## Known limitations

- The extension can't type into cross-origin `<iframe>`s on a page - this
  is a browser security restriction, not something the extension can work
  around. It types into the top-level document's currently focused element.
- Chrome throttles/clamps `chrome.alarms` to a 30-second minimum period;
  the alarm is only a backstop to wake a killed service worker, and the
  real polling loop (`setInterval`, ~5s idle / ~1s while a run is
  active/paused) does the actual work while the worker is alive.
- If you close every window/tab so no "active tab" exists, a `pending` run
  request just stays pending until a tab is focused again.
