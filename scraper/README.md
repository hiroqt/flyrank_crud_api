# Books to Scrape — Ethical HTML Scraper

## Target classification (Stage 0)

- **Target:** [Books to Scrape](https://books.toscrape.com), an educational fictional bookstore whose owners explicitly invite scraping for practice.
- **Robots check:** `https://books.toscrape.com/robots.txt` returned 404 when checked. A missing robots file is not permission; this exercise relies on the site's stated purpose as a scraping sandbox.
- **Scope:** The first three catalogue pages and their 60 book detail pages. Requests are read-only.

## Lane, install, and run

**Lane:** Browserless Node.js HTTP and HTML scraping. Requires Node.js 20.18.1 or newer. From the repository root, after cloning:

```sh
npm ci && node scraper/src/index.js
```

The run writes `scraper/output/books.json`, `scraper/output/books.csv`, `scraper/output/errors.json`, and `scraper/output/run-report.json`. The repository includes `scraper/output/books.json` as a sample; generated reports and errors stay local.

## Record schema

`scraper/src/bookSchema.js` defines and validates each record with Zod before it is stored. `product_url` is the canonical HTTPS identity; duplicate URLs are written once.

| Field | Type | Required | Meaning |
|---|---|---:|---|
| `title` | string | Yes | Book title |
| `product_url` | HTTPS URL string | Yes | Canonical detail-page URL and record identity |
| `price_text` | string | Yes | Original price text from the page |
| `price_gbp` | number | Yes | Parsed GBP amount, for example `51.77` |
| `availability_text` | string | Yes | Original availability text |
| `rating_text` | string | Yes | Rating label from the product area |
| `description` | string or null | No | Page description, or null when absent |
| `source_page` | HTTPS URL string | Yes | Catalogue page where the book was found |
| `fetched_at` | ISO timestamp string | Yes | Time the cached page was first fetched |

Records that fail validation are excluded from `books.json` and written to `errors.json` with a reason.

`books.csv` uses the same scalar fields and column order. No nested values need flattening; a null description becomes a blank cell, so CSV cannot distinguish null from an empty string. Cells starting with spreadsheet formula characters get a leading apostrophe.

## Politeness and recovery

- Sends `FlyRankInternship-A9/1.0 (+https://github.com/hiroqt/flyrank_crud_api)` as its user-agent.
- Waits 500 ms before every uncached request and applies an 8-second timeout.
- Checks the HTTP status and caches successful HTML under `scraper/cache/`; later runs reuse that cache.
- Retries a timeout or 5xx response once after the same delay. It does not retry 403 or 404 responses.
- Handles each book page separately. Failed pages are skipped, recorded in `errors.json`, and counted in the run report.

This assignment needs no browser: the data is already in the HTML the server sends, so a browser would only add cost.

## Sample run report

This real run report was generated on 2026-10-19 from the local HTML cache. It records 60 valid records and no failures; `pages_fetched` counts network fetches, while `cache_hits` counts reused pages.

```json
{
  "start_time": "2026-10-19T07:11:28.849Z",
  "duration_ms": 110,
  "pages_fetched": 0,
  "cache_hits": 63,
  "valid_records": 60,
  "invalid_records": 0,
  "failed_pages": 0
}
```

## Limitation and ethics

The local HTML cache has no expiry, so a rerun can return an older snapshot until the cache is refreshed. Use an official API when one exists; never bypass logins, paywalls, or blocks; collect only what you need.
