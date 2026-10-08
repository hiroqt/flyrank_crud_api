/**
 * Books to Scrape - Ethical Web Scraper
 * Stage: Fetch once, cache once
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://books.toscrape.com';
const USER_AGENT = 'FlyRankInternship-A9/1.0 (+https://github.com/hiroqt/flyrank_crud_api)';
const TIMEOUT_MS = 8000;
const CACHE_DIR = path.resolve(__dirname, '../cache');

/**
 * Retrieves a catalogue page, using local disk cache if available.
 * @param {number} pageNum
 * @returns {Promise<string>} HTML content
 */
async function getCataloguePage(pageNum = 1) {
  // Ensure cache directory exists
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  const cacheFile = `catalogue-page-${pageNum}.html`;
  const cachePath = path.join(CACHE_DIR, cacheFile);

  // 1. Check if cached version exists
  if (fs.existsSync(cachePath)) {
    const html = fs.readFileSync(cachePath, 'utf-8');
    const sizeBytes = Buffer.byteLength(html, 'utf-8');
    console.log(`[CACHE HIT] catalogue-page-${pageNum}.html (${sizeBytes.toLocaleString()} bytes)`);
    return html;
  }

  // 2. Fetch from site if not cached
  const url = `${BASE_URL}/catalogue/page-${pageNum}.html`;
  console.log(`[FETCH] Requesting ${url} (timeout: ${TIMEOUT_MS / 1000}s)`);

  let response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      throw new Error(`Request timed out after ${TIMEOUT_MS / 1000}s`);
    }
    throw err;
  }

  // 3. Strict status code check: only 200 is acceptable
  if (response.status !== 200) {
    throw new Error(`Fetch failed with HTTP status ${response.status} (${response.statusText})`);
  }

  const html = await response.text();
  const sizeBytes = Buffer.byteLength(html, 'utf-8');

  // 4. Save to cache
  fs.writeFileSync(cachePath, html, 'utf-8');
  console.log(`[FETCH] Saved to cache/${cacheFile} (${sizeBytes.toLocaleString()} bytes)`);

  return html;
}

async function main() {
  await getCataloguePage(1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = {
  BASE_URL,
  USER_AGENT,
  TIMEOUT_MS,
  getCataloguePage,
  main,
};
