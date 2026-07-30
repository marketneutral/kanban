/**
 * Categorical palette for asset classes (map view, legends).
 *
 * Validated with the dataviz six-checks script (light mode, surface #fcfcfb):
 * lightness band, chroma floor, contrast, and normal-vision separation all PASS.
 * One adjacent pair (#be185d rose ↔ #4d7c0f olive) sits at deutan ΔE 6.8 — legal
 * with secondary encoding, which the map provides (2px surface rings between
 * marks, text-labeled legend chips, named tooltips, and cluster captions).
 *
 * Hues are assigned to asset classes SORTED BY NAME, in this fixed order —
 * never cycled, never re-assigned when filters change. Classes beyond the 7th
 * fold into the neutral "Other" slot.
 */

export const CATEGORICAL = [
  "#2f6fa8", // Columbia blue (matches app accent-600)
  "#b45309", // amber
  "#0d9488", // teal
  "#be185d", // rose
  "#4d7c0f", // olive
  "#7c3aed", // violet
  "#c2410c", // orange
] as const;

export const OTHER_COLOR = "#78716c"; // neutral fold for 8th+ classes

export function assetClassColor(sortedIndex: number): string {
  return sortedIndex >= 0 && sortedIndex < CATEGORICAL.length
    ? CATEGORICAL[sortedIndex]!
    : OTHER_COLOR;
}
