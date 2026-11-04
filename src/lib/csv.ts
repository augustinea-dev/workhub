type Cell = string | number | null | undefined;

function cell(v: Cell): string {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  // Text starting with these could run as a formula in Excel.
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A CSV download that Excel opens with the right characters (UTF-8 with BOM). */
export function csvResponse(filename: string, header: string[], rows: Cell[][]): Response {
  const body = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  return new Response(`﻿${body}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "export";
}
