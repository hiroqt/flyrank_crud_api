# Web Scraper — Ethical Data Collection

A controlled web scraping project built for learning ethical data extraction practices.

---

## Target Classification

- **Target Site:** [Books to Scrape](https://books.toscrape.com) (`https://books.toscrape.com`)
- **Site Purpose & Permission:** On [toscrape.com](http://toscrape.com), the creators explicitly state:
  > *"A fictional bookstore that desperately wants to be scraped. It's a safe place for beginners learning web scraping and for developers validating their scraping technologies as well."*
  This confirms Books to Scrape is a sandbox built intentionally for practicing web scraping.
- **Scope:** First 3 catalogue pages only (`catalogue/page-1.html` through `catalogue/page-3.html`), extracting a maximum of 60 items (20 books per page).
- **Data Collected:**
  - Book title
  - Price (GBP)
  - Rating (1 to 5 stars)
  - Availability status (In stock)
  - Product page URL
- **Why It Is Appropriate Here:** Scraping this data is appropriate because the site is an open educational sandbox containing dummy bookstore items, and limiting collection to 3 pages ensures zero strain on the hosting infrastructure while demonstrating pagination and DOM extraction.

---

## Robots.txt Audit

- **URL Checked:** `https://books.toscrape.com/robots.txt`
- **Result:** `HTTP 404 Not Found` — **no robots file found**.
- **Assessment:** A missing `robots.txt` file is not explicit permission; it simply means no machine-readable disallow directives are published. Our permission instead stems from the site's explicit declaration as a public scraping sandbox on `toscrape.com`.

---

## Ethical Scraping Pledge

> "I will not reuse this code on another site without checking its rules and terms first."
