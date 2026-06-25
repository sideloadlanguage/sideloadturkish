// Sideload Turkish — E2E Encryption
//
// All sync data is encrypted client-side before leaving the device.
// The server never sees plaintext — it stores opaque { iv, ciphertext } blobs.
//
// Key derivation: PBKDF2(license_key + pin, salt = account_id, 100k iterations, SHA-256)
// Encryption: AES-256-GCM with random 12-byte IV per payload

const PBKDF2_ITERATIONS = 100_000;
const IV_BYTES = 12;

/**
 * Derive an AES-256-GCM key from license key, PIN, and account ID.
 *
 * @param {string} licenseKey - SL-XXXX-XXXX-XXXX format
 * @param {string} pin - 4-digit user PIN (never sent to server)
 * @param {string} accountId - opaque account identifier (used as salt)
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(licenseKey, pin, accountId) {
  const encoder = new TextEncoder();
  const password = encoder.encode(licenseKey + pin);
  const salt = encoder.encode(accountId);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    password,
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt plaintext string to { iv, ciphertext } (both base64).
 *
 * @param {string} plaintext
 * @param {CryptoKey} key - AES-256-GCM key from deriveKey()
 * @returns {Promise<{ iv: string, ciphertext: string }>}
 */
async function encrypt(plaintext, key) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );

  return {
    iv: uint8ToBase64(iv),
    ciphertext: uint8ToBase64(new Uint8Array(encrypted)),
  };
}

/**
 * Decrypt { iv, ciphertext } (both base64) back to plaintext string.
 * Throws on wrong key/PIN (GCM auth tag failure).
 *
 * @param {{ iv: string, ciphertext: string }} blob
 * @param {CryptoKey} key - AES-256-GCM key from deriveKey()
 * @returns {Promise<string>}
 */
async function decrypt(blob, key) {
  const iv = base64ToUint8(blob.iv);
  const ciphertext = base64ToUint8(blob.ciphertext);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
}

// ── Base64 helpers ──

function uint8ToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Export for use by sync.js and tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { deriveKey, encrypt, decrypt, uint8ToBase64, base64ToUint8 };
}
