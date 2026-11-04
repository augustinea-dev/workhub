"use client";

import { useState } from "react";
import { billingYearLabel, buildProjectName, clientLabel, type NamingClient } from "@/lib/naming";

/**
 * Client, title, type, start date, name on project and billing year, with a live preview of the
 * project name the database will build from them.
 */
export function ProjectNameFields({
  clients,
  types,
  reference,
  today,
  defaults = {},
  idPrefix = "p",
  titleRequired = true,
}: {
  clients: NamingClient[];
  types: { code: string; label: string }[];
  /** The project's number, or the next one for a new project. */
  reference: number | null;
  today: string;
  defaults?: {
    company_id?: string | null;
    title?: string | null;
    project_type?: string | null;
    start_date?: string | null;
    name_on_project?: string | null;
    billing_year?: string | null;
  };
  idPrefix?: string;
  titleRequired?: boolean;
}) {
  const [companyId, setCompanyId] = useState(defaults.company_id ?? "");
  const [title, setTitle] = useState(defaults.title ?? "");
  const [type, setType] = useState(defaults.project_type ?? "");
  const [start, setStart] = useState(defaults.start_date ?? "");
  const [label, setLabel] = useState(defaults.name_on_project ?? "");
  const [year, setYear] = useState(defaults.billing_year ?? "");
  const client = clients.find((c) => c.id === companyId);
  const autoYear = billingYearLabel(client, start || today);
  const preview = buildProjectName({
    reference,
    billingYear: year.trim() || autoYear,
    label: label.trim() || clientLabel(client),
    title,
    type,
  });
  const id = (k: string) => `${idPrefix}_${k}`;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label" htmlFor={id("title")}>Title</label>
        <input id={id("title")} name="title" required={titleRequired} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Website" className="input w-full" />
      </div>
      <div>
        <label className="label" htmlFor={id("company")}>Client</label>
        <select id={id("company")} name="company_id" value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="input w-full">
          <option value="">No client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={id("type")}>Project type</label>
        <select id={id("type")} name="project_type" value={type} onChange={(e) => setType(e.target.value)} className="input w-full">
          <option value="">None</option>
          {types.map((t) => (
            <option key={t.code} value={t.code}>{t.code === t.label ? t.code : `${t.code} (${t.label})`}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={id("label")}>Name on project</label>
        <input
          id={id("label")}
          name="name_on_project"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={clientLabel(client) ?? "Client or brand"}
          className="input w-full"
        />
      </div>
      <div>
        <label className="label" htmlFor={id("start")}>Start</label>
        <input id={id("start")} name="start_date" type="date" value={start} onChange={(e) => setStart(e.target.value)} className="input w-full" />
      </div>
      <div>
        <label className="label" htmlFor={id("year")}>Billing year</label>
        <input id={id("year")} name="billing_year" value={year} onChange={(e) => setYear(e.target.value)} placeholder={autoYear} className="input w-full" />
      </div>
      <p className="rounded-md bg-stone-50 px-3 py-2 text-sm sm:col-span-2" aria-live="polite">
        <span className="text-xs font-medium uppercase tracking-wide text-stone-500">Project name </span>
        <span className="break-words font-medium text-stone-900">
          {title.trim()
            ? preview.split("_").map((part, i) => (
                <span key={i}>
                  {i > 0 && (
                    <>
                      _<wbr />
                    </>
                  )}
                  {part}
                </span>
              ))
            : "Add a title to see the name"}
        </span>
      </p>
    </div>
  );
}
