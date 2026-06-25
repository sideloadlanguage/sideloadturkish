// Sideload Turkish — Content Script: Word Replacer
// Walks DOM text nodes, replaces English words with Turkish translations.
// Integrates with SideloadTiers for difficulty progression and density scaling.

(() => {
  // Elements whose text content should never be touched
  const EXCLUDED_TAGS = new Set([
    'CODE', 'PRE', 'SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION',
    'NOSCRIPT', 'SVG', 'MATH', 'KBD', 'SAMP', 'VAR',
  ]);

  // Matches a standalone word (letters, hyphens, apostrophes)
  const WORD_RE = /\b([a-zA-Z][a-zA-Z'-]*[a-zA-Z]|[a-zA-Z])\b/g;

  // Simple proper noun heuristic: word starts with uppercase and is not at sentence start
  const LOOKS_LIKE_PROPER_NOUN = /^[A-Z][a-z]/;

  // URL / email patterns to skip
  const URL_RE = /https?:\/\/\S+/gi;
  const EMAIL_RE = /\S+@\S+\.\S+/gi;

  // English articles — never replaced on their own (Turkish has no articles)
  const ARTICLES = new Set(['the', 'a', 'an']);

  let vocabMap = null;       // Map<lowercase_en, { tr, tier }> — filtered by unlocked tiers, tr non-null only
  let fullVocab = [];        // Raw vocabulary array (all tiers)
  let wordsPerTier = {};     // tier → total word count
  let knownWords = new Set(); // Words marked as known in IndexedDB
  let strugglingWords = new Set(); // Words seen 10+ times without marking known
  let currentDensity = 0.05; // Default tier-1 density
  let enabled = true;
  let initialized = false;

  /**
   * Load vocabulary JSON and initialize tier-aware state.
   */
  async function loadVocabulary() {
    try {
      const url = chrome.runtime.getURL('data/vocabulary.json');
      const response = await fetch(url);
      fullVocab = await response.json();

      wordsPerTier = SideloadTiers.countWordsPerTier(fullVocab);

      console.log(`[Sideload] Vocabulary loaded: ${fullVocab.length} words across ${Object.keys(wordsPerTier).length} tiers`);
    } catch (err) {
      console.error('[Sideload] Failed to load vocabulary:', err);
      fullVocab = [];
      wordsPerTier = {};
    }
  }

  /**
   * Rebuild the vocabMap based on current progress and unlocked tiers.
   */
  async function rebuildVocabMap() {
    let progress = { total: 0, known: 0, tiers: {} };
    let densityOverride = null;

    try {
      progress = await SideloadStorage.getProgress();
      densityOverride = await SideloadStorage.getSetting('densityOverride', null);
      knownWords = await SideloadStorage.getKnownWords();
      const strugglingList = await SideloadStorage.getStrugglingWords();
      strugglingWords = new Set(strugglingList.map((r) => r.en));
    } catch (err) {
      // Storage not ready — use defaults
    }

    const unlockedTiers = SideloadTiers.getUnlockedTiers(progress, wordsPerTier);
    currentDensity = SideloadTiers.getDensity(unlockedTiers, densityOverride);

    const filtered = SideloadTiers.filterByUnlockedTiers(fullVocab, unlockedTiers);

    vocabMap = new Map();
    for (const entry of filtered) {
      // Skip entries with no translation yet (tr === null while translation is pending)
      if (!entry.tr) continue;
      vocabMap.set(entry.en.toLowerCase(), {
        tr: entry.tr,
        tier: entry.tier,
      });
    }

    const maxTier = unlockedTiers.length ? Math.max(...unlockedTiers) : 0;
    console.log(`[Sideload] Active: ${vocabMap.size} words, tier ${maxTier} unlocked, density ${(currentDensity * 100).toFixed(0)}%`);
  }

  /**
   * Check if a node is inside an excluded element.
   */
  function isExcluded(node) {
    let current = node.parentElement;
    while (current) {
      if (EXCLUDED_TAGS.has(current.tagName)) return true;
      if (current.classList?.contains('sideload-word')) return true;
      if (current.classList?.contains('sideload-tooltip')) return true;
      if (current.isContentEditable) return true;
      current = current.parentElement;
    }
    return false;
  }

  /**
   * Check if a word looks like a proper noun based on its position in text.
   */
  function isProbablyProperNoun(word, fullText, matchIndex) {
    if (!LOOKS_LIKE_PROPER_NOUN.test(word)) return false;

    const before = fullText.slice(0, matchIndex).trimEnd();
    if (before.length === 0) return false;

    const lastChar = before[before.length - 1];
    if ('.!?'.includes(lastChar)) return false;

    return true;
  }

  /**
   * Collect all text nodes under a root element.
   */
  function collectTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
        if (isExcluded(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node;
    while ((node = walker.nextNode())) {
      nodes.push(node);
    }
    return nodes;
  }

  /**
   * Find all single-word matches in a text node.
   * Returns array of match objects: { word, wordLower, entry, index, length }
   */
  function findMatches(text) {
    const matches = [];
    WORD_RE.lastIndex = 0;
    let match;

    while ((match = WORD_RE.exec(text)) !== null) {
      const word = match[1];
      const wordLower = word.toLowerCase();

      const entry = vocabMap.get(wordLower);
      if (!entry) continue;
      if (isProbablyProperNoun(word, text, match.index)) continue;
      // Skip standalone English articles — not meaningful to replace
      if (ARTICLES.has(wordLower)) continue;
      // Skip cognates where English === Turkish (no value in replacing)
      if (entry.tr.toLowerCase() === wordLower) continue;

      matches.push({
        word,
        wordLower,
        entry,
        index: match.index,
        length: match[0].length,
      });
    }

    return matches;
  }

  /**
   * Build a replacement fragment for a single text node.
   * Applies density sampling to limit how many words get replaced.
   * Returns null if no replacements were made.
   */
  function buildReplacementFragment(textNode) {
    const text = textNode.textContent;

    // Skip text that looks like URLs or emails
    if (URL_RE.test(text) || EMAIL_RE.test(text)) return null;
    URL_RE.lastIndex = 0;
    EMAIL_RE.lastIndex = 0;

    // Find all potential matches
    const allMatches = findMatches(text);
    if (allMatches.length === 0) return null;

    // Apply density sampling
    const selectedMatches = SideloadTiers.applyDensity(allMatches, currentDensity);
    if (selectedMatches.length === 0) return null;

    // Sort by index so we process left-to-right
    selectedMatches.sort((a, b) => a.index - b.index);

    // Build fragment
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    for (const m of selectedMatches) {
      // Add text before this match
      if (m.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
      }

      // Create replacement span
      const span = document.createElement('span');
      const isKnown = knownWords.has(m.wordLower);
      const isStruggling = !isKnown && strugglingWords.has(m.wordLower);
      let cls = 'sideload-word';
      if (isKnown) cls += ' sideload-word--known';
      if (isStruggling) cls += ' sideload-word--struggling';
      span.className = cls;
      span.dataset.tier = m.entry.tier;
      span.dataset.original = m.word;
      span.dataset.tr = m.entry.tr;
      span.textContent = m.entry.tr;

      fragment.appendChild(span);
      lastIndex = m.index + m.length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    return fragment;
  }

  /**
   * Run replacement on all text nodes under a root.
   */
  function replaceWords(root = document.body) {
    if (!vocabMap || vocabMap.size === 0 || !enabled) return;

    const textNodes = collectTextNodes(root);

    // Batch: compute all replacements first, then apply
    const replacements = [];
    for (const node of textNodes) {
      const fragment = buildReplacementFragment(node);
      if (fragment) {
        replacements.push({ node, fragment });
      }
    }

    // Apply all at once
    for (const { node, fragment } of replacements) {
      node.parentNode.replaceChild(fragment, node);
    }

    if (replacements.length > 0) {
      console.log(`[Sideload] Replaced words in ${replacements.length} text nodes`);
    }
  }

  /**
   * Check if the current domain is blacklisted.
   */
  async function isDomainBlacklisted() {
    try {
      const blacklist = await SideloadStorage.getSetting('blacklist', '');
      if (!blacklist) return false;
      const domains = blacklist.split(/[\n,]/).map((d) => d.trim().toLowerCase()).filter(Boolean);
      const currentHost = window.location.hostname.toLowerCase();
      return domains.some((d) => currentHost === d || currentHost.endsWith('.' + d));
    } catch (_) {
      return false;
    }
  }

  /**
   * MutationObserver: watch for new DOM nodes and replace words in them.
   */
  function observeDynamicContent() {
    const observer = new MutationObserver((mutations) => {
      if (!vocabMap || vocabMap.size === 0 || !enabled) return;

      const nodesToProcess = [];
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE
            && !node.classList?.contains('sideload-word')
            && !node.classList?.contains('sideload-tooltip')) {
            nodesToProcess.push(node);
          }
        }
      }

      if (nodesToProcess.length === 0) return;

      // Disconnect before replacing to prevent self-triggered mutations
      observer.disconnect();
      for (const node of nodesToProcess) {
        replaceWords(node);
      }
      observer.observe(document.body, { childList: true, subtree: true });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return observer;
  }

  /**
   * Initialize: load vocab, compute tiers, run replacement, observe dynamic content.
   */
  async function init() {
    if (initialized) return;
    initialized = true;

    // Check domain blacklist before doing any work
    if (await isDomainBlacklisted()) {
      console.log('[Sideload] Domain is blacklisted — skipping');
      return;
    }

    await loadVocabulary();
    await rebuildVocabMap();

    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        replaceWords();
        // Delay observer setup to next task — lets queued MutationObserver
        // microtasks from replaceWords() drain first, preventing self-observation
        setTimeout(() => observeDynamicContent(), 0);
      });
    } else {
      setTimeout(() => {
        replaceWords();
        setTimeout(() => observeDynamicContent(), 0);
      }, 0);
    }
  }

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SET_ENABLED') {
      enabled = message.enabled;
      if (enabled) replaceWords();
    }

    if (message.type === 'SETTINGS_CHANGED') {
      // Rebuild vocab map with new settings, then re-run
      rebuildVocabMap().then(() => {
        // Note: already-replaced words stay; new density applies to future replacements
      });
    }
  });

  init();
})();
