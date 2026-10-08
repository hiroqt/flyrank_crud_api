/**
 * Books to Scrape - Ethical Web Scraper
 * Stage: Find all three pages
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const BASE_URL = 'https://books.toscrape.com';
const START_URL = `${BASE_URL}/catalogue/page-1.html`;
const USER_AGENT = 'FlyRankInternship-A9/1.0 (+https://github.com/hiroqt/flyrank_crud_api)';
const TIMEOUT_MS = 8000;
const RATE_LIMIT_DELAY_MS = 500;
const MAX_CATALOGUE_PAGES = 3;
const CACHE_DIR = path.resolve(__dirname, '../cache');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retrieves a catalogue page by URL, using local disk cache if available.
 * @param {string} url - Target catalogue URL
 * @param {number} pageNum - Page index (1-based)
 * @returns {Promise<string>} HTML content
 */
async function getCataloguePage(url, pageNum) {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  const cacheFile = `catalogue-page-${pageNum}.html`;
  const cachePath = path.join(CACHE_DIR, cacheFile);

  // 1. Return from cache if present (no network delay needed)
  if (fs.existsSync(cachePath)) {
    const html = fs.readFileSync(cachePath, 'utf-8');
    const sizeBytes = Buffer.byteLength(html, 'utf-8');
    console.log(`[CACHE HIT] ${cacheFile} (${sizeBytes.toLocaleString()} bytes)`);
    return html;
  }

  // 2. Real request -> enforce polite rate limit delay (>= 500ms)
  console.log(`[DELAY] Waiting ${RATE_LIMIT_DELAY_MS}ms before request to respect server...`);
  await sleep(RATE_LIMIT_DELAY_MS);

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
      throw new Error(`Request timed out after ${TIMEOUT_MS / 1000}s for ${url}`);
    }
    throw err;
  }

  if (response.status !== 200) {
    throw new Error(`Fetch failed for ${url} with HTTP status ${response.status} (${response.statusText})`);
  }

  const html = await response.text();
  const sizeBytes = Buffer.byteLength(html, 'utf-8');

  // 3. Save to local disk cache
  fs.writeFileSync(cachePath, html, 'utf-8');
  console.log(`[FETCH] Saved to cache/${cacheFile} (${sizeBytes.toLocaleString()} bytes)`);

  return html;
}

/**
 * Crawls catalogue pages up to MAX_CATALOGUE_PAGES following "next" links.
 * Extracts absolute book links and removes duplicates.
 */
async function crawlCatalogue() {
  let currentUrl = START_URL;
  let pagesCrawled = 0;
  const discoveredUrls = [];

  while (currentUrl && pagesCrawled < MAX_CATALOGUE_PAGES) {
    pagesCrawled++;
    const html = await getCataloguePage(currentUrl, pagesCrawled);
    const $ = cheerio.load(html);

    // Extract book links on this page
    const pageBookLinks = [];
    $('article.product_pod h3 a').each((_, element) => {
      const relHref = $(element).attr('href');
      if (relHref) {
        // Resolve to absolute URL using the standard URL API (never string gluing)
        const absoluteUrl = new URL(relHref, currentUrl).href;
        pageBookLinks.push(absoluteUrl);
      }
    });

    discoveredUrls.push(...pageBookLinks);

    // Follow the site's own "next" pagination link if we haven't reached the limit
    if (pagesCrawled < MAX_CATALOGUE_PAGES) {
      const nextRelHref = $('li.next a').attr('href');
      if (nextRelHref) {
        currentUrl = new URL(nextRelHref, currentUrl).href;
      } else {
        currentUrl = null;
      }
    } else {
      currentUrl = null;
    }
  }

  // Deduplicate URLs
  const uniqueUrls = Array.from(new Set(discoveredUrls));

  // Checkpoint output
  console.log(`catalogue_pages=${pagesCrawled} , discovered=${discoveredUrls.length} , unique_urls=${uniqueUrls.length}`);

  return {
    cataloguePages: pagesCrawled,
    discovered: discoveredUrls,
    uniqueUrls,
  };
}

async function main() {
  await crawlCatalogue();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Scraper Error:', err.message);
    process.exit(1);
  });
}

module.exports = {
  BASE_URL,
  START_URL,
  MAX_CATALOGUE_PAGES,
  getCataloguePage,
  crawlCatalogue,
  main,
};
