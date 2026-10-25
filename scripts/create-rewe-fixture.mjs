// Rebuilt fictional receipt: never reads/copies the user's original PDF.
import { PDFDocument, StandardFonts } from "pdf-lib";
import { writeFile } from "node:fs/promises";
const doc = await PDFDocument.create();
doc.setTitle("Fictional REWE-style extraction fixture");
doc.setAuthor("Smart Kitchen tests");
doc.setCreationDate(new Date("2026-01-01T00:00:00Z"));
doc.setModificationDate(new Date("2026-01-01T00:00:00Z"));
const font = await doc.embedFont(StandardFonts.Courier);
const pages = [
  [
    "FICTIONAL REWE-STYLE TEST - NOT A PURCHASE",
    "REWE TEST MARKET",
    "EUR",
    "GERVAIS HUETTENK                 3,60 B",
    "             2 Stk x   1,80",
    "BANANE BIO                      1,50 B",
    "         0,750 kg x  2,00 EUR/kg",
    "MARONE                          2,00 B",
    "         0,400 kg x  5,00 EUR/kg",
    "H-MILCH 3,5% LAK                 2,20 B",
    "             2 Stk x   1,10",
    "COCA-COLA 0,85L                  1,40 A",
    "PFAND 0,25 EURO                  0,25 A *",
    "GEFLUEGEL-WIENER                 2,50 B",
    "KUEHL.GILL. KALK                 4,00 A",
    "BONUS RABATT                   -0,50 A",
    "SUMME                EUR       16,95",
  ],
  [
    "FICTIONAL REWE-STYLE TEST - PAGE 2",
    "Payment and loyalty identifiers omitted.",
    "No real card, store, operator, timestamp",
    "or fiscal signature is retained.",
    "Non-product footer; 0 inventory lines.",
  ],
];
for (const lines of pages) {
  const page = doc.addPage([400, 620]);
  lines.forEach((line, i) =>
    page.drawText(line, { x: 16, y: 590 - i * 25, size: 11, font }),
  );
}
await writeFile(
  "tests/fixtures/receipts/rewe-style-fictional.pdf",
  await doc.save(),
);
