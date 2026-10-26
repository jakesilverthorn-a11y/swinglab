/*
  Renders the SwingLab app icon, favicon and iPhone launch images into public/.
  Run once after changing the artwork:  node scripts/make-assets.cjs
  Needs Playwright with a Chromium build (only for this script, not for the app).
*/
const fs = require('node:fs');
const path = require('node:path');

let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require('/home/claude/.npm-global/lib/node_modules/playwright');
}

const root = path.resolve(__dirname, '..');
const pub = path.join(root, 'public');
const fontPath = path.join(root, 'node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2');
const fontB64 = fs.readFileSync(fontPath).toString('base64');

const LIME = '#c8f542';

// The mark: a golf ball launching on a rising trail. Drawn on a 64 x 64 grid.
const trail = 'M6 57C12 34 26 17 46 14L46 27C32 31 17 42 6 57Z';
const ball = { cx: 50, cy: 20, r: 9 };

const markSvg = (id = 'g') => `
  <defs>
    <linearGradient id="${id}" x1="6" y1="57" x2="44" y2="18" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${LIME}" stop-opacity="0"/>
      <stop offset="0.6" stop-color="${LIME}" stop-opacity="0.6"/>
      <stop offset="1" stop-color="${LIME}" stop-opacity="0.95"/>
    </linearGradient>
  </defs>
  <path d="${trail}" fill="url(#${id})"/>
  <circle cx="${ball.cx}" cy="${ball.cy}" r="${ball.r}" fill="${LIME}"/>`;

const iconHtml = (size, inset) => `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;background:#070a09}
.bg{width:${size}px;height:${size}px;position:relative;overflow:hidden;
background:radial-gradient(75% 70% at 78% 12%,rgba(200,245,66,.20),transparent 60%),linear-gradient(155deg,#16241b 0%,#0a100d 55%,#060908 100%)}
svg{position:absolute;left:${inset}px;top:${inset}px;width:${size - inset * 2}px;height:${size - inset * 2}px}</style>
<div class="bg"><svg viewBox="-3 -3 70 70">${markSvg('i')}</svg></div>`;

const splashHtml = (w, h) => {
  const mark = Math.round(Math.min(w, h) * 0.3);
  return `<!doctype html><meta charset="utf-8">
<style>
@font-face{font-family:A;src:url(data:font/woff2;base64,${fontB64}) format('woff2-variations');font-weight:100 900;font-stretch:62% 125%}
html,body{margin:0;width:${w}px;height:${h}px;background:#080b0a;overflow:hidden}
.s{width:${w}px;height:${h}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(mark * 0.12)}px;
}
svg{width:${mark}px;height:${mark}px}
b{font:800 ${Math.round(mark * 0.27)}px/1 A,sans-serif;font-stretch:120%;letter-spacing:-0.01em;color:#f2f6f3}
</style>
<div class="s"><svg viewBox="-3 -3 70 70">${markSvg('s')}</svg><b>SwingLab</b></div>`;
};

// [device width, device height, pixel ratio]: portrait iPhones, newest first.
const SPLASH = [
  [440, 956, 3],
  [430, 932, 3],
  [428, 926, 3],
  [420, 912, 3],
  [414, 896, 3],
  [414, 896, 2],
  [414, 736, 3],
  [402, 874, 3],
  [393, 852, 3],
  [390, 844, 3],
  [375, 812, 3],
  [375, 667, 2],
];

(async () => {
  const browser = await playwright.chromium.launch({
    executablePath: fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
      ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
      : undefined,
    args: ['--no-sandbox'],
  });
  fs.mkdirSync(path.join(pub, 'icons'), { recursive: true });
  fs.mkdirSync(path.join(pub, 'splash'), { recursive: true });

  const render = async (html, w, h, dpr, file) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    const page = await ctx.newPage();
    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: w, height: h } });
    await ctx.close();
  };

  // Square icons. The "any" icons use a small inset; the maskable one keeps the mark inside the 80% safe zone.
  for (const [name, size, inset] of [
    ['apple-touch-icon.png', 180, 24],
    ['icon-192.png', 192, 26],
    ['icon-512.png', 512, 70],
    ['icon-maskable-512.png', 512, 110],
    ['icon-1024.png', 1024, 140],
  ]) {
    const file = name.startsWith('apple') ? path.join(pub, name) : path.join(pub, 'icons', name);
    await render(iconHtml(size, inset), size, size, 1, file);
  }
  await render(iconHtml(64, 8), 64, 64, 1, path.join(pub, 'favicon.png'));

  fs.writeFileSync(
    path.join(pub, 'favicon.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 76 76"><rect x="-6" y="-6" width="76" height="76" rx="16" fill="#0a100d"/>${markSvg('f')}</svg>\n`,
  );

  for (const [w, h, dpr] of SPLASH) {
    await render(splashHtml(w, h), w, h, dpr, path.join(pub, 'splash', `splash-${w * dpr}x${h * dpr}.png`));
  }
  await browser.close();
  console.log('assets written to', pub);
})();
