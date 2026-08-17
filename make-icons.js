// one-off: renders the Tik's Career Board icon (white "Tik" on an orange rounded square)
const sharp = require(String.raw`C:\Users\Hp By Comcom\Claude Code\ez-convert\node_modules\sharp`);
const path = require('path');

const svg = (s) => Buffer.from(`
<svg width="${s}" height="${s}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffab3f"/>
      <stop offset="55%" stop-color="#ff7a18"/>
      <stop offset="100%" stop-color="#ef5f0a"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="118" fill="url(#g)"/>
  <text x="256" y="338" text-anchor="middle"
        font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="230" font-weight="700"
        fill="#ffffff" letter-spacing="-4">Tik</text>
</svg>`);

(async () => {
  const out = path.join(__dirname, 'docs');
  for (const s of [512, 192, 32]) {
    await sharp(svg(s)).resize(s, s).png().toFile(path.join(out, `icon-${s}.png`));
  }
  console.log('icons done');
})();
