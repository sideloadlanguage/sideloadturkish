/**
 * E2E tests for MutationObserver (dynamic content) and domain blacklist.
 */
import { test, expect } from './extension.fixture.js';

const BASE_URL = 'http://localhost:8384';

// pending: vocab translation (tr:null until filled). See data/VOCAB-STATUS.md.
test.describe.skip('Dynamic content replacement (pending vocab translation)', () => {
  test('replaces words in dynamically added DOM nodes', async ({ extensionPage }) => {
    await extensionPage.goto(`${BASE_URL}/page-dynamic.html`);
    await extensionPage.waitForSelector('.sideload-word', { timeout: 10_000 });

    // Static content should be replaced
    const staticSpans = extensionPage.locator('#static-content .sideload-word');
    expect(await staticSpans.count()).toBeGreaterThan(0);

    // Click button to inject new content
    await extensionPage.click('#add-content');

    // Wait for MutationObserver to process the new node
    await extensionPage.waitForSelector('#injected .sideload-word', { timeout: 5000 });

    // Dynamic content should also have replacements
    const dynamicSpans = extensionPage.locator('#injected .sideload-word');
    expect(await dynamicSpans.count()).toBeGreaterThan(0);
  });
});
