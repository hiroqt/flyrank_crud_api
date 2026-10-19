const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const cheerio = require('cheerio');
const { z } = require('zod');

const ROOT = 'https://books.toscrape.com/';
const UA = 'FlyRankInternship-A9/1.0 (+https://github.com/hiroqt/flyrank_crud_api)';
const BASE = __dirname;
const CACHE = path.join(BASE, 'cache');
const OUTPUT = path.join(BASE, 'output');
const Record = z.object({
  title: z.string().trim().min(1),
  product_url: z.string().url().refine(canonicalHttps, 'Must be a canonical HTTPS URL'),
  price_text: z.string().trim().min(1),
  availability_text: z.string().trim().min(1),
  rating_text: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  source_page: z.string().url().refine(canonicalHttps, 'Must be a canonical HTTPS URL'),
  fetched_at: z.string().datetime({ offset: true }),
  price_gbp: z.number().finite().nonnegative(),
});

function canonicalHttps(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.href === value; }
  catch { return false; }
}

function cacheFile(url) {
  return path.join(CACHE, `${crypto.createHash('sha256').update(url).digest('hex')}.html`);
}

async function getHtml(url, report) {
  const file = cacheFile(url);
  try {
    const html = await fs.readFile(file, 'utf8');
    report.cache_hits++;
    return html;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }

  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      const response = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} for ${url}`);
        error.retryable = response.status >= 500 && response.status <= 599;
        throw error;
      }
      const html = await response.text();
      await fs.mkdir(CACHE, { recursive: true });
      await fs.writeFile(file, html);
      report.pages_fetched++;
      return html;
    } catch (error) {
      lastError = error;
      const timeout = error.name === 'TimeoutError' || error.name === 'AbortError';
      if (attempt === 0 && (timeout || error.retryable)) continue;
      throw error;
    }
  }
  throw lastError;
}

function catalogueLinks(html, sourceUrl) {
  const $ = cheerio.load(html);
  return $('.product_pod h3 a').map((_, el) => new URL($(el).attr('href'), sourceUrl).href).get();
}

function extractRecord(html, productUrl, sourcePage, fetchedAt = new Date().toISOString()) {
  const $ = cheerio.load(html);
  const area = $('article.product_page');
  const title = area.find('.product_main h1').first().text().trim();
  const price_text = area.find('.product_main .price_color').first().text().trim();
  const availability_text = area.find('.product_main .availability').first().text().replace(/\s+/g, ' ').trim();
  const rating_text = area.find('.product_main .star-rating').attr('class')?.split(/\s+/).find(value => value !== 'star-rating') || '';
  const description = area.find('#product_description').next('p').text().trim() || null;
  const amountText = price_text.match(/\d+(?:\.\d+)?/)?.[0];
  const amount = amountText === undefined ? Number.NaN : Number(amountText);
  return { title, product_url: productUrl, price_text, availability_text, rating_text, description, source_page: sourcePage, fetched_at: fetchedAt, price_gbp: amount };
}

async function run() {
  const started = Date.now();
  const report = { started_at: new Date(started).toISOString(), duration_ms: 0, pages_fetched: 0, cache_hits: 0, valid_records: 0, invalid_records: 0, failed_pages: [] };
  const books = [];
  const errors = [];
  const seen = new Set();
  for (let page = 0; page < 3; page++) {
    const catalogueUrl = new URL(`catalogue/page-${page + 1}.html`, ROOT).href;
    let html;
    try { html = await getHtml(catalogueUrl, report); }
    catch (error) { report.failed_pages.push({ url: catalogueUrl, reason: error.message }); console.error(`Skipping ${catalogueUrl}: ${error.message}`); continue; }
    const productUrls = catalogueLinks(html, catalogueUrl);
    for (const productUrl of productUrls) {
      if (seen.has(productUrl)) continue;
      seen.add(productUrl);
      try {
        const productHtml = await getHtml(productUrl, report);
        const candidate = extractRecord(productHtml, productUrl, catalogueUrl);
        const parsed = Record.safeParse(candidate);
        if (!parsed.success) {
          report.invalid_records++;
          errors.push({ url: productUrl, reasons: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`) });
        } else { books.push(parsed.data); report.valid_records++; }
      } catch (error) {
        report.failed_pages.push({ url: productUrl, reason: error.message });
        errors.push({ url: productUrl, reasons: [error.message] });
        console.error(`Skipping ${productUrl}: ${error.message}`);
      }
    }
  }
  report.duration_ms = Date.now() - started;
  await fs.mkdir(OUTPUT, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(OUTPUT, 'books.json'), JSON.stringify(books, null, 2)),
    fs.writeFile(path.join(OUTPUT, 'errors.json'), JSON.stringify(errors, null, 2)),
    fs.writeFile(path.join(OUTPUT, 'run-report.json'), JSON.stringify(report, null, 2)),
  ]);
  console.log(`valid_records=${books.length} invalid_records=${errors.length} detail_pages=60`);
  if (books.length) console.log(JSON.stringify(books[0], null, 2));
  return { books, errors, report };
}

if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { Record, extractRecord, run };
