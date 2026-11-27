import ExcelJS from "exceljs";

export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;

const pad = (n: number) => String(n).padStart(2, "0");

/** The workbook stores naive datetimes that exceljs reads as UTC. They mean IST wall-clock time. */
export function istWallClock(d: Date): string {
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+05:30`
  );
}

function cellValue(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return istWallClock(v);
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      const text = (o.richText as { text: string }[]).map((t) => t.text).join("").trim();
      return text === "" ? null : text;
    }
    if (o.result !== undefined) return cellValue(o.result as ExcelJS.CellValue);
    if (typeof o.text === "string") return o.text.trim() === "" ? null : o.text.trim();
  }
  return null;
}

export async function readWorkbook(source: Buffer | string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  if (typeof source === "string") await wb.xlsx.readFile(source);
  else await wb.xlsx.load(source as unknown as ArrayBuffer);
  return wb;
}

export function findSheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
  return wb.worksheets.find((w) => w.name.trim().toLowerCase() === name.toLowerCase());
}

export function sheetHeaders(ws: ExcelJS.Worksheet): string[] {
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const v = cellValue(cell.value);
    headers[col] = v === null ? "" : String(v);
  });
  return headers.filter((h) => h !== "");
}

export function sheetRows(ws: ExcelJS.Worksheet): Row[] {
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const v = cellValue(cell.value);
    headers[col] = v === null ? "" : String(v);
  });
  const out: Row[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj: Row = {};
    let any = false;
    headers.forEach((h, col) => {
      if (!h) return;
      const v = cellValue(row.getCell(col).value);
      obj[h] = v;
      if (v !== null) any = true;
    });
    if (any) out.push(obj);
  }
  return out;
}