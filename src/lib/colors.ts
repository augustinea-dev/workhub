/** Asana-style project colours: each project gets one from this palette, picked from its id. */
const PALETTE = ["#e8384f", "#fd612c", "#f2a71b", "#62b847", "#20aaea", "#4f1d75", "#d4007e", "#a3509b"];

export function projectColor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
