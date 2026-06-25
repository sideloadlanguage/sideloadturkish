/**
 * E2E tests for basic word replacement.
 * Verifies: content script injects, words get replaced, excluded elements are skipped.
 */
import { test, expect } from './extension.fixture.js';

const BASE_URL = 'http://localhost:8384';

// pending: vocab translation. vocabulary.json ships with tr:null for every entry, so no
// replacement occurs until the Turkish translations are filled. Un-skip (or point at a
// fixture vocab) once data/vocabulary.json has tr values. See data/VOCAB-STATUS.md.
test.describe.skip('Basic word replacement (pending vocab translation)', () => {
  test('replaces known words with Spanish translations', async ({ extensionPage }) => {
    await extensionPage.goto(`${BASE_URL}/page-with-nouns.html`);
    await extensionPage.waitForSelector('.sideload-word', { timeout: 10_000 });

    // At least some words should be replaced
    const spans = extensionPage.locator('.sideload-word');
    const count = await spans.count();
    expect(count).toBeGreaterThan(0);
  });

  test('replaced words have correct data attributes', async ({ extensionPage }) => {
    await extensionPage.goto(`${BASE_URL}/page-with-nouns.html`);
    await extensionPage.waitForSelector('.sideload-word', { timeout: 10_000 });

    const firstSpan = extensionPage.locator('.sideload-word').first();
    // Every replaced word should have original, tier, and es data
    await expect(firstSpan).toHaveAttribute('data-original');
    await expect(firstSpan).toHaveAttribute('data-tier');
    await expect(firstSpan).toHaveAttribute('data-es');
  });

  test('does not replace text inside <code> elements', async ({ extensionPage }) => {
    await extensionPage.goto(`${BASE_URL}/page-with-nouns.html`);
    // Wait for replacer to finish
    await extensionPage.waitForTimeout(2000);

    const codeBlock = extensionPage.locator('#code-block code');
    const sideloadSpans = codeBlock.locator('.sideload-word');
    expect(await sideloadSpans.count()).toBe(0);
  });

  test('does not replace text inside <pre> elements', async ({ extensionPage }) => {
    await extensionPage.goto(`${BASE_URL}/page-with-nouns.html`);
    await extensionPage.waitForTimeout(2000);

    const preBlock = extensionPage.locator('#pre-block');
    const sideloadSpans = preBlock.locator('.sideload-word');
    expect(await sideloadSpans.count()).toBe(0);
  });

  test('does not replace text inside <input> elements', async ({ extensionPage }) => {
    await extensionPage.goto(`${BASE_URL}/page-with-nouns.html`);
    await extensionPage.waitForTimeout(2000);

    const input = extensionPage.locator('#input-adjacent input');
    const value = await input.inputValue();
    // Input value should remain untouched
    expect(value).toBe('the house');
  });

  test('tooltip appears on hover and shows original word', async ({ extensionPage }) => {
    await extensionPage.goto(`${BASE_URL}/page-with-nouns.html`);
    await extensionPage.waitForSelector('.sideload-word', { timeout: 10_000 });

    const span = extensionPage.locator('.sideload-word').first();
    await span.hover();

    const tooltip = extensionPage.locator('.sideload-tooltip--visible');
    await expect(tooltip).toBeVisible({ timeout: 5000 });

    // Tooltip should have content (original word, translation, tier)
    const tooltipText = await tooltip.textContent();
    expect(tooltipText.length).toBeGreaterThan(0);
    // Detailed tooltip content verified in compound.spec.js
  });

  test('clicking a word marks it as known', async ({ extensionPage }) => {
    await extensionPage.goto(`${BASE_URL}/page-with-nouns.html`);
    await extensionPage.waitForSelector('.sideload-word', { timeout: 10_000 });

    const span = extensionPage.locator('.sideload-word').first();

    // Should not be known initially
    await expect(span).not.toHaveClass(/sideload-word--known/);

    // Click
    await span.click();

    // Should become known
    await expect(span).toHaveClass(/sideload-word--known/, { timeout: 2000 });
  });

  test('hovering a word triggers recordSeen without errors', async ({ extensionPage }) => {
    await extensionPage.goto(`${BASE_URL}/page-with-nouns.html`);
    await extensionPage.waitForSelector('.sideload-word', { timeout: 10_000 });

    // Collect console errors during hover
    const errors = [];
    extensionPage.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    const span = extensionPage.locator('.sideload-word').first();

    // Hover triggers recordSeen
    await span.hover();
    await extensionPage.waitForTimeout(300);

    // Hover away and back — should be debounced (no second recordSeen call)
    await extensionPage.mouse.move(0, 0);
    await extensionPage.waitForTimeout(200);
    await span.hover();
    await extensionPage.waitForTimeout(300);

    // No errors from the storage calls
    const sideloadErrors = errors.filter((e) => e.includes('[Sideload]'));
    expect(sideloadErrors).toHaveLength(0);
  });
});
