"use client";

/**
 * Pipeline Map — force-clustered, zoomable bubble view of the deal pipeline.
 * Nodes: deals (area = target $, color = asset class, ring = gate status).
 * Clusters: asset class (default) | stage lanes | deal lead.
 * Hovering a deal illuminates links to deals sharing its lead/team members.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  forceSimulation,
  forceX,
  forceY,
  forceCollide,
  forceManyBody,
  type Simulation,
} from "d3-force";
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { select } from "d3-selection";
import { assetClassColor, OTHER_COLOR } from "@/lib/palette";
import { STAGES, STAGE_LABELS, type Stage } from "@/lib/types";
import { fmtMm } from "@/lib/format";

export type MapDeal = {
  id: string;
  managerName: string;
  fundName: string;
  targetSizeMm: number | null;
  stage: string;
  status: string;
  assetClass: string;
  leadId: string;
  leadName: string;
  teamIds: string[];
  gateReady: boolean | null;
  openFollowUps: number;
  approvedCount: number | null;
};

type Grouping = "assetClass" | "stage" | "lead";

type Node = MapDeal & { x: number; y: number; vx?: number; vy?: number; r: number; color: string };

const W = 1280;
const H = 760;

function radius(mm: number | null): number {
  if (!mm || mm <= 0) return 8;
  return Math.max(8, Math.min(34, 4.2 * Math.sqrt(mm)));
}

function groupKey(d: MapDeal, g: Grouping): string {
  return g === "assetClass" ? d.assetClass : g === "stage" ? d.stage : d.leadId;
}

function groupLabel(d: MapDeal, g: Grouping): string {
  return g === "assetClass"
    ? d.assetClass
    : g === "stage"
      ? (STAGE_LABELS[d.stage as Stage] ?? d.stage)
      : d.leadName;
}

type Cluster = {
  key: string;
  label: string;
  x: number;
  y: number;
  labelY: number;
  count: number;
  mm: number;
};

function computeClusters(deals: MapDeal[], g: Grouping): Map<string, Cluster> {
  const acc = new Map<string, Cluster>();
  for (const d of deals) {
    const key = groupKey(d, g);
    const c =
      acc.get(key) ?? { key, label: groupLabel(d, g), x: 0, y: 0, labelY: 26, count: 0, mm: 0 };
    c.count += 1;
    c.mm += d.targetSizeMm ?? 0;
    acc.set(key, c);
  }
  if (g === "stage") {
    STAGES.forEach((s, i) => {
      const c = acc.get(s);
      if (c) {
        c.x = ((i + 0.5) / STAGES.length) * W;
        c.y = H / 2 + 20;
        c.labelY = 26;
      }
    });
  } else {
    const clusters = [...acc.values()].sort((a, b) => b.mm - a.mm);
    const cols = Math.max(1, Math.ceil(Math.sqrt((clusters.length * W) / H)));
    const rows = Math.max(1, Math.ceil(clusters.length / cols));
    const cellH = (H - 50) / rows;
    clusters.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      c.x = ((col + 0.5) / cols) * W;
      c.y = (row + 0.5) * cellH + 50;
      c.labelY = row * cellH + 50 + 14;
    });
  }
  return acc;
}

export default function DealMap({
  deals,
  assetClasses,
}: {
  deals: MapDeal[];
  assetClasses: string[];
}) {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const simRef = useRef<Simulation<Node, undefined> | null>(null);

  const classIndex = useMemo(() => {
    const m = new Map<string, number>();
    assetClasses.forEach((name, i) => m.set(name, i));
    return m;
  }, [assetClasses]);

  const nodesRef = useRef<Node[]>([]);
  if (nodesRef.current.length !== deals.length) {
    // scale radii so the bubbles' total area stays within ~30% of the canvas —
    // keeps clusters visually separate at hundreds of deals
    const raw = deals.map((d) => radius(d.targetSizeMm));
    const totalArea = raw.reduce((s, r) => s + Math.PI * r * r, 0);
    const scale = Math.min(1, Math.sqrt((0.3 * W * H) / Math.max(1, totalArea)));
    nodesRef.current = deals.map((d, i) => ({
      ...d,
      r: Math.max(5, raw[i]! * scale),
      color: assetClassColor(classIndex.get(d.assetClass) ?? -1),
      x: W / 2 + 40 * Math.cos((i / Math.max(1, deals.length)) * Math.PI * 2),
      y: H / 2 + 40 * Math.sin((i / Math.max(1, deals.length)) * Math.PI * 2),
    }));
  }

  const [grouping, setGrouping] = useState<Grouping>("assetClass");
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const clusters = useMemo(
    () => computeClusters(deals, grouping),
    [deals, grouping]
  );

  // deal id → ids of deals sharing its lead or any team member
  const related = useMemo(() => {
    const byPerson = new Map<string, string[]>();
    for (const d of deals) {
      for (const p of new Set([d.leadId, ...d.teamIds])) {
        byPerson.set(p, [...(byPerson.get(p) ?? []), d.id]);
      }
    }
    const m = new Map<string, Set<string>>();
    for (const d of deals) {
      const s = new Set<string>();
      for (const p of new Set([d.leadId, ...d.teamIds])) {
        for (const other of byPerson.get(p) ?? []) if (other !== d.id) s.add(other);
      }
      m.set(d.id, s);
    }
    return m;
  }, [deals]);

  // simulation
  useEffect(() => {
    const nodes = nodesRef.current;
    const sim =
      simRef.current ??
      forceSimulation<Node>(nodes)
        .force("collide", forceCollide<Node>((d) => d.r + 2.5))
        .force("charge", forceManyBody<Node>().strength(-4));
    simRef.current = sim;

    // stage lanes: strong x pull, loose y — lanes stretch vertically instead
    // of bleeding into neighbors
    const sx = grouping === "stage" ? 0.3 : 0.14;
    const sy = grouping === "stage" ? 0.035 : 0.14;
    sim
      .force(
        "x",
        forceX<Node>((d) => clusters.get(groupKey(d, grouping))?.x ?? W / 2).strength(sx)
      )
      .force(
        "y",
        forceY<Node>((d) => clusters.get(groupKey(d, grouping))?.y ?? H / 2).strength(sy)
      );

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      sim.stop();
      sim.tick(300);
      setTick((t) => t + 1);
      return;
    }

    let raf = 0;
    sim.on("tick", () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setTick((t) => t + 1));
    });
    sim.alpha(0.6).restart();
    return () => {
      cancelAnimationFrame(raf);
      sim.on("tick", null);
      sim.stop();
    };
  }, [clusters, grouping]);

  // zoom behavior
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behavior = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 4])
      .on("zoom", (e) => setTransform({ x: e.transform.x, y: e.transform.y, k: e.transform.k }));
    zoomRef.current = behavior;
    select(svg).call(behavior).on("dblclick.zoom", null);
    return () => {
      select(svg).on(".zoom", null);
    };
  }, []);

  const zoomBy = (factor: number) => {
    const svg = svgRef.current;
    if (svg && zoomRef.current) zoomRef.current.scaleBy(select(svg), factor);
  };
  const zoomReset = () => {
    const svg = svgRef.current;
    if (svg && zoomRef.current) zoomRef.current.transform(select(svg), zoomIdentity);
  };

  const k = transform.k;
  const nodes = nodesRef.current;
  const hovered = hoverId ? nodes.find((n) => n.id === hoverId) : null;
  const hoveredRelated = hoverId ? related.get(hoverId) : null;
  const captionSize = Math.min(22, 13 / Math.min(k, 1));
  const extraClasses = assetClasses.length > 7;

  return (
    <div className="mt-5">
      {/* legend + controls */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-stone-600">
        <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-white p-0.5 shadow-sm">
          {(
            [
              ["assetClass", "Asset class"],
              ["stage", "Stage"],
              ["lead", "Lead"],
            ] as [Grouping, string][]
          ).map(([g, label]) => (
            <button
              key={g}
              onClick={() => setGrouping(g)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${
                grouping === g ? "bg-accent-700 text-white" : "text-stone-500 hover:bg-stone-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {assetClasses.slice(0, 7).map((name, i) => (
          <span key={name} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: assetClassColor(i) }} />
            {name}
          </span>
        ))}
        {extraClasses && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: OTHER_COLOR }} />
            Other
          </span>
        )}
        <span className="ml-auto flex items-center gap-3 text-stone-400">
          <span>area = target $</span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-emerald-500" /> gate ready
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-amber-500" /> items open
          </span>
          <span>hover: shared-team links</span>
        </span>
      </div>

      <div className="relative mt-2 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        {/* zoom controls */}
        <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
          {(
            [
              ["+", "Zoom in", () => zoomBy(1.35)],
              ["−", "Zoom out", () => zoomBy(1 / 1.35)],
              ["⌂", "Reset zoom", zoomReset],
            ] as [string, string, () => void][]
          ).map(([label, aria, fn]) => (
            <button
              key={label}
              onClick={fn}
              className="grid h-7 w-7 place-items-center rounded-md border border-stone-200 bg-white text-[13px] text-stone-600 shadow-sm hover:bg-stone-50"
              aria-label={aria}
            >
              {label}
            </button>
          ))}
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-[calc(100vh-290px)] min-h-[540px] w-full cursor-grab active:cursor-grabbing"
          role="img"
          aria-label="Pipeline map: deals as bubbles clustered by group"
          onMouseLeave={() => setHoverId(null)}
        >
          <g transform={`translate(${transform.x},${transform.y}) scale(${k})`}>
            {/* hover edges */}
            {hovered &&
              hoveredRelated &&
              nodes
                .filter((n) => hoveredRelated.has(n.id))
                .map((n) => (
                  <line
                    key={n.id}
                    x1={hovered.x}
                    y1={hovered.y}
                    x2={n.x}
                    y2={n.y}
                    stroke="#a8a29e"
                    strokeWidth={1.5 / k}
                    opacity={0.55}
                  />
                ))}

            {/* nodes */}
            {nodes.map((n) => {
              const dimmed =
                hovered && n.id !== hovered.id && !hoveredRelated?.has(n.id);
              const showName = k >= 1.25 && n.r * k >= 14;
              const showDetail = k >= 1.8;
              const onHold = n.status === "ON_HOLD";
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  opacity={dimmed ? 0.3 : onHold ? 0.65 : 1}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverId(n.id)}
                  onClick={() => router.push(`/deals/${n.id}`)}
                >
                  {n.gateReady !== null && (
                    <circle
                      r={n.r + 2.5}
                      fill="none"
                      stroke={n.gateReady ? "#059669" : "#d97706"}
                      strokeWidth={n.id === hoverId ? 3 : 1.8}
                    />
                  )}
                  <circle
                    r={n.r}
                    fill={n.color}
                    stroke="#ffffff"
                    strokeWidth={2}
                    strokeDasharray={onHold ? "3 2" : undefined}
                  />
                  {n.status === "APPROVED" && k >= 1.2 && (
                    <text
                      textAnchor="middle"
                      dy={4}
                      fontSize={Math.max(9, n.r * 0.8)}
                      fill="#ffffff"
                      fontWeight={700}
                    >
                      ✓
                    </text>
                  )}
                  {showName && (
                    <text
                      textAnchor="middle"
                      y={n.r + 12 / k}
                      fontSize={11 / k}
                      fill="#57534e"
                      fontWeight={600}
                    >
                      {n.managerName.length > 18
                        ? `${n.managerName.slice(0, 17)}…`
                        : n.managerName}
                    </text>
                  )}
                  {showName && showDetail && (
                    <text
                      textAnchor="middle"
                      y={n.r + 12 / k + 12 / k}
                      fontSize={9.5 / k}
                      fill="#a8a29e"
                    >
                      {fmtMm(n.targetSizeMm)} · {STAGE_LABELS[n.stage as Stage] ?? n.stage}
                    </text>
                  )}
                </g>
              );
            })}

            {/* cluster captions — painted last, halo keeps them readable */}
            {[...clusters.values()].map((c) => (
              <text
                key={c.key}
                x={c.x}
                y={c.labelY}
                textAnchor="middle"
                fontSize={captionSize}
                fontWeight={600}
                fill="#78716c"
                stroke="#ffffff"
                strokeWidth={3.5 / k}
                paintOrder="stroke"
              >
                {c.label}
                <tspan fontWeight={400} fill="#a8a29e">
                  {"  "}
                  {c.count} · {fmtMm(c.mm)}
                </tspan>
              </text>
            ))}
          </g>
        </svg>

        {/* tooltip */}
        {hovered && (
          <div
            className="pointer-events-none absolute z-20 w-60 rounded-lg border border-stone-200 bg-white p-3 shadow-lg"
            style={{
              left: `min(max(${((hovered.x * k + transform.x) / W) * 100}%, 2%), 78%)`,
              top: `min(max(${((hovered.y * k + transform.y) / H) * 100 - 4}%, 2%), 70%)`,
            }}
          >
            <p className="text-[13px] font-semibold text-stone-900">{hovered.managerName}</p>
            <p className="text-[12px] text-stone-500">{hovered.fundName}</p>
            <p className="mt-1.5 text-[12px] text-stone-600">
              {hovered.assetClass} · {fmtMm(hovered.targetSizeMm)}
            </p>
            <p className="text-[12px] text-stone-600">
              {STAGE_LABELS[hovered.stage as Stage] ?? hovered.stage} · lead {hovered.leadName}
            </p>
            {hovered.openFollowUps > 0 && (
              <p className="text-[12px] text-amber-600">
                {hovered.openFollowUps} open follow-up{hovered.openFollowUps > 1 ? "s" : ""}
              </p>
            )}
            {hovered.approvedCount !== null && (
              <p className="text-[12px] text-accent-800">✓ {hovered.approvedCount}/4 signed</p>
            )}
            {(hoveredRelated?.size ?? 0) > 0 && (
              <p className="mt-1 text-[11px] text-stone-400">
                {hoveredRelated!.size} deal{hoveredRelated!.size > 1 ? "s" : ""} share team members
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
