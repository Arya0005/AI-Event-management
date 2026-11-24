import { useId } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts'
import { moneyCompact, number } from '../utils/format'

// Categorical palette: distinct in hue and readable on both light and dark surfaces.
const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#f43f5e', '#a855f7', '#64748b', '#ec4899']

// Theme-aware neutrals: these resolve against the (dark-remapped) slate palette.
const AXIS = { fontSize: 11, fill: 'var(--color-slate-500)' }
const GRID = 'var(--color-slate-200)'
const grid = <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
const legend = <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />

/** Card-styled tooltip shared by every chart. */
function ChartTooltip({ active, payload, label, formatter = number }) {
  if (!active || !payload?.length) return null
  return (
    <div className="min-w-36 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs shadow-elevated">
      {label !== undefined && label !== '' && <p className="mb-1.5 font-semibold text-slate-900">{label}</p>}
      <div className="space-y-1">
        {payload.filter((p) => p.name !== undefined).map((p) => (
          <div key={`${p.name}-${p.dataKey}`} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="size-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
              {p.name}
            </span>
            <span className="font-semibold text-slate-900 tabular-nums">{formatter(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TrendChart({ data, xKey, series, height = 260, money = false }) {
  const fmt = money ? moneyCompact : number
  const uid = useId().replace(/:/g, '')
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color || COLORS[i]} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.color || COLORS[i]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {grid}
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={fmt} width={56} />
        <Tooltip content={<ChartTooltip formatter={fmt} />} cursor={{ stroke: GRID, strokeWidth: 1 }} />
        {legend}
        {series.map((s, i) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label}
            stroke={s.color || COLORS[i]} strokeWidth={2.25} fill={`url(#${uid}-${s.key})`}
            dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-white)' }} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function BarsChart({ data, xKey, series, height = 260, formatter = number, layout = 'horizontal' }) {
  const vertical = layout === 'vertical'
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
        {vertical
          ? <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
          : grid}
        {vertical ? (
          <>
            <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={formatter} />
            <YAxis type="category" dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} width={96} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} minTickGap={8} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={formatter} width={56} />
          </>
        )}
        <Tooltip content={<ChartTooltip formatter={formatter} />} cursor={{ fill: 'var(--color-slate-100)' }} />
        {series.length > 1 && legend}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color || COLORS[i]}
            radius={vertical ? [0, 6, 6, 0] : [6, 6, 0, 0]} maxBarSize={32} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function DonutChart({ data, nameKey = 'label', valueKey = 'count', height = 220 }) {
  const total = data.reduce((s, d) => s + (d[valueKey] || 0), 0)
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="62%" outerRadius="84%"
            paddingAngle={2} cornerRadius={4} stroke="none" cy="45%">
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
          {legend}
        </PieChart>
      </ResponsiveContainer>
      {/* Total in the donut hole (pie is centred at 45% height). */}
      <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center" style={{ top: `calc(${height * 0.45}px - 18px)` }}>
        <span className="text-xl font-semibold text-slate-900 tabular-nums">{number(total)}</span>
        <span className="text-[11px] text-slate-500">total</span>
      </div>
    </div>
  )
}

/** Predicted vs actual scatter with a y = x reference diagonal. */
export function PredictedVsActual({ data, xKey, yKey, label, money = false, height = 280 }) {
  const fmt = money ? moneyCompact : number
  const max = Math.max(1, ...data.flatMap((d) => [d[xKey] || 0, d[yKey] || 0]))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis type="number" dataKey={xKey} name="Predicted" tick={AXIS} tickFormatter={fmt} domain={[0, max]}
          tickLine={false} axisLine={false}
          label={{ value: `Predicted ${label}`, position: 'insideBottom', offset: -8, fontSize: 11, fill: 'var(--color-slate-500)' }} />
        <YAxis type="number" dataKey={yKey} name="Actual" tick={AXIS} tickFormatter={fmt} domain={[0, max]} width={56}
          tickLine={false} axisLine={false} />
        <ZAxis range={[48, 48]} />
        <Tooltip content={<ChartTooltip formatter={fmt} />} cursor={{ strokeDasharray: '3 3', stroke: GRID }} />
        <Scatter data={[{ [xKey]: 0, [yKey]: 0 }, { [xKey]: max, [yKey]: max }]}
          line={{ stroke: 'var(--color-slate-300)', strokeDasharray: '4 4' }} shape={() => null} legendType="none" />
        <Scatter data={data} fill={COLORS[0]} fillOpacity={0.75} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}
