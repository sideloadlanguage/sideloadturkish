// Sideload Turkish — Popup Dashboard + Settings

document.addEventListener('DOMContentLoaded', async () => {
  const TIER_LABELS = { 1: 'A1', 2: 'A2', 3: 'B1', 4: 'B2', 5: 'C1' };
  const TIER_NAMES = {
    1: 'A1 — Beginner',
    2: 'A2 — Elementary',
    3: 'B1 — Intermediate',
    4: 'B2 — Upper Intermediate',
    5: 'C1 — Advanced',
  };

  // ── Elements ──
  const globalToggle = document.getElementById('globalToggle');
  const currentTierEl = document.getElementById('currentTier');
  const wordsKnownEl = document.getElementById('wordsKnown');
  const tierProgressEl = document.getElementById('tierProgress');
  const tierHintEl = document.getElementById('tierHint');
  const tierBarsEl = document.getElementById('tierBars');
  const densitySlider = document.getElementById('densitySlider');
  const densityValueEl = document.getElementById('densityValue');
  const blacklistInput = document.getElementById('blacklistInput');
  const saveBlacklistBtn = document.getElementById('saveBlacklist');
  const resetProgressBtn = document.getElementById('resetProgress');
  const strugglingSection = document.getElementById('strugglingSection');
  const strugglingHint = document.getElementById('strugglingHint');
  const strugglingList = document.getElementById('strugglingList');

  // ── Load vocabulary for tier totals + struggling word lookups ──
  let vocabTierTotals = {};
  try {
    const url = chrome.runtime.getURL('data/vocabulary.json');
    const response = await fetch(url);
    fullVocab = await response.json();
    vocabTierTotals = SideloadTiers.countWordsPerTier(fullVocab);
  } catch (err) {
    console.error('[Sideload Popup] Failed to load vocabulary:', err);
  }

  // ── Render progress ──
  async function renderProgress() {
    let progress;
    try {
      progress = await SideloadStorage.getProgress();
      console.log('[Sideload Popup] Progress from service worker:', JSON.stringify(progress));
    } catch (err) {
      console.error('[Sideload Popup] Failed to get progress:', err);
      progress = { total: 0, known: 0, tiers: {} };
    }
    const unlockedTiers = SideloadTiers.getUnlockedTiers(progress, vocabTierTotals);
    const maxTier = Math.max(...unlockedTiers);

    // Current tier display
    currentTierEl.textContent = TIER_NAMES[maxTier] || 'A1';

    // Words known
    const totalVocab = Object.values(vocabTierTotals).reduce((a, b) => a + b, 0);
    wordsKnownEl.textContent = `${progress.known} / ${totalVocab}`;

    // Tier progress bar (progress within current max tier)
    const tierTotal = vocabTierTotals[maxTier] || 1;
    const tierKnown = progress.tiers[maxTier]?.known || 0;
    const tierPct = Math.round((tierKnown / tierTotal) * 100);
    tierProgressEl.style.width = `${tierPct}%`;

    if (maxTier < 5) {
      const remaining = Math.ceil(tierTotal * SideloadTiers.UNLOCK_THRESHOLD) - tierKnown;
      tierHintEl.textContent = remaining > 0
        ? `${remaining} more to unlock ${TIER_LABELS[maxTier + 1]}`
        : `${TIER_LABELS[maxTier + 1]} unlocked!`;
    } else {
      tierHintEl.textContent = tierPct >= 80 ? 'Master level!' : 'Keep going!';
    }

    // Tier breakdown bars with readiness indicators
    let strugglingWords = [];
    try {
      strugglingWords = await SideloadStorage.getStrugglingWords() || [];
    } catch (_) { /* ignore */ }

    tierBarsEl.innerHTML = '';
    for (let t = 1; t <= 5; t++) {
      const total = vocabTierTotals[t] || 0;
      const known = progress.tiers[t]?.known || 0;
      const pct = total > 0 ? Math.round((known / total) * 100) : 0;
      const isLocked = !unlockedTiers.has(t);
      const readiness = SideloadTiers.getTierReadiness(t, progress, vocabTierTotals, strugglingWords);

      const readinessIcon = {
        green: '🟢',
        yellow: '🟡',
        grey: '⚪',
        locked: '🔒',
      }[readiness] || '';

      const readinessTitle = {
        green: 'Ready to advance',
        yellow: '5+ struggling words — consider reviewing',
        grey: `Below ${Math.round(SideloadTiers.UNLOCK_THRESHOLD * 100)}% known`,
        locked: 'Locked',
      }[readiness] || '';

      const row = document.createElement('div');
      row.className = `tier-row${isLocked ? ' tier-row--locked' : ''}`;

      row.innerHTML = `
        <span class="tier-row__label">${TIER_LABELS[t]}</span>
        <div class="tier-row__bar">
          <div class="tier-row__fill tier-row__fill--${t}" style="width: ${pct}%"></div>
        </div>
        <span class="tier-row__count">${known}/${total}</span>
        <span class="tier-row__readiness" title="${readinessTitle}">${readinessIcon}</span>
      `;

      tierBarsEl.appendChild(row);
    }
  }

  // ── Render struggling words ──
  async function renderStruggling() {
    try {
      const words = await SideloadStorage.getStrugglingWords();
      if (!words || words.length === 0) {
        strugglingSection.style.display = 'none';
        return;
      }

      strugglingSection.style.display = '';
      strugglingHint.textContent = `${words.length} word${words.length > 1 ? 's' : ''} seen 10+ times without marking known`;
      strugglingList.innerHTML = '';

      // Find most seen word for header stat
      const topWord = words[0];
      if (topWord) {
        const vocabEntry = fullVocab.find((v) => v.en.toLowerCase() === topWord.en);
        const tr = (vocabEntry && vocabEntry.tr) ? vocabEntry.tr : topWord.en;
        strugglingHint.textContent += ` — most seen: "${tr}" (${topWord.seen}x)`;
      }

      // Show up to 20 words
      const capped = words.slice(0, 20);
      for (const word of capped) {
        const vocabEntry = fullVocab.find((v) => v.en.toLowerCase() === word.en);
        const tr = (vocabEntry && vocabEntry.tr) ? vocabEntry.tr : '?';

        const row = document.createElement('div');
        row.className = 'struggling-row';
        row.innerHTML = `
          <span class="struggling-row__word">${tr}</span>
          <span class="struggling-row__original">${word.en}</span>
          <span class="struggling-row__seen">${word.seen}x</span>
          <button class="struggling-row__know btn btn--tiny">Know it</button>
        `;

        // Click "Know it" → mark known
        const btn = row.querySelector('.struggling-row__know');
        btn.addEventListener('click', async () => {
          await SideloadStorage.markKnown(word.en, word.tier || 1);
          btn.textContent = '✓';
          btn.disabled = true;
          row.classList.add('struggling-row--known');
        });

        strugglingList.appendChild(row);
      }
    } catch (err) {
      console.error('[Sideload Popup] Failed to load struggling words:', err);
    }
  }

  // ── Load settings ──
  async function loadSettings() {
    const enabled = await SideloadStorage.getSetting('enabled', true);
    globalToggle.checked = enabled;

    const densityOverride = await SideloadStorage.getSetting('densityOverride', null);
    if (densityOverride !== null) {
      const sliderVal = Math.round(densityOverride * 100);
      densitySlider.value = sliderVal;
      densityValueEl.textContent = `${sliderVal}%`;
    } else {
      densitySlider.value = 0;
      densityValueEl.textContent = 'Auto';
    }

    const blacklist = await SideloadStorage.getSetting('blacklist', '');
    blacklistInput.value = blacklist;
  }

  // ── Broadcast settings change to all tabs ──
  function broadcastSettings() {
    chrome.runtime.sendMessage({ type: 'SETTINGS_CHANGED', settings: {} });
  }

  // ── Event handlers ──

  globalToggle.addEventListener('change', async () => {
    const enabled = globalToggle.checked;
    await SideloadStorage.setSetting('enabled', enabled);

    // Toggle all tabs
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'SET_ENABLED', enabled }).catch(() => {});
      }
    }
  });

  densitySlider.addEventListener('input', () => {
    const val = parseInt(densitySlider.value, 10);
    densityValueEl.textContent = val === 0 ? 'Auto' : `${val}%`;
  });

  densitySlider.addEventListener('change', async () => {
    const val = parseInt(densitySlider.value, 10);
    const override = val === 0 ? null : val / 100;
    await SideloadStorage.setSetting('densityOverride', override);
    broadcastSettings();
  });

  saveBlacklistBtn.addEventListener('click', async () => {
    const value = blacklistInput.value.trim();
    await SideloadStorage.setSetting('blacklist', value);
    saveBlacklistBtn.textContent = 'Saved!';
    setTimeout(() => { saveBlacklistBtn.textContent = 'Save'; }, 1500);
    broadcastSettings();
  });

  resetProgressBtn.addEventListener('click', async () => {
    if (!confirm('Reset all progress? This cannot be undone.')) return;
    await SideloadStorage.resetProgress();
    await renderProgress();
    broadcastSettings();
  });

  // ── Sync UI ──

  const licenseKeyInput = document.getElementById('licenseKeyInput');
  const validateKeyBtn = document.getElementById('validateKeyBtn');
  const keyStatus = document.getElementById('keyStatus');
  const pinSetupGroup = document.getElementById('pinSetupGroup');
  const pinInput = document.getElementById('pinInput');
  const savePinBtn = document.getElementById('savePinBtn');
  const syncSetup = document.getElementById('syncSetup');
  const syncActive = document.getElementById('syncActive');
  const syncStatus = document.getElementById('syncStatus');
  const syncKeyDisplay = document.getElementById('syncKeyDisplay');
  const syncNowBtn = document.getElementById('syncNowBtn');
  const disconnectSyncBtn = document.getElementById('disconnectSyncBtn');

  // Sync deferred (waitlist) — set when a Turkish sync backend is provisioned.
  const SYNC_API = '';

  async function loadSyncState() {
    const items = await new Promise((resolve) => {
      chrome.storage.local.get(['syncLicenseKey', 'syncPin', 'syncAccountId'], resolve);
    });

    if (items.syncLicenseKey && items.syncPin && items.syncAccountId) {
      showSyncActive(items.syncLicenseKey);
      updateSyncStatus();
    } else if (items.syncLicenseKey && items.syncAccountId && !items.syncPin) {
      // Key validated but PIN not set yet
      licenseKeyInput.value = items.syncLicenseKey;
      pinSetupGroup.style.display = '';
      keyStatus.textContent = 'Key valid — set your PIN to activate sync';
      keyStatus.className = 'setting-hint key-status--ok';
    }
  }

  function showSyncActive(key) {
    syncSetup.style.display = 'none';
    syncActive.style.display = '';
    // Show last 4 chars, mask the rest
    syncKeyDisplay.textContent = key;
    syncKeyDisplay.title = 'Click to copy';
  }

  function showSyncSetup() {
    syncSetup.style.display = '';
    syncActive.style.display = 'none';
    licenseKeyInput.value = '';
    pinInput.value = '';
    pinSetupGroup.style.display = 'none';
    keyStatus.textContent = '';
  }

  async function updateSyncStatus() {
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_SYNC_STATUS' }, resolve);
      });
      if (response?.data) {
        const { lastSyncTime, syncInProgress } = response.data;
        if (syncInProgress) {
          syncStatus.textContent = 'Syncing...';
        } else if (lastSyncTime > 0) {
          const ago = Math.round((Date.now() - lastSyncTime) / 1000);
          if (ago < 60) syncStatus.textContent = 'Just synced';
          else if (ago < 3600) syncStatus.textContent = `${Math.round(ago / 60)}m ago`;
          else syncStatus.textContent = `${Math.round(ago / 3600)}h ago`;
        } else {
          syncStatus.textContent = 'Not synced yet';
        }
      }
    } catch {
      syncStatus.textContent = 'Unknown';
    }
  }

  // Validate key
  validateKeyBtn.addEventListener('click', async () => {
    const key = licenseKeyInput.value.trim().toUpperCase();
    if (!key) return;

    validateKeyBtn.disabled = true;
    validateKeyBtn.textContent = '...';
    keyStatus.textContent = '';

    try {
      const res = await fetch(`${SYNC_API}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();

      if (data.valid && data.active) {
        // Store key + account_id, prompt for PIN
        await new Promise((resolve) => {
          chrome.storage.local.set({
            syncLicenseKey: key,
            syncAccountId: data.account_id,
          }, resolve);
        });
        keyStatus.textContent = 'Key valid! Set your PIN below.';
        keyStatus.className = 'setting-hint key-status--ok';
        pinSetupGroup.style.display = '';
      } else if (data.valid && !data.active) {
        keyStatus.textContent = 'Subscription expired';
        keyStatus.className = 'setting-hint key-status--error';
      } else {
        keyStatus.textContent = data.error || 'Invalid key';
        keyStatus.className = 'setting-hint key-status--error';
      }
    } catch (err) {
      keyStatus.textContent = 'Connection failed — is the sync server running?';
      keyStatus.className = 'setting-hint key-status--error';
    } finally {
      validateKeyBtn.disabled = false;
      validateKeyBtn.textContent = 'Activate';
    }
  });

  // Save PIN + activate sync
  savePinBtn.addEventListener('click', async () => {
    const pin = pinInput.value.trim();
    if (!/^\d{4}$/.test(pin)) {
      pinInput.focus();
      return;
    }

    await new Promise((resolve) => {
      chrome.storage.local.set({ syncPin: pin }, resolve);
    });

    const items = await new Promise((resolve) => {
      chrome.storage.local.get(['syncLicenseKey'], resolve);
    });

    showSyncActive(items.syncLicenseKey);

    // Trigger first sync
    chrome.runtime.sendMessage({ type: 'SYNC', reason: 'manual' }, (response) => {
      if (response?.data) {
        updateSyncStatus();
        renderProgress();
      }
    });
  });

  // Sync Now
  syncNowBtn.addEventListener('click', async () => {
    syncNowBtn.disabled = true;
    syncNowBtn.textContent = 'Syncing...';
    syncStatus.textContent = 'Syncing...';

    chrome.runtime.sendMessage({ type: 'SYNC', reason: 'manual' }, (response) => {
      syncNowBtn.disabled = false;
      syncNowBtn.textContent = 'Sync Now';

      if (response?.error) {
        if (response.error === 'EXPIRED') {
          syncStatus.textContent = 'Subscription expired';
          syncNowBtn.textContent = 'Renew';
          syncNowBtn.onclick = () => { window.open('https://sideloadturkish.com/renew', '_blank'); };
        } else if (response.error === 'INVALID_KEY') {
          syncStatus.textContent = 'Key invalid — re-enter your key';
          showSyncSetup();
        } else {
          syncStatus.textContent = `Error: ${response.error}`;
        }
      } else {
        updateSyncStatus();
        renderProgress();
      }
    });
  });

  // Copy key on click
  syncKeyDisplay.addEventListener('click', () => {
    navigator.clipboard.writeText(syncKeyDisplay.textContent).then(() => {
      const original = syncKeyDisplay.textContent;
      syncKeyDisplay.textContent = 'Copied!';
      setTimeout(() => { syncKeyDisplay.textContent = original; }, 1500);
    });
  });

  // Reset PIN
  const resetPinBtn = document.getElementById('resetPinBtn');
  resetPinBtn.addEventListener('click', async () => {
    const newPin = prompt('Enter new 4-digit PIN.\n\nWarning: this will replace your sync data with your current local data. The old encrypted data on the server will be overwritten.');
    if (!newPin || !/^\d{4}$/.test(newPin.trim())) return;

    await new Promise((resolve) => {
      chrome.storage.local.set({ syncPin: newPin.trim() }, resolve);
    });

    syncStatus.textContent = 'Re-encrypting...';
    chrome.runtime.sendMessage({ type: 'SYNC', reason: 'manual' }, (response) => {
      if (response?.error) {
        syncStatus.textContent = `Error: ${response.error}`;
      } else {
        syncStatus.textContent = 'PIN updated, data re-synced';
        setTimeout(updateSyncStatus, 2000);
      }
    });
  });

  // Disconnect
  disconnectSyncBtn.addEventListener('click', async () => {
    if (!confirm('Disconnect sync? Your local data will be kept.')) return;
    await new Promise((resolve) => {
      chrome.storage.local.remove(['syncLicenseKey', 'syncPin', 'syncAccountId'], resolve);
    });
    showSyncSetup();
  });

  // ── Init ──
  await SideloadStorage.open();
  await renderProgress();
  await renderStruggling();
  await loadSettings();
  await loadSyncState();
});
