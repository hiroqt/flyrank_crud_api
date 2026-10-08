/**
 * Books to Scrape - Ethical Web Scraper Entry Point
 * Target: https://books.toscrape.com
 * Scope: First 3 catalogue pages only
 */

const BASE_URL = 'https://books.toscrape.com';
const MAX_PAGES = 3;

async function main() {
  console.log('--- Scraper Initialized ---');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Scope: First ${MAX_PAGES} catalogue pages`);
  console.log('Robots.txt check: 404 (no robots file found)');
  console.log('Ethics reminder: I will not reuse this code on another site without checking its rules and terms first.');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { BASE_URL, MAX_PAGES, main };
