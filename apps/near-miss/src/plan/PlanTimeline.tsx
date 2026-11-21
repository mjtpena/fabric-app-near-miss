/**
 * The 90-day time slider under the plan: a strip of daily reports (serious days in red), the heat curve of one zone
 * (the focused zone, else the site's top hotspot) with its fixes marked, and a scrubber. Dragging replays the plan;
 * Play runs the 90 days in about nine seconds so you can watch a hotspot form and cool.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';

import { DAY, toMs } from '@x10/shared/lib';
import { Button, IconButton, cx } from '@x10/shared/ui';

import { heatSeries } from '../domain/hotspots';
import type { Action, Report, Zone } from '../model';

export const REPLAY_DAYS = 90;

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short' });

export function PlanTimeline({
  now,
  t,
  onChange,
  playing,
  onTogglePlay,
  reports,
  actions,
  zone,
  heatPeak,
  className,
}: {
  now: number;
  t: number;
  onChange: (t: number) => void;
  playing: boolean;
  onTogglePlay: () => void;
  reports: Report[];
  actions: Action[];
  /** The zone whose heat curve is drawn. */
  zone: Zone | null;
  heatPeak: number;
  className?: string;
}) {
  const from = now - REPLAY_DAYS * DAY;
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const m = () => setW(el.clientWidth);
    m();
    const ro = new ResizeObserver(m);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 44;
  const x = (ms: number) => ((ms - from) / (now - from)) * w;

  const days = useMemo(() => {
    const out: { count: number; serious: boolean }[] = Array.from({ length: REPLAY_DAYS + 1 }, () => ({ count: 0, serious: false }));
    for (const r of reports) {
      const d = Math.floor((toMs(r.reportedAt) - from) / DAY);
      if (d < 0 || d > REPLAY_DAYS) continue;
      out[d].count += 1;
      if (r.potential === 'serious' || r.potential === 'high') out[d].serious = true;
    }
    return out;
  }, [reports, from]);
  const maxCount = Math.max(1, ...days.map((d) => d.count));

  const curve = useMemo(() => (zone ? heatSeries(reports, zone.id, from, now, 1) : []), [reports, zone, from, now]);
  const fixes = useMemo(
    () =>
      zone
        ? actions.filter((a) => a.doneAt && toMs(a.doneAt) >= from && reports.some((r) => r.id === a.reportId && r.zoneId === zone.id))
        : [],
    [actions, reports, zone, from],
  );
  const peak = Math.max(heatPeak, 1);
  const area =
    curve.length && w
      ? `M 0 ${H} ` + curve.map((p) => `L ${x(p.t).toFixed(1)} ${(H - 4 - (p.heat / peak) * (H - 10)).toFixed(1)}`).join(' ') + ` L ${w} ${H} Z`
      : '';
  const line = curve.length && w ? curve.map((p, i) => `${i ? 'L' : 'M'} ${x(p.t).toFixed(1)} ${(H - 4 - (p.heat / peak) * (H - 10)).toFixed(1)}`).join(' ') : '';

  const months = useMemo(() => {
    const out: { t: number; label: string }[] = [];
    const d = new Date(from);
    const cur = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    while (cur.getTime() <= now) {
      out.push({ t: cur.getTime(), label: monthFmt.format(cur) });
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
    return out;
  }, [from, now]);

  const live = now - t < 60_000;
  const dayNo = Math.round((t - now) / DAY);
  const bw = w / (REPLAY_DAYS + 1);

  return (
    <div className={cx('flex items-center gap-2.5', className)} data-testid="timeline">
      <IconButton
        label={playing ? 'Pause the replay' : 'Replay the last 90 days'}
        icon={playing ? <Pause /> : <Play />}
        variant="secondary"
        className="size-9 shrink-0 rounded-full!"
        onClick={onTogglePlay}
      />
      <div className="w-[84px] shrink-0 leading-tight sm:w-[112px]">
        <div className="truncate text-ui font-semibold text-fg num" data-testid="timeline-date">
          {live ? 'Today' : dayFmt.format(t)}
        </div>
        <div className="font-mono text-[11px] text-muted num">{live ? 'live' : `day ${dayNo}`}</div>
        {zone && (
          <div className="mt-0.5 flex items-center gap-1 truncate font-mono text-[9.5px] uppercase tracking-[0.04em] text-muted" title={`Heat curve: ${zone.name}`}>
            <span aria-hidden="true" className="inline-block h-[3px] w-2.5 shrink-0 rounded-full bg-[var(--heat-2)]" />
            <span className="truncate">{zone.name}</span>
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div ref={ref} className="relative h-[44px]">
          {w > 0 && (
            <svg width={w} height={H} className="absolute inset-0 overflow-visible" aria-hidden="true">
              <defs>
                <linearGradient id="nm-tl-heat" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--heat-3)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--heat-1)" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              {months.map((m) => (
                <g key={m.t}>
                  <line x1={x(m.t)} x2={x(m.t)} y1={0} y2={H} stroke="var(--line)" strokeDasharray="2 3" />
                  <text x={x(m.t) + 3} y={8} fontSize={9} fontFamily="var(--font-mono, ui-monospace)" fill="var(--gray-9)" letterSpacing="0.06em">
                    {m.label.toUpperCase()}
                  </text>
                </g>
              ))}
              {days.map((d, i) =>
                d.count ? (
                  <rect
                    key={i}
                    x={i * bw + bw * 0.18}
                    width={Math.max(1, bw * 0.64)}
                    y={H - 2 - (d.count / maxCount) * 12}
                    height={(d.count / maxCount) * 12}
                    rx={0.8}
                    fill={d.serious ? 'var(--pot-serious)' : 'var(--gray-8)'}
                    opacity={from + i * DAY <= t ? 0.9 : 0.3}
                  />
                ) : null,
              )}
              {area && <path d={area} fill="url(#nm-tl-heat)" />}
              {line && <path d={line} fill="none" stroke="var(--heat-2)" strokeWidth={1.6} strokeLinejoin="round" />}
              {fixes.map((a) => (
                <g key={a.id} transform={`translate(${x(toMs(a.doneAt!))}, 17)`}>
                  <circle r={4.5} fill="var(--surface)" stroke="var(--st-fixed)" strokeWidth={1.3} />
                  <path d="M-2 0 L-0.5 1.5 L2.1 -1.3" fill="none" stroke="var(--st-fixed)" strokeWidth={1.4} strokeLinecap="round" />
                  <title>{`Fixed: ${a.title}`}</title>
                </g>
              ))}
              <rect x={x(t)} y={0} width={Math.max(0, w - x(t))} height={H} fill="var(--surface)" opacity={0.35} />
              <line x1={x(t)} x2={x(t)} y1={-2} y2={H + 2} stroke="var(--gray-12)" strokeWidth={1.6} />
            </svg>
          )}
          <input
            type="range"
            className="nm-range absolute inset-0 h-full w-full"
            min={from}
            max={now}
            step={DAY / 4}
            value={Math.min(now, Math.max(from, t))}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label="Replay the last 90 days"
            aria-valuetext={live ? 'Today' : dayFmt.format(t)}
            data-testid="timeline-range"
          />
          <span
            aria-hidden="true"
            className="nm-thumb pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--surface)] bg-[var(--gray-12)] shadow-1"
            style={{ left: w ? x(t) : 0 }}
          />
        </div>
      </div>
      {!live && (
        <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => onChange(now)} className="shrink-0">
          Today
        </Button>
      )}
    </div>
  );
}
