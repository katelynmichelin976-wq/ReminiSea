const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.join(__dirname, '..');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function blend(base, over, alpha) {
  return [
    Math.round(base[0] * (1 - alpha) + over[0] * alpha),
    Math.round(base[1] * (1 - alpha) + over[1] * alpha),
    Math.round(base[2] * (1 - alpha) + over[2] * alpha),
    255
  ];
}

function makeIcon(size, fileName) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const center = size / 2;

  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 4;
      const nx = x / size;
      const ny = y / size;
      const dx = (x - center) / size;
      const dy = (y - center) / size;
      const radial = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 1.8);
      const wave = Math.sin((nx * 3.2 + ny * 1.7) * Math.PI) * 10;
      const base = [
        13 + Math.round(16 * radial),
        76 + Math.round(74 * ny),
        116 + Math.round(92 * radial + wave)
      ];
      raw[i] = base[0];
      raw[i + 1] = base[1];
      raw[i + 2] = base[2];
      raw[i + 3] = 255;
    }
  }

  const setPixel = (x, y, color, alpha = 1) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = y * (size * 4 + 1) + 1 + x * 4;
    const mixed = blend([raw[i], raw[i + 1], raw[i + 2], raw[i + 3]], color, alpha);
    raw[i] = mixed[0];
    raw[i + 1] = mixed[1];
    raw[i + 2] = mixed[2];
    raw[i + 3] = mixed[3];
  };

  const circle = (cx, cy, r, color, alpha = 1) => {
    const rr = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d <= rr) {
          const edge = Math.min(1, (rr - d) / Math.max(1, r * 2));
          setPixel(x, y, color, alpha * Math.min(1, edge + 0.25));
        }
      }
    }
  };

  const line = (x1, y1, x2, y2, width, color, alpha = 1) => {
    const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      circle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, width / 2, color, alpha);
    }
  };

  const white = [250, 253, 255, 255];
  const gold = [255, 214, 102, 255];
  const cyan = [138, 224, 255, 255];

  circle(size * 0.5, size * 0.5, size * 0.24, [255, 255, 255, 255], 0.16);
  circle(size * 0.5, size * 0.5, size * 0.18, [255, 255, 255, 255], 0.12);
  line(size * 0.31, size * 0.58, size * 0.69, size * 0.58, size * 0.055, white, 0.95);
  line(size * 0.5, size * 0.36, size * 0.5, size * 0.73, size * 0.055, white, 0.95);
  line(size * 0.39, size * 0.46, size * 0.61, size * 0.70, size * 0.04, cyan, 0.88);
  line(size * 0.61, size * 0.46, size * 0.39, size * 0.70, size * 0.04, cyan, 0.88);
  circle(size * 0.72, size * 0.28, size * 0.05, gold, 0.95);
  circle(size * 0.26, size * 0.32, size * 0.035, white, 0.75);
  circle(size * 0.72, size * 0.72, size * 0.03, white, 0.65);

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', Buffer.from([
      (size >>> 24) & 255, (size >>> 16) & 255, (size >>> 8) & 255, size & 255,
      (size >>> 24) & 255, (size >>> 16) & 255, (size >>> 8) & 255, size & 255,
      8, 6, 0, 0, 0
    ])),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);

  fs.writeFileSync(path.join(root, fileName), png);
  console.log(`Wrote ${fileName}`);
}

makeIcon(192, 'icon-192.png');
makeIcon(512, 'icon-512.png');
makeIcon(180, 'apple-touch-icon.png');
