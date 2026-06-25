# Turkish Language Review — Action Needed (extension)

**Status:** Needs a native/fluent Turkish review before this extension ships.

This extension was **ported from the Sideload Spanish extension** by mechanical
find-and-replace + schema migration (see `docs/plans/2026-06-25-001-refactor-spanish-extension-to-turkish-plan.md`).
Structure, code, and branding are Turkish, but **correctness was driven by porting rules, not
by a Turkish speaker.** This is the checklist for the human pass. (The marketing site has a
parallel review at `sideloadturkish.com/docs/TURKISH-LOCALIZATION-REVIEW.md`.)

## What the port already handled (language-aware decisions)
- **Grammatical gender removed** — Turkish has none. Deleted `scripts/assign-gender.py`, the
  `gender` field, and the tooltip gender line. Also removed the Spanish **article-noun compound**
  feature (`the house → la casa`), which has no Turkish analog (no articles, no gender).
- **`es` → `tr`** data key; CEFR tiers (A1–C1) kept (tier rank is by English frequency,
  language-independent).

## What a Turkish reviewer must verify

### 1. Vocabulary translations (the core — currently empty)
`sideload/data/vocabulary.json` ships **3661 entries with `tr: null`**. The follow-up task fills
them (en → tr). When it does, a Turkish speaker must verify:
- [ ] Each `tr` is the natural, correct Turkish for the English `en` — not a dictionary-literal
      or a Spanish-influenced gloss.
- [ ] **Word form / morphology.** Turkish is agglutinative: nouns take case/possessive/plural
      suffixes and obey vowel harmony depending on grammatical role. The extension swaps single
      words **in isolation** (no surrounding grammar). Decide the convention: bare nominative
      (dictionary form)? And confirm bare forms read acceptably inline in English sentences.
      **This is the central language risk of the whole product for Turkish.**
- [ ] No gendered/articled artifacts left over from Spanish assumptions.
- [ ] Turkish characters (ç, ü, ş, ğ, ı, ö, İ) are correct and render (file is UTF-8).
- [ ] Tier assignment still makes sense — tiers come from English frequency; confirm the Turkish
      translations at tier 1 really are the "first words a learner meets."

### 2. Cognate / no-op skip rule
`replacer.js` skips replacement when `tr.toLowerCase() === en.toLowerCase()` (English == Turkish,
e.g. loanwords like "web", "internet"). Confirm this is the desired behavior for Turkish loanwords
(many English tech words are identical or near-identical in Turkish).

### 3. İ / ı casing
The skip rule and any matching uses `.toLowerCase()`. Turkish dotted/dotless i (İ→i, I→ı) does
**not** lowercase correctly under default JS `.toLowerCase()`. If translations contain I/İ,
matching may misbehave.
- [ ] Verify İ/ı handling in the cognate-skip and any case-folding once real `tr` values exist
      (consider `toLocaleLowerCase('tr')` where Turkish text is compared).

### 4. User-facing strings
The extension UI is English (popup, tooltips, store listing) — confirm that's intended (vs.
localizing the UI itself into Turkish). The only Turkish content is the vocabulary.
- [ ] Store listing (`sideload/store/listing.md`) claims "3,600+ word vocabulary" — don't submit
      to AMO/Chrome until the vocab is actually translated, or the listing overstates.

## Files in scope
`sideload/data/vocabulary.json` (the translations), `sideload/content/replacer.js` (matching +
İ/ı), `sideload/store/listing.md` (claims). Code/branding elsewhere is done.

## Reference
- Port plan: `docs/plans/2026-06-25-001-refactor-spanish-extension-to-turkish-plan.md`
- Vocab status: `sideload/data/VOCAB-STATUS.md`
- Maintainer handoff issue: #1
