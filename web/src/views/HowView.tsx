/**
 * How it works (F8).
 *
 * The method and its limits, for a reader with one minute. Every figure on
 * this page is computed from the dataset at load, including the unit-trap
 * table, so the page cannot drift from the data it describes.
 */
import { DEFAULT_TOLERANCE } from '@shared/evidence'
import { GRADE_MEANING, GradeBadge } from '../components/Grade'
import { investigationByAccession, investigations, meta, tests } from '../data'
import { pct } from '../lib/format'
import { href } from '../lib/route'

// ---------------------------------------------------------------------------
// The unit trap, read straight from the rows
// ---------------------------------------------------------------------------

interface SourceColumn {
  accession: string
  column: string
  count: number
  rawLo: number
  rawHi: number
  usedLo: number
  usedHi: number
}

function sourceColumns(): SourceColumn[] {
  const byKey = new Map<string, SourceColumn>()
  for (const t of tests) {
    if (!t.sourceO2Column || t.o2Fraction === null) continue
    const rawValue = Number.parseFloat(t.raw[t.sourceO2Column])
    if (!Number.isFinite(rawValue)) continue
    const key = `${t.accession}|${t.sourceO2Column}`
    const c =
      byKey.get(key) ??
      { accession: t.accession, column: t.sourceO2Column.trim(), count: 0, rawLo: Infinity, rawHi: -Infinity, usedLo: Infinity, usedHi: -Infinity }
    c.count++
    c.rawLo = Math.min(c.rawLo, rawValue)
    c.rawHi = Math.max(c.rawHi, rawValue)
    c.usedLo = Math.min(c.usedLo, t.o2Fraction)
    c.usedHi = Math.max(c.usedHi, t.o2Fraction)
    byKey.set(key, c)
  }
  // Percent sources first: they are the ones that would break a naive merge.
  return [...byKey.values()].sort((a, b) => b.rawHi - a.rawHi)
}

const COLUMNS = sourceColumns()
const isPercent = (c: SourceColumn) => c.rawHi > 1
const NAIVE_LO = Math.min(...COLUMNS.map((c) => c.rawLo))
const NAIVE_HI = Math.max(...COLUMNS.map((c) => c.rawHi))
const fmtRaw = (n: number) => String(Math.round(n * 1000) / 1000)

// ---------------------------------------------------------------------------

const STEPS = [
  { name: 'Fetch', model: false, text: 'Download every combustion investigation and its test tables from NASA PSI.' },
  { name: 'Normalise', model: false, text: 'Convert oxygen to mole fraction and pressure to atm, once. Keep every original value.' },
  { name: 'Grade', model: false, text: 'Decide what the tests can and cannot say about a condition, by fixed rules.' },
  { name: 'Summarise', model: true, text: 'A language model writes two plain sentences per investigation. It sees prose and returns prose.' },
  { name: 'Show', model: false, text: 'This dashboard reads the result as one static file. Lookups are graded in your browser.' },
]

export function HowView() {
  const withO2 = tests.filter((t) => t.o2Fraction !== null).length
  const noMaterial = tests.filter((t) => t.material === null).length
  const withOutcome = investigations.filter((i) => i.hasOutcomeData)
  const noTable = investigations.filter((i) => i.testCount === 0).length
  const solids = tests.filter((t) => t.family === 'flame-spread')
  const solidsNoPressure = solids.filter((t) => t.pressureAtm === null).length

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h1>
      </section>

      <section>
        <h2 className="text-lg font-semibold">From NASA's archive to this screen</h2>
        <ol className="mt-4 grid gap-x-5 gap-y-5 md:grid-cols-5">
          {STEPS.map((s) => (
            <li key={s.name} className={`border-t-2 pt-3 ${s.model ? 'border-bounded' : 'border-line-strong'}`}>
              <p className="font-medium">{s.name}</p>
              <p className="mt-1 text-sm leading-snug text-dim">{s.text}</p>
              {s.model && <p className="mt-2 text-sm text-bounded">The only step that uses a language model.</p>}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-faint">
          Result: {meta.investigationCount} investigations and {meta.testCount.toLocaleString()} tests,
          built {meta.generatedAt.slice(0, 10)} from {meta.source} ({meta.license}).
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">The three grades</h2>
        <div className="mt-3 divide-y divide-line border-y border-line">
          <GradeRow grade="measured"
            detail={`At least one test of that material within ${DEFAULT_TOLERANCE.o2 * 100} percentage point of the oxygen level asked, and within ${DEFAULT_TOLERANCE.pressure} atm when the test recorded a pressure.`} />
          <GradeRow grade="bounded"
            detail="No test at that oxygen level, but tests of the same material both below and above it. The point is bracketed, not measured." />
          <GradeRow grade="no-data"
            detail="Neither. The nearest tests are shown, labelled as not a match, with the reason they may not carry over." />
        </div>
        <p className="mt-3 max-w-3xl text-sm text-dim">
          Tests are graded one kind at a time: solid flame spread, liquid droplet, gas burner, smoke
          aerosol. They measure different physical quantities, so they are never combined into one
          answer or one chart. When a comparison is blocked, the screen says why.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">The trap in the data: oxygen in two units</h2>
        <p className="mt-2 max-w-3xl text-dim">
          NASA's tables do not agree on how to write an oxygen level. Most use a fraction between 0
          and 1. BASS-II uses a percentage. Merged as they are, the oxygen axis would run from{' '}
          <span className="font-mono text-ink">{fmtRaw(NAIVE_LO)}</span> to{' '}
          <span className="font-mono text-ink">{fmtRaw(NAIVE_HI)}</span>, and every chart built on it
          would be wrong without looking wrong.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line-strong text-xs text-faint">
              <tr>
                <th className="px-3 py-2 font-normal">Investigation</th>
                <th className="px-3 py-2 font-normal">Column name in NASA's file</th>
                <th className="px-3 py-2 text-right font-normal">Values as written</th>
                <th className="px-3 py-2 text-right font-normal">As used here</th>
                <th className="px-3 py-2 text-right font-normal">Tests</th>
              </tr>
            </thead>
            <tbody>
              {COLUMNS.map((c) => (
                <tr key={`${c.accession}|${c.column}`} className={`border-b border-line ${isPercent(c) ? 'bg-flame/10' : ''}`}>
                  <td className="whitespace-nowrap px-3 py-2">
                    {investigationByAccession.get(c.accession)?.acronym || c.accession}
                    <span className="ml-2 font-mono text-xs text-faint">{c.accession}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-dim">"{c.column}"</td>
                  <td className={`whitespace-nowrap px-3 py-2 text-right font-mono ${isPercent(c) ? 'text-flame' : ''}`}>
                    {fmtRaw(c.rawLo)} to {fmtRaw(c.rawHi)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono">
                    {pct(c.usedLo)} to {pct(c.usedHi)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-dim">{c.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-3xl text-sm text-dim">
          The pipeline checks each column two ways: what its name claims, and what range its values
          can physically be. Conversion happens there, once, and never in this interface. Open any
          test row to see the original value beside the converted one.{' '}
          <a className="link" href={href('tests', { acc: 'PSI-25', o2only: '1' })}>
            See the BASS-II rows
          </a>
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">What the language model does</h2>
        <div className="mt-3 grid gap-x-12 gap-y-6 md:grid-cols-2">
          <div className="border-t border-line-strong pt-3">
            <h3 className="font-medium">It does</h3>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed text-dim">
              <li>Write the two-sentence summary and the prevention, detection or suppression tags for each investigation.</li>
              <li>On the Ask screen, read your question into a material, an oxygen level and a kind of test.</li>
              <li>On the Ask screen, phrase the reply from a list of facts already computed.</li>
            </ul>
          </div>
          <div className="border-t border-line-strong pt-3">
            <h3 className="font-medium">It never does</h3>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed text-dim">
              <li>Produce, convert or adjust a number. Every figure comes from a NASA table.</li>
              <li>Decide a grade. Grading is fixed rules that run the same way every time.</li>
              <li>Fill a gap. If a reply contains a number that is not in the computed facts, the reply is thrown away and fixed wording is used.</li>
            </ul>
          </div>
        </div>
        <p className="mt-3 max-w-3xl text-sm text-dim">
          The Ask screen works with no model at all: questions are then read and answered by fixed
          rules, and the grading step is exactly the same.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Limits</h2>
        <ul className="mt-3 space-y-2.5 text-dim">
          <Limit n={`${(tests.length - withO2).toLocaleString()} of ${tests.length.toLocaleString()}`}>
            tests have no numeric oxygen level in their source file. They are listed, but cannot answer a question about an atmosphere.
          </Limit>
          <Limit n={`${withOutcome.length} of ${investigations.length}`}>
            investigations record whether a flame went out or kept burning ({withOutcome.map((i) => i.acronym || i.accession).join(', ')}).
            For the rest the outcome is shown as not recorded. It is never inferred.
          </Limit>
          <Limit n={String(noMaterial)}>
            tests could not be matched to a named material, usually because the file describes a sample's size but not what it is made of. They are excluded from lookups.
          </Limit>
          <Limit n={`${solidsNoPressure} of ${solids.length}`}>
            solid-material tests record no ambient pressure, so a pressure filter cannot rule them in or out.
          </Limit>
          <Limit n={String(noTable)}>
            investigations have a description in PSI but no test table.
          </Limit>
          <Limit n="0">
            tests at lunar gravity. Everything here ran in microgravity or on the ground.
          </Limit>
        </ul>
        <p className="mt-4 max-w-3xl text-sm text-faint">
          FlameSafe is a view of what was tested. It is not a flammability model and not a safety
          certification, and a "measured" grade means a test exists, not that a material is safe.
        </p>
      </section>
    </div>
  )
}

function GradeRow({ grade, detail }: { grade: 'measured' | 'bounded' | 'no-data'; detail: string }) {
  return (
    <div className="grid items-baseline gap-x-6 gap-y-1 py-3 md:grid-cols-[8rem_15rem_1fr]">
      <div>
        <GradeBadge grade={grade} />
      </div>
      <p className="font-medium">{GRADE_MEANING[grade]}</p>
      <p className="text-sm leading-relaxed text-dim">{detail}</p>
    </div>
  )
}

function Limit({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[6.5rem_1fr] gap-3 sm:grid-cols-[8rem_1fr]">
      <span className="font-mono text-ink">{n}</span>
      <span>{children}</span>
    </li>
  )
}
