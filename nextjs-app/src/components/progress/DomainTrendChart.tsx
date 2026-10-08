import type { DomainTrendDto } from '@/lib/results/types'
import { TREND_LABEL } from '@/lib/results/format'

// A line per i-Ready domain across worksheets. Each domain has its own colour AND marker shape, a legend with
// the latest trend in words, and a table of the same numbers, so nothing depends on colour or on seeing the chart.

const WIDTH = 640
const HEIGHT = 240
const PAD = { left: 104, right: 24, top: 16, bottom: 36 }

const STYLES = [
  { stroke: 'stroke-brand', fill: 'fill-brand', shape: 'circle' },
  { stroke: 'stroke-success', fill: 'fill-success', shape: 'square' },
  { stroke: 'stroke-warning', fill: 'fill-warning', shape: 'triangle' },
  { stroke: 'stroke-accent', fill: 'fill-accent', shape: 'diamond' },
] as const

const LEVELS = [
  { value: 2, label: 'Secure' },
  { value: 1, label: 'Developing' },
  { value: 0, label: 'Not yet' },
]

function Marker({ shape, x, y, className }: { shape: (typeof STYLES)[number]['shape']; x: number; y: number; className: string }) {
  const r = 5
  if (shape === 'circle') return <circle cx={x} cy={y} r={r} className={className} />
  if (shape === 'square') return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} className={className} />
  if (shape === 'triangle') return <polygon points={`${x},${y - r - 1} ${x + r + 1},${y + r} ${x - r - 1},${y + r}`} className={className} />
  return <polygon points={`${x},${y - r - 1} ${x + r + 1},${y} ${x},${y + r + 1} ${x - r - 1},${y}`} className={className} />
}

export function DomainTrendChart({ domains }: { domains: DomainTrendDto[] }) {
  const cycles = Array.from(new Set(domains.flatMap((domain) => domain.points.map((point) => point.cycle)))).sort((a, b) => a - b)
  const plotWidth = WIDTH - PAD.left - PAD.right
  const plotHeight = HEIGHT - PAD.top - PAD.bottom
  const x = (cycle: number) =>
    PAD.left + (cycles.length === 1 ? plotWidth / 2 : (cycles.indexOf(cycle) / (cycles.length - 1)) * plotWidth)
  const y = (score: number) => PAD.top + plotHeight - (score / 2) * plotHeight

  const summary = domains
    .map((domain) => {
      const last = domain.points[domain.points.length - 1]
      return `${domain.domain}: ${last ? last.score.toFixed(1) : 'no data'} out of 2${domain.latestTrend ? `, ${TREND_LABEL[domain.latestTrend].toLowerCase()}` : ''}`
    })
    .join('. ')

  return (
    <div className="flex flex-col gap-4">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby="trend-title trend-desc"
        className="h-auto w-full rounded-lg border border-line bg-canvas"
      >
        <title id="trend-title">Progress by domain across worksheets</title>
        <desc id="trend-desc">{summary}</desc>

        {LEVELS.map((level) => (
          <g key={level.value}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(level.value)} y2={y(level.value)} className="stroke-line" strokeWidth={1} />
            <text x={PAD.left - 10} y={y(level.value) + 4} textAnchor="end" className="fill-text-secondary text-caption">
              {level.label}
            </text>
          </g>
        ))}
        {cycles.map((cycle) => (
          <text key={cycle} x={x(cycle)} y={HEIGHT - 12} textAnchor="middle" className="fill-text-secondary text-caption">
            Sheet {cycle}
          </text>
        ))}

        {domains.map((domain, index) => {
          const style = STYLES[index % STYLES.length] as (typeof STYLES)[number]
          const points = domain.points.map((point) => `${x(point.cycle)},${y(point.score)}`).join(' ')
          return (
            <g key={domain.domain}>
              {domain.points.length > 1 ? <polyline points={points} fill="none" className={style.stroke} strokeWidth={2} /> : null}
              {domain.points.map((point) => (
                <Marker key={point.cycle} shape={style.shape} x={x(point.cycle)} y={y(point.score)} className={style.fill} />
              ))}
            </g>
          )
        })}
      </svg>

      <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
        {domains.map((domain, index) => {
          const style = STYLES[index % STYLES.length] as (typeof STYLES)[number]
          return (
            <li key={domain.domain} className="flex items-center gap-2 text-caption text-text-primary">
              <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true">
                <Marker shape={style.shape} x={7} y={7} className={style.fill} />
              </svg>
              {domain.domain}
              <span className="text-text-secondary">
                {domain.latestTrend ? `· ${TREND_LABEL[domain.latestTrend]}` : '· trend appears after a second worksheet'}
              </span>
            </li>
          )
        })}
      </ul>

      <details className="rounded-lg border border-line bg-canvas p-4">
        <summary className="cursor-pointer text-body text-text-primary">View as a table</summary>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Average score by domain and worksheet (0 = Not yet, 1 = Developing, 2 = Secure)</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="px-3 py-2 text-caption">Worksheet</th>
                {domains.map((domain) => (
                  <th key={domain.domain} scope="col" className="px-3 py-2 text-caption">
                    {domain.domain}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cycles.map((cycle) => (
                <tr key={cycle} className="border-b border-line last:border-b-0">
                  <th scope="row" className="px-3 py-2 text-caption">{cycle}</th>
                  {domains.map((domain) => {
                    const point = domain.points.find((candidate) => candidate.cycle === cycle)
                    return (
                      <td key={domain.domain} className="px-3 py-2 text-caption text-text-secondary">
                        {point ? point.score.toFixed(1) : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
