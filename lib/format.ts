export function fmtMm(mm: number | null | undefined): string {
  if (mm == null) return "—";
  if (mm >= 1000) return `$${(mm / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}bn`;
  return `$${mm.toLocaleString(undefined, { maximumFractionDigits: 1 })}mm`;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function daysSince(d: Date | string): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
