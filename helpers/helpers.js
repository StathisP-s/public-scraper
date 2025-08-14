// helpers.js
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function toHttps(url) {
  try {
    const u = new URL(url);
    u.protocol = 'https:';
    u.hostname = 'www.public.gr';
    return u.toString();
  } catch {
    return url;
  }
}

async function installSearchGuards(page) {
  await page.evaluateOnNewDocument(() => {
    window.addEventListener('keydown', (e) => {
      const k = (e.key || '').toLowerCase();
      if (k === '/' || (e.ctrlKey && k === 'k')) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    }, true);

    const killOverlays = () => {
      const sel = [
        '.cdk-overlay-container', '.cdk-overlay-backdrop',
        'app-search', '.search-modal', '.search'
      ];
      sel.forEach(s => {
        document.querySelectorAll(s).forEach(n => {
          const z = Number(getComputedStyle(n).zIndex || '0');
          const pos = getComputedStyle(n).position;
          if (z > 1000 || pos === 'fixed') n.remove();
        });
      });
      if (document.activeElement?.tagName === 'INPUT') {
        document.activeElement.blur();
      }
    };

    const obs = new MutationObserver(killOverlays);
    obs.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', killOverlays, { once: true, capture: true });
  });
}

async function dismissSearchOverlay(page) {
  try {
    await page.keyboard.press('Escape').catch(()=>{});
    await page.mouse.click(5,5).catch(()=>{});
    await page.evaluate(() => {
      document.querySelectorAll('.cdk-overlay-container,.cdk-overlay-backdrop,app-search,.search-modal,.search')
        .forEach(n => n.remove());
      if (document.activeElement?.tagName === 'INPUT') {
        document.activeElement.blur();
      }
      document.body?.focus?.();
    }).catch(()=>{});
  } catch {}
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 350;
      const timer = setInterval(() => {
        const { scrollHeight } = document.body;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 180);
    });
  });
}

async function acceptCookiesIfAny(page) {
  const selectors = [
    '#onetrust-accept-btn-handler',
    'button#onetrust-accept-btn-handler',
    'button[aria-label*="Αποδοχ"]',
    'button:has-text("Αποδοχ")',
    'button:has-text("Αποδέχομαι")'
  ];
  for (const s of selectors) {
    try {
      const btn = await page.$(s);
      if (btn) { await btn.click().catch(()=>{}); await sleep(600); break; }
    } catch {}
  }
}

function isRootCat(url) {
  try {
    const u = new URL(url);
    return u.pathname === '/cat' || u.pathname === '/cat/';
  } catch {
    return false;
  }
}
async function pageHasProductList(browser, url) {
  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'el-GR,el;q=0.9,en;q=0.8' });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }).catch(()=>{});
  await new Promise(r => setTimeout(r, 700));
  const isList = await page.evaluate(() => {
    const hasTiles = !!document.querySelector('.product-tile-container');
    const hasSeeMore = !!document.querySelector('[label="Δες περισσότερα"]');
    return hasTiles || hasSeeMore;
  });
  await page.close();
  return isList;
}

module.exports = {
  sleep,
  toHttps,
  installSearchGuards,
  dismissSearchOverlay,
  autoScroll,
  acceptCookiesIfAny,
  isRootCat,
  pageHasProductList
};
