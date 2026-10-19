/**
 * Books to Scrape - Ethical Web Scraper
 * Stage: Find all three pages
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const bookSchema = require('./bookSchema');

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
async function getCachedPage(url, cacheFile, metrics) {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  const cachePath = path.join(CACHE_DIR, cacheFile);

  // 1. Return from cache if present (no network delay needed)
  if (fs.existsSync(cachePath)) {
    if (metrics) metrics.cache_hits++;
    const html = fs.readFileSync(cachePath, 'utf-8');
    const sizeBytes = Buffer.byteLength(html, 'utf-8');
    console.log(`[CACHE HIT] ${cacheFile} (${sizeBytes.toLocaleString()} bytes)`);
    return html;
  }

  let response;
  let html;
  for (let attempt = 0; attempt < 2; attempt++) {
    console.log(`[DELAY] Waiting ${RATE_LIMIT_DELAY_MS}ms before request to respect server...`);
    await sleep(RATE_LIMIT_DELAY_MS);
    console.log(`[FETCH] Requesting ${url} (timeout: ${TIMEOUT_MS / 1000}s)`);

    try {
      response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if (err.name === 'TimeoutError' && attempt === 0) continue;
      if (err.name === 'TimeoutError') throw new Error(`Request timed out after ${TIMEOUT_MS / 1000}s for ${url}`);
      throw err;
    }

    if (response.status !== 200) {
      if (response.status >= 500 && attempt === 0) {
        await response.body?.cancel();
        continue;
      }
      const error = new Error(`Fetch failed for ${url} with HTTP status ${response.status} (${response.statusText})`);
      error.status = response.status;
      throw error;
    }

    try {
      html = await response.text();
      break;
    } catch (err) {
      if (err.name === 'TimeoutError' && attempt === 0) continue;
      if (err.name === 'TimeoutError') throw new Error(`Request timed out after ${TIMEOUT_MS / 1000}s for ${url}`);
      throw err;
    }
  }

  if (metrics) metrics.pages_fetched++;
  const sizeBytes = Buffer.byteLength(html, 'utf-8');

  // 3. Save to local disk cache
  fs.writeFileSync(cachePath, html, 'utf-8');
  console.log(`[FETCH] Saved to cache/${cacheFile} (${sizeBytes.toLocaleString()} bytes)`);

  return html;
}

async function getCataloguePage(url, pageNum, metrics) {
  return getCachedPage(url, `catalogue-page-${pageNum}.html`, metrics);
}

/**
 * Crawls catalogue pages up to MAX_CATALOGUE_PAGES following "next" links.
 * Extracts absolute book links and removes duplicates.
 */
async function crawlCatalogue({ metrics = { failed_pages: 0 } } = {}) {
  let currentUrl = START_URL;
  let pagesCrawled = 0;
  const discoveredBooks = [];

  while (currentUrl && pagesCrawled < MAX_CATALOGUE_PAGES) {
    pagesCrawled++;
    let html;
    try {
      html = await getCataloguePage(currentUrl, pagesCrawled, metrics);
    } catch (error) {
      metrics.failed_pages++;
      console.error(`[PAGE FAILED] ${currentUrl}: ${error.message}`);
      currentUrl = pagesCrawled < MAX_CATALOGUE_PAGES
        ? new URL(`/catalogue/page-${pagesCrawled + 1}.html`, BASE_URL).href
        : null;
      continue;
    }
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

    discoveredBooks.push(...pageBookLinks.map((productUrl) => ({ productUrl, sourcePage: currentUrl })));

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
  const uniqueBooks = Array.from(new Map(discoveredBooks.map((book) => {
    const productUrl = new URL(book.productUrl).href;
    return [productUrl, { ...book, productUrl }];
  })).values());
  const uniqueUrls = uniqueBooks.map((book) => book.productUrl);

  // Checkpoint output
  console.log(`catalogue_pages=${pagesCrawled} , discovered=${discoveredBooks.length} , unique_urls=${uniqueUrls.length}`);

  return {
    cataloguePages: pagesCrawled,
    discovered: discoveredBooks.map((book) => book.productUrl),
    uniqueUrls,
    uniqueBooks,
  };
}

async function getBookDetails({ productUrl, sourcePage }, metrics) {
  const cacheName = `${path.basename(path.dirname(new URL(productUrl).pathname))}.html`;
  const cacheFile = `detail-${cacheName}`;
  const html = await getCachedPage(productUrl, cacheFile, metrics);
  const $ = cheerio.load(html);
  const product = $('article.product_page');
  const description = product.find('#product_description').next('p').text().trim() || null;
  const priceText = product.find('.price_color').first().text().trim();

  return {
    title: product.find('h1').first().text().trim(),
    product_url: new URL(productUrl).href,
    price_text: priceText,
    price_gbp: Number(priceText.replace(/,/g, '').replace(/[^\d.]/g, '')),
    availability_text: product.find('.availability').first().text().replace(/\s+/g, ' ').trim(),
    rating_text: (product.find('.star-rating').attr('class') || '').split(/\s+/).find((name) => name !== 'star-rating') || null,
    description,
    source_page: new URL(sourcePage).href,
    fetched_at: fs.statSync(path.join(CACHE_DIR, cacheFile)).mtime.toISOString(),
  };
}

async function main({ extraBooks = [], catalogueBooks, bookDetailsFetcher = getBookDetails } = {}) {
  const startedAt = new Date();
  const metrics = { pages_fetched: 0, cache_hits: 0, valid_records: 0, invalid_records: 0, failed_pages: 0 };
  const outputDir = path.resolve(__dirname, '../output');
  fs.mkdirSync(outputDir, { recursive: true });
  const errors = [];
  const recordsByUrl = new Map();

  let uniqueBooks = [];
  try {
    uniqueBooks = catalogueBooks || (await crawlCatalogue({ metrics })).uniqueBooks;
    const booksByUrl = new Map();
    for (const book of [...uniqueBooks, ...extraBooks]) {
      try {
        const productUrl = new URL(book.productUrl).href;
        if (!booksByUrl.has(productUrl)) booksByUrl.set(productUrl, { ...book, productUrl });
      } catch (error) {
        metrics.failed_pages++;
        errors.push({ product_url: book.productUrl, source_page: book.sourcePage, reason: error.message });
        console.error(`[PAGE FAILED] ${book.productUrl}: ${error.message}`);
      }
    }

    uniqueBooks = Array.from(booksByUrl.values());
    for (const book of uniqueBooks) {
      let record;
      try {
        record = await bookDetailsFetcher(book, metrics);
      } catch (error) {
        metrics.failed_pages++;
        errors.push({ product_url: book.productUrl, source_page: book.sourcePage, reason: error.message });
        console.error(`[PAGE FAILED] ${book.productUrl}: ${error.message}`);
        continue;
      }
      const result = bookSchema.safeParse(record);
      if (result.success) recordsByUrl.set(result.data.product_url, result.data);
      else {
        metrics.invalid_records++;
        errors.push({ record, reason: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') });
      }
    }
  } catch (error) {
    metrics.failed_pages++;
    errors.push({ reason: error.message });
    console.error(`[RUN FAILED] ${error.message}`);
  }

  const records = Array.from(recordsByUrl.values());
  metrics.valid_records = records.length;
  fs.writeFileSync(path.join(outputDir, 'books.json'), `${JSON.stringify(records, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, 'errors.json'), `${JSON.stringify(errors, null, 2)}\n`);
  const report = {
    start_time: startedAt.toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    ...metrics,
  };
  fs.writeFileSync(path.join(outputDir, 'run-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  if (records.length) console.log(JSON.stringify(records[0], null, 2));
  console.log(`detail_pages=${uniqueBooks.length} valid_records=${records.length} invalid_records=${metrics.invalid_records} failed_pages=${metrics.failed_pages}`);
  return report;
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
  getCachedPage,
  crawlCatalogue,
  getBookDetails,
  main,
};
