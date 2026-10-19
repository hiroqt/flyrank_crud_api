const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { run } = require('./scraper');

const rootUrl = 'https://fixture.invalid/';
const books = Array.from({ length: 60 }, (_, index) => ({
  url: new URL(`catalogue/book-${index + 1}.html`, rootUrl).href,
  html: `<div class="product_main"><h1>Book ${index + 1}</h1><p class="price_color">£12.34</p><p class="availability">In stock (10 available)</p><p class="star-rating Three"></p></div><div id="product_description"></div><p>Description ${index + 1}</p>`,
}));

function fixtureFetch(withFailure) {
  return async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith('/catalogue/page-')) {
      const page = Number(parsed.pathname.match(/page-(\d+)/)[1]);
      const selected = books.slice((page - 1) * 20, page * 20);
      const links = selected.map(({ url: href }) => `<article class="product_pod"><h3><a href="${href}">Book</a></h3></article>`).join('');
      const extra = withFailure && page === 3 ? '<article class="product_pod"><h3><a href="/catalogue/fake-404.html">Missing</a></h3></article>' : '';
      return response(`<section>${links}${extra}</section>`);
    }
    if (parsed.pathname === '/catalogue/fake-404.html') return response('Not found', 404);
    const book = books.find(({ url: href }) => href === url);
    return book ? response(book.html) : response('Not found', 404);
  };
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}

async function main() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'rematch-check-'));
  const quietWait = async () => {};
  try {
    const normal = await run({ rootUrl, fetchImpl: fixtureFetch(false), wait: quietWait, cacheDir: path.join(tmp, 'cache'), outputDir: path.join(tmp, 'output') });
    assert.equal(normal.records.length, 60);
    assert.ok(normal.records.every((book) => typeof book.price_gbp === 'number' && book.product_url.startsWith('https://')));
    const rerun = await run({ rootUrl, fetchImpl: async () => { throw new Error('unexpected cache miss'); }, wait: quietWait, cacheDir: path.join(tmp, 'cache'), outputDir: path.join(tmp, 'output') });
    assert.deepEqual(rerun.records, normal.records);
    assert.equal(rerun.report.cache_hits, 63);
    const failed = await run({ rootUrl, fetchImpl: fixtureFetch(true), wait: quietWait, cacheDir: path.join(tmp, 'failure-cache'), outputDir: path.join(tmp, 'failure-output') });
    assert.equal(failed.records.length, 60);
    assert.equal(failed.report.failed_pages, 1);
    assert.equal(JSON.parse(await fs.readFile(path.join(tmp, 'failure-output', 'run-report.json'), 'utf8')).failed_pages, 1);
    console.log('integration check passed: 60 records, stable cache rerun, isolated 404 failure');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
