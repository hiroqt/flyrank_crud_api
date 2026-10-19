const assert = require('node:assert/strict');
const { extractRecord, Record } = require('./index');

const badPage = '<html><body><h1>Not a product page</h1></body></html>';
const candidate = extractRecord(badPage, 'https://books.toscrape.com/catalogue/missing_1/index.html', 'https://books.toscrape.com/catalogue/page-1.html');
const result = Record.safeParse(candidate);
assert.equal(result.success, false);
assert.ok(result.error.issues.some(issue => issue.path[0] === 'title'));
assert.ok(result.error.issues.some(issue => issue.path[0] === 'price_gbp'));
console.log('synthetic bad-page check passed');
