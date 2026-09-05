import sharp from "sharp";
import { mkdirSync } from "node:fs";

mkdirSync("public/icons", { recursive: true });

const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="#2563eb"/>
  <text x="50" y="66" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="700"
        fill="white" text-anchor="middle">C</text>
</svg>`;

const sizes = [192, 512];

for (const size of sizes) {
  await sharp(Buffer.from(svg(size))).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
}

// Maskable-ikon med lite mer marginal
const maskableSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#2563eb"/>
  <text x="256" y="330" font-family="Arial, Helvetica, sans-serif" font-size="220" font-weight="700"
        fill="white" text-anchor="middle">C</text>
</svg>`;
await sharp(Buffer.from(maskableSvg)).resize(512, 512).png().toFile("public/icons/icon-512-maskable.png");

console.log("Ikoner genererade.");
