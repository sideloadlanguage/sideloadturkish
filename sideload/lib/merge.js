// Sideload Turkish — Client-Side Merge (G-Set CRDT)
//
// Known-words is a grow-only set. No words are ever removed.
// Per-word merge is deterministic and commutative.
//
// Rules:
//   known       = a OR b           (grow-only flag)
//   seen        = max(a, b)
//   clicked_known = max(a, b)
//   tier        = min(a, b)        (conservative: keep lower tier on conflict)
//
// @param {Array<{ en: string, known: boolean, clicked_known: number, seen: number, tier: number }>} localRecords
// @param {Array<{ en: string, known: boolean, clicked_known: number, seen: number, tier: number }>} remoteRecords
// @returns {Array<{ en: string, known: boolean, clicked_known: number, seen: number, tier: number }>}
/**
 * Merge two arrays of word records into a single deduplicated set.
 */
function mergeWordSets(localRecords, remoteRecords) {
  const merged = new Map();

  for (const record of localRecords) {
    merged.set(record.en, { ...record });
  }

  for (const remote of remoteRecords) {
    const local = merged.get(remote.en);

    if (!local) {
      merged.set(remote.en, { ...remote });
      continue;
    }

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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { mergeWordSets };
}
