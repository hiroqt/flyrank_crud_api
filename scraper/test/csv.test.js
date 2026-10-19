const assert = require('node:assert/strict');
const test = require('node:test');
const { toCsv } = require('../src');

test('exports scalar records as escaped CSV and leaves null descriptions blank', () => {
  const csv = toCsv([
    {
      title: '=2+2',
      product_url: 'https://books.toscrape.com/book.html',
      price_text: '£51.77',
      price_gbp: 51.77,
      availability_text: 'In stock',
      rating_text: 'Three',
      description: null,
      source_page: 'https://books.toscrape.com/catalogue/page-1.html',
      fetched_at: '2026-10-19T00:00:00.000Z',
    },
    {
      title: 'A, "quoted"\nbook',
      product_url: 'https://books.toscrape.com/another-book.html',
      price_text: '£2.00',
      price_gbp: 2,
      availability_text: 'In stock',
      rating_text: 'One',
      description: 'First line\nsecond line',
      source_page: 'https://books.toscrape.com/catalogue/page-1.html',
      fetched_at: '2026-10-19T00:00:00.000Z',
    },
  ]);

  assert.match(csv, /^title,product_url,price_text,price_gbp,availability_text,rating_text,description,source_page,fetched_at\n/);
  assert.match(csv, /\n'=2\+2,https:\/\/books\.toscrape\.com\/book\.html,£51\.77,51\.77,In stock,Three,,/);
  assert.match(csv, /"A, ""quoted""\nbook"/);
  assert.match(csv, /"First line\nsecond line"/);
});
