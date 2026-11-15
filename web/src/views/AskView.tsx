/**
 * Grounded Q&A (F7).
 *
 * A plain-English question goes to /api/ask. That endpoint uses a language
 * model only to read the question and to phrase the reply; the answer in
 * between is graded by the same `gradeEvidence` the rest of the app uses.
 * This screen shows all three parts: how the question was read, the grade,
 * and the list of computed facts the wording was allowed to draw on.
 *
 * Offline fallback: the five pinned questions have a fixed reading, so if the
 * endpoint cannot be reached they are graded right here in the browser from
 * the bundled data. The demo does not depend on a network or an API key.
 */
import { useEffect, useState } from 'react'
import { cannedReading, SUGGESTIONS } from '@api/canned.ts'
import { buildFacts } from '@api/facts.ts'
import { blockReason, gradeEvidence } from '@shared/evidence'
import type { Family, Grade, TestRow } from '@shared/types'
import { GradeBadge } from '../components/Grade'
import { RowList } from '../components/RowList'
import { dataset, investigationByAccession, tests } from '../data'
import { atm, FAMILY_LABEL, pct, psi } from '../lib/format'
import { href, navigate } from '../lib/route'

/**
 * The parts of the /api/ask response this screen uses. The full wire format
 * is defined in api/ask.ts (`AskResponse`); it is restated here because that
 * file reads from disk and cannot be imported into browser code.
 */
interface Answer {
  question: string
  interpretation: {
    material: string
    o2Fraction: number
    pressureAtm?: number
    family?: Family
    assumedO2: boolean
  }
  grade: Grade
  answer: string
  facts: string[]
  matches: { id: string }[]
  nearest: { id: string }[]
  caveat: string | null
  blocked: string | null
  citations: { accession: string; acronym: string; title: string; doi: string }[]
  meta: {
    answerMode: 'model' | 'deterministic' | 'browser'
    readingMode: 'model' | 'rules'
    pinned: boolean
    rejectedNumbers: string[]
  }
}

type State =
  | { status: 'idle' }
  | { status: 'loading'; q: string }
  | { status: 'done'; q: string; answer: Answer }
  | { status: 'failed'; q: string; message: string }

const ROW_BY_ID = new Map(tests.map((t) => [t.id, t]))
const rowsFor = (refs: { id: string }[]) =>
  refs.map((r) => ROW_BY_ID.get(r.id)).filter((r): r is TestRow => Boolean(r))

/** Grade a pinned question locally. Same function the endpoint calls. */
function answerInBrowser(question: string): Answer | null {
  const reading = cannedReading(question)
  if (!reading) return null

  const result = gradeEvidence(tests, {
    material: reading.material,
    o2Fraction: reading.o2Fraction,
    pressureAtm: reading.pressureAtm,
    family: reading.family,
  })
  const rows = [...result.matches, ...result.nearest]
  // The same fact builder the endpoint uses, so an offline answer is not a
  // thinner answer. The wording mirrors the endpoint's rule-based path: the
  // per-row and licence lines are shown in their own places below.
  const facts = buildFacts(result, reading, dataset)
  const prose = facts.filter((f) => !/^(Nearest available evidence:|Source:)/.test(f))

  return {
    question,
    interpretation: reading,
    grade: result.grade,
    answer: prose.join(' '),
    facts,
    matches: result.matches,
    nearest: result.nearest,
    caveat: result.caveat,
    blocked: blockReason(rows),
    citations: [...new Set(rows.map((r) => r.accession))].flatMap((a) => {
      const i = investigationByAccession.get(a)
      return i ? [{ accession: a, acronym: i.acronym, title: i.title, doi: i.doi }] : []
    }),
    meta: { answerMode: 'browser', readingMode: 'rules', pinned: true, rejectedNumbers: [] },
  }
}

async function fetchAnswer(question: string): Promise<Answer> {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question }),
  })
  // A static host answers unknown paths with the HTML page; treat that as down.
  if (!res.headers.get('content-type')?.includes('application/json')) {
    throw new Error('unreachable')
  }
  const body = await res.json()
  if (!res.ok) throw new Error(typeof body?.error === 'string' ? body.error : 'unreachable')
  return body as Answer
}

export function AskView({ params }: { params: URLSearchParams }) {
  const q = (params.get('q') ?? '').trim()
  const [draft, setDraft] = useState(q)
  const [state, setState] = useState<State>({ status: 'idle' })

  useEffect(() => {
    if (!q) return
    let cancelled = false
    const settle = (next: State) => {
      if (!cancelled) setState(next)
    }
    settle({ status: 'loading', q })
    fetchAnswer(q)
      .then((answer) => settle({ status: 'done', q, answer }))
      .catch((err: Error) => {
        const local = answerInBrowser(q)
        if (local) settle({ status: 'done', q, answer: local })
        else settle({ status: 'failed', q, message: err.message })
      })
    return () => {
      cancelled = true
    }
  }, [q])

  const submit = (question: string) => {
    setDraft(question)
    navigate('ask', { q: question.trim() })
  }
  const current = q && state.status !== 'idle' && state.q === q ? state : null

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Ask in plain English</h1>
      </section>

      <form
        className="border-y border-line py-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.trim()) submit(draft)
        }}
      >
        <label className="block">
          <span className="text-sm text-dim">Your question</span>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={500}
              placeholder="e.g. Has PMMA been tested at 34% oxygen?"
              className="w-full border border-line-strong bg-raised px-3 py-2 text-base"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="bg-flame px-5 py-2 font-medium text-canvas hover:brightness-110 disabled:opacity-40"
            >
              Ask
            </button>
          </div>
        </label>
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-sm text-faint">Questions that work without a network:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => submit(s)}
                className={`border px-3 py-1.5 text-left text-sm ${q === s ? 'border-flame text-flame' : 'border-line-strong text-dim hover:text-ink'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </form>

      <div aria-live="polite">
        {current?.status === 'loading' && (
          <p className="text-dim">Checking the test tables…</p>
        )}
        {current?.status === 'failed' && <Failed message={current.message} />}
        {current?.status === 'done' && <Result a={current.answer} />}
      </div>
    </div>
  )
}

function Failed({ message }: { message: string }) {
  const down = message === 'unreachable' || message === 'Failed to fetch'
  return (
    <div className="border-l-2 border-line-strong pl-4">
      <p className="text-lg">
        {down ? 'The question service cannot be reached right now.' : 'That question could not be answered.'}
      </p>
      <p className="mt-2 max-w-2xl text-dim">
        {down
          ? 'Nothing was guessed in its place. The suggested questions above still work, and the evidence lookup answers the same kind of question without the service.'
          : message}
      </p>
      <a className="mt-3 inline-block link" href={href('evidence')}>
        Open the evidence lookup
      </a>
    </div>
  )
}

function Result({ a }: { a: Answer }) {
  const r = a.interpretation
  const known = r.material !== 'unknown'
  const shown = rowsFor(a.grade === 'no-data' ? a.nearest : a.matches)
  const noData = a.grade === 'no-data'

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-base font-semibold">How your question was read</h2>
        <div className="mt-3">
          {known ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <Read label="Material" value={r.material} />
              <Read label="Oxygen" value={pct(r.o2Fraction)} warn={r.assumedO2 ? 'assumed' : undefined} />
              <Read label="Pressure" value={r.pressureAtm === undefined ? 'Any' : `${atm(r.pressureAtm)} (${psi(r.pressureAtm)})`} />
              <Read label="Kind of test" value={r.family ? FAMILY_LABEL[r.family] : 'Any'} />
            </dl>
          ) : (
            <p className="text-dim">No material in the question matched one the archive covers.</p>
          )}
          {r.assumedO2 && (
            <p className="mt-3 border-l-2 border-bounded pl-3 text-sm text-dim">
              Your question named no oxygen level, so {pct(r.o2Fraction)} was assumed. That answers a
              narrower question than the one you asked.
            </p>
          )}
          <p className="mt-3 text-xs text-faint">
            {a.meta.pinned
              ? 'Read with a fixed interpretation for this suggested question.'
              : a.meta.readingMode === 'model'
                ? 'Read by a language model; any number it returned had to appear in your question.'
                : 'Read by fixed rules, with no language model.'}
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold">What the test tables say</h2>
        <article className={`mt-3 ${noData ? 'hatch border border-dashed border-line-strong p-4 sm:p-5' : ''}`}>
          <div className="flex flex-wrap items-center gap-3">
            <GradeBadge grade={a.grade} size="lg" />
          </div>
          <p className="mt-4 max-w-3xl text-lg leading-relaxed">{a.answer}</p>

          {a.blocked && (
            <p className="mt-4 max-w-3xl border-l-2 border-line-strong pl-3 text-dim">
              <span className="font-medium text-ink">Not pooled: </span>
              {a.blocked}
            </p>
          )}

          {shown.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-medium text-dim">
                {noData ? 'Nearest evidence (not a match)' : `Tests behind this answer (${shown.length})`}
              </h3>
              <RowList rows={shown.slice(0, 6)} />
            </div>
          )}

          {known && (
            <a
              className="mt-4 inline-block text-sm link"
              href={href('evidence', {
                m: r.material,
                o2: String(Math.round(r.o2Fraction * 1000) / 10),
                p: r.pressureAtm === undefined ? undefined : r.pressureAtm.toFixed(3),
              })}
            >
              Explore this in the evidence lookup
            </a>
          )}
        </article>
      </section>

      <section>
        <h2 className="text-base font-semibold">The facts the wording was allowed to use</h2>
        <div className="mt-3">
          <ul className="space-y-1.5 text-sm text-dim">
            {a.facts.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-faint">
            {a.meta.answerMode === 'model'
              ? 'Worded by a language model from these facts only. Every number in the reply was checked against this list.'
              : a.meta.answerMode === 'browser'
                ? 'The question service was unreachable, so this was graded in your browser from the bundled data. No language model was involved.'
                : 'Worded by fixed rules from these facts. No language model was involved.'}
            {a.meta.rejectedNumbers.length > 0 &&
              ` A model reply was discarded for introducing numbers not in this list: ${a.meta.rejectedNumbers.join(', ')}.`}
          </p>
          {a.citations.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
              {a.citations.map((c) => (
                <li key={c.accession}>
                  <span className="font-mono text-xs text-faint">{c.accession}</span>{' '}
                  <span className="text-dim">{c.acronym || c.title}</span>{' '}
                  {c.doi && (
                    <a className="font-mono text-xs link" href={`https://doi.org/${c.doi}`} target="_blank" rel="noreferrer">
                      doi:{c.doi}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}

function Read({ label, value, warn }: { label: string; value: string; warn?: string }) {
  return (
    <div>
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="font-mono">
        {value}
        {warn && <span className="ml-2 border border-bounded px-1 text-xs text-bounded">{warn}</span>}
      </dd>
    </div>
  )
}
