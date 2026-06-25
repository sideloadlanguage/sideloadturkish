/**
 * Take Chrome Web Store screenshots using Playwright.
 * Run: node scripts/take-screenshots.js
 *
 * Produces:
 *   store/screenshot-1-replacement.png  — page with replaced words
 *   store/screenshot-2-tooltip.png      — tooltip on hover
 *   store/screenshot-3-popup.png        — popup dashboard
 */
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

const EXTENSION_PATH = path.resolve(import.meta.dirname, '..');
const STORE_DIR = path.resolve(EXTENSION_PATH, 'store');
const FIXTURE_URL = 'http://localhost:8384/screenshot-demo.html';

async function main() {
  // Start fixture server
  const { execSync, spawn } = await import('child_process');
  const fixturesDir = path.resolve(EXTENSION_PATH, 'test/fixtures');
  const server = spawn('python3', ['-m', 'http.server', '8384', '--directory', fixturesDir], {
    stdio: 'ignore',
    detached: true,
  });
  server.unref();

  // Wait for server to start
  await new Promise((r) => setTimeout(r, 1000));

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sideload-screenshots-'));

  try {
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-first-run',
        '--disable-default-apps',
      ],
      viewport: { width: 1280, height: 800 },
    });

    try {
      const page = await context.newPage();

      // --- Screenshot 1: Page with replaced words ---
      await page.goto(FIXTURE_URL);
      await page.waitForSelector('.sideload-word', { timeout: 10_000 });
      // Small delay for all replacements to render
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: path.join(STORE_DIR, 'screenshot-1-replacement.png'),
        fullPage: false,
      });
      console.log('Screenshot 1: replacement — done');

      // --- Screenshot 2: Tooltip on hover ---
      // Find a replaced word for a nice tooltip
      const wordSpan = page.locator('.sideload-word').first();
      await wordSpan.scrollIntoViewIfNeeded();
      await wordSpan.hover();
      await page.waitForSelector('.sideload-tooltip--visible', { timeout: 3000 });
      await page.waitForTimeout(500); // Let async seen count load
      await page.screenshot({
        path: path.join(STORE_DIR, 'screenshot-2-tooltip.png'),
        fullPage: false,
      });
      console.log('Screenshot 2: tooltip — done');

      // --- Screenshot 3: Popup dashboard ---
      // Get the extension ID from the service worker
      let extensionId;
      for (const sw of context.serviceWorkers()) {
        const url = sw.url();
        if (url.includes('service-worker')) {
          extensionId = new URL(url).hostname;
          break;
        }
      }

      if (extensionId) {
        const popupPage = await context.newPage();
        await popupPage.setViewportSize({ width: 400, height: 600 });
        await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`);
        await popupPage.waitForTimeout(1500); // Let popup render progress
        await popupPage.screenshot({
          path: path.join(STORE_DIR, 'screenshot-3-popup.png'),
          fullPage: false,
        });
        await popupPage.close();
        console.log('Screenshot 3: popup — done');
      } else {
        console.log('Screenshot 3: skipped — could not find extension ID');
      }
    } finally {
      await context.close();
    }

    console.log(`\nScreenshots saved to ${STORE_DIR}/`);
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true });
    try { process.kill(-server.pid); } catch (_) {}
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
