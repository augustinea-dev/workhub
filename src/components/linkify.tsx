import type { ReactNode } from "react";

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"]+)/gi;
const TRAILING = /[.,;:!?'")\]}]+$/;

export function linkify(text: string, keyPrefix = "l"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    let url = m[0];
    const trail = url.match(TRAILING)?.[0] ?? "";
    if (trail) url = url.slice(0, -trail.length);
    if (!url.replace(/^(https?:\/\/|www\.)/i, "")) continue;
    if (start > last) out.push(text.slice(last, start));
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    out.push(
      <a key={`${keyPrefix}${start}`} href={href} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-blue-700 underline-offset-2 hover:underline">
        {url}
      </a>,
    );
    last = start + url.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
