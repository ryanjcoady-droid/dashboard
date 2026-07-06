/* sync.js — Cloud sync for the dashboard
 * Mirrors localStorage to Firebase Firestore so the same data
 * appears across devices. Drop a <script src="sync.js"></script>
 * tag in the <head> of every page that uses localStorage.
 *
 * Setup: load firebase-config.js BEFORE this script. That file must
 * set window.__FIREBASE_CONFIG__ to your Firebase web app config.
 */
(function () {
  'use strict';

  if (!window.__FIREBASE_CONFIG__) {
    console.warn('[sync] No Firebase config. Sync disabled, dashboard will run local-only.');
    window.__sync = { enabled: false, getUID: () => null, setUID: () => {} };
    return;
  }

  // Keys that get synced. Anything else stays device-local
  // (e.g. ephemeral UI state, the sync UID itself).
  const SYNCED = [
    /^dash_/,                   // per-day completion state
    /^wt_/,                     // workout tracker (all keys: wt_workouts_v2, wt_session_*, wt_notes_*, wt_session_log, wt_active_workout, wt_session_timer, wt_completed_days)
    /^training_plan$/,          // editable race title, race date, phases, weekly sport split
    /^training_plan_full$/,     // full editable plan incl. all session content (workout dashboard)
    /^routine_overrides$/,
    /^workout_schedule_overrides$/, // weekly recurring workout name edits
    /^recurring_events$/,
    /^custom_tasks$/,
    /^skip_tasks$/,
    /^weather_location$/,
    /^cal_ics_url$/,
    /^work_ics_url$/,        // Humanforce roster webcal URL
    /^myCustomStocks$/,
    /^obsidian_notes$/,         // notes page — note content + sync state
    /^obsidian_note_cats$/,     // notes page — category list
    /^dashboard\.activeTab$/,
  ];
  const isSynced = (k) => typeof k === 'string' && SYNCED.some((r) => r.test(k));

  // Stable user ID — acts as the shared secret between paired devices.
  // Generated once on first run; can be replaced via the pairing UI.
  let UID = localStorage.getItem('__sync_uid');
  if (!UID) {
    UID = 'u_' + (crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2)));
    localStorage.setItem('__sync_uid', UID);
  }

  // Per-key change tracking. Map<key, value | null (delete)>.
  const pending = new Map();
  let pushTimer = null;
  let suppressEcho = 0;        // counter — ignore N upcoming snapshots (echoes of our own writes)
  let firstSnapshot = true;
  let fb = null;               // Firebase modules + refs once loaded

  // ── localStorage interception ─────────────────────────────────────
  const origSet = Storage.prototype.setItem;
  const origRemove = Storage.prototype.removeItem;

  Storage.prototype.setItem = function (k, v) {
    origSet.call(this, k, v);
    if (this === localStorage && isSynced(k)) {
      pending.set(k, String(v));
      schedulePush();
    }
  };

  Storage.prototype.removeItem = function (k) {
    const wasSynced = isSynced(k);
    origRemove.call(this, k);
    if (this === localStorage && wasSynced) {
      pending.set(k, null);
      schedulePush();
    }
  };

  function schedulePush() {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(flushPush, 800);
  }

  async function flushPush() {
    pushTimer = null;
    if (!fb || pending.size === 0) return;
    const { setDoc, deleteField } = fb.fns;
    const update = {};
    for (const [k, v] of pending) {
      update[encodeKey(k)] = v === null ? deleteField() : v;
    }
    pending.clear();
    suppressEcho++;
    try {
      await setDoc(fb.userDoc, update, { merge: true });
    } catch (e) {
      console.warn('[sync] push failed', e);
    }
  }

  // Firestore field names can't contain '/' or '.'  — encode them.
  function encodeKey(k) {
    return k.replace(/\./g, '__DOT__').replace(/\//g, '__SL__');
  }
  function decodeKey(k) {
    return k.replace(/__DOT__/g, '.').replace(/__SL__/g, '/');
  }

  // ── Apply remote snapshot to localStorage ─────────────────────────
  function applyRemote(remote) {
    if (!remote) return false;
    let changed = false;

    // Apply remote keys
    for (const encK in remote) {
      if (encK === '__updatedAt') continue;
      const k = decodeKey(encK);
      if (!isSynced(k)) continue;
      const remoteVal = remote[encK];
      const localVal = localStorage.getItem(k);
      if (remoteVal == null) {
        if (localVal !== null) { origRemove.call(localStorage, k); changed = true; }
      } else if (localVal !== remoteVal) {
        origSet.call(localStorage, k, String(remoteVal));
        changed = true;
      }
    }

    // Remove local synced keys not in remote (so deletes propagate)
    const remoteKeys = new Set(Object.keys(remote).map(decodeKey));
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (isSynced(k) && !remoteKeys.has(k)) {
        origRemove.call(localStorage, k);
        changed = true;
      }
    }
    return changed;
  }

  // ── Soft refresh: re-render without a hard reload when possible ───
  function softRefresh() {
    // Most existing pages don't expose a render hook, so a reload is
    // the safest universal way to reflect remote changes. We dispatch
    // an event first so any page can opt-in to handle it without reload.
    const ev = new CustomEvent('sync:remote-change');
    let handled = false;
    ev.markHandled = () => { handled = true; };
    window.dispatchEvent(ev);
    if (!handled) window.location.reload();
  }

  // ── Init Firebase ─────────────────────────────────────────────────
  (async () => {
    try {
      const appMod = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js');
      const fsMod  = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');
      const app = appMod.initializeApp(window.__FIREBASE_CONFIG__);
      const db = fsMod.getFirestore(app);
      // Best-effort offline cache. Fails silently if multiple tabs are open.
      try { await fsMod.enableIndexedDbPersistence(db); } catch (e) { /* ignore */ }
      const userDoc = fsMod.doc(db, 'dashboards', UID);
      fb = {
        db, userDoc,
        fns: { setDoc: fsMod.setDoc, deleteField: fsMod.deleteField, onSnapshot: fsMod.onSnapshot }
      };

      // Real-time listener
      fsMod.onSnapshot(userDoc, (snap) => {
        if (suppressEcho > 0) { suppressEcho--; firstSnapshot = false; return; }
        const data = snap.data();

        if (!data) {
          // Brand-new doc. Push whatever we have locally so the cloud has a copy.
          if (firstSnapshot) {
            firstSnapshot = false;
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (isSynced(k)) pending.set(k, localStorage.getItem(k));
            }
            if (pending.size > 0) schedulePush();
          }
          return;
        }

        const changed = applyRemote(data);
        const wasFirst = firstSnapshot;
        firstSnapshot = false;
        if (changed) {
          if (wasFirst) {
            // First load — UI rendered against local cache. Refresh to show cloud state.
            softRefresh();
          } else {
            // Live update from another device.
            softRefresh();
          }
        }
      }, (err) => {
        console.warn('[sync] listener error', err);
      });

      // Flush anything that piled up during init (highly unlikely but harmless).
      if (pending.size > 0) schedulePush();
    } catch (e) {
      console.warn('[sync] init failed — running local-only.', e);
    }
  })();

  // ── Public API for the pairing UI ─────────────────────────────────
  window.__sync = {
    enabled: true,
    getUID: () => UID,
    setUID: (newUid) => {
      newUid = (newUid || '').trim();
      if (!newUid || newUid === UID) return;
      // Clear synced local data so we don't push it under the new UID.
      // Unsynced keys (UI prefs etc.) are kept.
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (isSynced(k)) origRemove.call(localStorage, k);
      }
      origSet.call(localStorage, '__sync_uid', newUid);
      window.location.reload();
    },
  };
})();
