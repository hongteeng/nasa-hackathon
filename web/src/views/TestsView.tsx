/**
 * Test-data browser (F2), with the comparability guard on its chart (F4).
 *
 * Filters live in the URL, so other screens can link straight to a slice.
 * The chart above the table tallies outcomes by oxygen level, but only when
 * the filtered rows belong to one test family. Otherwise it is withheld and
 * the reason is shown in its place.
 */
import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { binFor, blockReason, familiesIn, O2_BINS } from '@shared/evidence'
import type { Family, Outcome, TestRow } from '@shared/types'
import { RowList } from '../components/RowList'
import { investigations, materials, tests } from '../data'
import { FAMILY_LABEL, FAMILY_ORDER, OUTCOME_LABEL, plural } from '../lib/format'
import { href, navigate } from '../lib/route'

const PAGE = 50
const KEYS = ['acc', 'fam', 'mat', 'o2min', 'o2max', 'p', 'o2only', 'page'] as const
type Key = (typeof KEYS)[number]

const PRESSURES = [
  { value: '', label: 'Any pressure' },
  { value: 'low', label: 'Below 0.9 atm' },
  { value: 'one', label: 'About 1 atm' },
  { value: 'high', label: 'Above 1.1 atm' },
  { value: 'none', label: 'Not recorded' },
]

function pressureMatch(p: number | null, mode: string) {
  if (!mode) return true
  if (mode === 'none') return p === null
  if (p === null) return false
  if (mode === 'low') return p < 0.9
  if (mode === 'one') return p >= 0.9 && p <= 1.1
  return p > 1.1
}

export function TestsView({ params }: { params: URLSearchParams }) {
  const f = Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? ''])) as Record<Key, string>
  const set = (next: Partial<Record<Key, string>>) =>
    navigate('tests', { ...f, page: '', ...next }, true)

  const rows = useMemo(() => {
    const lo = f.o2min ? Number(f.o2min) / 100 : null
    const hi = f.o2max ? Number(f.o2max) / 100 : null
    return tests.filter((t) => {
      if (f.acc && t.accession !== f.acc) return false
      if (f.fam && t.family !== f.fam) return false
      if (f.mat && t.material !== f.mat) return false
      if (!pressureMatch(t.pressureAtm, f.p)) return false
      if (lo !== null || hi !== null || f.o2only) {
        if (t.o2Fraction === null) return false
        if (lo !== null && t.o2Fraction < lo) return false
        if (hi !== null && t.o2Fraction > hi) return false
      }
      return true
    })
  }, [f.acc, f.fam, f.mat, f.o2min, f.o2max, f.p, f.o2only])

  const page = Math.max(1, Number(f.page) || 1)
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const visible = rows.slice((page - 1) * PAGE, page * PAGE)
  const filtered = KEYS.some((k) => k !== 'page' && f[k])

  const select = 'w-full border border-line-strong bg-raised px-2.5 py-2 text-sm'

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Test data</h1>
      </section>

      <section className="grid grid-cols-2 gap-3 border-y border-line py-5 md:grid-cols-3 lg:grid-cols-6">
        <Filter label="Investigation">
          <select className={select} value={f.acc} onChange={(e) => set({ acc: e.target.value })}>
            <option value="">All</option>
            {investigations.filter((i) => i.testCount > 0).map((i) => (
              <option key={i.accession} value={i.accession}>
                {i.acronym || i.accession} ({i.testCount})
              </option>
            ))}
          </select>
        </Filter>
        <Filter label="Test family">
          <select className={select} value={f.fam} onChange={(e) => set({ fam: e.target.value })}>
            <option value="">All</option>
            {FAMILY_ORDER.map((fam) => (
              <option key={fam} value={fam}>{FAMILY_LABEL[fam]}</option>
            ))}
          </select>
        </Filter>
        <Filter label="Material">
          <select className={select} value={f.mat} onChange={(e) => set({ mat: e.target.value })}>
            <option value="">All</option>
            {materials.map((m) => (
              <option key={m.name} value={m.name}>{m.name} ({m.total})</option>
            ))}
          </select>
        </Filter>
        <Filter label="Oxygen from (%)">
          <input className={select} type="number" min={0} max={100} step={1} placeholder="e.g. 30" value={f.o2min}
            onChange={(e) => set({ o2min: e.target.value })} />
        </Filter>
        <Filter label="Oxygen to (%)">
          <input className={select} type="number" min={0} max={100} step={1} placeholder="e.g. 40" value={f.o2max}
            onChange={(e) => set({ o2max: e.target.value })} />
        </Filter>
        <Filter label="Pressure">
          <select className={select} value={f.p} onChange={(e) => set({ p: e.target.value })}>
            {PRESSURES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Filter>
        <label className="col-span-2 flex items-center gap-2 text-sm text-dim md:col-span-3 lg:col-span-4">
          <input type="checkbox" checked={!!f.o2only} onChange={(e) => set({ o2only: e.target.checked ? '1' : '' })}
            className="accent-[var(--color-flame)]" />
          Only tests with a recorded oxygen level
        </label>
        <div className="col-span-2 flex items-center justify-end gap-4 text-sm md:col-span-3 lg:col-span-2">
          <span className="font-mono text-dim">{plural(rows.length, 'row')}</span>
          {filtered && (
            <button className="link" onClick={() => navigate('tests', {}, true)}>
              Clear filters
            </button>
          )}
        </div>
      </section>

      {rows.length === 0 ? (
        <div className="hatch border border-dashed border-line-strong p-6">
          <p className="text-lg">No test matches these filters.</p>
          <p className="mt-1 text-dim">
            That can be a real finding rather than a mistake. The{' '}
            <a className="link" href={href('gaps')}>gap map</a> shows where the
            archive is empty.
          </p>
        </div>
      ) : (
        <>
          <OutcomeChart rows={rows} onPick={(fam) => set({ fam })} />
          <RowList rows={visible} />
          {pages > 1 && (
            <nav className="flex items-center justify-between text-sm" aria-label="Pages">
              <button disabled={page <= 1} onClick={() => navigate('tests', { ...f, page: String(page - 1) }, true)}
                className="border border-line-strong px-3 py-1.5 disabled:opacity-40">Previous</button>
              <span className="font-mono text-dim">Page {page} of {pages}</span>
              <button disabled={page >= pages} onClick={() => navigate('tests', { ...f, page: String(page + 1) }, true)}
                className="border border-line-strong px-3 py-1.5 disabled:opacity-40">Next</button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-dim">{label}</span>
      {children}
    </label>
  )
}

// ---------------------------------------------------------------------------
// Chart, or the reason there is no chart
// ---------------------------------------------------------------------------

const OUTCOME_FILL: Record<Outcome, string> = {
  extinction: '#4fd1a5',
  sustained: '#ff7a45',
  disruption: '#f2c14e',
  unknown: '#4a505b',
}
const OUTCOMES: Outcome[] = ['extinction', 'sustained', 'disruption', 'unknown']

function OutcomeChart({ rows, onPick }: { rows: TestRow[]; onPick: (f: Family) => void }) {
  const reason = useMemo(() => blockReason(rows), [rows])
  const withO2 = useMemo(() => rows.filter((r) => r.o2Fraction !== null), [rows])

  const data = useMemo(() => {
    const bins = O2_BINS.map((b, i) => ({
      bin: `${Math.round(b * 100)}-${Math.round((O2_BINS[i + 1] ?? 1) * 100)}%`,
      extinction: 0, sustained: 0, disruption: 0, unknown: 0,
    }))
    for (const r of withO2) bins[O2_BINS.indexOf(binFor(r.o2Fraction!))][r.outcome]++
    return bins
  }, [withO2])

  if (reason) {
    const fams = familiesIn(rows)
    return (
      <section className="hatch border border-dashed border-line-strong p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="border border-dashed border-line-strong bg-canvas px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-dim">
            Not comparable
          </span>
          <h2 className="text-lg font-medium">Chart withheld: these rows mix {fams.length} kinds of test</h2>
        </div>
        <div className="mt-3 space-y-3">
          <p className="max-w-3xl leading-relaxed text-dim">{reason}</p>
          <p className="text-sm text-dim">
            Putting them on one axis would produce a chart that looks informative and means nothing.
            Choose one kind to chart it:
          </p>
          <div className="flex flex-wrap gap-2">
            {FAMILY_ORDER.filter((x) => fams.includes(x)).map((fam) => (
              <button key={fam} onClick={() => onPick(fam)}
                className="border border-line-strong px-3 py-1.5 text-sm hover:border-flame hover:text-flame">
                {FAMILY_LABEL[fam]} <span className="text-faint">({rows.filter((r) => r.family === fam).length})</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (!withO2.length) {
    return (
      <section className="hatch border border-dashed border-line-strong p-4 text-dim">
        None of these {rows.length} tests records a numeric oxygen level, so there is nothing to chart
        against oxygen.
      </section>
    )
  }

  return (
    <section>
      <h2 className="font-medium">Tests by oxygen level: {FAMILY_LABEL[rows[0].family].toLowerCase()}</h2>
      <p className="text-sm text-faint">
        {plural(withO2.length, 'test')} with a recorded oxygen level
        {rows.length > withO2.length ? `; ${rows.length - withO2.length} more have none and are not drawn` : ''}.
      </p>
      <div className="mt-3 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="#262a31" vertical={false} />
            <XAxis dataKey="bin" tick={{ fill: '#6d737e', fontSize: 11 }} stroke="#3a404a" interval={0} angle={-30} textAnchor="end" height={44} />
            <YAxis tick={{ fill: '#6d737e', fontSize: 11 }} stroke="#3a404a" allowDecimals={false} />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              contentStyle={{ background: '#191c21', border: '1px solid #3a404a', borderRadius: 0, fontSize: 13 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {OUTCOMES.map((o) => (
              <Bar key={o} dataKey={o} name={OUTCOME_LABEL[o]} stackId="a" fill={OUTCOME_FILL[o]} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

