# Vocabulary status — TRANSLATION PENDING

`vocabulary.json` holds **3661 entries** in the Turkish schema:

```json
{ "en": "be", "tr": null, "tier": 1 }
```

- `en` — English source word (frequency-ranked)
- `tr` — Turkish translation, **currently `null` for every entry**
- `tier` — 1–5, by English-word frequency (CEFR A1→C1); language-independent, do not change

## What's done
Schema migrated from the Spanish fork (`{en, es, tier, gender}` → `{en, tr, tier}`): Spanish
translations dropped, grammatical gender removed (Turkish has none), `tr` nulled.

## What's left (follow-up data task)
Fill `tr` for all 3661 entries (English → Turkish), preserving `tier`. Then a native Turkish
review pass. Until then the extension loads but **replaces nothing** (code skips `tr === null`).

Regenerate the schema from a Spanish-shaped source with `scripts/migrate-vocab-schema.py`.
