// Sideload Turkish — Background Service Worker (CQRS)
//
// Commands (write): mutate word records in IndexedDB, then update read projections.
// Queries (read): return pre-computed projections — no table scans.
//
// Projections (in-memory, rebuilt from IDB on service worker wake):
//   _progress  — { total, known, tiers: { [tier]: { total, known } } }
//   _knownSet  — Set<string> of known word keys
//
// The projections are the single source of truth for all read operations.
// They are rebuilt on startup and kept in sync by every command.

// ── IndexedDB ──

const DB_NAME = 'sideload-turkish';
const DB_VERSION = 1;
const WORDS_STORE = 'words';
const SETTINGS_STORE = 'settings';

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(WORDS_STORE)) {
        const store = db.createObjectStore(WORDS_STORE, { keyPath: 'en' });
        store.createIndex('tier', 'tier', { unique: false });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      _db.onclose = () => { _db = null; };
      resolve(_db);
    };
    req.onerror = (e) => reject(new Error(`IndexedDB: ${e.target.error}`));
  });
}

function tx(storeName, mode, op) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    try {
      const t = db.transaction(storeName, mode);
      const store = t.objectStore(storeName);
      const req = op(store);
      if (req) {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } else {
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }
    } catch (err) {
      _db = null;
      openDB().then((db2) => {
        const t = db2.transaction(storeName, mode);
        const store = t.objectStore(storeName);
        const req = op(store);
        if (req) {
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        } else {
          t.oncomplete = () => resolve();
          t.onerror = () => reject(t.error);
        }
      }).catch(reject);
    }
  }));
}

// ── Read projections (in-memory) ──

let _progress = { total: 0, known: 0, tiers: {} };
let _knownSet = new Set();
let _projectionsReady = null; // Promise that resolves when projections are built

/**
 * Rebuild projections from IndexedDB. Called once on service worker wake.
 */
function rebuildProjections() {
  _projectionsReady = (async () => {
    const records = await tx(WORDS_STORE, 'readonly', (s) => s.getAll());

    const tiers = {};
    let total = 0;
    let known = 0;
    const knownSet = new Set();

    for (const r of records || []) {
      total++;
      if (r.known) {
        known++;
        knownSet.add(r.en);
      }
      if (!tiers[r.tier]) tiers[r.tier] = { total: 0, known: 0 };
      tiers[r.tier].total++;
      if (r.known) tiers[r.tier].known++;
    }

    _progress = { total, known, tiers };
    _knownSet = knownSet;

    console.log(`[Sideload SW] Projections built: ${known} known / ${total} tracked`);
  })();

  return _projectionsReady;
}

/**
 * Ensure projections are ready before any operation.
 */
function ensureProjections() {
  return _projectionsReady || rebuildProjections();
}

// ── Sync state ──

let _syncCounter = 0;          // markKnown calls since last sync
const SYNC_BATCH_SIZE = 10;    // sync after this many markKnown calls
const SYNC_DEBOUNCE_MS = 60000; // minimum 60s between syncs
let _lastSyncTime = 0;
let _syncInProgress = false;

// ── Commands (write) ──

const Commands = {
  async markKnown({ word, tier }) {
    await ensureProjections();
    const key = word.toLowerCase();

    // Write to IDB
    const existing = await tx(WORDS_STORE, 'readonly', (s) => s.get(key));
    const record = existing || { en: key, tier, seen: 0, clicked_known: 0, known: false };
    const wasKnown = record.known;
    const updated = { ...record, clicked_known: record.clicked_known + 1, known: true };
    await tx(WORDS_STORE, 'readwrite', (s) => s.put(updated));

    // Update projections
    if (!existing) {
      _progress.total++;
      if (!_progress.tiers[tier]) _progress.tiers[tier] = { total: 0, known: 0 };
      _progress.tiers[tier].total++;
    }
    if (!wasKnown) {
      _progress.known++;
      _progress.tiers[tier].known++;
      _knownSet.add(key);

      // Trigger batched sync
      _syncCounter++;
      if (_syncCounter >= SYNC_BATCH_SIZE) {
        _syncCounter = 0;
        triggerSync('batch');
      }
    }
  },

  async recordSeen({ word, tier }) {
    await ensureProjections();
    const key = word.toLowerCase();

    const existing = await tx(WORDS_STORE, 'readonly', (s) => s.get(key));
    const record = existing || { en: key, tier, seen: 0, clicked_known: 0, known: false };
    const updated = { ...record, seen: record.seen + 1 };
    await tx(WORDS_STORE, 'readwrite', (s) => s.put(updated));

    // Update projections if new word
    if (!existing) {
      _progress.total++;
      if (!_progress.tiers[tier]) _progress.tiers[tier] = { total: 0, known: 0 };
      _progress.tiers[tier].total++;
    }
  },

  async setSetting({ key, value }) {
    await tx(SETTINGS_STORE, 'readwrite', (s) => s.put({ key, value }));
  },

  async resetProgress() {
    await tx(WORDS_STORE, 'readwrite', (s) => s.clear());
    // Reset projections
    _progress = { total: 0, known: 0, tiers: {} };
    _knownSet = new Set();
  },
};

// ── Queries (read) — projections only, no IDB access ──

const Queries = {
  async getWordProgress({ word }) {
    // Single-record lookup still hits IDB (not worth projecting every word)
    return tx(WORDS_STORE, 'readonly', (s) => s.get(word.toLowerCase()));
  },

  async getProgress() {
    await ensureProjections();
    // Return a copy so callers can't mutate the projection
    return {
      total: _progress.total,
      known: _progress.known,
      tiers: Object.fromEntries(
        Object.entries(_progress.tiers).map(([t, v]) => [t, { ...v }])
      ),
    };
  },

  async getKnownWords() {
    await ensureProjections();
    return [..._knownSet];
  },

  async getSetting({ key }) {
    const record = await tx(SETTINGS_STORE, 'readonly', (s) => s.get(key));
    return record ? record.value : undefined;
  },

  async getSettings() {
    const records = await tx(SETTINGS_STORE, 'readonly', (s) => s.getAll());
    const settings = {};
    for (const r of records || []) settings[r.key] = r.value;
    return settings;
  },

  async getStrugglingWords({ threshold }) {
    const t = threshold || 10;
    const all = await tx(WORDS_STORE, 'readonly', (s) => s.getAll());
    return (all || [])
      .filter((r) => r.seen >= t && !r.known)
      .sort((a, b) => b.seen - a.seen);
  },
};

// ── Unified dispatch ──

const Dispatch = { ...Queries, ...Commands };

// ── Bootstrap projections on wake ──

rebuildProjections();

// ── Message routing ──

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Sideload] Extension installed.');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'STORAGE') {
    const { action, ...params } = message;
    const op = Dispatch[action];

    (async () => {
      try {
        if (!op) throw new Error(`Unknown action: ${action}`);
        const data = await op(params);
        sendResponse({ data });
      } catch (err) {
        console.error(`[Sideload SW] ${action} error:`, err);
        sendResponse({ error: err.message });
      }
    })();

    return true;
  }

  if (message.type === 'GET_TAB_ID') {
    sendResponse({ tabId: sender.tab?.id ?? null });
    return false;
  }

  if (message.type === 'TOGGLE_TAB') {
    chrome.tabs.sendMessage(message.tabId, { type: 'SET_ENABLED', enabled: message.enabled });
    return false;
  }

  if (message.type === 'SETTINGS_CHANGED') {
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'SETTINGS_CHANGED',
            settings: message.settings,
          }).catch(() => {});
        }
      }
    });
    return false;
  }

  if (message.type === 'SYNC') {
    (async () => {
      try {
        const result = await performSync(message.reason || 'manual');
        sendResponse({ data: result });
      } catch (err) {
        console.error('[Sideload SW] Sync error:', err);
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }

  if (message.type === 'GET_SYNC_STATUS') {
    sendResponse({
      data: {
        lastSyncTime: _lastSyncTime,
        syncInProgress: _syncInProgress,
      },
    });
    return false;
  }

  return false;
});

// ── Sync engine ──

// Sync is deferred (waitlist). No Turkish backend exists yet — set this and add the
// matching manifest host_permissions when a Turkish sync host is provisioned.
const SYNC_API = '';

/**
 * Trigger a sync if conditions are met (debounce, not already in progress).
 * @param {string} reason - 'startup' | 'batch' | 'manual'
 */
function triggerSync(reason) {
  if (_syncInProgress) return;
  if (reason !== 'manual' && Date.now() - _lastSyncTime < SYNC_DEBOUNCE_MS) return;

  // Check if sync is configured
  chrome.storage.local.get(['syncLicenseKey', 'syncPin', 'syncAccountId'], (items) => {
    if (!items.syncLicenseKey || !items.syncPin || !items.syncAccountId) return;
    performSync(reason).catch((err) => {
      console.error(`[Sideload SW] Background sync (${reason}) failed:`, err.message);
    });
  });
}

/**
 * Execute a full sync cycle: export words → pull → merge → push → import merged.
 * @param {string} reason
 * @returns {Promise<{ merged: number, reason: string }>}
 */
async function performSync(reason) {
  if (_syncInProgress) throw new Error('Sync already in progress');
  _syncInProgress = true;

  try {
    // Get sync credentials from chrome.storage.local
    const config = await new Promise((resolve) => {
      chrome.storage.local.get(['syncLicenseKey', 'syncPin', 'syncAccountId'], resolve);
    });

    if (!config.syncLicenseKey || !config.syncPin || !config.syncAccountId) {
      throw new Error('Sync not configured');
    }

    // Export all word records from IDB
    await ensureProjections();
    const allRecords = await tx(WORDS_STORE, 'readonly', (s) => s.getAll());
    const localWords = (allRecords || []).map((r) => ({
      en: r.en,
      known: r.known,
      clicked_known: r.clicked_known,
      seen: r.seen,
      tier: r.tier,
    }));

    // Derive encryption key
    const cryptoKey = await deriveSyncKey(config.syncLicenseKey, config.syncPin, config.syncAccountId);

    // Pull remote blob
    const remoteBlob = await syncPull(config.syncLicenseKey);

    let merged;
    if (remoteBlob) {
      const remotePlain = await syncDecrypt(remoteBlob, cryptoKey);
      const remoteData = JSON.parse(remotePlain);
      const remoteWords = remoteData.words || [];
      merged = syncMergeWordSets(localWords, remoteWords);
    } else {
      merged = localWords;
    }

    // Encrypt and push
    const payload = JSON.stringify({ words: merged, version: 2 });
    const encryptedBlob = await syncEncrypt(payload, cryptoKey);
    await syncPush(config.syncLicenseKey, encryptedBlob);

    // Import merged records into IDB
    await importMergedRecords(merged);

    _lastSyncTime = Date.now();
    console.log(`[Sideload SW] Sync complete (${reason}): ${merged.length} words`);

    return { merged: merged.length, reason };
  } finally {
    _syncInProgress = false;
  }
}

/**
 * Import merged word records into IDB and rebuild projections.
 * @param {Array} mergedRecords
 */
async function importMergedRecords(mergedRecords) {
  for (const record of mergedRecords) {
    await tx(WORDS_STORE, 'readwrite', (s) => s.put(record));
  }
  await rebuildProjections();
}

// ── Inline sync helpers (no module imports in service worker) ──

// Crypto: PBKDF2 + AES-256-GCM
async function deriveSyncKey(licenseKey, pin, accountId) {
  const encoder = new TextEncoder();
  const password = encoder.encode(licenseKey + pin);
  const salt = encoder.encode(accountId);
  const keyMaterial = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function syncEncrypt(plaintext, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return { iv: uint8ToB64(iv), ciphertext: uint8ToB64(new Uint8Array(encrypted)) };
}

async function syncDecrypt(blob, key) {
  const iv = b64ToUint8(blob.iv);
  const ciphertext = b64ToUint8(blob.ciphertext);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

function uint8ToB64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function b64ToUint8(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Merge: G-Set CRDT
function syncMergeWordSets(localRecords, remoteRecords) {
  const merged = new Map();
  for (const r of localRecords) merged.set(r.en, { ...r });
  for (const remote of remoteRecords) {
    const local = merged.get(remote.en);
    if (!local) { merged.set(remote.en, { ...remote }); continue; }
    merged.set(remote.en, {
      en: local.en,
      known: local.known || remote.known,
      clicked_known: Math.max(local.clicked_known, remote.clicked_known),
      seen: Math.max(local.seen, remote.seen),
      tier: Math.min(local.tier, remote.tier),
    });
  }
  return [...merged.values()];
}

// HTTP helpers
async function syncPull(licenseKey) {
  const res = await fetch(`${SYNC_API}/sync`, {
    headers: { 'Authorization': `Bearer ${licenseKey}`, 'Content-Type': 'application/json' },
  });
  if (res.status === 401) throw new Error('INVALID_KEY');
  if (res.status === 403) throw new Error('EXPIRED');
  if (!res.ok) throw new Error(`Sync pull failed: ${res.status}`);
  const body = await res.json();
  return body.data;
}

async function syncPush(licenseKey, blob) {
  const res = await fetch(`${SYNC_API}/sync`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${licenseKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(blob),
  });
  if (res.status === 401) throw new Error('INVALID_KEY');
  if (res.status === 403) throw new Error('EXPIRED');
  if (!res.ok) throw new Error(`Sync push failed: ${res.status}`);
  return res.json();
}

// ── Startup sync ──

chrome.storage.local.get(['syncLicenseKey'], (items) => {
  if (items.syncLicenseKey) {
    triggerSync('startup');
  }
});
