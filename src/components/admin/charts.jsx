import { useMemo, useState } from "react";

function niceMax(value) {
  if (value <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  return Math.ceil(value / pow) * pow;
}

const PALETTE = ["#00A896", "#4C8DFF", "#D9A40E", "#E5484D", "#8B5CF6", "#2FA96C", "#F0763B"];

export function LineChart({ data, series: seriesProp, height = 220, yLabel = "", formatX = (v) => v }) {
  const [hover, setHover] = useState(null);
  const w = 640;
  const h = height;
  const pad = { l: 40, r: 12, t: 14, b: 26 };

  // Accept either data=[{label,value}] (single series) or series=[{name,color,points}]
  const { series, fromData } = useMemo(() => {
    if (Array.isArray(seriesProp) && seriesProp.length) {
      return {
        fromData: false,
        series: seriesProp.map((s) => ({
          ...s,
          points: s.points.map((p, i) => (typeof p === "number" ? { x: i + 1, y: p } : p)),
        })),
      };
    }
    return { fromData: true, series: [{ name: "", points: (data || []).map((d, i) => ({ x: i + 1, y: d.value, label: d.label })) }] };
  }, [data, seriesProp]);

  const allPoints = series.flatMap((s) => s.points);
  const maxX = Math.max(1, ...allPoints.map((p) => p.x));
  const maxY = niceMax(Math.max(1, ...allPoints.map((p) => p.y)));
  const sx = (x) => pad.l + (x / maxX) * (w - pad.l - pad.r);
  const sy = (y) => pad.t + (1 - y / maxY) * (h - pad.t - pad.b);
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  const xTicks = useMemo(() => {
    const count = Math.min(6, Math.max(2, Math.floor((w - pad.l - pad.r) / 110)));
    return Array.from({ length: count + 1 }, (_, i) => Math.round((maxX / count) * i));
  }, [maxX]);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full select-none" style={{ height }} onMouseLeave={() => setHover(null)}>
      {gridLines.map((g) => (
        <g key={g}>
          <line x1={pad.l} x2={w - pad.r} y1={pad.t + g * (h - pad.t - pad.b)} y2={pad.t + g * (h - pad.t - pad.b)} stroke="var(--adm-border)" strokeDasharray="3 4" strokeWidth="1" />
          <text x={pad.l - 6} y={pad.t + g * (h - pad.t - pad.b) + 3} textAnchor="end" fontSize="10" fill="var(--adm-muted)">
            {Math.round(maxY * (1 - g))}
          </text>
        </g>
      ))}
      {xTicks.map((t) => {
        const nearest = fromData ? allPoints.reduce((a, b) => (Math.abs(b.x - t) < Math.abs(a.x - t) ? b : a), allPoints[0]) : null;
        return (
          <text key={t} x={sx(t)} y={h - 8} textAnchor="middle" fontSize="10" fill="var(--adm-muted)">
            {fromData && nearest?.label ? nearest.label : formatX(t)}
          </text>
        );
      })}
      {series.map((s, si) => {
        const color = s.color || PALETTE[si % PALETTE.length];
        const path = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x)},${sy(p.y)}`).join(" ");
        const areaPath = `${path} L${sx(s.points[s.points.length - 1]?.x || 0)},${sy(0)} L${sx(s.points[0]?.x || 0)},${sy(0)} Z`;
        return (
          <g key={s.name}>
            {series.length === 1 && <path d={areaPath} fill={color} opacity="0.08" />}
            <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {s.points.map((p) => (
              <g key={p.x}>
                <circle cx={sx(p.x)} cy={sy(p.y)} r={hover?.x === p.x ? 4 : 2.5} fill={color} />
                <rect
                  x={sx(p.x) - 8} y={pad.t} width={16} height={h - pad.t - pad.b} fill="transparent"
                  onMouseEnter={() => setHover({ x: p.x })}
                />
              </g>
            ))}
          </g>
        );
      })}
      {hover && (
        <g>
          <rect
            x={Math.min(w - 150, Math.max(pad.l, sx(hover.x) - 70))} y={pad.t}
            width="145" height={20 * (series.length + 1) + 10} rx="6"
            fill="var(--adm-surface)" stroke="var(--adm-border)"
          />
          {series.map((s, si) => {
            const point = s.points.find((p) => p.x === hover.x);
            const name = s.name || (point && point.label) || "";
            return (
              <text key={s.name + si} x={Math.min(w - 144, Math.max(pad.l + 6, sx(hover.x) - 64))} y={pad.t + 16 + si * 20} fontSize="11" fill="var(--adm-text)">
                {`${name ? `${name}: ` : ""}${point ? point.y : 0}${yLabel}`}
              </text>
            );
          })}
        </g>
      )}
    </svg>
  );
}

export function DonutChart({ data = [], size = 180, thickness = 26, centerLabel, centerSub, colors }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const colorFor = (d, i) => d.color || (colors && colors[String(d.label).toLowerCase()]) || PALETTE[i % PALETTE.length];
  if (!total) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-sm adm-muted">No data</span>
      </div>
    );
  }
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        {data.map((d, i) => {
          const frac = d.value / total;
          const seg = (
            <circle
              key={d.label}
              cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={colorFor(d, i)}
              strokeWidth={thickness}
              strokeDasharray={`${c * frac} ${c * (1 - frac)}`}
              strokeDashoffset={-c * offset}
            >
              <title>{`${d.label}: ${d.value} (${Math.round(frac * 100)}%)`}</title>
            </circle>
          );
          offset += frac;
          return seg;
        })}
      </svg>
      {(centerLabel || centerSub || total != null) && (
        <div className="absolute flex flex-col items-center pointer-events-none">
          <span className="text-xl font-bold adm-text tabular-nums">{centerLabel ?? total}</span>
          {centerSub && <span className="text-[10px] adm-muted uppercase tracking-wide">{centerSub}</span>}
        </div>
      )}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <ul className="space-y-1.5 text-xs">
      {items.map((d, i) => (
        <li key={d.label} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color || PALETTE[i % PALETTE.length] }} />
          <span className="flex-1 truncate adm-text">{d.label}</span>
          <span className="font-semibold tabular-nums adm-muted">{d.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function BarChart({ data = [], height = 200, color = "#00A896", formatValue = (v) => v }) {
  const w = 640;
  const pad = { l: 36, r: 8, t: 12, b: 30 };
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
  const bw = (w - pad.l - pad.r) / Math.max(1, data.length);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }}>
      {[0, 0.5, 1].map((g) => (
        <g key={g}>
          <line x1={pad.l} x2={w - pad.r} y1={pad.t + (1 - g) * (height - pad.t - pad.b)} y2={pad.t + (1 - g) * (height - pad.t - pad.b)} stroke="var(--adm-border)" strokeDasharray="3 4" />
          <text x={pad.l - 6} y={pad.t + (1 - g) * (height - pad.t - pad.b) + 3} textAnchor="end" fontSize="10" fill="var(--adm-muted)">{Math.round(max * g)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const barH = (d.value / max) * (height - pad.t - pad.b);
        const x = pad.l + i * bw + bw * 0.18;
        const bwidth = bw * 0.64;
        return (
          <g key={d.label}>
            <rect x={x} y={pad.t + (height - pad.t - pad.b) - barH} width={bwidth} height={Math.max(2, barH)} rx="4" fill={d.color || color}>
              <title>{`${d.label}: ${formatValue(d.value)}`}</title>
            </rect>
            <text x={x + bwidth / 2} y={height - 16} textAnchor="middle" fontSize="10" fill="var(--adm-muted)">
              {d.label.length > 9 ? `${d.label.slice(0, 8)}…` : d.label}
            </text>
            <text x={x + bwidth / 2} y={height - 4} textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--adm-text)">
              {formatValue(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function Histogram({ buckets = [], height = 190 }) {
  return <BarChart data={buckets.map((b) => ({ label: b.bucket, value: b.count }))} height={height} />;
}
