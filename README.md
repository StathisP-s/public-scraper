# Public Scraper (Public.gr Category & Product List Crawler)

A Node.js scraper for **Public.gr** that **auto-crawls** categories under `/cat` (no sitemap) and extracts product data (title, price, availability, specs, image, link) from **list pages** into **JSON** and **CSV**.

## Features
- 🧭 **BFS crawling** of subcategories up to `MAX_DEPTH`
- 🧰 **Helpers** for blocking overlays, handling cookies, and other page guards
- 🧾 **Export** to `data/products_all.json` & `data/products_all.csv`
- 🧠 “Smart” target selection: full `/cat`, single-list page, or only a specific subtree

---

## Project Structure

```
.
├─ helper/
│  └─ helpers.js         # helper functions
├─ utils/
│  └─ export.js          # exportToCSV(...)
├─ scrapePublic.js       # main script
├─ data/                 # output folder (ignored by git)
├─ package.json
└─ README.md
```

In `scrapePublic.js` you import the helpers like this:
```js
const {
  sleep,
  toHttps,
  installSearchGuards,
  dismissSearchOverlay,
  autoScroll,
  acceptCookiesIfAny,
  isRootCat,
  pageHasProductList
} = require('./helper/helpers');
```

---

## Requirements
- **Node.js** v18+
- **Google Chrome** installed (Windows recommended for profile path example)
- Puppeteer (installed as a dependency)

---

## Installation

```bash
# Clone the repository
git clone https://github.com/StathisP-s/public-scraper.git
cd public-scraper

# Install dependencies
npm install
```

Make sure your `package.json` includes:
```json
{
  "type": "commonjs",
  "scripts": {
    "start": "node scrapePublic.js"
  },
  "dependencies": {
    "puppeteer": "^22.0.0"
  }
}
```

---

## Configuration (inside `scrapePublic.js`)
- **`ROOT_ALL_CATEGORIES`**: the root category or `/cat` for a full crawl  
- **`MAX_DEPTH`**: BFS depth (e.g. `2`)  
- **`USER_DATA_DIR`**: your Chrome profile path on Windows, e.g.:
  ```js
  const USER_DATA_DIR = 'C:\\Users\\<User>\\AppData\\Local\\Google\\Chrome\\User Data\\Default';
  ```
- **UA / headers**: set for Greek locale

---

## Run

```bash
npm start
# or
node scrapePublic.js
```

During execution:
- Crawls subcategories based on settings
- On each list page, clicks “See more” until all products are loaded
- Extracts for each card: Code, Title, Price, Availability, Specs, Image, Link

**Output**:
```
data/products_all.json
data/products_all.csv
```
If `data/` does not exist, the script will create it automatically.

---

## Key Helpers (in `helper/helpers.js`)
- `installSearchGuards(page)`: blocks search overlays and shortcut triggers before site scripts run
- `dismissSearchOverlay(page)`: manually clears overlays and modals
- `acceptCookiesIfAny(page)`: clicks OneTrust cookie banner
- `autoScroll(page)`: scrolls to load lazy content
- `isRootCat(url)`, `toHttps(url)`: URL utilities
- `pageHasProductList(browser, url)`: detects if a page is a product list

---

## .gitignore suggestion

```
node_modules/
data/
*.csv
*.json
```

---

## Troubleshooting
- **Cannot find module './helper/helpers'**  
  ➜ Ensure the file is at `helper/helpers.js` and the import path matches.
- **Empty availability for some cards**  
  ➜ The script scrolls each card into view before reading availability. The selector used is:
  ```js
  card.querySelector('.availability-container strong') ||
  card.querySelector('app-product-list-availability strong')
  ```
- **Slow “See more”**  
  ➜ Reduce `sleep` delays or limit how many clicks per page.

---

## Legal Notice
This project is intended for educational use. Respect the robots.txt, the terms of service of Public.gr, and local laws regarding web scraping.

---

## Roadmap / Ideas
- Optional detail-page fetch for products missing availability/specs (with small concurrency)
- CLI flags (`--depth`, `--root`, `--headless`)
- Playwright implementation
