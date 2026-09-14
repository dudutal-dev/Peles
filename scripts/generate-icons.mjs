/**
 * מייצר את אייקוני האפליקציה (PNG + SVG) בלי תלויות חיצוניות:
 * ציור וקטורי פשוט עם החלקת קצוות, וקידוד PNG עם zlib של Node.
 * הרצה: npm run icons
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BRAND = [0x0e, 0x5e, 0x6f];
const VIAL = [0xf1, 0xf3, 0xf2];
const BUBBLE = [0xff, 0xe4, 0x5c];

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** מרחק חתום ממלבן מעוגל שמרכזו (cx,cy). */
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
}

function sdCircle(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r;
}

/**
 * מצייר את סימן הפלס על קנבס בגודל size.
 * maskable: הרקע ממלא את כל הריבוע והסמל מוקטן לאזור הבטוח.
 */
function render(size, { maskable = false, rounded = true } = {}) {
  const px = new Uint8Array(size * size * 4);
  const u = size / 32; // יחידת ציור, כמו viewBox 32
  const scale = maskable ? 0.72 : 1;
  const c = size / 2;
  const S = (v) => (v - 16) * u * scale + c; // מרחב 32 → פיקסלים

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x + 0.5;
      const fy = y + 0.5;
      const aa = 1; // רוחב החלקה בפיקסלים

      let color = [0, 0, 0];
      let alpha = 0;

      // רקע
      const bg = maskable || !rounded ? -1 : sdRoundRect(fx, fy, c, c, size / 2, size / 2, 8 * u);
      const bgA = clamp01(0.5 - bg / aa);
      color = BRAND;
      alpha = bgA;

      // זכוכית הפלס
      const vial = sdRoundRect(fx, fy, c, c, 12 * u * scale, 5.5 * u * scale, 5.5 * u * scale);
      const vialA = clamp01(0.5 - vial / aa);
      color = mix(color, VIAL, vialA);

      // שני קווי סימון
      for (const lx of [10.3, 21.7]) {
        const line = sdRoundRect(fx, fy, S(lx), c, 0.7 * u * scale, 3.6 * u * scale, 0.7 * u * scale);
        color = mix(color, BRAND, clamp01(0.5 - line / aa));
      }

      // בועה עם מסגרת דקה
      const ring = sdCircle(fx, fy, c, c, 3.7 * u * scale);
      color = mix(color, BRAND, clamp01(0.5 - ring / aa));
      const bubble = sdCircle(fx, fy, c, c, 3.3 * u * scale);
      color = mix(color, BUBBLE, clamp01(0.5 - bubble / aa));

      const i = (y * size + x) * 4;
      px[i] = color[0];
      px[i + 1] = color[1];
      px[i + 2] = color[2];
      px[i + 3] = Math.round(alpha * 255);
    }
  }
  return px;
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map(Math.round);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192, render(192)));
writeFileSync('public/icons/icon-512.png', png(512, render(512)));
writeFileSync('public/icons/icon-maskable-512.png', png(512, render(512, { maskable: true })));
// iOS מעגל פינות בעצמו — רקע מלא בלי שקיפות
writeFileSync('public/icons/apple-touch-icon.png', png(180, render(180, { rounded: false })));

writeFileSync(
  'public/icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="#0E5E6F"/>
  <rect x="4" y="10.5" width="24" height="11" rx="5.5" fill="#F1F3F2"/>
  <rect x="9.6" y="12.4" width="1.4" height="7.2" rx="0.7" fill="#0E5E6F"/>
  <rect x="21" y="12.4" width="1.4" height="7.2" rx="0.7" fill="#0E5E6F"/>
  <circle cx="16" cy="16" r="3.3" fill="#FFE45C" stroke="#0E5E6F" stroke-width="0.8"/>
</svg>
`,
);

console.log('icons written to public/');
