const fs = require('node:fs/promises');
const path = require('node:path');
const cheerio = require('cheerio');
const { z } = require('zod');

const ROOT = 'https://books.toscrape.com/';
const USER_AGENT = 'FlyRankInternship-A9/1.0 (+https://github.com/hiroqt/flyrank_crud_api)';
const BookSchema = z.object({
  title: z.string().trim().min(1),
  product_url: z.string().url().refine((value) => value.startsWith('https://')),
  price_text: z.string().trim().min(1),
  price_gbp: z.number().finite().nonnegative(),
  availability_text: z.string().trim().min(1),
  rating_text: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  source_page: z.string().url().refine((value) => value.startsWith('https://')),
  fetched_at: z.string().datetime(),
});

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cacheName = (url) => `${Buffer.from(url).toString('base64url')}.json`;

async function cachedPage(url, cacheDir, fetchImpl, wait) {
  const file = path.join(cacheDir, cacheName(url));
  try {
    const cached = JSON.parse(await fs.readFile(file, 'utf8'));
    return { ...cached, hit: true };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await wait(500);
    try {
      const response = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} for ${url}`);
        error.status = response.status;
        if (response.status >= 500 && attempt === 0) { lastError = error; continue; }
        throw error;
      }
      const page = { html: await response.text(), fetched_at: new Date().toISOString() };
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(file, JSON.stringify(page));
      return { ...page, hit: false };
    } catch (error) {
      lastError = error;
      const timeout = error.name === 'TimeoutError' || error.name === 'AbortError';
      if (!timeout || attempt === 1) throw error;
    }
  }
  throw lastError;
}

function catalogueLinks(html, pageUrl) {
  const $ = cheerio.load(html);
  return $('.product_pod h3 a').map((_, link) => new URL($(link).attr('href'), pageUrl).href).get();
}

function ratingFromClass(className = '') {
  return className.split(/\s+/).find((part) => ['One', 'Two', 'Three', 'Four', 'Five'].includes(part)) || '';
}

function parseBook(html, productUrl, sourcePage, fetchedAt) {
  const $ = cheerio.load(html);
  const area = $('.product_main');
  const title = area.find('h1').first().text().trim();
  const priceText = area.find('.price_color').first().text().trim();
  const price = Number(priceText.replace(/[^\d.]/g, ''));
  const record = {
    title,
    product_url: productUrl,
    price_text: priceText,
    price_gbp: price,
    availability_text: area.find('.availability').first().text().replace(/\s+/g, ' ').trim(),
    rating_text: ratingFromClass(area.find('.star-rating').attr('class')),
    description: $('#product_description').next('p').text().trim() || null,
    source_page: sourcePage,
    fetched_at: fetchedAt,
  };
  return BookSchema.safeParse(record);
}

async function run(options = {}) {
  const root = options.rootUrl || ROOT;
  const cacheDir = options.cacheDir || path.join(__dirname, 'cache');
  const outputDir = options.outputDir || path.join(__dirname, 'output');
  const fetchImpl = options.fetchImpl || fetch;
  const wait = options.wait || pause;
  const start = new Date().toISOString();
  const started = Date.now();
  const report = { start_time: start, duration_ms: 0, pages_fetched: 0, cache_hits: 0, valid_records: 0, invalid_records: 0, failed_pages: 0 };
  const errors = [];
  const books = new Map();
  const catalogueUrls = [1, 2, 3].map((n) => new URL(n === 1 ? 'catalogue/page-1.html' : `catalogue/page-${n}.html`, root).href);
  const detailJobs = [];
  for (const catalogueUrl of catalogueUrls) {
    try {
      const page = await cachedPage(catalogueUrl, cacheDir, fetchImpl, wait);
      report[page.hit ? 'cache_hits' : 'pages_fetched'] += 1;
      detailJobs.push(...catalogueLinks(page.html, catalogueUrl).map((url) => ({ url, source: catalogueUrl })));
    } catch (error) {
      report.failed_pages += 1;
      errors.push({ page: catalogueUrl, reason: error.message });
    }
  }
  for (const { url, source } of detailJobs) {
    if (books.has(url)) continue;
    try {
      const page = await cachedPage(url, cacheDir, fetchImpl, wait);
      report[page.hit ? 'cache_hits' : 'pages_fetched'] += 1;
      const parsed = parseBook(page.html, url, source, page.fetched_at);
      if (!parsed.success) {
        report.invalid_records += 1;
        errors.push({ page: url, reason: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) });
        continue;
      }
      books.set(url, parsed.data);
    } catch (error) {
      report.failed_pages += 1;
      errors.push({ page: url, reason: error.message });
    }
  }
  report.valid_records = books.size;
  report.duration_ms = Date.now() - started;
  await fs.mkdir(outputDir, { recursive: true });
  const records = [...books.values()];
  await Promise.all([
    fs.writeFile(path.join(outputDir, 'books.json'), JSON.stringify(records, null, 2)),
    fs.writeFile(path.join(outputDir, 'errors.json'), JSON.stringify(errors, null, 2)),
    fs.writeFile(path.join(outputDir, 'run-report.json'), JSON.stringify(report, null, 2)),
  ]);
  if (books.size === 60) {
    console.log(JSON.stringify(records[0] || null, null, 2));
    console.log('detail_pages=60');
  }
  return { records, errors, report };
}

if (require.main === module) run().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { BookSchema, run };
