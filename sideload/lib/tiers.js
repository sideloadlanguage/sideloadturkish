// Sideload Turkish — Tier System
// Tier unlock logic and replacement density scaling.

const SideloadTiers = (() => {
  const TIER_COUNT = 5;
  const UNLOCK_THRESHOLD = 0.80; // 80% known to unlock next tier

  // Density scaling: what % of eligible words get replaced per tier level
  const DENSITY_BY_TIER = {
    1: 0.05,  //  5% — gentle introduction
    2: 0.10,  // 10%
    3: 0.15,  // 15%
    4: 0.22,  // 22%
    5: 0.30,  // 30% — full immersion
  };

  const TIER_LABELS = {
    1: 'A1 — Beginner',
    2: 'A2 — Elementary',
    3: 'B1 — Intermediate',
    4: 'B2 — Upper Intermediate',
    5: 'C1 — Advanced',
  };

  /**
   * Count total words per tier in the vocabulary.
   * @param {Array<{en: string, tr: string, tier: number}>} vocabulary
   * @returns {Object<number, number>} tier → total count
   */
  function countWordsPerTier(vocabulary) {
    const counts = {};
    for (const entry of vocabulary) {
      counts[entry.tier] = (counts[entry.tier] || 0) + 1;
    }
    return counts;
  }

  /**
   * Determine which tiers are unlocked based on progress.
   * Tier 1 is always unlocked. Subsequent tiers unlock when the previous
   * tier reaches UNLOCK_THRESHOLD known percentage.
   *
   * @param {Object} progress - From SideloadStorage.getProgress()
   * @param {Object<number, number>} wordsPerTier - Total vocab words per tier
   * @returns {Set<number>} Set of unlocked tier numbers
   */
  function getUnlockedTiers(progress, wordsPerTier) {
    const unlocked = new Set([1]);

    for (let tier = 1; tier < TIER_COUNT; tier++) {
      const totalInTier = wordsPerTier[tier] || 0;
      if (totalInTier === 0) continue;

      const knownInTier = progress.tiers[tier]?.known || 0;
      const pct = knownInTier / totalInTier;

      if (pct >= UNLOCK_THRESHOLD) {
        unlocked.add(tier + 1);
      } else {
        break; // Tiers unlock sequentially — can't skip
      }
    }

    return unlocked;
  }

  /**
   * Get the current effective density based on the highest unlocked tier.
   * User density override (from settings) takes precedence if set.
   *
   * @param {Set<number>} unlockedTiers
   * @param {number|null} userOverride - User's density slider value (0-1), or null
   * @returns {number} Density between 0 and 1
   */
  function getDensity(unlockedTiers, userOverride) {
    if (userOverride !== null && userOverride !== undefined) {
      return Math.max(0, Math.min(1, userOverride));
    }

    const maxTier = Math.max(...unlockedTiers);
    return DENSITY_BY_TIER[maxTier] || DENSITY_BY_TIER[1];
  }

  /**
   * Filter vocabulary to only include words from unlocked tiers.
   * @param {Array<{en: string, tr: string, tier: number}>} vocabulary
   * @param {Set<number>} unlockedTiers
   * @returns {Array<{en: string, tr: string, tier: number}>}
   */
  function filterByUnlockedTiers(vocabulary, unlockedTiers) {
    return vocabulary.filter((entry) => unlockedTiers.has(entry.tier));
  }

  /**
   * Apply density sampling: given a list of match positions, keep only
   * a random subset according to the density ratio.
   * Uses a seeded approach per-page to keep replacements stable on re-render.
   *
   * @param {Array<any>} matches - Array of potential replacements
   * @param {number} density - Fraction to keep (0-1)
   * @returns {Array<any>} Subset of matches
   */
  function applyDensity(matches, density) {
    if (density >= 1) return matches;
    if (density <= 0) return [];

    const targetCount = Math.max(1, Math.round(matches.length * density));

    // Deterministic shuffle using simple hash — keeps results stable per page load
    const shuffled = [...matches];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = (i * 2654435761) % (i + 1); // Knuth multiplicative hash
      const temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }

    return shuffled.slice(0, targetCount);
  }

  /**
   * Get tier readiness status factoring in struggling words.
   * @param {number} tier
   * @param {Object} progress - From SideloadStorage.getProgress()
   * @param {Object<number, number>} wordsPerTier
   * @param {Array} strugglingWords - From SideloadStorage.getStrugglingWords()
   * @returns {'locked'|'green'|'yellow'|'grey'} Readiness status
   *   green: 80%+ known, few struggling words (< 5 in this tier)
   *   yellow: 80%+ known, but 5+ struggling words in this tier
   *   grey: below 80% known
   *   locked: tier not yet unlocked
   */
  function getTierReadiness(tier, progress, wordsPerTier, strugglingWords) {
    const totalInTier = wordsPerTier[tier] || 0;
    if (totalInTier === 0) return 'locked';

    const knownInTier = progress.tiers[tier]?.known || 0;
    const pct = knownInTier / totalInTier;

    if (pct < UNLOCK_THRESHOLD) return 'grey';

    // Count struggling words in this tier
    const strugglingInTier = strugglingWords.filter((w) => w.tier === tier).length;
    if (strugglingInTier >= 5) return 'yellow';

    return 'green';
  }

  return {
    TIER_COUNT,
    UNLOCK_THRESHOLD,
    DENSITY_BY_TIER,
    TIER_LABELS,
    countWordsPerTier,
    getUnlockedTiers,
    getDensity,
    filterByUnlockedTiers,
    applyDensity,
    getTierReadiness,
  };
})();
