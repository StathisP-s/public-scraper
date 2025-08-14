// Scrape.js — auto-crawl categories under /cat (no sitemap) + scrape product list pages

// Core deps
const puppeteer = require('puppeteer');              // Browser automation
const fs = require('fs');                             // Read/write local files
const { exportToCSV } = require('./utils/export');    // Utility to export results to CSV

// Project helpers (moved out of this file to keep it tidy)
const {
  sleep,
  toHttps,
  installSearchGuards,
  dismissSearchOverlay,
  autoScroll,
  acceptCookiesIfAny,
  isRootCat,
  pageHasProductList
} = require('./helpers/helpers'); // <- adjust path if helpers live elsewhere

// ========= SETTINGS =========
// Root category to start crawling from (can be /cat or any sub-tree)
const ROOT_ALL_CATEGORIES = 'https://www.public.gr/cat/computers-and-software';
// How deep to BFS into subcategories
const MAX_DEPTH = 2;
// Reuse your Chrome profile to keep cookies/session (reduces bot friction)
const USER_DATA_DIR = 'C:\\Users\\Stathis\\AppData\\Local\\Google\\Chrome\\User Data\\Default';
// Desktop Chrome-like UA
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';


// === Collect all /cat/ links from a page (exclude product pages /p/, queries, and anchors) ===
async function extractCategoryLinksFromPage(browser, pageUrl) {
  const page = await browser.newPage();

  // Install guards before page scripts run (blocks search overlays/shortcuts)
  await installSearchGuards(page);

  // Pretend to be a Greek Chrome user and disable basic bot flag
  await page.setUserAgent(UA);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8' });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  // Open category page, accept cookies, and clear any overlays
  await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await acceptCookiesIfAny(page);
  await dismissSearchOverlay(page);

  // Try a few times to ensure content shows up (scrolling often triggers lazy rendering)
  for (let i = 0; i < 5; i++) {
    await dismissSearchOverlay(page);
    const ok = await page.$('a[href*="/cat/"]').catch(()=>null);
    if (ok) break;
    await autoScroll(page);
    await sleep(700);
    await dismissSearchOverlay(page);
  }

  // One more full scroll to collect all anchors
  await autoScroll(page);
  await sleep(800);

  // Extract and keep only normalized /cat/ links under the same sub-tree
  let links = await page.evaluate((pageUrl) => {
    const origin = new URL(pageUrl).origin;
    const rootPath = new URL(pageUrl).pathname; // e.g. "/cat/computers-and-software"

    const anchors = Array.from(document.querySelectorAll('a[href]')).map(a => a.href);

    const cleaned = anchors.filter(h => {
      try {
        const u = new URL(h, origin);
        return (
          u.pathname.startsWith(rootPath) &&     // only subcategories below the root
          u.pathname.startsWith('/cat/') &&
          !u.pathname.includes('/p/') &&         // exclude product pages
          !u.search &&                           // exclude querystring
          !u.hash &&                             // exclude hash
          !u.pathname.endsWith('/cat/')          // exclude the bare /cat/
        );
      } catch { return false; }
    });

    return Array.from(new Set(cleaned));
  }, pageUrl);

  // Normalize host/protocol to https://www.public.gr for consistency
  links = links.map(h => {
    try {
      const u = new URL(h);
      u.protocol = 'https:';
      u.hostname = 'www.public.gr';
      return u.toString();
    } catch { return h; }
  });

  // Close tab and return the set of links
  await page.close();
  return links;
}


// === BFS from root -> subcategories up to maxDepth, then keep only "product list" pages ===
async function getAllCategoryUrlsFromRoot(browser, rootUrl = ROOT_ALL_CATEGORIES, maxDepth = MAX_DEPTH) {
  const seen = new Set();     // URLs we've already visited
  const result = new Set();   // All discovered candidate category URLs
  let frontier = [rootUrl];   // Queue (current BFS level)
  let depth = 0;              // Current BFS depth

  while (frontier.length && depth <= maxDepth) {
    const next = [];          // Next level queue
    for (const url of frontier) {
      if (seen.has(url)) continue;
      seen.add(url);

      try {
        // Extract immediate child category links from this page
        const found = await extractCategoryLinksFromPage(browser, url);
        for (const link of found) {
          const child = toHttps(link);        // Normalize URL
          if (!seen.has(child)) next.push(child);
          result.add(child);
        }
      } catch (e) {
        console.log('⚠️ extractCategoryLinksFromPage error:', e.message);
      }
    }
    frontier = next;
    depth += 1;
  }

  // Validate: keep only pages that look like product listings (tiles or "See more" button)
  const filtered = [];
  for (const url of result) {
    const page = await browser.newPage();
    await installSearchGuards(page);
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8' });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    const safeUrl = toHttps(url);
    await page.goto(safeUrl, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await dismissSearchOverlay(page);
    await sleep(900);

    const isList = await page.evaluate(() => {
      const hasTiles = !!document.querySelector('.product-tile-container');
      const hasSeeMore = !!document.querySelector('[label="Δες περισσότερα"]');
      return hasTiles || hasSeeMore;
    });

    await page.close();
    if (isList) filtered.push(url);
  }

  return Array.from(new Set(filtered));
}


// ========= MAIN =========
(async () => {
  // Launch Chrome with your user profile. Headful mode helps with anti-bot defenses and debugging.
  const browser = await puppeteer.launch({
    headless: false,
    // executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // optional fixed Chrome
    userDataDir: USER_DATA_DIR,
    args: ['--start-maximized'],
    defaultViewport: null,
  });

  // Optional warm-up tab to set UA/headers and override webdriver before first navigation
  {
    const boot = await browser.newPage();
    await boot.setUserAgent(UA);
    await boot.setExtraHTTPHeaders({ 'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8' });
    await boot.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    await boot.close();
  }

  // === 1) Smart target selection ===
  // If root is /cat or /cat/ -> crawl the whole category tree (BFS).
  // Else:
  //   - If the given page already has products -> scrape just that page
  //   - Otherwise -> crawl ONLY the subtree under that root
  let START_URLS = [];
  const rootHttps = toHttps(ROOT_ALL_CATEGORIES);

  if (isRootCat(rootHttps)) {
    START_URLS = await getAllCategoryUrlsFromRoot(browser, rootHttps, MAX_DEPTH);
    console.log(`🗺️ Full-site mode: ${START_URLS.length} categories discovered from /cat.`);
  } else {
    const hasList = await pageHasProductList(browser, rootHttps);
    if (hasList) {
      START_URLS = [rootHttps];
      console.log(`🎯 Single-page mode: 1 category -> ${rootHttps}`);
    } else {
      const all = await getAllCategoryUrlsFromRoot(browser, rootHttps, MAX_DEPTH);
      START_URLS = all.filter(u => u.startsWith(rootHttps));
      console.log(`🌿 Subtree mode: ${START_URLS.length} subcategories under ${rootHttps}`);
    }
  }

  // Accumulator for all products across all target category pages
  let allProducts = [];

  // === 2) For each category URL, run the same extraction logic ===
  for (const url of START_URLS) {
    const page = await browser.newPage();
    await installSearchGuards(page);

    // Pretend to be Greek Chrome; reduce bot signals
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8' });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    console.log(`🚀 Scraping: ${url}`);

    // Navigate, normalize to https + fixed host, and clear overlays
    const safeUrl = toHttps(url);
    await page.goto(safeUrl, { waitUntil: 'networkidle2', timeout: 60000 }).catch(()=>{});
    await dismissSearchOverlay(page);
    await sleep(1200);

    // Keep clicking "See more" until no more results are loaded.
    const SEE_MORE_SELECTOR = '[label="Δες περισσότερα"], button[aria-label="Δες περισσότερα"]';

    while (true) {
      await dismissSearchOverlay(page);

      // Small scroll to help the button appear/become clickable
      await page.evaluate(() => window.scrollBy(0, window.innerHeight / 2));
      await sleep(500);

      const seeMore = await page.$(SEE_MORE_SELECTOR);
      if (!seeMore) {
        // If no button is present, stop if we reached the bottom
        const atBottom = await page.evaluate(() => {
          return (window.innerHeight + window.scrollY) >= document.body.scrollHeight;
        });
        if (atBottom) break;
        continue;
      }

      // Bring button to center and try to click (with fallback to mouse-click by bbox)
      await seeMore.evaluate(el => el.scrollIntoView({ behavior: 'instant', block: 'center' }));
      await sleep(300);
      try {
        await seeMore.click({ delay: 50 });
      } catch {
        const box = await seeMore.boundingBox();
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        }
      }

      // Wait for new products to render
      await sleep(1500);
    }

    // Ensure tiles become visible (some data renders only on visibility)
    await page.evaluate(() => {
      document.querySelectorAll('.product-tile-container')
        .forEach(el => el.scrollIntoView({ block: 'center' }));
    });
    await sleep(300);

    // ===== Extract product tiles from the listing =====
    const products = await page.$$eval('.product-tile-container', (cards) => {
      // Helper: first non-empty text among selectors
      const pickFirstText = (root, sels) => {
        for (const sel of sels) {
          const el = root.querySelector(sel);
          const t = el && el.textContent && el.textContent.trim();
          if (t) return t;
        }
        return '';
      };

      // Helper: try multiple img sources (src, data-src, srcset, etc.)
      const pickImage = (root) => {
        const img = root.querySelector('img');
        if (img) {
          const cand = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy');
          if (cand) return cand;
        }
        const source = root.querySelector('picture source[srcset]');
        if (source) {
          const srcset = source.getAttribute('srcset') || '';
          const best = srcset.split(',').map(s => s.trim().split(' ')[0]).pop();
          if (best) return best;
        }
        const any = Array.from(root.querySelectorAll('img, source'))
          .map(n => n.getAttribute('src') || n.getAttribute('data-src') || n.getAttribute('srcset') || '')
          .find(s => /.(webp|jpg|jpeg|png)(\?|$)/i.test(s));
        return any || '';
      };

      // Trim helper
      const norm = s => (s || '').replace(/\s+/g, ' ').trim();

      // Map each card to a product row
      return cards.map(card => {
        // Title + link (with a few fallbacks across list layouts)
        const aEl = card.querySelector(
          'h3.product__title a, .tile-title a[href], a.product__title, a[title], a[href*="/p/"]'
        );
        const title = (aEl?.textContent || '').trim();
        const link  = (aEl?.href || '').trim();

        // Derive product code from URL (last path segment)
        const code = link ? link.substring(link.lastIndexOf('/') + 1) : '';

        // Price: try common selectors across variants
        const price = pickFirstText(card, [
          'app-product-price .product__price',
          '[class*="product-prices"] .product__price',
          '.product__price--large',
          '.product__price--main',
          '.price__current',
          '[data-automation-id="productPrice"]'
        ]);

        // Availability: compact selectors that match the observed markup
        let availability = norm(
          card.querySelector('.availability-container strong')?.textContent ||      // primary
          card.querySelector('app-product-list-availability strong')?.textContent || // fallback
          ''
        );

        // Tiny backup: look for known keywords in the card text
        if (!availability) {
          const txt = norm(card.innerText || '');
          const hit = txt.match(/Άμεσα Διαθέσιμο|Διαθέσιμο με παραγγελία|Μη διαθέσιμο|Εξαντλημένο/);
          availability = hit ? hit[0] : '';
        }

        // Short specs snippet if present (layout varies)
        const specs = (
          card.querySelector('.product-specs')?.innerText?.trim() ||
          pickFirstText(card, ['.specs', '.features', '.chips', '.attributes']) ||
          ''
        );

        // Image (handles lazy/img/srcset)
        const img = pickImage(card);

        // Final row
        return {
          'Κωδικός': code,
          'Τίτλος': title,
          'Τιμή': price,
          'Διαθεσιμότητα': availability,
          'Specs': specs,
          'Εικόνα': img,
          'Link': link
        };
      });
    });

    console.log(`✅ ${products.length} προϊόντα από: ${url}`);
    allProducts.push(...products);

    // Close tab and cool down a bit between categories (friendlier to the site)
    await page.close();
    await sleep(600);
  }

  // ===== Persist results =====
  // Ensure data folder exists; write JSON + CSV snapshots
  if (!fs.existsSync('data')) fs.mkdirSync('data');
  fs.writeFileSync('data/products_all.json', JSON.stringify(allProducts, null, 2), 'utf-8');
  exportToCSV(allProducts, 'data/products_all.csv');
  console.log(`🎯 Τελικός απολογισμός: ${allProducts.length} προϊόντα σε ${START_URLS.length} κατηγορίες.`);

  // ------------------------------------------------------------------
  // OPTIONAL FEATURE 
  // Open each product detail page to fill missing availability/specs.
  // Steps:
  // 1) Find products missing availability/specs
  // 2) Open detail page
  // 3) Extract missing fields
  // 4) Save "full" dataset
  
  const missing = cardsData.filter(p => !p['Διαθεσιμότητα'] || p.Specs.length === 0);
  if (missing.length) {
    console.log(`ℹ️ Filling in availability + specs for ${missing.length} products…`);

    for (const prod of missing) {
      const detailPage = await browser.newPage();
      await detailPage.goto(prod.Link, { waitUntil: 'networkidle2' });

      // Availability example selector (may vary by layout)
      const detailSel = 'app-product-page-availability span.mdc-typography--subtitle2.mdc-typography--bold';
      await detailPage.waitForSelector(detailSel, { timeout: 10000 }).catch(() => {});
      prod['Διαθεσιμότητα'] = await detailPage.$eval(
        detailSel,
        el => el.textContent.trim()
      ).catch(() => prod['Διαθεσιμότητα'] || '');

      // Specs table example
      await detailPage.waitForSelector('.product__specifications .specs-table .spec-item', { timeout: 15000 });
      const fullSpecsText = await detailPage.$$eval(
        '.product__specifications .specs-table .spec-item',
        el => ( typeof el?.innerText === 'string' ? el.innerText : '').trim()
      );
      prod.Specs = fullSpecsText;

      await detailPage.close();
    }

    fs.writeFileSync('data/products_full.json', JSON.stringify(cardsData, null, 2), 'utf-8');
    exportToCSV(cardsData, 'data/products_full.csv');
    console.log(`✅ Final scrape completed: ${cardsData.length} products.`);
  }
  
  // ------------------------------------------------------------------

  // All done
  await browser.close();
})();
