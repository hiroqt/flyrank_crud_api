const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { main, getCachedPage, getBookDetails } = require('../src');

test('keeps good books after a fake page fails and retries only transient failures', async () => {
  const fakeUrl = 'https://failure.invalid/catalogue/fake-book_0/index.html';
  const fakeBook = { productUrl: fakeUrl, sourcePage: 'https://books.toscrape.com/catalogue/page-1.html' };
  const goodBooks = Array.from({ length: 60 }, (_, index) => ({
    productUrl: `https://books.toscrape.com/catalogue/good-book-${index}/index.html`,
    sourcePage: 'https://books.toscrape.com/catalogue/page-1.html',
  }));
  const originalFetch = global.fetch;
  const originalLog = console.log;
  const originalError = console.error;
  const calls = [];
  let fakeResponse = 0;
  global.fetch = async (url) => {
    calls.push(String(url));
    assert.equal(String(url), fakeUrl);
    fakeResponse++;
    return new Response('', { status: fakeResponse === 1 ? 503 : 404 });
  };
  console.log = () => {};
  console.error = () => {};

  try {
    const report = await main({
      catalogueBooks: goodBooks,
      extraBooks: [fakeBook],
      bookDetailsFetcher: (book, metrics) => book.productUrl === fakeUrl
        ? getBookDetails(book, metrics)
        : Promise.resolve({
          title: book.productUrl,
          product_url: book.productUrl,
          price_text: '£51.77',
          price_gbp: 51.77,
          availability_text: 'In stock',
          rating_text: 'Three',
          description: null,
          source_page: book.sourcePage,
          fetched_at: '2026-10-19T00:00:00.000Z',
        }),
    });
    const outputDir = path.resolve(__dirname, '../output');
    const books = JSON.parse(fs.readFileSync(path.join(outputDir, 'books.json'), 'utf8'));
    const csv = fs.readFileSync(path.join(outputDir, 'books.csv'), 'utf8');
    const errors = JSON.parse(fs.readFileSync(path.join(outputDir, 'errors.json'), 'utf8'));
    const savedReport = JSON.parse(fs.readFileSync(path.join(outputDir, 'run-report.json'), 'utf8'));
    assert.equal(books.length, 60);
    assert.equal(new Set(books.map((book) => book.product_url)).size, 60);
    assert.match(csv, /^title,product_url,price_text,price_gbp,availability_text,rating_text,description,source_page,fetched_at\n/);
    assert.match(csv, /https:\/\/books\.toscrape\.com\/catalogue\/good-book-0\/index\.html/);
    assert.equal(errors.length, 1);
    assert.match(errors[0].reason, /HTTP status 404/);
    assert.equal(calls.length, 2);
    assert.equal(report.failed_pages, 1);
    assert.equal(report.valid_records, 60);
    assert.equal(report.invalid_records, 0);
    assert.equal(savedReport.failed_pages, 1);
    assert.equal(savedReport.cache_hits, 0);
  } finally {
    global.fetch = originalFetch;
    console.log = originalLog;
    console.error = originalError;
  }

  let forbiddenCalls = 0;
  global.fetch = async () => {
    forbiddenCalls++;
    return new Response('', { status: 403 });
  };
  console.log = () => {};
  try {
    await assert.rejects(getCachedPage('https://forbidden.invalid/page.html', 'retry-forbidden-check.html'), { status: 403 });
    assert.equal(forbiddenCalls, 1);
  } finally {
    global.fetch = originalFetch;
    console.log = originalLog;
  }

  const cacheFile = 'retry-timeout-check.html';
  const cachePath = path.resolve(__dirname, '../cache', cacheFile);
  const metrics = { pages_fetched: 0, cache_hits: 0 };
  let timeoutCalls = 0;
  global.fetch = async () => {
    timeoutCalls++;
    if (timeoutCalls === 1) {
      const error = new Error('synthetic timeout');
      error.name = 'TimeoutError';
      throw error;
    }
    return new Response('ok', { status: 200 });
  };
  console.log = () => {};
  try {
    assert.equal(await getCachedPage('https://timeout.invalid/page.html', cacheFile, metrics), 'ok');
    assert.equal(timeoutCalls, 2);
    assert.equal(metrics.pages_fetched, 1);
  } finally {
    global.fetch = originalFetch;
    console.log = originalLog;
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
  }
});
