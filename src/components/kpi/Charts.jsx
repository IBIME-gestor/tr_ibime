/**
 * Gráficas ligeras en SVG para el módulo de KPIs (sin librerías externas).
 * Animación de entrada con las clases .kpi-* definidas en index.css.
 */

export const PALETTE = ['#12405f', '#1E9E96', '#E0714A', '#7C6FE0', '#8C9A2E', '#C4548C', '#2E86D6'];

/** Gráfica de pastel (dona). data: [{ label, value, color }] */
export function Donut({ data, size = 150, centerTop, centerBottom, unit = '' }) {
  const items = data.filter((d) => d.value > 0);
  const total = items.reduce((n, d) => n + d.value, 0);
  const R = 15.9155;
  let acc = 0;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 42 42" width={size} height={size} role="img" aria-label="Gráfica de pastel" className="shrink-0">
        <circle cx="21" cy="21" r={R} fill="none" stroke="#e8edf3" strokeWidth="6" />
        {total > 0 && items.map((d, i) => {
          const frac = (d.value / total) * 100;
          const el = (
            <circle
              key={d.label}
              cx="21" cy="21" r={R} fill="none"
              stroke={d.color || PALETTE[i % PALETTE.length]}
              strokeWidth="6"
              strokeDasharray={`${Math.max(frac - 0.6, 0.1)} ${100 - Math.max(frac - 0.6, 0.1)}`}
              strokeDashoffset={25 - acc}
              className="kpi-draw"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          );
          acc += frac;
          return el;
        })}
        {centerTop != null && (
          <g className="kpi-fade">
            <text x="21" y={centerBottom ? 20.5 : 23} textAnchor="middle" fontSize="7" fontWeight="700" fill="#12405f">{centerTop}</text>
            {centerBottom && <text x="21" y="26.5" textAnchor="middle" fontSize="3.2" fill="#6b7f92">{centerBottom}</text>}
          </g>
        )}
      </svg>
      <ul className="text-xs space-y-1.5 min-w-[140px]">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color || PALETTE[i % PALETTE.length] }} />
            <span className="text-navy-600">{d.label}</span>
            <b className="text-navy-900 ml-auto pl-3 tabular-nums">
              {d.value.toLocaleString('es-MX')}{unit}
              {total > 0 && <span className="text-navy-400 font-normal"> · {Math.round((d.value / total) * 100)}%</span>}
            </b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barras verticales. data: [{ label, value }]; refLine opcional (línea de referencia). */
export function Bars({ data, color = '#12405f', height = 150, unit = '', refLine, refLabel, maxValue }) {
  if (!data.length) return <p className="text-xs text-navy-400">Sin datos en el periodo.</p>;
  const max = Math.max(maxValue || 0, refLine || 0, ...data.map((d) => d.value), 1);
  const W = Math.max(data.length * 34, 260);
  const H = height;
  const padTop = 16, padBottom = 22;
  const plotH = H - padTop - padBottom;
  const bw = Math.min(22, (W / data.length) * 0.62);
  const step = W / data.length;
  const yOf = (v) => padTop + plotH - (v / max) * plotH;
  const every = data.length > 14 ? Math.ceil(data.length / 10) : 1;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: Math.min(W, 520), maxHeight: H + 10 }} role="img" aria-label="Gráfica de barras">
        <line x1="0" x2={W} y1={padTop + plotH} y2={padTop + plotH} stroke="#d9e1ea" />
        {refLine != null && (
          <g>
            <line x1="0" x2={W} y1={yOf(refLine)} y2={yOf(refLine)} stroke="#E0714A" strokeDasharray="4 3" />
            {refLabel && <text x={W - 2} y={yOf(refLine) - 3} textAnchor="end" fontSize="9" fill="#E0714A">{refLabel}</text>}
          </g>
        )}
        {data.map((d, i) => {
          const h = Math.max((d.value / max) * plotH, d.value > 0 ? 2 : 0);
          const x = i * step + (step - bw) / 2;
          return (
            <g key={`${d.label}-${i}`}>
              <rect
                x={x} y={padTop + plotH - h} width={bw} height={h} rx="3" fill={color}
                className="kpi-grow" style={{ animationDelay: `${Math.min(i * 40, 500)}ms`, transformOrigin: `${x + bw / 2}px ${padTop + plotH}px` }}
              >
                <title>{`${d.label}: ${Number(d.value).toLocaleString('es-MX')}${unit}`}</title>
              </rect>
              {data.length <= 16 && d.value > 0 && (
                <text x={x + bw / 2} y={padTop + plotH - h - 3} textAnchor="middle" fontSize="8.5" fill="#12405f" fontWeight="600">
                  {Math.round(d.value).toLocaleString('es-MX')}
                </text>
              )}
              {i % every === 0 && (
                <text x={x + bw / 2} y={H - 7} textAnchor="middle" fontSize="8.5" fill="#6b7f92">{d.label}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Anillo de calificación (0–100) para las tarjetas. */
export function ScoreRing({ score, color, size = 64, stroke = 6 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = score == null ? 0 : Math.max(0, Math.min(100, score));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img" aria-label={score == null ? 'Sin datos' : `Calificación ${Math.round(score)}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e8edf3" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${(v / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray .7s ease' }}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size * 0.3} fontWeight="700" fill="#12405f">
        {score == null ? '—' : Math.round(score)}
      </text>
    </svg>
  );
}
