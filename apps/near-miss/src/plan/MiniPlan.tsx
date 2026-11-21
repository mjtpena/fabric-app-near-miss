/**
 * A compact, self-scaling drawing of a site's plan, for the Report form (tap to place the pin), the report detail
 * (where it happened) and the toolbox talk (a zone's hazards). Same geometry and colours as the site plan.
 */
import { useMemo, useRef, type MouseEvent, type ReactNode } from 'react';

import { cx } from '@x10/shared/ui';

import { KindGlyph } from '../components/bits';
import type { Report, SiteKind, Zone } from '../model';
import { drawPlan, zoneAtPoint } from './geometry';

const U = 10;
const W = 100 * U;
const H = 60 * U;

export interface MiniPin {
  id: string;
  x: number;
  y: number;
  color: string;
  kind: Report['kind'];
  fixed?: boolean;
}

export function MiniPlan({
  zones,
  siteKind,
  pins = [],
  picked,
  highlightZoneId,
  onPick,
  crop,
  label,
  className,
  children,
}: {
  zones: Zone[];
  siteKind: SiteKind;
  pins?: MiniPin[];
  /** The pin being placed (Report form). */
  picked?: { x: number; y: number } | null;
  highlightZoneId?: string | null;
  /** Tap handler: grid coordinates and the zone under them. */
  onPick?: (x: number, y: number, zone: Zone | null) => void;
  /** Show only this zone and its surroundings. */
  crop?: Zone | null;
  label: string;
  className?: string;
  children?: ReactNode;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drawing = useMemo(() => drawPlan(zones, siteKind), [zones, siteKind]);
  const pad = 6 * U;
  const vb = crop
    ? (() => {
        // Keep a 5:3 frame so a tall zone does not make a tall picture.
        let cw = Math.max(crop.w * U + pad * 2, 36 * U);
        let ch = Math.max(crop.h * U + pad * 2, 22 * U);
        if (cw / ch < 5 / 3) cw = (ch * 5) / 3;
        else ch = (cw * 3) / 5;
        const cx0 = (crop.x + crop.w / 2) * U - cw / 2;
        const cy0 = (crop.y + crop.h / 2) * U - ch / 2;
        return { x: Math.max(-pad, Math.min(cx0, W + pad - cw)), y: Math.max(-pad, Math.min(cy0, H + pad - ch)), w: cw, h: ch };
      })()
    : { x: -12, y: -12, w: W + 24, h: H + 24 };
  const k = vb.w / 1000; // label scale relative to the full plan
  const fs = 22 * k;
  const pinK = 1.5 * Math.max(k, 0.62);

  const pick = (e: MouseEvent<SVGSVGElement>) => {
    if (!onPick || !svg.current) return;
    const ctm = svg.current.getScreenCTM();
    if (!ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const gx = Math.max(0.5, Math.min(99.5, p.x / U));
    const gy = Math.max(0.5, Math.min(59.5, p.y / U));
    onPick(gx, gy, zoneAtPoint(zones, gx, gy));
  };

  return (
    <div className={cx('relative', className)}>
      <svg
        ref={svg}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className={cx('block h-auto w-full', onPick && 'cursor-crosshair touch-manipulation')}
        role={onPick ? 'img' : 'img'}
        aria-label={label}
        onClick={pick}
        data-testid={onPick ? 'pick-plan' : 'mini-plan'}
      >
        <defs>
          <pattern id="nm-mini-hatch" width={9} height={9} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={9} stroke="var(--plan-line-2)" strokeWidth={1.2} />
          </pattern>
        </defs>
        <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="var(--plan-paper)" />
        {zones.map((z) => {
          const on = z.id === highlightZoneId;
          return (
            <g key={z.id} data-mini-zone={z.name}>
              <rect
                x={z.x * U}
                y={z.y * U}
                width={z.w * U}
                height={z.h * U}
                fill={z.kind === 'yard' ? 'var(--plan-yard)' : z.kind === 'route' ? 'var(--plan-route)' : 'var(--plan-floor)'}
              />
              {z.kind === 'yard' && <rect x={z.x * U} y={z.y * U} width={z.w * U} height={z.h * U} fill="url(#nm-mini-hatch)" />}
              {on && <rect x={z.x * U} y={z.y * U} width={z.w * U} height={z.h * U} fill="var(--accent-9)" fillOpacity={0.14} />}
            </g>
          );
        })}
        <g strokeLinecap="square" aria-hidden="true">
          {drawing.walls.map((w, i) =>
            w.kind === 'open' ? (
              <line key={i} x1={w.x1 * U} y1={w.y1 * U} x2={w.x2 * U} y2={w.y2 * U} stroke="var(--plan-line)" strokeWidth={1.2} strokeDasharray="6 5" />
            ) : w.kind === 'fence' ? (
              <line key={i} x1={w.x1 * U} y1={w.y1 * U} x2={w.x2 * U} y2={w.y2 * U} stroke="var(--plan-wall-2)" strokeWidth={1.6} strokeDasharray="10 4 2 4" />
            ) : (
              <line key={i} x1={w.x1 * U} y1={w.y1 * U} x2={w.x2 * U} y2={w.y2 * U} stroke="var(--plan-wall)" strokeWidth={w.kind === 'exterior' ? 6 : 2.6} />
            ),
          )}
          {drawing.dockDoors.map((d) => (
            <line
              key={d.n}
              x1={d.x * U}
              y1={d.y * U}
              x2={(d.x + d.dx * d.width) * U}
              y2={(d.y + d.dy * d.width) * U}
              stroke="var(--plan-wall-2)"
              strokeWidth={3}
              strokeDasharray="3 2"
            />
          ))}
        </g>
        {highlightZoneId &&
          zones
            .filter((z) => z.id === highlightZoneId)
            .map((z) => (
              <rect key="hl" x={z.x * U + 2} y={z.y * U + 2} width={z.w * U - 4} height={z.h * U - 4} fill="none" stroke="var(--plan-focus-line)" strokeWidth={3 * k} strokeDasharray={`${10 * k} ${7 * k}`} />
            ))}
        <g aria-hidden="true" fontFamily="var(--font-mono, ui-monospace)" letterSpacing="0.05em" pointerEvents="none">
          {zones.map((z) => {
            const max = Math.floor((z.w * U - 12 * k) / (fs * 0.62));
            if (max < 3 || z.h * U < fs * 2) return null;
            const name = z.name.toUpperCase();
            return (
              <text key={z.id} x={z.x * U + 8 * k} y={z.y * U + 8 * k + fs} fontSize={fs} fill="var(--plan-ink)" fillOpacity={z.id === highlightZoneId ? 0.95 : 0.55} fontWeight={z.id === highlightZoneId ? 600 : 500}>
                {name.length > max ? `${name.slice(0, max - 1)}…` : name}
              </text>
            );
          })}
        </g>
        <g aria-hidden="true">
          {pins.map((p) => (
            <g key={p.id} transform={`translate(${p.x * U}, ${p.y * U}) scale(${pinK})`}>
              {p.fixed ? (
                <>
                  <circle r={5.6} fill="var(--plan-pin-edge)" stroke={p.color} strokeWidth={1.6} />
                  <path d="M-2.5 0.1 L-0.7 1.9 L2.7 -1.7" fill="none" stroke={p.color} strokeWidth={1.7} strokeLinecap="round" />
                </>
              ) : (
                <>
                  <path d="M0 0 C -2 -4.5 -7 -8.5 -7 -14.5 A 7 7 0 1 1 7 -14.5 C 7 -8.5 2 -4.5 0 0 Z" fill={p.color} stroke="var(--plan-pin-edge)" strokeWidth={1.4} />
                  <g transform="translate(0,-14.5)">
                    <KindGlyph kind={p.kind} color="var(--plan-pin-edge)" />
                  </g>
                </>
              )}
            </g>
          ))}
          {picked && (
            <g transform={`translate(${picked.x * U}, ${picked.y * U}) scale(${2.4 * Math.max(k, 0.62)})`} data-testid="picked-pin">
              <ellipse rx={5} ry={1.8} fill="var(--world-shadow)" />
              <g className="nm-drop" key={`${picked.x}-${picked.y}`}>
                <path d="M0 0 C -2 -4.5 -7 -8.5 -7 -14.5 A 7 7 0 1 1 7 -14.5 C 7 -8.5 2 -4.5 0 0 Z" fill="var(--accent-9)" stroke="var(--plan-wall)" strokeWidth={1.4} />
                <circle cy={-14.5} r={2.6} fill="var(--plan-wall)" />
              </g>
            </g>
          )}
        </g>
      </svg>
      {children}
    </div>
  );
}
