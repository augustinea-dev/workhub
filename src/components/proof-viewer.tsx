"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, useState, type ReactNode } from "react";

const ZOOMS = [1, 1.25, 1.5, 2];
const PDFJS_URL = "/pdfjs/pdf.min.mjs";

type PageSize = { width: number; height: number };

export function ProofViewer({
  url,
  mime,
  fileName,
  overlay,
  onPageClick,
}: {
  url: string;
  mime: string;
  fileName: string;
  overlay?: (page: number) => ReactNode;
  onPageClick?: (page: number, x: number, y: number, el: HTMLElement) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [error, setError] = useState<string | null>(null);
  const isPdf = mime === "application/pdf";

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxWidth(el.clientWidth));
    ro.observe(el);
    setBoxWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!isPdf) return;
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    setDoc(null);
    setSizes([]);
    setError(null);
    (async () => {
      const pdfjs = (await import(/* webpackIgnore: true */ PDFJS_URL)) as typeof import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      loaded = await pdfjs.getDocument({ url }).promise;
      const out: PageSize[] = [];
      for (let i = 1; i <= loaded.numPages; i++) {
        const v = (await loaded.getPage(i)).getViewport({ scale: 1 });
        out.push({ width: v.width, height: v.height });
      }
      if (cancelled) return;
      setSizes(out);
      setDoc(loaded);
    })().catch(() => {
      if (!cancelled) setError("This PDF couldn't be opened. Try downloading it instead.");
    });
    return () => {
      cancelled = true;
      loaded?.destroy();
    };
  }, [url, isPdf]);

  const width = Math.max(200, Math.floor((boxWidth - 32) * ZOOMS[zoom]));

  const click = (page: number) => (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onPageClick || (e.target as HTMLElement).closest("[data-proof-pin]")) return;
    const r = e.currentTarget.getBoundingClientRect();
    onPageClick(page, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, e.currentTarget);
  };

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-white px-4 py-2 text-xs text-stone-600">
        <span>{isPdf ? (sizes.length ? `${sizes.length} page${sizes.length === 1 ? "" : "s"}` : "Loading…") : "Image"}</span>
        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          {ZOOMS.map((z, i) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(i)}
              aria-pressed={zoom === i}
              className={`rounded px-2 py-1 font-medium tabular-nums ${zoom === i ? "bg-stone-900 text-white" : "hover:bg-stone-100"}`}
            >
              {i === 0 ? "Fit" : `${Math.round(z * 100)}%`}
            </button>
          ))}
          <a href={url} download={fileName} className="ml-2 rounded px-2 py-1 font-medium text-blue-700 hover:bg-stone-100">Download</a>
        </div>
      </div>
      <div ref={box} className="max-h-[calc(100vh-14rem)] overflow-auto bg-stone-200/70 p-4">
        {error ? (
          <p className="rounded-md bg-white p-6 text-center text-sm text-stone-600">{error}</p>
        ) : isPdf ? (
          <div className="flex flex-col items-center gap-4">
            {sizes.map((s, i) => (
              <div
                key={i}
                data-page={i + 1}
                onClick={click(i + 1)}
                className={`relative shrink-0 bg-white shadow ${onPageClick ? "cursor-crosshair" : ""}`}
                style={{ width, height: Math.round((width * s.height) / s.width) }}
              >
                {doc && <PdfPage doc={doc} page={i + 1} width={width} />}
                {overlay?.(i + 1)}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex justify-center">
            <div data-page={1} onClick={click(1)} className={`relative shrink-0 shadow ${onPageClick ? "cursor-crosshair" : ""}`} style={{ width }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={fileName} className="block h-auto w-full select-none" draggable={false} />
              {overlay?.(1)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PdfPage({ doc, page, width }: { doc: PDFDocumentProxy; page: number; width: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    (async () => {
      const p = await doc.getPage(page);
      if (cancelled || !canvas.current) return;
      const base = p.getViewport({ scale: 1 });
      const ratio = window.devicePixelRatio || 1;
      const viewport = p.getViewport({ scale: (width / base.width) * ratio });
      const c = canvas.current;
      c.width = Math.floor(viewport.width);
      c.height = Math.floor(viewport.height);
      task = p.render({ canvas: c, viewport });
      await task.promise.catch(() => undefined);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, width]);
  return <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-label={`Page ${page}`} />;
}
