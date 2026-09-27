/**
 * Drives the real UI in headless Chrome: logs in via quick-fill buttons,
 * visits every page, captures console errors and uncaught exceptions.
 * Run: node scripts/ui-test.mjs   (frontend :5173 + backend :5000 must be up)
 */
import puppeteer from 'puppeteer-core';

const BASE = process.env.APP_BASE || 'http://localhost:5173';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const issues = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') issues.push(`[console.error] ${msg.text()}`);
});
page.on('pageerror', (err) => {
  issues.push(`[pageerror] ${err.message}`);
});
page.on('requestfailed', (req) => {
  issues.push(`[requestfailed] ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
});
page.on('response', (res) => {
  if (res.status() >= 500) issues.push(`[http ${res.status()}] ${res.request().method()} ${res.url()}`);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Login via quick-fill + submit
await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 30000 });
await sleep(800);
const clicked = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const quick = btns.find((b) => /admin/i.test(b.textContent));
  if (quick) quick.click();
  return !!quick;
});
if (!clicked) issues.push('[login] no quick-fill button found');
await sleep(300);
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const submit = btns.find((b) => /sign in|log in/i.test(b.textContent));
  if (submit) submit.click();
});
await sleep(2500);
console.log('after login URL:', page.url());

// 2. Visit each page, capture snapshot of visible content
const routes = ['/assets', '/allocation', '/booking', '/maintenance', '/audit', '/reports', '/logs', '/org-setup'];
for (const route of routes) {
  issues.length = 0; // per-page issues
  await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1800);
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 200).replace(/\s+/g, ' '));
  const blank = bodyText.trim().length < 5;
  const status = blank ? '💀 BLANK PAGE' : issues.length ? '⚠️  ERRORS' : '✅ OK';
  console.log(`\n${status} ${route}`);
  console.log(`   text: ${bodyText.slice(0, 120)}`);
  issues.forEach((i) => console.log(`   ${i.split('\n')[0].slice(0, 200)}`));
}

await browser.close();
console.log('\nUI test complete.');
