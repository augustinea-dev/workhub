/** Mirrors public.billing_year_label and public.build_project_name in the database. */

export type NamingClient = { id: string; name: string; project_label: string | null; fiscal_year_start_month: number | null };

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026", or "FY27" for a fiscal year starting in a given month (named for the year it ends). */
export function billingYearLabel(client: Pick<NamingClient, "fiscal_year_start_month"> | undefined, isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const start = client?.fiscal_year_start_month;
  if (!start) return String(year);
  return `FY${String(year + (month >= start ? 1 : 0)).slice(-2)}`;
}

export function clientLabel(client: NamingClient | undefined): string | undefined {
  return client ? client.project_label?.trim() || client.name : undefined;
}

export function buildProjectName(parts: {
  reference: number | string | null | undefined;
  billingYear: string;
  label: string | undefined;
  title: string;
  type: string | null | undefined;
}): string {
  return [parts.reference, parts.billingYear, parts.label, parts.title.trim(), parts.type]
    .filter((p) => p != null && String(p).trim() !== "")
    .join("_");
}
