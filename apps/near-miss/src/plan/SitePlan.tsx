/**
 * The site plan: an architectural drawing of one site (zones as rooms and yards, walls, doors, racks, routes), every
 * report of the last 90 days as a pin coloured by the lens, fixed hazards as small check marks, and a heat layer that
 * blooms over hotspots. `t` replays any day of the last 90: pins appear when they were reported, statuses and heat
 * are as they were that day.
 *
 * Two layers: the drawing is one scaled group (pans and zooms with a CSS transform), while pins and labels are drawn
 * at screen size on top, moved by the same transition, so they stay legible at any zoom and on a phone.
 */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';

import { toMs } from '@x10/shared/lib';

import { categoryLabels, kindLabels, potentialLabels, statusLabels } from '../config';
import type { Hotspot } from '../domain/hotspots';
import { heatOf, statusAt, zoneHeat } from '../domain/hotspots';
import type { Role } from '../domain/reports';
import { triageClock } from '../domain/rules';
import type { LensKey } from '../domain/today';
import type { Action, Potential, Report, ReportStatus, Site, Zone } from '../model';
import { KindGlyph } from '../components/bits';
import { drawPlan, fixturesOf, isIndoor, type Fixture, type Wall } from './geometry';
import { AGE_VAR, ageBucket, CAT_VAR, POT_VAR, STATUS_VAR } from './palette';

export type PlanFocus = { kind: 'report'; id: string } | { kind: 'zone'; id: string } | null;

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SitePlanProps {
  site: Site;
  zones: Zone[];
  reports: Report[];
  actions: Action[];
  lens: LensKey;
  role: Role;
  meSub: string;
  /** The day being shown (ms). Equal to `now` when live. */
  t: number;
  now: number;
  /** The hottest any zone got over the 90 days: the heat layer's full scale. */
  heatPeak: number;
  hotspots: Hotspot[];
  focus: PlanFocus;
  onFocus: (f: PlanFocus) => void;
  /** Space the overlays take, in px, so the plan fits between them. */
  insets: Insets;
  reducedMotion: boolean;
}

/** Base drawing units per grid unit. */
const U = 10;
const W = 100 * U;
const H = 60 * U;
const PIN_SCALE: Record<Potential, number> = { low: 0.86, medium: 0.96, high: 1.06, serious: 1.2 };

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export interface PinView {
  r: Report;
  status: ReportStatus;
  color: string;
  fixed: boolean;
  dim: boolean;
  mine: boolean;
  urgent: boolean;
}

export function pinColor(r: Report, status: ReportStatus, lens: LensKey, t: number): string {
  switch (lens) {
    case 'status':
      return STATUS_VAR[status];
    case 'category':
      return CAT_VAR[r.category];
    case 'age':
      return AGE_VAR[ageBucket(r.reportedAt, t)];
    case 'heat':
      return POT_VAR[r.potential];
    default:
      return POT_VAR[r.potential];
  }
}

export function SitePlan(props: SitePlanProps) {
  const { site, zones, reports, actions, lens, role, meSub, t, now, heatPeak, hotspots, focus, onFocus, insets, reducedMotion } = props;
  const [wrap, size] = useSize<HTMLDivElement>();
  const mountedAt = useRef(Date.now());
  const live = Math.abs(now - t) < 60_000;

  const drawing = useMemo(() => drawPlan(zones, site.kind), [zones, site.kind]);
  const fixtures = useMemo(() => zones.flatMap((z) => fixturesOf(z, site.kind).map((f) => ({ ...f, zoneId: z.id }))), [zones, site.kind]);

  // Fit the plan between the overlays; zoom to the focused zone (or the focused pin's zone).
  const focusZone = focus?.kind === 'zone' ? zones.find((z) => z.id === focus.id) : focus?.kind === 'report' ? zones.find((z) => z.id === reports.find((r) => r.id === focus.id)?.zoneId) : undefined;
  const view = useMemo(() => {
    const aw = Math.max(80, size.w - insets.left - insets.right);
    const ah = Math.max(80, size.h - insets.top - insets.bottom);
    const fit = Math.min(aw / W, ah / H);
    let s = fit;
    let cx = W / 2;
    let cy = H / 2;
    if (focusZone) {
      const m = 9 * U;
      const rw = Math.max(focusZone.w * U + m * 2, 46 * U);
      const rh = Math.max(focusZone.h * U + m * 2, 28 * U);
      s = Math.min(aw / rw, ah / rh, fit * 2.6);
      s = Math.max(s, fit);
      cx = (focusZone.x + focusZone.w / 2) * U;
      cy = (focusZone.y + focusZone.h / 2) * U;
      // Keep the plan's edge from floating into the middle of the screen.
      const halfW = aw / 2 / s;
      const halfH = ah / 2 / s;
      cx = Math.min(Math.max(cx, Math.min(halfW, W / 2)), Math.max(W - halfW, W / 2));
      cy = Math.min(Math.max(cy, Math.min(halfH, H / 2)), Math.max(H - halfH, H / 2));
    }
    return { s, tx: insets.left + aw / 2 - cx * s, ty: insets.top + ah / 2 - cy * s };
  }, [size.w, size.h, insets.left, insets.right, insets.top, insets.bottom, focusZone]);

  const sx = (gx: number) => view.tx + gx * U * view.s;
  const sy = (gy: number) => view.ty + gy * U * view.s;

  // Pins as of day t.
  const pins: PinView[] = useMemo(() => {
    const out: PinView[] = [];
    for (const r of reports) {
      if (r.x === null || r.y === null) continue;
      const status = statusAt(r, actions, t);
      if (!status) continue;
      const fixed = status === 'fixed' || status === 'closed';
      const mine = r.reporterSub === meSub;
      const inFocusZone = focus?.kind === 'zone' ? r.zoneId === focus.id : true;
      const dim = (role === 'reporter' && !mine) || !inFocusZone;
      const urgent = live && status === 'new' && (r.potential === 'serious' || r.potential === 'high');
      out.push({ r, status, color: pinColor(r, status, lens, t), fixed, dim, mine, urgent });
    }
    // Draw fixed marks first, then open pins by y so lower pins overlap upper ones; urgent and focused last.
    return out.sort((a, b) => Number(!a.fixed) - Number(!b.fixed) || (a.r.y ?? 0) - (b.r.y ?? 0) || Number(a.urgent) - Number(b.urgent));
  }, [reports, actions, t, lens, role, meSub, focus, live]);

  const heat = useMemo(() => zoneHeat(reports, t), [reports, t]);
  const heatBlobs = useMemo(() => {
    return zones
      .map((z) => {
        const h = Math.min(1, (heat.get(z.id) ?? 0) / Math.max(heatPeak, 1));
        const mine = reports.filter((r) => r.zoneId === z.id && r.x !== null && toMs(r.reportedAt) <= t);
        let wx = 0;
        let wy = 0;
        let wsum = 0;
        for (const r of mine) {
          const w = heatOf(r, t);
          wx += (r.x ?? 0) * w;
          wy += (r.y ?? 0) * w;
          wsum += w;
        }
        const cx = (wsum ? wx / wsum : z.x + z.w / 2) * U;
        const cy = (wsum ? wy / wsum : z.y + z.h / 2) * U;
        const R = (5 + 13 * Math.sqrt(h)) * U;
        return { z, h, cx, cy, R };
      })
      .filter((b) => b.h > 0.02);
  }, [zones, heat, heatPeak, reports, t]);
  const heatStrength = lens === 'heat' ? 1 : role === 'lead' ? 0.42 : 0.3;

  const rank = new Map(hotspots.slice(0, 3).map((h, i) => [h.zone.id, { rank: i + 1, score: h.score }]));
  const zoneCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pins) if (p.r.zoneId) m.set(p.r.zoneId, (m.get(p.r.zoneId) ?? 0) + 1);
    return m;
  }, [pins]);

  const stagger = Date.now() - mountedAt.current < 400;
  const order = useMemo(() => new Map([...reports].sort((a, b) => toMs(a.reportedAt) - toMs(b.reportedAt)).map((r, i) => [r.id, i])), [reports]);
  const pan = reducedMotion ? undefined : 'nm-pan';

  const onPinKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onFocus({ kind: 'report', id });
    }
  };

  const ready = size.w > 0 && size.h > 0;

  return (
    <div ref={wrap} className="absolute inset-y-0 left-0 w-[calc(100%-var(--side-w,0px))]" data-testid="site-plan" data-site={site.name} data-lens={lens}>
      {ready && (
        <svg
          width={size.w}
          height={size.h}
          className="absolute inset-0 block select-none"
          role="group"
          aria-label={`Plan of ${site.name}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) onFocus(null);
          }}
        >
          <defs>
            <pattern id="nm-grid" width={U} height={U} patternUnits="userSpaceOnUse">
              <path d={`M ${U} 0 L 0 0 0 ${U}`} fill="none" stroke="var(--plan-grid)" strokeWidth={0.6} />
            </pattern>
            <pattern id="nm-grid-major" width={U * 10} height={U * 10} patternUnits="userSpaceOnUse">
              <rect width={U * 10} height={U * 10} fill="url(#nm-grid)" />
              <path d={`M ${U * 10} 0 L 0 0 0 ${U * 10}`} fill="none" stroke="var(--plan-grid-major)" strokeWidth={1} />
            </pattern>
            <pattern id="nm-hatch" width={9} height={9} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1={0} y1={0} x2={0} y2={9} stroke="var(--plan-line-2)" strokeWidth={1.2} />
            </pattern>
            <radialGradient id="nm-heat-soft">
              <stop offset="0%" stopColor="var(--heat-2)" stopOpacity={0.55} />
              <stop offset="55%" stopColor="var(--heat-1)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--heat-1)" stopOpacity={0} />
            </radialGradient>
            <radialGradient id="nm-heat-core">
              <stop offset="0%" stopColor="var(--heat-3)" stopOpacity={0.85} />
              <stop offset="45%" stopColor="var(--heat-2)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="var(--heat-2)" stopOpacity={0} />
            </radialGradient>
            <clipPath id="nm-site-clip">
              <rect x={0} y={0} width={W} height={H} />
            </clipPath>
            <filter id="nm-pin-shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx={0} dy={1.2} stdDeviation={1.2} floodColor="var(--world-shadow)" floodOpacity={1} />
            </filter>
          </defs>

          {/* ---------------- the drawing (scaled) ---------------- */}
          <g className={pan} style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, transformOrigin: '0 0' }}>
            <rect x={-W} y={-H} width={W * 3} height={H * 3} fill="url(#nm-grid-major)" onClick={() => onFocus(null)} />
            {/* Floors */}
            {zones.map((z) => (
              <rect
                key={`f-${z.id}`}
                x={z.x * U}
                y={z.y * U}
                width={z.w * U}
                height={z.h * U}
                fill={z.kind === 'yard' ? 'var(--plan-yard)' : z.kind === 'route' ? 'var(--plan-route)' : z.kind === 'dock' || z.kind === 'plant' ? 'var(--plan-floor-2)' : 'var(--plan-floor)'}
              />
            ))}
            {zones
              .filter((z) => z.kind === 'yard')
              .map((z) => (
                <rect key={`h-${z.id}`} x={z.x * U} y={z.y * U} width={z.w * U} height={z.h * U} fill="url(#nm-hatch)" />
              ))}
            {/* Fixtures */}
            <g aria-hidden="true">
              {fixtures.map((f, i) => (
                <FixtureMark key={i} f={f} />
              ))}
              {drawing.crossings.map((c, i) => (
                <Crossing key={`x-${i}`} c={c} />
              ))}
              {drawing.trailers.map((tr, i) => (
                <g key={`t-${i}`}>
                  <rect x={tr.x * U} y={tr.y * U} width={tr.w * U} height={tr.h * U} rx={2} fill="var(--plan-floor)" stroke="var(--plan-wall-2)" strokeWidth={1.4} />
                  <line
                    x1={tr.w > tr.h ? (tr.x + 1.4) * U : tr.x * U + 3}
                    y1={tr.w > tr.h ? tr.y * U + 3 : (tr.y + 1.4) * U}
                    x2={tr.w > tr.h ? (tr.x + 1.4) * U : (tr.x + tr.w) * U - 3}
                    y2={tr.w > tr.h ? (tr.y + tr.h) * U - 3 : (tr.y + 1.4) * U}
                    stroke="var(--plan-line)"
                    strokeWidth={1}
                  />
                </g>
              ))}
            </g>

            {/* Heat */}
            <g clipPath="url(#nm-site-clip)" className="nm-heat-layer" aria-hidden="true" data-testid="heat-layer">
              {heatBlobs.map((b) => (
                <g key={`heat-${b.z.id}`} data-heat-zone={b.z.name} data-heat={b.h.toFixed(3)}>
                  <circle
                    className={reducedMotion ? undefined : 'nm-heat'}
                    cx={b.cx}
                    cy={b.cy}
                    r={b.R * 1.35}
                    fill="url(#nm-heat-soft)"
                    style={{ opacity: Math.min(1, b.h * 1.8) * heatStrength, transform: `scale(${0.55 + 0.45 * heatStrength})` } as CSSProperties}
                  />
                  <circle
                    className={reducedMotion ? undefined : 'nm-heat'}
                    cx={b.cx}
                    cy={b.cy}
                    r={b.R * 0.85}
                    fill="url(#nm-heat-core)"
                    style={{ opacity: b.h ** 1.25 * heatStrength, transform: `scale(${0.4 + 0.6 * heatStrength})` } as CSSProperties}
                  />
                </g>
              ))}
            </g>

            {/* Walls, doors, dock doors */}
            <g aria-hidden="true" strokeLinecap="square">
              {drawing.walls.map((w, i) => (
                <WallLine key={i} w={w} />
              ))}
              {drawing.doors.map((d, i) => {
                const r = d.width * U;
                const hx = d.x * U;
                const hy = d.y * U;
                const ex = hx + d.dx * r;
                const ey = hy + d.dy * r;
                const lx = hx + d.nx * r;
                const ly = hy + d.ny * r;
                const sweep = d.dx * d.ny - d.dy * d.nx > 0 ? 1 : 0;
                return (
                  <g key={`d-${i}`}>
                    <line x1={hx} y1={hy} x2={lx} y2={ly} stroke="var(--plan-wall-2)" strokeWidth={1.4} />
                    <path d={`M ${lx} ${ly} A ${r} ${r} 0 0 ${sweep ? 0 : 1} ${ex} ${ey}`} fill="none" stroke="var(--plan-line)" strokeWidth={0.9} strokeDasharray="3 2" />
                  </g>
                );
              })}
              {drawing.dockDoors.map((d) => {
                const x1 = d.x * U;
                const y1 = d.y * U;
                const x2 = x1 + d.dx * d.width * U;
                const y2 = y1 + d.dy * d.width * U;
                const lx = (x1 + x2) / 2 + d.nx * 9;
                const ly = (y1 + y2) / 2 + d.ny * 9;
                return (
                  <g key={`dd-${d.n}`}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--plan-wall-2)" strokeWidth={3} strokeDasharray="3 2.2" strokeLinecap="butt" />
                    <text x={lx} y={ly + 2.8} textAnchor="middle" fontSize={8} fontFamily="var(--font-mono, ui-monospace)" fill="var(--plan-label)">
                      {d.n}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* Drawing furniture: scale bar and north point */}
            <g aria-hidden="true" transform={`translate(0, ${H + 20})`} fontFamily="var(--font-mono, ui-monospace)" fontSize={9} fill="var(--plan-label)">
              <rect x={0} y={0} width={50} height={5} fill="var(--plan-wall-2)" />
              <rect x={50} y={0} width={50} height={5} fill="none" stroke="var(--plan-wall-2)" strokeWidth={1} />
              <rect x={100} y={0} width={100} height={5} fill="var(--plan-wall-2)" />
              <text x={0} y={18}>0</text>
              <text x={100} y={18} textAnchor="middle">10</text>
              <text x={200} y={18} textAnchor="middle">20 m</text>
              <text x={240} y={7} fill="var(--plan-label)" letterSpacing="0.08em">
                {site.name.toUpperCase()} · SITE PLAN · 1 SQUARE = 1 M
              </text>
            </g>
            <g aria-hidden="true" transform={`translate(${W - 12}, ${H + 26})`}>
              <circle r={11} fill="none" stroke="var(--plan-wall-2)" strokeWidth={1} />
              <path d="M0 -15 L5 5 L0 1.5 L-5 5 Z" fill="var(--plan-wall)" />
              <text y={-19} textAnchor="middle" fontSize={9} fontWeight={600} fontFamily="var(--font-mono, ui-monospace)" fill="var(--plan-ink)">
                N
              </text>
            </g>

            {/* Zone hit areas and the focused zone's outline */}
            {zones.map((z) => {
              const n = zoneCount.get(z.id) ?? 0;
              const focused = focus?.kind === 'zone' && focus.id === z.id;
              return (
                <rect
                  key={`z-${z.id}`}
                  className="nm-zone-hit"
                  role="button"
                  tabIndex={-1}
                  aria-label={`${z.name}: ${n} report${n === 1 ? '' : 's'} shown`}
                  data-zone={z.name}
                  x={z.x * U + 1}
                  y={z.y * U + 1}
                  width={z.w * U - 2}
                  height={z.h * U - 2}
                  fill="transparent"
                  stroke={focused ? 'var(--plan-focus-line)' : 'none'}
                  strokeWidth={focused ? 2.4 / Math.max(view.s, 0.3) : 0}
                  strokeDasharray={focused ? '8 6' : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFocus(focused ? null : { kind: 'zone', id: z.id });
                  }}
                />
              );
            })}
          </g>

          {/* ---------------- labels (screen size) ---------------- */}
          <g aria-hidden="true" pointerEvents="none">
            {zones.map((z) => {
              const zw = z.w * U * view.s;
              const zh = z.h * U * view.s;
              if (zw < 46 || zh < 22) return null;
              const fs = zw > 150 ? 10.5 : 9.5;
              const rk = lens === 'heat' && zh > 40 ? rank.get(z.id) : undefined;
              const maxChars = Math.floor((zw - 14 - (rk ? 78 : 0)) / (fs * 0.62));
              const name = z.name.toUpperCase();
              const label = name.length > maxChars ? `${name.slice(0, Math.max(3, maxChars - 1))}…` : name;
              return (
                <g key={`l-${z.id}`} className={pan} style={{ transform: `translate(${sx(z.x) + 7}px, ${sy(z.y) + 7}px)` }}>
                  <text
                    y={fs}
                    fontSize={fs}
                    fontFamily="var(--font-mono, ui-monospace)"
                    letterSpacing="0.06em"
                    fill={z.kind === 'yard' ? 'var(--plan-label)' : 'var(--plan-ink)'}
                    fillOpacity={z.kind === 'yard' ? 0.9 : 0.62}
                    fontWeight={500}
                  >
                    {label}
                  </text>
                  {rk && zh > 40 && (
                    <g transform={`translate(${zw - 14 - (rk.rank === 1 ? 70 : 64)}, -1)`} data-hotspot-rank={rk.rank}>
                      <rect width={rk.rank === 1 ? 70 : 64} height={17} rx={8.5} fill={rk.rank === 1 ? 'var(--heat-3)' : 'var(--plan-ink)'} fillOpacity={rk.rank === 1 ? 1 : 0.82} />
                      <text x={8} y={12} fontSize={10} fontFamily="var(--font-mono, ui-monospace)" fill={rk.rank === 1 ? 'white' : 'var(--plan-paper)'} fontWeight={600}>
                        #{rk.rank} · {rk.score}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>

          {/* ---------------- pins (screen size) ---------------- */}
          <g data-testid="pins">
            {pins.map((p) => {
              const focused = focus?.kind === 'report' && focus.id === p.r.id;
              const k = PIN_SCALE[p.r.potential] * (focused ? 1.3 : 1) * (view.s < 0.55 ? 0.82 : 1);
              const delay = stagger && !reducedMotion ? Math.min(1100, (order.get(p.r.id) ?? 0) * 14) : 0;
              const zoneName = zones.find((z) => z.id === p.r.zoneId)?.name ?? 'Unzoned';
              const label = `${potentialLabels[p.r.potential]} ${kindLabels[p.r.kind].toLowerCase()}, ${zoneName}, ${statusLabels[p.status].toLowerCase()}: ${p.r.description}`;
              const clock = p.status === 'new' && live ? triageClock(p.r, new Date(now)) : null;
              return (
                <g
                  key={p.r.id}
                  className={pan}
                  style={{ transform: `translate(${sx(p.r.x!)}px, ${sy(p.r.y!)}px)` }}
                  data-report={p.r.id}
                  data-status={p.status}
                  data-potential={p.r.potential}
                  data-fixed={p.fixed ? 'true' : 'false'}
                  data-color={p.color}
                >
                  <g className="nm-fade" opacity={p.dim && !focused ? 0.26 : 1}>
                    <g
                      className="nm-pin"
                      role="button"
                      tabIndex={0}
                      aria-label={label}
                      aria-pressed={focused}
                      onClick={(e) => {
                        e.stopPropagation();
                        onFocus(focused ? null : { kind: 'report', id: p.r.id });
                      }}
                      onKeyDown={(e) => onPinKey(e, p.r.id)}
                    >
                      <title>{`${potentialLabels[p.r.potential]} · ${categoryLabels[p.r.category]} · ${statusLabels[p.status]}`}</title>
                      {/* generous hit area */}
                      <circle cy={p.fixed ? 0 : -12} r={p.fixed ? 10 : 13} fill="transparent" />
                      {p.fixed ? (
                        <g className="nm-drop" style={{ animationDelay: `${delay}ms` }}>
                          <g transform={`scale(${focused ? 1.45 : 1})`}>
                            {focused && <circle r={9} fill="none" stroke="var(--plan-focus-line)" strokeWidth={1.4} strokeDasharray="3 2.5" className="nm-focus-ring" />}
                            <circle r={5.6} fill="var(--plan-pin-edge)" stroke={p.color} strokeWidth={1.6} opacity={0.92} />
                            <path d="M-2.5 0.1 L-0.7 1.9 L2.7 -1.7" fill="none" stroke={p.color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
                          </g>
                        </g>
                      ) : (
                        <>
                          <ellipse className="nm-drop-shadow" style={{ animationDelay: `${delay}ms` }} rx={4.6 * k} ry={1.7 * k} fill="var(--world-shadow)" />
                          <g className="nm-drop" style={{ animationDelay: `${delay}ms` }}>
                            <g transform={`scale(${k})`}>
                              {p.urgent && <circle className="nm-ping" cy={-14.5} r={9} fill="none" stroke={POT_VAR[p.r.potential]} strokeWidth={2} />}
                              {(p.mine && role === 'reporter') && <circle cy={-14.5} r={10.5} fill="none" stroke="var(--accent-10)" strokeWidth={2.2} />}
                              {focused && <circle cy={-14.5} r={12} fill="none" stroke="var(--plan-focus-line)" strokeWidth={1.6} strokeDasharray="3 2.5" className="nm-focus-ring" />}
                              <path
                                className="nm-pin-head"
                                d="M0 0 C -2 -4.5 -7 -8.5 -7 -14.5 A 7 7 0 1 1 7 -14.5 C 7 -8.5 2 -4.5 0 0 Z"
                                fill={p.color}
                                stroke="var(--plan-pin-edge)"
                                strokeWidth={1.4}
                                filter="url(#nm-pin-shadow)"
                              />
                              <g transform="translate(0,-14.5)">
                                <KindGlyph kind={p.r.kind} color="var(--plan-pin-edge)" size={1} />
                              </g>
                            </g>
                          </g>
                          {clock && clock.state === 'late' && (
                            <g transform={`translate(${8 * k}, ${-24 * k})`} aria-hidden="true">
                              <rect x={0} y={-7} width={18} height={12} rx={6} fill="var(--bad-solid)" />
                              <text x={9} y={2} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="var(--bad-contrast)" fontFamily="var(--font-mono, ui-monospace)">
                                !
                              </text>
                            </g>
                          )}
                        </>
                      )}
                    </g>
                  </g>
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </div>
  );
}

function WallLine({ w }: { w: Wall }) {
  const x1 = w.x1 * U;
  const y1 = w.y1 * U;
  const x2 = w.x2 * U;
  const y2 = w.y2 * U;
  if (Math.hypot(x2 - x1, y2 - y1) < 0.5) return null;
  switch (w.kind) {
    case 'exterior':
      return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--plan-wall)" strokeWidth={6} />;
    case 'interior':
      return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--plan-wall)" strokeWidth={2.4} strokeOpacity={0.85} />;
    case 'open':
      return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--plan-line)" strokeWidth={1} strokeDasharray="6 5" strokeLinecap="butt" />;
    default:
      return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--plan-wall-2)" strokeWidth={1.4} strokeDasharray="10 4 2 4" strokeLinecap="butt" />;
  }
}

function FixtureMark({ f }: { f: Fixture }) {
  const x = f.x * U;
  const y = f.y * U;
  const w = f.w * U;
  const h = f.h * U;
  switch (f.kind) {
    case 'rack': {
      const bays = Math.floor((f.vertical ? h : w) / 27);
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} fill="var(--plan-fixture)" stroke="var(--plan-line)" strokeWidth={0.9} />
          {Array.from({ length: Math.max(0, bays - 1) }, (_, k) =>
            f.vertical ? (
              <line key={k} x1={x} x2={x + w} y1={y + (k + 1) * (h / bays)} y2={y + (k + 1) * (h / bays)} stroke="var(--plan-line)" strokeWidth={0.7} />
            ) : (
              <line key={k} y1={y} y2={y + h} x1={x + (k + 1) * (w / bays)} x2={x + (k + 1) * (w / bays)} stroke="var(--plan-line)" strokeWidth={0.7} />
            ),
          )}
        </g>
      );
    }
    case 'machine':
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={3} fill="var(--plan-fixture)" stroke="var(--plan-line)" strokeWidth={1} />
          <circle cx={x + w / 2} cy={y + h / 2} r={Math.min(w, h) * 0.24} fill="none" stroke="var(--plan-line)" strokeWidth={1} />
          <rect x={x - 4} y={y - 4} width={w + 8} height={h + 8} rx={5} fill="none" stroke="var(--plan-line-2)" strokeWidth={0.8} strokeDasharray="3 3" />
        </g>
      );
    case 'desk':
      return <rect x={x} y={y} width={w} height={h} rx={1.5} fill="var(--plan-fixture)" stroke="var(--plan-line)" strokeWidth={0.8} />;
    case 'table':
      return <circle cx={x} cy={y} r={w * 0.9} fill="var(--plan-fixture)" stroke="var(--plan-line)" strokeWidth={0.8} />;
    case 'bay':
      return <rect x={x} y={y} width={w} height={h} fill="none" stroke="var(--plan-line-2)" strokeWidth={1} />;
    case 'lane-dash':
      return <rect x={x} y={y} width={w} height={h} fill="var(--plan-wall-2)" opacity={0.55} />;
    case 'chevron': {
      const cx = x;
      const cy = y;
      const s = 6;
      const d = f.dir ?? 1;
      return f.vertical ? (
        <path d={`M ${cx - s} ${cy - s * d * 0.5} L ${cx} ${cy + s * d * 0.5} L ${cx + s} ${cy - s * d * 0.5}`} fill="none" stroke="var(--plan-line)" strokeWidth={1.6} />
      ) : (
        <path d={`M ${cx - s * d * 0.5} ${cy - s} L ${cx + s * d * 0.5} ${cy} L ${cx - s * d * 0.5} ${cy + s}`} fill="none" stroke="var(--plan-line)" strokeWidth={1.6} />
      );
    }
    default:
      return null;
  }
}

function Crossing({ c }: { c: { x: number; y: number; w: number; h: number; vertical: boolean } }) {
  const x = c.x * U;
  const y = c.y * U;
  const w = c.w * U;
  const h = c.h * U;
  const stripes = Math.floor((c.vertical ? h : w) / 7);
  return (
    <g>
      {Array.from({ length: stripes }, (_, k) =>
        c.vertical ? (
          <rect key={k} x={x} y={y + 2 + k * 7} width={w} height={3.6} fill="var(--plan-crossing)" opacity={0.5} />
        ) : (
          <rect key={k} x={x + 2 + k * 7} y={y} width={3.6} height={h} fill="var(--plan-crossing)" opacity={0.5} />
        ),
      )}
    </g>
  );
}

/** Indoor zones only (for the toolbox talk's mini plan and tests). */
export const indoorZones = (zones: Zone[]) => zones.filter((z) => isIndoor(z.kind));
