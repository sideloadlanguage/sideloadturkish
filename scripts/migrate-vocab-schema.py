#!/usr/bin/env python3
"""
Migrate vocabulary.json from the Spanish schema to the Turkish schema.

  {en, es, tier, gender}  ->  {en, tr, tier}

- Drops `es` (Spanish translation) and `gender` (Turkish has no grammatical gender).
- Adds `tr` set to null — translations are filled by a separate data task.
- Preserves `en` and `tier` exactly. Entry order and count unchanged.

Idempotent: re-running on already-migrated data is a no-op (tr stays null).
"""

import json

VOCAB_PATH = 'sideload/data/vocabulary.json'


def migrate(entries):
    out = []
    for e in entries:
        out.append({'en': e['en'], 'tr': e.get('tr'), 'tier': e['tier']})
    return out


def main():
    with open(VOCAB_PATH) as f:
        vocab = json.load(f)

    migrated = migrate(vocab)

    # Invariants
    assert len(migrated) == len(vocab), 'entry count changed'
    assert all(set(e.keys()) == {'en', 'tr', 'tier'} for e in migrated), 'bad keys'
    assert all(e['tr'] is None for e in migrated), 'tr must be null pending translation'

    with open(VOCAB_PATH, 'w') as f:
        json.dump(migrated, f, indent=2, ensure_ascii=False)
        f.write('\n')

    filled = sum(1 for e in migrated if e['tr'] is not None)
    print(f'migrated {len(migrated)} entries -> {{en, tr, tier}}; tr filled: {filled}/{len(migrated)}')


if __name__ == '__main__':
    main()
