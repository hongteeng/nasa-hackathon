/**
 * Evidence lookup (F3) and the comparability guard (F4).
 *
 * The user names a material and an atmosphere. The answer is a grade first
 * and numbers second: Measured, Bounded or No data. The grading itself is
 * `gradeEvidence` in shared/evidence.ts, the same function the pipeline and
 * the /api/ask endpoint use, so this screen cannot disagree with them.
 *
 * The guard: a material is graded one test family at a time, and data from
 * other families that happens to cover the same oxygen level is shown as
 * "not pooled", with the physical reason, instead of being mixed in.
 */
import { useMemo } from 'react'
import { canCompare, DEFAULT_TOLERANCE, gradeEvidence, HABITAT } from '@shared/evidence'
import type { EvidenceResult, Family, TestRow } from '@shared/types'
import { GradeBadge } from '../components/Grade'
import { O2Strip } from '../components/O2Strip'
import { RowList } from '../components/RowList'
import { investigationByAccession, materialByName, materials, tests, type MaterialFamily } from '../data'
import { atm, FAMILY_LABEL, FAMILY_ORDER, OUTCOME_LABEL, pct, plural, psi } from '../lib/format'
import { href, navigate } from '../lib/route'

const KIND_LABEL = { solid: 'Solids', liquid: 'Liquids', gas: 'Gases' } as const

const PRESETS = [
  { label: 'Moon habitat', o2: 34, p: HABITAT.pressureMaxAtm.toFixed(3), note: '34% O₂, 10.2 psi' },
  { label: 'Space station', o2: 21, p: '1', note: '21% O₂, 1 atm' },
]

export function EvidenceView({ params }: { params: URLSearchParams }) {
  const material = params.get('m') ?? 'Nomex'
  const o2Pct = clamp(Number(params.get('o2') ?? 34), 10, 90)
  const pressure = params.get('p') ?? ''
  const pressureAtm = pressure ? Number(pressure) : undefined

  const set = (next: { m?: string; o2?: number; p?: string }) =>
    navigate(
      'evidence',
      {
        m: next.m ?? material,
        o2: String(next.o2 ?? o2Pct),
        p: next.p ?? pressure,
      },
      true,
    )

  const mat = materialByName.get(material)
  const o2 = o2Pct / 100

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          What did NASA actually measure?
        </h1>
      </section>

      <section className="border-y border-line py-5">
        <div className="grid gap-5 md:grid-cols-[1fr_1.4fr_1fr]">
          <label className="block">
            <span className="text-sm text-dim">Material</span>
            <select
              value={material}
              onChange={(e) => set({ m: e.target.value })}
              className="mt-1.5 w-full border border-line-strong bg-raised px-3 py-2 text-base"
            >
              {(['solid', 'liquid', 'gas'] as const).map((kind) => (
                <optgroup key={kind} label={KIND_LABEL[kind]}>
                  {materials
                    .filter((m) => m.kind === kind)
                    .map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name} ({m.total} tests)
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="flex items-baseline justify-between">
              <span className="text-sm text-dim">Oxygen</span>
              <span className="font-mono text-lg text-flame">{o2Pct}%</span>
            </span>
            <input
              type="range"
              min={10}
              max={90}
              step={0.5}
              value={o2Pct}
              onChange={(e) => set({ o2: Number(e.target.value) })}
              className="mt-3 w-full accent-[var(--color-flame)]"
            />
            <span className="mt-1 flex justify-between font-mono text-xs text-faint">
              <span>10%</span>
              <span>Earth air 21%</span>
              <span>90%</span>
            </span>
          </label>

          <label className="block">
            <span className="text-sm text-dim">Pressure</span>
            <select
              value={pressure}
              onChange={(e) => set({ p: e.target.value })}
              className="mt-1.5 w-full border border-line-strong bg-raised px-3 py-2 text-base"
            >
              <option value="">Any pressure</option>
              <option value="1">1 atm (14.7 psi)</option>
              <option value={HABITAT.pressureMaxAtm.toFixed(3)}>0.69 atm (10.2 psi, habitat)</option>
              <option value="0.5">0.5 atm (7.3 psi)</option>
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <span className="text-sm text-faint">Atmospheres:</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => set({ o2: p.o2, p: p.p })}
              className="border border-line-strong px-3 py-1.5 text-sm hover:border-flame hover:text-flame"
            >
              {p.label} <span className="text-faint">({p.note})</span>
            </button>
          ))}
        </div>
      </section>

      {!mat ? (
        <p className="hatch border border-dashed border-line-strong p-5 text-dim">
          {material} does not appear in the PSI combustion data.
        </p>
      ) : (
        <>
          {sortFamilies(mat.families).map((mf) => (
            <FamilyResult key={mf.family} material={material} mf={mf} o2={o2} pressureAtm={pressureAtm} />
          ))}
          <NotPooled material={material} own={mat.families.map((f) => f.family)} o2={o2} />
        </>
      )}
    </div>
  )
}

const clamp = (n: number, lo: number, hi: number) =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo

const sortFamilies = (fs: MaterialFamily[]) =>
  [...fs].sort((a, b) => FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family))

// ---------------------------------------------------------------------------
// One material in one test family
// ---------------------------------------------------------------------------

function FamilyResult({
  material,
  mf,
  o2,
  pressureAtm,
}: {
  material: string
  mf: MaterialFamily
  o2: number
  pressureAtm: number | undefined
}) {
  const result = useMemo<EvidenceResult | null>(
    () =>
      mf.withO2.length
        ? gradeEvidence(tests, { material, o2Fraction: o2, pressureAtm, family: mf.family })
        : null,
    [material, mf, o2, pressureAtm],
  )

  // Did pressure, rather than oxygen, rule out a direct match? Worth saying.
  const pressureMiss = useMemo(() => {
    if (!result || result.grade === 'measured' || pressureAtm === undefined) return false
    return (
      gradeEvidence(tests, { material, o2Fraction: o2, family: mf.family }).grade === 'measured'
    )
  }, [result, material, mf, o2, pressureAtm])

  const accessions = [...new Set(mf.rows.map((r) => r.accession))]

  // The material was tested, but no row carries a numeric oxygen level.
  if (!result) {
    return (
      <article className="hatch border border-dashed border-line-strong p-5">
        <FamilyHeading family={mf.family} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <GradeBadge grade="no-data" size="lg" />
          <p className="text-lg">Tested, but oxygen was not recorded.</p>
        </div>
        <p className="mt-3 max-w-2xl text-dim">
          PSI holds {plural(mf.rows.length, 'test')} of {material} in this family ({names(accessions)}),
          but none records a numeric oxygen level, so they cannot answer a question about a
          specific atmosphere.
        </p>
        <a className="mt-3 inline-block text-sm link" href={href('tests', { mat: material, fam: mf.family })}>
          See these {mf.rows.length} tests
        </a>
      </article>
    )
  }

  const shown = result.grade === 'no-data' ? result.nearest : result.matches
  const noData = result.grade === 'no-data'

  return (
    <article
      className={noData ? 'hatch border border-dashed border-line-strong p-4 sm:p-5' : 'border-t border-line-strong pt-6'}
    >
      <FamilyHeading family={mf.family} />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <GradeBadge grade={result.grade} size="lg" />
        <p className="text-xl font-medium">{headline(result, material, o2, mf)}</p>
      </div>

      {result.caveat && <p className="mt-3 max-w-3xl leading-relaxed text-dim">{result.caveat}</p>}
      {pressureMiss && (
        <p className="mt-2 max-w-3xl text-dim">
          Tests do exist at {pct(o2)} oxygen, but none within {DEFAULT_TOLERANCE.pressure} atm of{' '}
          {atm(pressureAtm!)} ({psi(pressureAtm!)}). Choose "Any pressure" to see them.
        </p>
      )}

      {result.grade === 'measured' && <OutcomeTally rows={result.matches} />}

      <div className="mt-6 overflow-x-auto">
        <div className="min-w-[38rem]">
          <O2Strip rows={mf.withO2} query={o2} />
        </div>
      </div>
      <p className="mt-2 text-xs text-faint">
        Every tick is an oxygen level where {material} was tested in this family:{' '}
        {plural(mf.withO2.length, 'test')} from {pct(mf.o2Range![0])} to {pct(mf.o2Range![1])}.

        {mf.rows.length > mf.withO2.length &&
          ` A further ${mf.rows.length - mf.withO2.length} have no oxygen level recorded.`}
      </p>

      {shown.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-medium text-dim">
            {noData
              ? 'Nearest evidence (not a match)'
              : result.grade === 'bounded'
                ? 'The tests either side'
                : `Tests at this condition (${shown.length})`}
          </h3>
          <RowList rows={shown.slice(0, 6)} />
          <a className="mt-2 inline-block text-sm link" href={href('tests', { mat: material, fam: mf.family })}>
            All {mf.rows.length} {material} tests in this family
          </a>
        </div>
      )}
    </article>
  )
}

function FamilyHeading({ family }: { family: Family }) {
  return (
    <div>
      <h2 className="text-base font-semibold">{FAMILY_LABEL[family]} tests</h2>
    </div>
  )
}

const names = (accessions: string[]) =>
  accessions.map((a) => investigationByAccession.get(a)?.acronym || a).join(', ')

function headline(r: EvidenceResult, material: string, o2: number, mf: MaterialFamily) {
  if (r.grade === 'measured')
    return `${material} was tested at ${pct(o2)} oxygen: ${plural(r.matches.length, 'test')} within one percentage point.`
  if (r.grade === 'bounded') return `${material} was not tested at ${pct(o2)}, but was tested either side.`
  const top = mf.o2Range![1]
  return o2 > top
    ? `No test of ${material} above ${pct(top)} oxygen.`
    : `No test of ${material} at ${pct(o2)} oxygen.`
}

/** Outcomes for measured rows. Shown only where NASA recorded one. */
function OutcomeTally({ rows }: { rows: TestRow[] }) {
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.outcome, (counts.get(r.outcome) ?? 0) + 1)
  const recorded = [...counts.entries()].filter(([k]) => k !== 'unknown')

  if (!recorded.length) {
    return (
      <p className="mt-3 max-w-3xl text-dim">
        These tests ran, but their source tables have no burn-or-extinguish column. The outcome is
        not recorded, and this app does not infer one.
      </p>
    )
  }
  return (
    <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
      {recorded.map(([k, n]) => (
        <div key={k}>
          <dd className="font-mono text-2xl tabular-nums">{n}</dd>
          <dt className="text-sm text-dim">{OUTCOME_LABEL[k as TestRow['outcome']]}</dt>
        </div>
      ))}
      {counts.get('unknown') ? (
        <div>
          <dd className="font-mono text-2xl tabular-nums text-faint">{counts.get('unknown')}</dd>
          <dt className="text-sm text-faint">{OUTCOME_LABEL.unknown}</dt>
        </div>
      ) : null}
    </dl>
  )
}

// ---------------------------------------------------------------------------
// The comparability guard
// ---------------------------------------------------------------------------

/**
 * Data from other test families that covers the oxygen level asked about.
 * It exists, and it is tempting, so it is shown; but it is kept out of the
 * answer above, with the reason.
 */
function NotPooled({ material, own, o2 }: { material: string; own: Family[]; o2: number }) {
  const blocked = useMemo(() => {
    const primary = FAMILY_ORDER.find((f) => own.includes(f))!
    return FAMILY_ORDER.filter((f) => !own.includes(f)).flatMap((family) => {
      const rows = tests.filter((t) => t.family === family && t.o2Fraction !== null)
      if (!rows.length) return []
      const values = rows.map((r) => r.o2Fraction!)
      const lo = Math.min(...values)
      const hi = Math.max(...values)
      if (o2 < lo - DEFAULT_TOLERANCE.o2 || o2 > hi + DEFAULT_TOLERANCE.o2) return []
      const near = rows.filter((r) => Math.abs(r.o2Fraction! - o2) <= DEFAULT_TOLERANCE.o2)
      return [
        {
          family,
          lo,
          hi,
          near: near.length,
          total: rows.length,
          accessions: [...new Set(rows.map((r) => r.accession))],
          reason: canCompare(primary, family).reason,
        },
      ]
    })
  }, [own, o2])

  if (!blocked.length) return null

  return (
    <section>
      <h2 className="text-lg font-semibold">Kept out of this answer on purpose</h2>
      <p className="mt-1 max-w-2xl text-sm text-dim">
        Other kinds of test do reach {pct(o2)} oxygen. They measure something physically different
        from a {material} test, so they are not mixed into the grade above.
      </p>
      <div className="mt-4 divide-y divide-line border-y border-line">
        {blocked.map((b) => (
          <article key={b.family} className="grid gap-x-8 gap-y-2 py-4 md:grid-cols-[13rem_1fr]">
            <div>
              <h3 className="font-medium">{FAMILY_LABEL[b.family]}</h3>
              <span className="hatch mt-2 inline-block border border-dashed border-line-strong px-2 py-0.5 font-mono text-xs uppercase tracking-wider text-dim">
                Not pooled
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-mono">{plural(b.near, 'test')}</span> at {pct(o2)} oxygen;{' '}
                {b.total.toLocaleString()} in all, from {pct(b.lo)} to {pct(b.hi)}. From {names(b.accessions)}.
              </p>
              <p className="max-w-3xl leading-relaxed text-dim">{b.reason}</p>
              <a className="link inline-block" href={href('tests', { fam: b.family })}>
                Browse these tests separately
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
