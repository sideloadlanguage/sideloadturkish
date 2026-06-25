---
title: "refactor: Port Sideload Spanish extension to Turkish (code/branding; vocab + sync deferred)"
type: refactor
date: 2026-06-25
depth: deep
status: ready
target_repo: sideloadlanguage/sideloadturkish
---

# refactor: Port Sideload Spanish extension to Turkish

**Target repo:** `sideloadlanguage/sideloadturkish` (the browser-extension repo, distinct from
the marketing site `sideloadturkish.com`). All paths below are relative to that repo.

## Summary

The `sideloadlanguage/sideloadturkish` repo is a **verbatim fork of the Sideload Spanish
extension** — every file still carries Spanish branding, the Spanish vocabulary, grammatical
gender, and the `es` data key. This plan does a **full code/branding/structure port to
Turkish** in one pass, with two pieces explicitly deferred per the scoping decision:

- **Vocabulary translation deferred.** `vocabulary.json` holds 3661 `{en, es, tier, gender}`
  entries. This plan migrates the *schema* (drop `gender`, rename `es`→`tr`, null the `tr`
  values) so the data is Turkish-ready, but does **not** translate the 3661 English words —
  that is a separate data-generation task. The extension will be structurally complete and
  runnable but will not replace words until the vocab is filled.
- **Sync backend deferred (waitlist).** Matching the marketing site's posture, cross-device
  sync stays idea-stage. The Spanish Fermyon sync host is removed from the manifest; sync code
  remains dormant.

Two language facts drive the port: **Turkish has no grammatical gender** (drop the gender
feature end-to-end, like the site did) and **tier assignment is by English-word frequency**
(language-independent → tiers and CEFR labels carry over unchanged).

---

## Problem Frame

A fork was taken from the Spanish extension; the repo was renamed but no content localized.
The whole franchise (`sideloadchinese` too) sits as raw Spanish forks. Goal: a clean
Turkish-branded extension with Spanish-specific concepts (gender, `es` key, Spanish strings,
Spanish vocab, Spanish sync host) removed or converted, leaving exactly one well-defined
follow-up (vocab translation) and one deferred capability (sync).

This is a mechanical+structural refactor with one deliberate behavioral simplification
(gender removal) and one schema migration (`es`→`tr`, gender dropped).

---

## Requirements

- **R1** — All user-visible "Spanish"/"español" branding → Turkish/Türkçe (manifest, popup,
  tooltips, promo tiles, docs).
- **R2** — Grammatical gender removed end-to-end: delete `scripts/assign-gender.py`, drop the
  `gender` field from the vocab schema, and remove all gender code paths (replacer, tooltip,
  merge, sync, service-worker).
- **R3** — Vocab data key renamed `es`→`tr` across data and all code/tests that read it.
- **R4** — `vocabulary.json` schema migrated to `{en, tr, tier}` with `tr: null` for every
  entry (translation deferred); tier values preserved unchanged.
- **R5** — Sync backend deferred: remove the Spanish Fermyon host from `manifest.json`
  `host_permissions`; sync code stays present but unwired. No Turkish backend stood up.
- **R6** — Repo structure/docs de-Spanished: spec dirs, eidos specs, memory notes, README,
  and `.github` workflow references renamed Spanish→Turkish where user-facing or
  contract-bearing.
- **R7** — Test suite reflects the new schema (gender gone, `tr` key); replacement e2e tests
  that need real vocab use a small fixture or are marked pending until vocab lands.
- **R8** — No residual `spanish`/`español`/`"es"` data-key/`gender` token remains in shipped
  extension code (`sideload/`), excluding the deferred-vocab placeholder and historical
  changelog/memory entries.

---

## Key Technical Decisions

- **KTD1 — Schema migration nulls `tr`, doesn't translate.** Per the deferred-translation
  decision, the data port rewrites each entry `{en, es, tier, gender}` →
  `{en, tr: null, tier}`. The follow-up task fills `tr`. Nulling (vs. leaving Spanish values
  under a `tr` key) prevents shipping mislabeled Spanish-as-Turkish data. Code must treat
  `tr === null` as "no replacement available" and skip gracefully.
- **KTD2 — Remove gender code, not just gender data.** Same call as the site. Delete
  `assign-gender.py`; strip the `gender` field, the tooltip gender line, the merge/sync gender
  handling, and any replacer gender logic (e.g. article-noun compound replacement, which is a
  Spanish gendered-article feature with no Turkish analog). Article-noun compound logic is
  Spanish-specific — remove it rather than port it.
- **KTD3 — Rename `es`→`tr` everywhere.** The data key and every `entry.es` / `'es'` read
  becomes `tr`. Honest naming; mirrors the `data-es`→`data-tr` rename already done on the
  marketing site.
- **KTD4 — Tiers untouched.** Tier numbers come from English-word frequency, independent of
  target language. `lib/tiers.js` density/threshold/CEFR-label logic ports as-is (only its
  Spanish header comment changes).
- **KTD5 — Sync deferred via host removal, code retained.** Drop the Fermyon
  `host_permissions` entry so the extension requests no Spanish-backend network access.
  `lib/sync.js` / `lib/crypto.js` / `lib/merge.js` stay in the tree (dormant) so a future sync
  launch is a re-wire, not a rebuild. Note: gender removal still touches `merge.js`/`sync.js`
  schema even though sync is dormant.
- **KTD6 — Article-noun compound feature dropped.** The Spanish extension replaces
  article+noun compounds using gender (`el/la`). Turkish has no articles or gender — delete
  this path (`memory/plan - …article-noun compound replacement.md` becomes historical).

---

## Output Structure (shipped extension, post-port)

```
sideload/
  manifest.json            # Turkish name/description, no Fermyon host
  data/vocabulary.json     # {en, tr:null, tier} × 3661 (tr filled by follow-up)
  content/replacer.js      # tr key, no gender, no article-noun compound
  content/tooltip.js       # tr key, no gender line
  content/styles.css       # unchanged
  lib/tiers.js             # unchanged logic, Turkish header
  lib/merge.js             # gender field dropped from merge schema
  lib/sync.js              # dormant, gender dropped
  lib/storage.js           # tr key if it persists translations
  lib/struggling.js        # branding only
  lib/crypto.js            # unchanged
  popup/                   # Turkish strings
  background/service-worker.js  # no gender
  scripts/                 # assign-gender.py DELETED
```

---

## Implementation Units

### U1. Vocabulary schema migration (data)

**Goal:** Convert `vocabulary.json` to the Turkish-ready schema, translation deferred.

**Requirements:** R3, R4

**Dependencies:** none

**Files:** `sideload/data/vocabulary.json`, plus a one-shot transform script
`scripts/migrate-vocab-schema.py` (new; replaces the deleted `assign-gender.py` role)

**Approach:** For each of the 3661 entries, map `{en, es, tier, gender}` →
`{en, tr: null, tier}`. Drop `es` and `gender` keys. Preserve `en` and `tier` exactly. Write
the script to be idempotent and re-runnable. Record the count migrated. Leave a top-level
note (sidecar `data/VOCAB-STATUS.md`) stating translation is pending and the schema.

**Patterns to follow:** Existing `scripts/assign-gender.py` JSON-load/transform/dump shape
(the file being deleted) — reuse its IO pattern.

**Test scenarios:**
- Happy path: every output entry has exactly keys `en, tr, tier`; `tr is null`; `tier`
  unchanged from source.
- Edge: entry count stays 3661; no duplicate `en` introduced.
- Idempotent: running the script twice yields identical output.

**Verification:** `python3 -c` asserts all 3661 entries match `{en, tr, tier}` with `tr` null
and tiers preserved; no `es`/`gender` keys remain.

---

### U2. Remove gender feature across code

**Goal:** Delete grammatical-gender logic everywhere it appears.

**Requirements:** R2

**Dependencies:** U1 (schema no longer carries `gender`)

**Files:** `sideload/content/replacer.js`, `sideload/content/tooltip.js`,
`sideload/lib/merge.js`, `sideload/lib/sync.js`,
`sideload/background/service-worker.js`, delete `scripts/assign-gender.py`

**Approach:** Remove every `gender` read/branch (replacer ~13, tooltip ~6, merge ~5,
service-worker ~2, sync ~1). In the tooltip, delete the masculine/feminine line (mirrors the
site). In `merge.js`/`sync.js`, drop `gender` from the persisted/merged record shape. Remove
the **article-noun compound replacement** path in `replacer.js` (Spanish gendered-article
feature; no Turkish analog) per KTD6. Delete `scripts/assign-gender.py`.

**Execution note:** Behavior-changing. After edits, load the unpacked extension and confirm
the tooltip renders with no gender line and replacement still runs (against a fixture vocab,
since real `tr` is null).

**Test scenarios:**
- Tooltip shows original → translation → tier → action, no gender line.
- Merge of two progress records ignores/omits gender without error.
- Replacer no longer attempts article-noun compounding.
- No reference to `gender` or `assign-gender` remains in `sideload/`.

**Verification:** `grep -rn gender sideload/` (excluding tests' historical fixtures) returns
nothing; extension loads; tooltip correct.

---

### U3. Rename `es`→`tr` data key across code

**Goal:** Every translation-field read uses `tr`.

**Requirements:** R3

**Dependencies:** U1

**Files:** `sideload/content/replacer.js`, `sideload/content/tooltip.js`,
`sideload/popup/popup.js`, `sideload/lib/storage.js` (if it persists the translation),
relevant `sideload/test/**` fixtures/assertions

**Approach:** Replace `entry.es` / `'es'` / `"es"` reads with `tr` (replacer ~7, tooltip ~1,
popup ~2). Guard for `tr === null` (skip replacement) per KTD1. Update any test fixtures that
embed `es`.

**Test scenarios:**
- Replacer reads `entry.tr`; when `tr` is null, the word is left as English (no crash, no
  empty render).
- Tooltip translation line reads from `tr`.
- No `\bes\b` data-key reference remains in `sideload/` non-historical code.

**Verification:** `grep -rnE "\.es\b|'es'|\"es\"" sideload/ --include='*.js'` returns only
non-data-key matches (e.g. words containing "es"); manual confirm.

---

### U4. Manifest, package, and branding strings

**Goal:** Turkish branding in all user-visible strings and package metadata.

**Requirements:** R1

**Dependencies:** none

**Files:** `sideload/manifest.json`, `sideload/package.json`, `sideload/popup/popup.html`,
`sideload/popup/popup.js`, `sideload/content/tooltip.js`,
`sideload/scripts/make-marquee-tile.html`, `sideload/scripts/make-promo-tile.html`,
`sideload/lib/*.js` header comments

**Approach:** `manifest.json` name "Sideload Spanish"→"Sideload Turkish", description →
"Learn Turkish while browsing — …". `package.json` name/description. Popup UI copy, tooltip
CEFR labels (keep A1–C1), promo/marquee tile text → Turkish/Türkçe. Emit Turkish chars
(ç,ü,ş,ğ,ı,ö,İ) as UTF-8. Consider resetting `version` to `0.1.0` for a fresh Turkish line
(open question).

**Test scenarios:** Test expectation: none for static strings — covered by R8 grep. Popup
smoke: loads and shows Turkish copy.

**Verification:** `grep -rliE 'spanish|español' sideload/ --include='*.js' --include='*.html'
--include='*.json'` (excluding historical/test) returns nothing; popup renders Turkish.

---

### U5. Defer sync backend (remove Spanish host)

**Goal:** Extension requests no Spanish sync-backend network access; sync stays dormant.

**Requirements:** R5

**Dependencies:** none

**Files:** `sideload/manifest.json`

**Approach:** Remove the `host_permissions` entry
`https://sideload-sync-0sfsjx4d.fermyon.app/*`. Leave `lib/sync.js`/`lib/crypto.js` in place
(unwired). If the popup exposes a sync toggle, gate or hide it behind a "waitlist/coming
soon" state to match the marketing site.

**Test scenarios:**
- Manifest has no Fermyon host permission; extension still loads with only `storage`.
- No code path makes a network request on normal use.

**Verification:** `grep -rn fermyon sideload/manifest.json` returns nothing; load extension,
confirm no host-permission prompt beyond storage.

---

### U6. Repo structure and docs de-Spanish

**Goal:** Rename Spanish-named structure, specs, and docs to Turkish.

**Requirements:** R6

**Dependencies:** none

**Files:** `.start/specs/001-sideload-spanish-landing-page/` (rename + content),
`eidos/spec - sideload …`, `eidos/seed.md`, `memory/*spanish*`, top-level `README*`,
`.github/workflows/setup-dns.yml` and other workflows referencing Spanish domains/repo

**Approach:** Rename the spec directory and update "Spanish"→"Turkish" in spec/eidos/readme
prose and domain references (sideloadspanish→sideloadturkish, sideloadspanish.com→
sideloadturkish.com). In `.github/workflows`, update any hardcoded Spanish repo/domain/secret
names. Leave historical `memory/solved - …` entries as-is (they record real past events) but
fix forward-looking docs.

**Execution note:** `.github/workflows` are an external-contract surface — verify renamed
secrets/domains actually exist before relying on them (ties to the marketing-site follow-ups:
addon slug, DNS).

**Test scenarios:** Test expectation: none — docs/structure. CI workflows lint/parse after
edits.

**Verification:** No `sideload-spanish-landing-page` dir remains; workflows still valid YAML;
forward-looking docs say Turkish.

---

### U7. Test suite alignment

**Goal:** Tests pass against the new schema; vocab-dependent e2e handled.

**Requirements:** R7

**Dependencies:** U1, U2, U3

**Files:** `sideload/test/unit/merge.test.js`, `sideload/test/e2e/*.spec.js`,
`sideload/test/e2e/extension.fixture.js`, `sideload/playwright.config.js` (if needed)

**Approach:** Update unit tests that assert `gender` (merge) and `es` (fixtures) to the new
schema. For e2e replacement specs that need real translations, point them at a small **fixture
vocabulary** (a handful of `{en, tr, tier}` entries) instead of the null-filled production
vocab, OR mark them `test.skip` with a `// pending: vocab translation` note until the
follow-up lands. Pick fixture-injection if the harness already supports a test vocab; else
skip-with-note.

**Execution note:** Characterization-first — run the existing suite before edits to capture
which specs depend on Spanish vocab/gender, then adjust precisely.

**Test scenarios:**
- Unit: merge no longer references gender; passes.
- E2E replacement: runs against fixture vocab (en→tr present) and replaces correctly, proving
  the `tr` path works end-to-end even though production vocab is deferred.
- Suite is green (no silently-skipped feature-bearing tests beyond the documented vocab-pending
  ones).

**Verification:** `npm test` (or the repo's runner) green; skipped specs carry the pending
note.

---

## Scope Boundaries

In scope: full Turkish code/branding/structure port; gender removal; `es`→`tr` rename; vocab
schema migration (values nulled); sync-host removal; test alignment.

Out of scope (non-goals):
- The marketing site `sideloadturkish.com` — already done, separate repo.

### Deferred to Follow-Up Work
- **Vocabulary translation (the big one):** fill `tr` for all 3661 entries (en→tr), then a
  native Turkish review pass. This is its own data task — choose LLM batch vs MT API at that
  time.
- **Sync backend:** stand up or wire a Turkish sync host if/when the waitlist validates demand.
- **AMO/Chrome Web Store submission:** publish the `sideload-turkish` add-on (the marketing
  site already links to this slug).
- **Turkish-morphology question:** decide whether naive word replacement is acceptable for an
  agglutinative language or whether the replacement strategy needs suffix-awareness (raised in
  the site's `docs/TURKISH-LOCALIZATION-REVIEW.md`).

---

## Open Questions

- Reset extension `version` to `0.1.0` for a fresh Turkish line, or keep Spanish's `0.1.5`?
  (Leaning fresh `0.1.0`.) — resolve at U4.
- Does the e2e harness already support injecting a fixture vocabulary, or must tests be
  skip-with-note? — resolve at U7 by reading `extension.fixture.js`.

---

## Risks & Dependencies

- **Null vocab makes the extension visibly do nothing** until translation lands. Acceptable
  per scope, but the popup/marketing should not imply it's functional yet. Mitigation: U5's
  waitlist/coming-soon framing + `data/VOCAB-STATUS.md`.
- **Article-noun compound removal (KTD6)** may touch more of `replacer.js` than the raw gender
  count suggests; treat U2 as the riskiest unit and verify replacement still runs.
- **`.github/workflows` external contracts** (U6) may reference Spanish secrets/domains that
  don't exist for Turkish — verify before trusting CI.

---

## Verification (whole-plan)

`grep -rniE 'spanish|español|assign-gender|fermyon' sideload/ --include='*.js' --include='*.html' --include='*.json'`
returns nothing (excluding historical `memory/` and test fixtures intentionally retained).
`vocabulary.json` is 3661 × `{en, tr:null, tier}`. Extension loads with only `storage`
permission; tooltip has no gender line; replacement works against a fixture vocab. Test suite
green with documented pending specs.
