// Sideload Turkish — Struggling Word Detection
// Identifies words the user keeps seeing but can't mark as known.

const SideloadStruggling = (() => {
  const DEFAULT_THRESHOLD = 10;

  /**
   * Check if a single word record qualifies as "struggling".
   * @param {{ seen: number, known: boolean }} record
   * @param {number} threshold - Seen count to trigger struggling status
   * @returns {boolean}
   */
  function isStruggling(record, threshold = DEFAULT_THRESHOLD) {
    if (!record) return false;
    return record.seen >= threshold && !record.known;
  }

  /**
   * Filter a list of word records to only struggling words.
   * @param {Array<{ en: string, seen: number, known: boolean }>} records
   * @param {number} threshold
   * @returns {Array} Struggling records sorted by seen count descending
   */
  function getStrugglingWords(records, threshold = DEFAULT_THRESHOLD) {
    return records
      .filter((r) => isStruggling(r, threshold))
      .sort((a, b) => b.seen - a.seen);
  }

  return {
    DEFAULT_THRESHOLD,
    isStruggling,
    getStrugglingWords,
  };
})();
