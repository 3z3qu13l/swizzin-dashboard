import { useMemo, useState } from 'react'
import { Activity } from 'lucide-react'
import type { EChartsCoreOption } from 'echarts/core'
import { useBandwidth, useHistory } from '@/lib/queries'
import { bytes, rate } from '@/lib/format'
import { EChart } from '@/components/charts'
import { useThemeColors } from '@/lib/hooks'
import { Card, CardHead, Empty, ErrorNote, Segmented, Spinner } from '@/components/ui'

const ranges = ['5m', '15m', '1h', '6h', '24h', '7d', '30d'] as const
type Range = (typeof ranges)[number]
const spans: Record<Range, number> = { '5m': 3e5, '15m': 9e5, '1h': 36e5, '6h': 216e5, '24h': 864e5, '7d': 6048e5, '30d': 2592e6 }

function base(c: Record<string, string>, span: number): EChartsCoreOption {
  const short = span <= 86400_000
  return {
    animation: false,
    grid: { left: 8, right: 12, top: 28, bottom: 4, containLabel: true },
    legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10, icon: 'roundRect', textStyle: { color: c.muted, fontSize: 11 } },
    tooltip: {
      trigger: 'axis',
      backgroundColor: c.surface,
      borderColor: c.line,
      textStyle: { color: c.text, fontSize: 12 },
      axisPointer: { lineStyle: { color: c.line } },
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: c.line } },
      axisLabel: { color: c.muted, fontSize: 11, hideOverlap: true, formatter: short ? '{HH}:{mm}' : '{dd}/{MM}' },
      splitLine: { show: false },
    },
  }
}

function series(name: string, color: string, data: [number, number][], area = true) {
  return {
    name,
    type: 'line',
    showSymbol: false,
    smooth: 0.25,
    lineStyle: { width: 1.6, color },
    itemStyle: { color },
    areaStyle: area ? { color, opacity: 0.12 } : undefined,
    data,
  }
}

export function HistoryCharts() {
  const [range, setRange] = useState<Range>('1h')
  const q = useHistory(range)
  const c = useThemeColors()

  const opts = useMemo(() => {
    const pts = q.data?.points ?? []
    const b = base(c, spans[range])
    const pctAxis = {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { color: c.muted, fontSize: 11, formatter: '{value}%' },
      splitLine: { lineStyle: { color: c.line, opacity: 0.5 } },
    }
    const tip = (fmt: (v: number) => string) => ({ ...(b.tooltip as object), valueFormatter: (v: number) => fmt(v) })
    return {
      cpu: {
        ...b,
        tooltip: tip((v) => `${v.toFixed(1)}%`),
        yAxis: pctAxis,
        series: [
          series(
            'CPU',
            c.cpu,
            pts.map((p) => [p.t, p.cpu]),
          ),
          series(
            'IO wait',
            c.warn,
            pts.map((p) => [p.t, p.iowait]),
            false,
          ),
        ],
      },
      mem: {
        ...b,
        tooltip: tip((v) => `${v.toFixed(1)}%`),
        yAxis: pctAxis,
        series: [
          series(
            'Memory',
            c.mem,
            pts.map((p) => [p.t, p.mem]),
          ),
          series(
            'Swap',
            c.swap,
            pts.map((p) => [p.t, p.swap]),
            false,
          ),
        ],
      },
      net: {
        ...b,
        tooltip: tip((v) => rate(v)),
        yAxis: {
          type: 'value',
          axisLabel: { color: c.muted, fontSize: 11, formatter: (v: number) => bytes(v) },
          splitLine: { lineStyle: { color: c.line, opacity: 0.5 } },
        },
        series: [
          series(
            'Download',
            c.accent,
            pts.map((p) => [p.t, p.rx]),
          ),
          series(
            'Upload',
            c.info,
            pts.map((p) => [p.t, p.tx]),
          ),
        ],
      },
    } satisfies Record<string, EChartsCoreOption>
  }, [q.data, c, range])

  const empty = q.data && q.data.points.length < 2
  return (
    <Card>
      <CardHead
        icon={<Activity className="size-4" />}
        title="History"
        hint="Recorded every 10 seconds by swizdash, kept 30 days"
        right={<Segmented value={range} onChange={setRange} options={ranges.map((r) => ({ value: r, label: r }))} />}
      />
      {q.isPending ? (
        <Spinner />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : empty ? (
        <Empty title="Not enough history yet">The charts fill in as swizdash runs, a point every 10 seconds.</Empty>
      ) : (
        <div className="grid gap-x-6 gap-y-2 px-5 pb-5 lg:grid-cols-3">
          {(
            [
              ['CPU', opts.cpu],
              ['Memory and swap', opts.mem],
              ['Network', opts.net],
            ] as const
          ).map(([t, o]) => (
            <figure key={t}>
              <figcaption className="mb-1 text-xs font-medium text-muted">{t}</figcaption>
              <EChart option={o} className="h-52" />
            </figure>
          ))}
        </div>
      )}
    </Card>
  )
}

export function BandwidthChart() {
  const q = useBandwidth()
  const c = useThemeColors()
  const option = useMemo<EChartsCoreOption>(() => {
    const days = q.data?.days ?? []
    return {
      animation: false,
      grid: { left: 8, right: 8, top: 28, bottom: 4, containLabel: true },
      legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10, icon: 'roundRect', textStyle: { color: c.muted, fontSize: 11 } },
      tooltip: {
        trigger: 'axis',
        backgroundColor: c.surface,
        borderColor: c.line,
        textStyle: { color: c.text, fontSize: 12 },
        valueFormatter: (v: number) => bytes(v),
      },
      xAxis: {
        type: 'category',
        data: days.map((d) => d.date.slice(5)),
        axisLine: { lineStyle: { color: c.line } },
        axisLabel: { color: c.muted, fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: c.muted, fontSize: 11, formatter: (v: number) => bytes(v) },
        splitLine: { lineStyle: { color: c.line, opacity: 0.5 } },
      },
      series: [
        { name: 'Download', type: 'bar', stack: 't', data: days.map((d) => d.rx), itemStyle: { color: c.accent, borderRadius: [0, 0, 2, 2] }, barMaxWidth: 22 },
        { name: 'Upload', type: 'bar', stack: 't', data: days.map((d) => d.tx), itemStyle: { color: c.info, borderRadius: [2, 2, 0, 0] }, barMaxWidth: 22 },
      ],
    }
  }, [q.data, c])
  if (!q.data?.available || !q.data.days?.length) return null
  return (
    <Card>
      <CardHead title="Traffic per day" hint={`vnStat on ${q.data.iface}, last ${q.data.days.length} days`} />
      <div className="px-5 pb-5">
        <EChart option={option} className="h-56" />
      </div>
    </Card>
  )
}
