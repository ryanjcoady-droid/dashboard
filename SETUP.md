# Dashboard PWA: Setup Guide

This package turns your existing dashboard into a Progressive Web App (PWA) that installs on Android like a native app and syncs data between your phone and laptop in real time via Firebase Firestore.

## What's in this folder

| File | Purpose |
|------|---------|
| `dashboard.html`, `daily-dashboard.html`, `market-dashboard.html` | Your existing dashboards, with a few small additions |
| `manifest.webmanifest` | PWA manifest (makes the app installable) |
| `service-worker.js` | Caches the app shell so it works offline |
| `sync.js` | Mirrors `localStorage` to Firestore in real time |
| `firebase-config.js` | Holds your Firebase project config. **You edit this.** |
| `icons/` | App icons for Android and iOS |

Setup is three stages. Allow about 15 minutes the first time.

---

## Stage 1: Create a free Firebase project (about 5 min)

Firebase's free Spark tier easily covers a personal dashboard. You will not be charged.

1. Go to <https://console.firebase.google.com> and sign in with your Google account.
2. Click **Add project**. Name it whatever you like (e.g. "ryan-dashboard"). Disable Google Analytics when prompted (not needed for this).
3. Once the project is created, click the **web icon** (`</>`) on the project home page to "Add app". Give it a nickname, skip Firebase Hosting for now, and click **Register app**.
4. Firebase shows you a config object that looks like:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcd1234"
   };
   ```
   Copy these values.
5. Open `firebase-config.js` in this folder and replace the `REPLACE_ME` placeholders with your values. Save.
6. In the Firebase Console sidebar, go to **Build > Firestore Database**, click **Create database**, choose a region close to you (e.g. `australia-southeast1` for Melbourne), and select **Start in production mode** (more secure default).
7. Once the database exists, go to its **Rules** tab and paste this:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /dashboards/{userId} {
         allow read, write: if true;
       }
     }
   }
   ```
   Click **Publish**.

   **Note on security:** This rule allows anyone who knows your sync code (a 30+ character random ID) to read or write your data. The code is your shared secret. For a personal dashboard this is acceptable. If you want stronger security later, see "Hardening" at the bottom of this file.

---

## Stage 2: Host the files online (about 5 min)

PWAs require HTTPS. The simplest free option is GitHub Pages.

### Option A: GitHub Pages (recommended)

1. Create a new GitHub repo (private or public, your choice). Name it something like `dashboard`.
2. Upload all the files from this folder to the repo. You can do this via:
   - The GitHub web UI: drag and drop the files into the repo page.
   - Or `git clone`, copy files in, `git add . && git commit -m "init" && git push`.
3. In the repo, go to **Settings > Pages**.
4. Under "Branch", select `main` (or `master`) and `/ (root)`. Save.
5. Wait about a minute. Your dashboard will be live at `https://<your-username>.github.io/<repo-name>/dashboard.html`.

### Option B: Netlify drop

1. Go to <https://app.netlify.com/drop>.
2. Drag the entire folder onto the page.
3. You get a URL like `https://<random-words>.netlify.app/dashboard.html`. Done.

### Option C: Cloudflare Pages

Similar workflow to Netlify. Free, fast.

Open the URL in a desktop browser to test. If sync is configured correctly, the **sync icon** in the top-left of the dashboard turns green.

---

## Stage 3: Install on your Android phone (about 1 min)

1. Open the dashboard URL in **Chrome** on your Android phone.
2. Tap the **three-dot menu** in the top-right.
3. Tap **Install app** (or **Add to Home screen** on older Android versions).
4. Confirm. The Dashboard icon now sits on your home screen and launches in standalone mode (no browser chrome).

### On your laptop

The same URL works in any modern desktop browser. Chrome and Edge also let you install it as a standalone app (look for the install icon in the address bar).

---

## Stage 4: Pair your devices

Each device generates its own sync code on first run. To share data, both devices need to use the **same** code.

1. On your **laptop**, open the dashboard. Click the sync icon (top-left, the circular arrows). A code appears.
2. Click **Copy code**.
3. On your **phone**, open the dashboard. Click the sync icon, paste the code into the input box, and tap **Pair**. Confirm the prompt.
4. The phone reloads. Both devices now share the same Firestore document.

Any change made on either device (ticking a supplement, adding a task, switching tabs) appears on the other within about a second.

---

## Migrating your existing data

Your current local data lives at whatever URL or `file://` path you've been using. The PWA at the new URL starts fresh. To bring your data across:

1. Open your **old** dashboard in a browser and use the existing **Export** function (in the daily dashboard's settings) to save a JSON backup.
2. Open the **new** PWA dashboard in the same browser, go to settings, and **Import** the JSON.
3. Sync will pick up the imported data and push it to Firestore. From then on, every paired device will have it.

---

## What gets synced and what doesn't

Synced (mirrored to Firestore):

- Per-day completion state for supplements and skincare (`dash_<date>`)
- Workout and skincare routine overrides
- Recurring events
- Custom tasks
- Skipped tasks
- Weather location
- Calendar ICS URL
- Custom stocks list
- Currently active tab

Not synced (stays local on each device):

- Ephemeral UI state
- The sync UID itself (each device stores its own copy)
- Any keys not listed above

If you add new `localStorage` keys in future and want them synced, add the key pattern to the `SYNCED` array near the top of `sync.js`.

---

## Troubleshooting

**Sync icon stays grey.** `firebase-config.js` is missing values or has a typo. Open the browser console (F12) for the actual error.

**"Sync is disabled" message.** Same as above. Check `firebase-config.js`.

**PWA install option doesn't appear.** PWAs require HTTPS. `file://` and `http://localhost` work for testing in Chrome but Android won't offer install on those. Make sure you're on the HTTPS GitHub Pages or Netlify URL.

**Service worker errors in console after editing files.** The old service worker is cached. Open DevTools > Application > Service Workers and click **Unregister**, then refresh.

**Data on one device doesn't appear on the other.** Confirm both devices show the same code in the sync modal. If not, pair again.

**Firestore quota errors.** The free tier allows 50,000 reads, 20,000 writes and 20,000 deletes per day. A personal dashboard uses a tiny fraction of this. If you hit limits, something is looping. Check the console.

---

## Hardening (optional)

The default rules above use the sync code as the only credential. To require Google sign-in instead:

1. In Firebase Console, enable **Authentication > Google** as a sign-in provider.
2. Update Firestore rules to:
   ```
   match /dashboards/{userId} {
     allow read, write: if request.auth != null && request.auth.uid == userId;
   }
   ```
3. Modify `sync.js` to call `signInWithPopup` and use `auth.currentUser.uid` as the document ID instead of the random code.

This is more secure but adds friction (a sign-in step on each device) and a bit of complexity. The default approach is fine for personal use.

---

## How it works (one-paragraph version)

`sync.js` intercepts `localStorage.setItem` and `removeItem` calls. When a tracked key changes, it queues the change and pushes it to a Firestore document keyed by your sync UID about 800 ms later. A real-time listener on the same document fires whenever any device writes, applies the change to local `localStorage`, then triggers a soft refresh so the UI reflects the new state. Firestore's IndexedDB persistence means writes queue when offline and flush when the connection returns. The service worker caches the HTML, JS and icons so the app shell loads instantly and works offline.
