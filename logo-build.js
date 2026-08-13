// Script tạm: cắt viền trong suốt của logo_nobg.png và xuất các asset thương hiệu.
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const src = path.resolve(__dirname, "logo_nobg.png");
const outDir = path.resolve(__dirname, "public/brand");
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const trimmed = await sharp(src).trim({ threshold: 10 }).toBuffer();
  const meta = await sharp(trimmed).metadata();
  console.log("trimmed:", meta.width, "x", meta.height);

  // Logo dùng trong UI: giữ nguyên tỉ lệ, nền trong suốt, rộng 512.
  await sharp(trimmed)
    .resize({ width: 512, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outDir, "whale.png"));

  // Vuông hoá + đệm 12% để logo không chạm mép icon.
  const side = Math.round(Math.max(meta.width, meta.height) * 1.24);
  const squareLogo = await sharp(trimmed)
    .resize({
      width: Math.round(side * 0.78),
      height: Math.round(side * 0.78),
      fit: "inside",
    })
    .toBuffer();

  // Nền tối bo góc để favicon đọc được trên tab sáng.
  const bg = Buffer.from(
    `<svg width="${side}" height="${side}" xmlns="http://www.w3.org/2000/svg">
       <rect width="${side}" height="${side}" rx="${Math.round(side * 0.22)}" fill="#08080c"/>
     </svg>`,
  );

  const icon = await sharp(bg)
    .composite([{ input: squareLogo, gravity: "center" }])
    .png()
    .toBuffer();

  for (const [file, size] of [
    ["icon.png", 512],
    ["apple-icon.png", 180],
  ]) {
    await sharp(icon)
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(path.resolve(__dirname, "src/app", file));
  }

  console.log("done");
})();
