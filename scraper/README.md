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

## AI vs me

I used two isolated AI attempts under `scraper/ai-version/`; the hand-built scraper in `scraper/src/` was not changed. Both prompts and generated versions are kept there. I reviewed the code and ran synthetic checks plus polite live runs where noted.

### Checkpoint results

| Version | 60 records and HTTPS numeric prices | Rerun | One mocked bad page | Result |
|---|---|---|---|---|
| Hand-built | Yes: 60 valid unique records | 60 remain; the Stage 5 recovery and CSV tests pass | Yes: 60 good records remain and numeric `failed_pages` is 1 | Checkpoints met. The tests were run locally; the sample run report above is from the cache. |
| AI first attempt | Yes on the live target: 60 valid unique records | 60 remain, but record contents change because cached records get a new `fetched_at` | Yes: 60 good records remain; one local mocked 404 is recorded | Count and recovery pass; exact-record idempotency and numeric report shape fail. `failed_pages` is an array. |
| AI rematch | The fixture integration check passes with 60; live run produced 59 | Live cached rerun remains at 59 | Fixture check preserves 60 and writes numeric `failed_pages: 1` | Synthetic checks pass. Live 60-book checkpoint fails: one long product URL creates an `ENAMETOOLONG` cache filename. |

The rematch uses one cache filename per full URL encoded as base64. The longest URL exceeds the operating system’s filename limit, so its real-site run saved only 59 of 60 records. Its rerun still had 59 records. The first attempt uses a SHA-256 cache key and did save all 60. Its local bad-page check in `synthetic-check.js` only tests record validation; `checkpoint-first.js` separately injects a catalogue link and intercepts the fake 404 locally, so no fake request reached the website.

The rematch fixed stable `fetched_at` values by storing them with cached HTML, changed `failed_pages` to a number, and added a full mock integration check. That check uses short fixture URLs and did not reveal the long real URL failure. Review also found that the rematch selects the description from the whole document instead of scoping it to the product container, and that it does not constrain catalogue links to the target origin. Its success message derives `detail_pages=60` from the number of valid records, so a failed 61st fixture detail request can still print that count. The mock check does not cover retry timing/headers or assert the error entry. I understand the code: it uses small helpers, native `fetch`, Cheerio, Zod, injected fetch/wait functions, and temporary fixture directories; the base64 filename choice is clear but unsafe for this site’s longest URL.

Concrete differences from my version:

1. The hand-built cache uses a compact product slug; AI v1 uses a SHA-256 cache key, while the rematch uses the full URL in base64, which breaks one real book.
2. The hand-built scraper preserves the first `fetched_at` through cache file metadata. AI v1 regenerated it on every run; v2 fixed that with timestamp metadata beside cached HTML.
3. The hand-built and rematch reports use numeric `failed_pages`; AI v1 used an array of failure objects.
4. The rematch has a cleaner mock integration check with a fetch seam and temporary directories; the hand-built recovery test instead exercises its existing `main` and retry behavior.
5. The hand-built pipeline also exports CSV; neither AI prompt requested that optional feature, so neither AI version does.

The first prompt said to report failed pages but did not specify that `failed_pages` must be an integer, that cache hits must preserve the original timestamp, or that the bad-page test had to exercise the whole pipeline. The improved prompt made those requirements explicit. It should also have required bounded cache filenames and same-origin catalogue links; those omissions explain the rematch’s live failure and remaining review findings.

### Prompt 1 (verbatim)

```text
Build an independent version of my Books to Scrape pipeline in Node.js CommonJS. Use the repository's installed Cheerio and Zod dependencies; do not add dependencies. Work only in `scraper/ai-version/first-attempt/`. Do not inspect, import, modify, or copy `scraper/src/` or its tests. The target is `https://books.toscrape.com`; crawl only the first three catalogue pages and the 60 books linked from them. This is browserless HTML scraping.

For each book, keep these eight raw fields: `title`, absolute `product_url`, `price_text`, `availability_text`, `rating_text`, `description`, `source_page`, and `fetched_at`. Use null if the page has no description. Scope selectors to the product area. Normalize `price_text` into numeric `price_gbp`, retaining both values. Define a Zod schema for the finished record: required nonempty title/text fields, canonical HTTPS product and source URLs, finite nonnegative numeric price, ISO timestamp, and optional nullable description. Validate before writing; put invalid records and their reasons in `errors.json`, never `books.json`.

Use the absolute canonical `product_url` as identity and write duplicates once. Cache catalogue and detail HTML locally and reuse it on reruns. For every uncached request, send user-agent `FlyRankInternship-A9/1.0 (+https://github.com/hiroqt/flyrank_crud_api)`, use an 8-second timeout, check HTTP status, and wait 500 ms before requesting. Retry one timeout or 5xx once after the normal delay; do not retry 403 or 404. Handle each page independently: log and skip a failed page while retaining successful records. At run end write `output/books.json`, `output/errors.json`, and `output/run-report.json`, reporting start time, duration, pages fetched, cache hits, valid records, invalid records, and failed pages. Print one complete record and `detail_pages=60` in the summary on a successful run.

Keep the implementation small and runnable with the repository's Node.js setup. Add a local, synthetic check for a bad page; do not induce failures by sending bad requests to the real site. Do not change the hand-built scraper or its documentation.
```

### Prompt 2 (one improved rematch, verbatim)

```text
Build an independent version of my Books to Scrape pipeline in Node.js CommonJS. Use the repository's installed Cheerio and Zod dependencies; add no dependencies. Work only in `scraper/ai-version/rematch/`. Do not inspect, import, modify, or copy `scraper/src/`, its tests, or the first attempt. The target is `https://books.toscrape.com`; crawl only the first three catalogue pages and their 60 book detail pages. Use HTTP and the HTML the server returns; no browser.

Each raw book record has these eight keys: `title`, absolute `product_url`, `price_text`, `availability_text`, `rating_text`, `description`, `source_page`, and `fetched_at`. Read selectors inside the product area. Store a missing description as null. Normalize `price_text` to numeric `price_gbp` while retaining the original string. Define a Zod schema for the finished record: required nonempty title and raw text fields, canonical HTTPS product/source URLs, finite nonnegative numeric price, ISO timestamp, and optional nullable description. Validate before storing. Invalid records go only to `errors.json` with reasons.

Use canonical absolute `product_url` as identity and store each URL once. Cache catalogue and detail HTML and reuse it on reruns. A cache hit must preserve that page's original `fetched_at`; reruns over cached pages must leave all 60 records unchanged. For each uncached request, send user-agent `FlyRankInternship-A9/1.0 (+https://github.com/hiroqt/flyrank_crud_api)`, wait 500 ms, use an 8-second timeout, check HTTP status, and cache successful responses. Retry timeout or 5xx once after the same delay; never retry 403 or 404. Catch failures per page, log and skip the failed page, and keep other valid records.

Always write `output/books.json`, `output/errors.json`, and `output/run-report.json`. The report has start time, duration, `pages_fetched`, `cache_hits`, `valid_records`, `invalid_records`, and `failed_pages` as a numeric count. Print a complete first record and `detail_pages=60` only when 60 detail pages were actually processed. Verify: the normal run yields exactly 60 valid records with numeric prices and HTTPS URLs; a cached rerun remains exactly 60 with identical records; a locally simulated fake detail URL returning 404 does not crash the run, preserves the 60 good records, and writes `failed_pages: 1`. Add a small automated check for the simulated failure. Mock the failure locally; never request a fake URL from the real site. Keep the implementation small and runnable with the repository's Node.js setup. Do not change the hand-built scraper or its documentation.
```
