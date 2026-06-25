/**
 * Regression test: replaced words must not be re-replaced on second scan.
 * Bug: "set" → "establecer" then re-scan turns data-original into "establecer".
 */
import { test, expect } from './extension.fixture.js';

const BASE_URL = 'http://localhost:8384';

// pending: vocab translation (tr:null until filled). See data/VOCAB-STATUS.md.
test.describe.skip('Double replacement prevention (pending vocab translation)', () => {
  test('data-original contains English word, not Spanish', async ({ extensionPage }) => {
    await extensionPage.goto(`${BASE_URL}/page-with-nouns.html`);
    await extensionPage.waitForSelector('.sideload-word', { timeout: 10_000 });

    // Check ALL replaced words: data-original must differ from data-es
    const results = await extensionPage.evaluate(() => {
      const spans = document.querySelectorAll('.sideload-word');
      return Array.from(spans).slice(0, 20).map((s) => ({
        original: s.dataset.original,
        es: s.dataset.es,
        text: s.textContent,
      }));
    });

    for (const r of results) {
      if (r.original === r.es) {
        throw new Error(
          `Bug: data-original="${r.original}" === data-es="${r.es}" (should be English vs Spanish)`
        );
      }
    }
  });

  test('data-original survives a second replaceWords pass', async ({ extensionPage }) => {
    await extensionPage.goto(`${BASE_URL}/page-with-nouns.html`);
    await extensionPage.waitForSelector('.sideload-word', { timeout: 10_000 });

    // Force a second replacement pass from inside the content script context
    await extensionPage.evaluate(() => {
      // Access the content script's replaceWords by dispatching a custom event
      // that the content script listens for, OR directly inject a re-scan
      const spans = document.querySelectorAll('.sideload-word');
      // Simulate what happens when dynamic content arrives:
      // wrap existing paragraphs in a new div (triggers MutationObserver)
      const p = document.querySelector('#basic');
      if (p) {
        const wrapper = document.createElement('div');
        wrapper.id = 'rescan-wrapper';
        p.parentNode.insertBefore(wrapper, p);
        wrapper.appendChild(p);
      }
    });

    // Wait for MutationObserver to process
    await extensionPage.waitForTimeout(1000);

    // Check: original should still be English
    const results = await extensionPage.evaluate(() => {
      const spans = document.querySelectorAll('.sideload-word');
      return Array.from(spans).slice(0, 20).map((s) => ({
        original: s.dataset.original,
        es: s.dataset.es,
        text: s.textContent,
        parent: s.parentElement?.className || 'none',
      }));
    });

    console.log('After rescan:', JSON.stringify(results, null, 2));

    for (const r of results) {
      if (r.original === r.es) {
        throw new Error(
          `Double replacement after rescan: data-original="${r.original}" === data-es="${r.es}"`
        );
      }
    }
  });
});
