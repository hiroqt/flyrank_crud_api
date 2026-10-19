// Inject a fake catalogue link and intercept its request locally; never request a fake URL from the site.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const first = require('./first-attempt');

async function main() {
  const base = path.join(__dirname, 'first-attempt');
  const catalogueUrl = 'https://books.toscrape.com/catalogue/page-1.html';
  const fakeUrl = 'https://books.toscrape.com/catalogue/not-a-real-book_0/index.html';
  const cataloguePath = path.join(base, 'cache', `${crypto.createHash('sha256').update(catalogueUrl).digest('hex')}.html`);
  const original = await fs.readFile(cataloguePath, 'utf8');
  const edited = original.replace('</body>', '<article class="product_pod"><h3><a href="not-a-real-book_0/index.html">fake</a></h3></article></body>');
  assert.notEqual(edited, original, 'catalogue body exists for fake-link injection');
  await fs.writeFile(cataloguePath, edited);
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.equal(String(url), fakeUrl);
    return new Response('', { status: 404, statusText: 'Not Found' });
  };
  try {
    const { books, errors, report } = await first.run();
    assert.equal(books.length, 60);
    assert.equal(new Set(books.map((book) => book.product_url)).size, 60);
    assert.equal(errors.length, 1);
    assert.equal(report.failed_pages.length, 1);
    console.log(`first-attempt fake-page checkpoint: books=${books.length}, unique=${new Set(books.map((book) => book.product_url)).size}, failed_pages=${report.failed_pages.length}`);
  } finally {
    global.fetch = originalFetch;
    await fs.writeFile(cataloguePath, original);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
