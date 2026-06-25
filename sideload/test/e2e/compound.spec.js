/**
 * E2E tests for article-noun compound replacement.
 * Verifies: "the house" → "la casa", gendered articles, capitalisation,
 * tooltip gender display, click-marks-noun behaviour.
 */
import { test, expect } from './extension.fixture.js';

const BASE_URL = 'http://localhost:8384';

// Removed for Turkish: article-noun compounds were a Spanish gendered-article feature.
// Turkish has no grammatical gender or articles, so this replacement path was deleted.
test.describe.skip('Article-noun compound replacement (removed for Turkish)', () => {
  test('replaces "the house" with "la casa" as a single span', async ({ extensionPage }) => {
    await extensionPage.goto(`${BASE_URL}/page-with-articles.html`);
    // Wait for content script to run
    await extensionPage.waitForSelector('.sideload-word', { timeout: 10_000 });

    const feminineP = extensionPage.locator('#definite-feminine');
    const span = feminineP.locator('.sideload-word').first();

    // Should be a single span containing the full compound
    await expect(span).toHaveAttribute('data-original', 'The house');
    await expect(span).toHaveAttribute('data-es', 'La casa');
    await expect(span).toHaveAttribute('data-gender', 'f');
    await expect(span).toContainText('La casa');
  });

  test('uses masculine article for masculine nouns', async ({ extensionPage }) => {
    await extensionPage.goto(`${BASE_URL}/page-with-articles.html`);
    await extensionPage.waitForSelector('.sideload-word', { timeout: 10_000 });

    const masculineP = extensionPage.locator('#definite-masculine');
    const spans = masculineP.locator('.sideload-word');

    // "The book" should become "El libro"
    const bookSpan = spans.filter({ hasAttribute: 'data-original' }).filter({ hasText: /libro/ }).first();
    await expect(bookSpan).toHaveAttribute('data-gender', 'm');
  });

  test('handles indefinite articles: a dog → un perro', async ({ extensionPage }) => {
    // Use dense page with many repetitions to ensure density sampling hits at least one
    await extensionPage.goto(`${BASE_URL}/page-dense-articles.html`);
    await extensionPage.waitForSelector('.sideload-word', { timeout: 10_000 });

    // Look for any "un perro" compound on the dense page
    const dogSpan = extensionPage.locator('#indefinite-test .sideload-word')
      .filter({ hasText: /perro/ })
      .first();

    await expect(dogSpan).toBeVisible({ timeout: 5000 });
    // "A dog" at sentence start → "Un perro" (capitalised)
    const text = await dogSpan.textContent();
    expect(text.toLowerCase()).toContain('un perro');
    await expect(dogSpan).toHaveAttribute('data-gender', 'm');
  });

  test('capitalises article at sentence start: The → La/El', async ({ extensionPage }) => {
    await extensionPage.goto(`${BASE_URL}/page-with-articles.html`);
    await extensionPage.waitForSelector('.sideload-word', { timeout: 10_000 });

    // "The city" starts a sentence → should be "La ciudad" (capitalised La)
    const p = extensionPage.locator('#capitalised');
    const citySpan = p.locator('.sideload-word').filter({ hasText: /ciudad/ }).first();

    const text = await citySpan.textContent();
    expect(text).toMatch(/^La /);
  });

  test('standalone article without known noun is left as-is', async ({ extensionPage }) => {
    await extensionPage.goto(`${BASE_URL}/page-with-articles.html`);
    // Wait for replacer to finish
    await extensionPage.waitForTimeout(2000);

    const p = extensionPage.locator('#standalone-article');
    const text = await p.textContent();

    // "The quick brown fox" — "The" should NOT be replaced (no known noun follows)
    // "quick" etc. might be replaced as single words, but "The" should remain
    expect(text).toMatch(/^The /);
  });

  test('tooltip shows gender on hover', async ({ extensionPage }) => {
    await extensionPage.goto(`${BASE_URL}/page-with-articles.html`);
    await extensionPage.waitForSelector('.sideload-word', { timeout: 10_000 });

    const span = extensionPage.locator('#definite-feminine .sideload-word').first();
    await span.hover();

    const tooltip = extensionPage.locator('.sideload-tooltip--visible');
    await expect(tooltip).toBeVisible({ timeout: 3000 });
    await expect(tooltip).toContainText('feminine');
  });

  test('clicking compound marks noun as known, not article', async ({ extensionPage }) => {
    await extensionPage.goto(`${BASE_URL}/page-with-articles.html`);
    await extensionPage.waitForSelector('.sideload-word', { timeout: 10_000 });

    const span = extensionPage.locator('#definite-feminine .sideload-word').first();

    // data-noun should be the noun word (for progress tracking)
    await expect(span).toHaveAttribute('data-noun', 'house');

    // Click to mark known
    await span.click();

    // Should gain the known class
    await expect(span).toHaveClass(/sideload-word--known/, { timeout: 2000 });
  });
});
