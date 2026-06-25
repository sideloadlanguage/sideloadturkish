// Sideload Turkish — Sync Client
//
// Orchestrates pull → decrypt → merge → encrypt → push.
// All crypto happens client-side; the server only stores opaque blobs.
//
// Depends on: lib/crypto.js (deriveKey, encrypt, decrypt)
//             lib/merge.js  (mergeWordSets)

const SideloadSync = (() => {
  // Sync is deferred (waitlist). No Turkish backend exists yet — set this and add the
  // matching manifest host_permissions when a Turkish sync host is provisioned.
  const SYNC_API = '';

  function authHeaders(licenseKey) {
    return {
      'Authorization': `Bearer ${licenseKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Validate a license key against the backend.
   * @param {string} licenseKey
   * @returns {Promise<{ valid: boolean, active?: boolean, expires_at?: string, account_id?: string, error?: string }>}
   */
  async function validate(licenseKey) {
    const res = await fetch(`${SYNC_API}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: licenseKey }),
    });
    return res.json();
  }

  /**
   * Pull the encrypted blob from the server.
   * @param {string} licenseKey
   * @returns {Promise<{ iv: string, ciphertext: string, updated_at: string } | null>}
   */
  async function pull(licenseKey) {
    const res = await fetch(`${SYNC_API}/sync`, {
      headers: authHeaders(licenseKey),
    });

    if (res.status === 401) throw new Error('INVALID_KEY');
    if (res.status === 403) throw new Error('EXPIRED');
    if (!res.ok) throw new Error(`Sync pull failed: ${res.status}`);

    const body = await res.json();
    return body.data;
  }

  /**
   * Push an encrypted blob to the server.
   * @param {string} licenseKey
   * @param {{ iv: string, ciphertext: string }} blob
   * @returns {Promise<{ ok: boolean, updated_at: string }>}
   */
  async function push(licenseKey, blob) {
    const res = await fetch(`${SYNC_API}/sync`, {
      method: 'PUT',
      headers: authHeaders(licenseKey),
      body: JSON.stringify(blob),
    });

    if (res.status === 401) throw new Error('INVALID_KEY');
    if (res.status === 403) throw new Error('EXPIRED');
    if (!res.ok) throw new Error(`Sync push failed: ${res.status}`);

    return res.json();
  }

  /**
   * Full sync cycle: pull → decrypt → merge → encrypt → push.
   *
   * @param {string} licenseKey
   * @param {string} pin
   * @param {string} accountId
   * @param {Array<{ en: string, known: boolean, clicked_known: number, seen: number, tier: number }>} localWords
   * @returns {Promise<{ merged: Array, pushed: boolean }>}
   */
  async function syncFull(licenseKey, pin, accountId, localWords) {
    // Derive encryption key
    const cryptoKey = await deriveKey(licenseKey, pin, accountId);

    // Pull remote blob
    const remoteBlob = await pull(licenseKey);

    let merged;
    if (remoteBlob) {
      // Decrypt remote data
      const remotePlain = await decrypt(remoteBlob, cryptoKey);
      const remoteData = JSON.parse(remotePlain);
      const remoteWords = remoteData.words || [];

      // Merge local + remote
      merged = mergeWordSets(localWords, remoteWords);
    } else {
      // No remote data — local is the truth
      merged = localWords;
    }

    // Encrypt merged set
    const payload = JSON.stringify({ words: merged, version: 2 });
    const encryptedBlob = await encrypt(payload, cryptoKey);

    // Push to server
    await push(licenseKey, encryptedBlob);

    return { merged, pushed: true };
  }

  return { validate, pull, push, syncFull, SYNC_API };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SideloadSync;
}
