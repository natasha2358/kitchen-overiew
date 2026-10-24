import { Buffer } from "node:buffer";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { writeFile } from "node:fs/promises";
const path = new URL("../tests/fixtures/receipts/", import.meta.url);
const text = await PDFDocument.create();
const page = text.addPage([400, 500]);
const font = await text.embedFont(StandardFonts.Helvetica);
[
  "SYNTHETIC TEST RECEIPT — NOT A STORE RECEIPT",
  "Rice 2 x 500 g",
  "Apples 0.750 kg",
  "Milk 1 l",
  "Discount -0.20",
  "Mystery item: quantity unclear",
].forEach((line, i) =>
  page.drawText(line, { x: 20, y: 460 - i * 30, size: 12, font }),
);
await writeFile(new URL("synthetic-text.pdf", path), await text.save());
const image = await PDFDocument.create();
const imagePage = image.addPage([400, 500]);
const png = await image.embedPng(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO1sAAAAASUVORK5CYII=",
    "base64",
  ),
);
imagePage.drawImage(png, { x: 20, y: 20, width: 360, height: 460 });
await writeFile(new URL("synthetic-image-only.pdf", path), await image.save());
