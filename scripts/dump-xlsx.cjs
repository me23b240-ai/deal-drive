const ExcelJS = require("exceljs");
function val(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.result !== undefined) return String(v.result);
    if (v.text) return String(v.text);
    return JSON.stringify(v);
  }
  return String(v);
}
(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("data/Sponsor_Dataset.xlsx");
  const out = [];
  wb.eachSheet((ws) => {
    out.push("## SHEET: " + ws.name + " | rows=" + ws.rowCount + " | cols=" + ws.columnCount);
    const isGuide = /field|guide|readme|notes/i.test(ws.name);
    const limit = isGuide ? ws.rowCount : Math.min(ws.rowCount, 4);
    for (let i = 1; i <= limit; i++) {
      const vals = ws.getRow(i).values.slice(1).map(val);
      out.push(vals.join(" | "));
    }
    out.push("");
  });
  console.log(out.join("\n"));
})();