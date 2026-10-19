# Web Scraper — Ethical Data Collection

A controlled web scraping project built for learning ethical data extraction practices.

---

## Target Classification

- **Target Site:** [Books to Scrape](https://books.toscrape.com) (`https://books.toscrape.com`)
- **Site Purpose & Permission:** On [toscrape.com](http://toscrape.com), the creators explicitly state:
  > *"A fictional bookstore that desperately wants to be scraped. It's a safe place for beginners learning web scraping and for developers validating their scraping technologies as well."*
  This confirms Books to Scrape is a sandbox built intentionally for practicing web scraping.
- **Scope:** First 3 catalogue pages only (`catalogue/page-1.html` through `catalogue/page-3.html`), extracting a maximum of 60 items (20 books per page).
- **Data Collected:** `title` (string), canonical HTTPS `product_url` (string identity), `price_text` (string), `price_gbp` (number), `availability_text` (string), `rating_text` (string), optional nullable `description` (string), `source_page` (HTTPS URL), and `fetched_at` (ISO timestamp). `src/bookSchema.js` defines the Zod schema.
- **Detail Pages:** Product pages are fetched sequentially with the same user-agent, 8-second timeout, HTTP status check, 500 ms delay, and local cache as catalogue pages. Raw page HTML remains in `cache/`.
- **Validation and Output:** Every record is schema-validated before storage. Valid records replace `output/books.json`; invalid records and their reasons replace `output/errors.json`. Both output files are ignored by Git. Product URLs are deduplicated by canonical URL, so reruns replace output instead of appending records.
- **Checkpoint:** The run prints one complete validated record and a `detail_pages=60` summary after collecting three catalogue pages.
- **Why It Is Appropriate Here:** Scraping this data is appropriate because the site is an open educational sandbox containing dummy bookstore items, and limiting collection to 3 pages ensures zero strain on the hosting infrastructure while demonstrating pagination and DOM extraction.

---

## Robots.txt Audit

- **URL Checked:** `https://books.toscrape.com/robots.txt`
- **Result:** `HTTP 404 Not Found` — **no robots file found**.
- **Assessment:** A missing `robots.txt` file is not explicit permission; it simply means no machine-readable disallow directives are published. Our permission instead stems from the site's explicit declaration as a public scraping sandbox on `toscrape.com`.

---

## Ethical Scraping Pledge

> "I will not reuse this code on another site without checking its rules and terms first."
