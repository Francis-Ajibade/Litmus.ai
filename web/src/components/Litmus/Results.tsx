import { useState, useMemo, useEffect } from "react";
import hljs from "highlight.js/lib/core";
import python from "highlight.js/lib/languages/python";
import type { Attempt, TestCase, TryEntry } from "./Litmus";


// `highlight.js/lib/core` is an EMPTY highlighter — no grammars at all. We
// register only Python, so the bundle carries one language instead of ~190.
// Registration is global and idempotent, so it belongs at module scope: inside
// the component it would re-run on every render for nothing.
hljs.registerLanguage("python", python);


type Tab = 'code' | 'tests' | 'console' | 'cases'

// One code/console line is exactly 20px tall (leading-5). The reveal clips the
// block by height, so this constant and that class MUST stay in step — hence a
// named constant rather than a magic number buried in the style.
const LINE_H = 20
// how fast each panel streams in. Tests are slower on purpose: a row per ~90ms
// reads like a suite executing, where 28ms/line reads like code being written.
const LINE_MS = 28
const ROW_MS  = 90

// pytest's longrepr is 10-30 lines: the source context, the `>` marker, then the
// error lines prefixed with `E`. The headline is the FIRST `E` line; the rest is
// diff detail. We show the headline inline and hide the remainder behind a
// toggle, so one failure doesn't blow the row height apart.
function headline(message: string): string {
    const line = message.split('\n').find(l => l.trimStart().startsWith('E'))
    return line ? line.trimStart().replace(/^E\s*/, '') : message.split('\n')[0] ?? ''}

interface ResultProps {
    attempts : Attempt[],
    // the pytest source. Not read yet — it feeds "Copy tests" in the next block.
    testSource : string,
    // the approved cases, as objects — description/input are read as fields,
    // which is what lets the Test button prefill without parsing anything.
    testSpec : TestCase[],
    // ALREADY resolved by the parent. "null means the latest" is decided in one
    // place (Litmus), so this component never has to know that convention.
    selected : number,
    // function to set select from parent wil be passed
    onSelect: (i: number) => void

    setTestCase : (i : TestCase) => void
    // the REPL scrollback and whether a run is in flight — both owned by Litmus,
    // because the composer that submits them lives there.
    tryLog: TryEntry[]
    trying: boolean
}
export default function Result({attempts, selected, onSelect, testSource, testSpec, setTestCase, tryLog, trying} : ResultProps){
    const [tab, setTab] = useState<Tab>('code')
    // which tracebacks are expanded, keyed by test name. A Set rather than a
    // single string, because opening one shouldn't collapse another.
    const [open, setOpen] = useState<Set<string>>(new Set())

    const attempt = attempts[selected]
    const sandbox = attempt.result
    const codeLines = attempt.code.split('\n')
    const consoleLines = (sandbox.captured_stdout || 'no output').split('\n')

    // Highlighting is a pure string -> string transform, so useMemo keeps it off
    // every render: it only re-runs when the shown version's code changes.
    const highlighted = useMemo(
        () => hljs.highlight(attempt.code, { language: 'python' }).value,
        [attempt.code],
    )

    // ---- the reveal --------------------------------------------------------
    // How many units the open panel has, and how many are on screen so far.
    const units = tab === 'code'  ? codeLines.length
                : tab === 'tests' ? sandbox.tests.length
                : tab === 'cases' ? testSpec.length
                :                   consoleLines.length
    const [revealed, setRevealed] = useState(0)
    const done = revealed >= units

    // restart the stream whenever the panel or the version changes
    useEffect(() => { setRevealed(0) }, [tab, selected])

    // A self-rescheduling timeout rather than one long-lived interval: it stops
    // on its own once everything is shown, instead of firing forever into a
    // no-op. The cleanup cancels the pending tick if the tab changes mid-stream,
    // which is what stops two streams from racing each other.
    useEffect(() => {
        if (done) return
        const id = setTimeout(
            () => setRevealed(n => n + 1),
            tab === 'tests' ? ROW_MS : LINE_MS,
        )
        return () => clearTimeout(id)
    }, [revealed, done, tab])

    function toggle(name: string) {
        setOpen(prev => {
            // never mutate state in place — React compares by reference, so a
            // mutated Set is the same object and the re-render never happens.
            const next = new Set(prev)
            if (next.has(name)) next.delete(name)
            else next.add(name)
            return next
        })
    }

    // Goes true for a moment each time a new entry lands, so the console dot
    // pulses to say "something arrived" even when you're on another tab. Keyed
    // on tryLog.length rather than the array: a new reference with the same
    // length would re-fire on every unrelated re-render.
    const [justLanded, setJustLanded] = useState(false)
    useEffect(() => {
        if (tryLog.length === 0) return
        setJustLanded(true)
        const id = setTimeout(() => setJustLanded(false), 1800)
        return () => clearTimeout(id)      // a second result mid-flash restarts it
    }, [tryLog.length])

    // which button was last pressed, so it can say "Copied" for a moment. An
    // alert() blocks the whole page and has to be dismissed — heavy feedback for
    // an action that succeeded silently.
    const [copied, setCopied] = useState<'code' | 'tests' | null>(null)

    const handleCopy = async (what: 'code' | 'tests') => {
        try {
            await navigator.clipboard.writeText(what === 'code' ? attempt.code : testSource);
            setCopied(what);
            setTimeout(() => setCopied(null), 1600);
        } catch (err) {
            console.error("Failed to copy text: ", err);
        }
    };


    return(
        <div className="flex flex-col min-h-0 h-full">

        <header className="shrink-0 flex items-center gap-2 px-5 py-3 border-b border-[var(--line)] bg-[var(--panel)]">
                {attempts.map((a, index) => (
                    <button
                        key={index}
                        onClick={() => onSelect(index)}
                        className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 font-mono text-[11px] transition-colors ${
                            index === selected
                                ? 'border-[var(--line)] bg-[var(--panel-3)] text-[var(--text)]'
                                : 'border-transparent text-[var(--faint)] hover:text-[var(--muted)]'
                        }`}
                    >
                        {/* green when that version survived the suite, red when it didn't */}
                        <span className={`w-1.5 h-1.5 rounded-full ${a.result.all_passed ? 'bg-[var(--green)]' : 'bg-[var(--red)]'}`} />
                        v{index + 1}
                    </button>
                ))}

            {/* ml-auto belongs to ONE element — it eats the free space to push
                itself right. On every tab they'd all fight for the same space. */}
            <div className="ml-auto flex items-center gap-1.5 font-mono text-[12.5px] text-[var(--muted)]">
                        {attempt &&(
                            <>
                                {/* index -> version number happens here, once */}
                                <span>v{selected + 1}</span>
                                <span className="text-[var(--line)]">·</span>
                                <span>{sandbox.total} tests</span>
                                <span className="text-[var(--line)]">·</span>
                                <span>
                                    {(sandbox.duration_ms / 1000).toFixed(2)}s
                                </span>
                            </>
                        ) }
            </div>

        </header>

        {/* sidebar + panel. min-h-0 lets the panel scroll instead of stretching
            the whole column — same trick as the chat thread. */}
        <div className="flex-1 min-h-[420px] grid grid-cols-[132px_1fr]">

            <nav className="flex flex-col border-r border-[var(--line)] py-2">
                {([
                    ['code',    codeLines.length],
                    ['tests',   sandbox.tests.length],
                    ['console', null],
                    ['cases',   testSpec.length],
                ] as [Tab, number | null][]).map(([key, count]) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={`flex items-center gap-2 border-l-2 px-4 py-2.5 font-mono text-[13px] transition-colors ${
                            tab === key
                                ? 'border-[var(--violet)] bg-[var(--panel-2)] text-[var(--text)]'
                                : 'border-transparent text-[var(--faint)] hover:text-[var(--muted)]'
                        }`}
                    >
                        {key}
                        {count != null && <span className="ml-auto text-[11px] text-[var(--faint)]">{count}</span>}
                        {/* console has no count — it gets a status dot instead.
                            pulsing while a run is in flight or just after one lands,
                            steady once there's output sitting there to read. */}
                        {key === 'console' && (trying || tryLog.length > 0) && (
                            <span
                                className={`ml-auto h-1.5 w-1.5 rounded-full bg-[var(--green)] ${
                                    trying || justLanded ? 'animate-pulse' : ''
                                }`}
                            />
                        )}
                    </button>
                ))}
            </nav>

            <div className="min-w-0 min-h-0 overflow-auto">

                {/* ---- code: line-number gutter beside the highlighted source ---- */}
                {tab === 'code' && (
                    // The clip. Highlighting runs over the WHOLE file so multi-line
                    // constructs (docstrings, triple-quoted strings) stay correct —
                    // we just uncover it a line at a time by growing the height.
                    // Once done, height goes back to auto so nothing is ever cut off.
                    <div
                        className="overflow-hidden"
                        style={{ height: done ? undefined : revealed * LINE_H + 24 }}
                    >
                        <div className="flex min-w-max font-mono text-[12.5px] leading-5">
                            {/* sticky so the numbers stay put when the code scrolls sideways.
                                The two columns share a line-height — that's what keeps them
                                aligned, rather than interleaving numbers into the code. */}
                            <pre className="sticky left-0 shrink-0 select-none bg-[var(--panel)] px-4 py-3 text-right text-[var(--faint)]">
                                {codeLines.map((_, i) => i + 1).join('\n')}
                            </pre>
                            {/* highlight.js returns an HTML string of <span> tags, so this is
                                the one place raw HTML is justified — it's our own output, and
                                hljs escapes the source text before wrapping it. */}
                            <pre className="px-4 py-3 text-[var(--text)]">
                                <code dangerouslySetInnerHTML={{ __html: highlighted }} />
                            </pre>
                        </div>
                    </div>
                )}

                {/* ---- tests: the receipt ---- */}
                {tab === 'tests' && (
                    <div>
                        {/* rows are independent, so this one slices instead of clipping —
                            each row can carry its own entrance animation that way */}
                        {sandbox.tests.slice(0, revealed).map(t => {
                            const failed = t.outcome !== 'passed'
                            return (
                                <div
                                    key={t.name}
                                    className={`fade-in border-b border-[var(--line-soft)] last:border-b-0 ${failed ? 'bg-[var(--red)]/[0.06]' : ''}`}
                                >
                                    <button
                                        onClick={() => failed && toggle(t.name)}
                                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${failed ? 'cursor-pointer' : 'cursor-default'}`}
                                    >
                                        <span className={`font-mono text-[13px] ${failed ? 'text-[var(--red)]' : 'text-[var(--green)]'}`}>
                                            {failed ? '×' : '✓'}
                                        </span>
                                        {/* the nodeid is "test_solution.py::test_name" —
                                            only the trailing name is worth showing */}
                                        <span className="font-mono text-[13px] text-[var(--text)] truncate">
                                            {t.name.split('::').pop()}
                                        </span>
                                        <span className="ml-auto shrink-0 font-mono text-[11.5px] text-[var(--faint)]">
                                            {Math.round(t.duration_ms)} ms
                                        </span>
                                    </button>

                                    {failed && (
                                        <div className="px-4 pb-3 pl-11 flex flex-col gap-2">
                                            <p className="m-0 font-mono text-[12.5px] text-[var(--red)] whitespace-pre-wrap break-words">
                                                {headline(t.message)}
                                            </p>
                                            {open.has(t.name) && (
                                                <pre className="max-h-[260px] overflow-auto rounded-md border border-[var(--line)] bg-[var(--panel-2)] p-3 font-mono text-[11.5px] leading-relaxed text-[var(--muted)]">
                                                    {t.message}
                                                </pre>
                                            )}
                                            <span className="font-mono text-[11px] text-[var(--faint)]">
                                                {open.has(t.name) ? 'click the row to hide the traceback' : 'click the row for the full traceback'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* ---- console: what the code under test actually printed ---- */}
                {tab === 'console' && (
                    <div className="px-4 py-3 font-mono text-[12.5px] leading-5">
                        <pre className="m-0 text-[var(--muted)] whitespace-pre-wrap">
                            {consoleLines.slice(0, revealed).join('\n')}
                        </pre>

                        {/* the REPL scrollback. `>>>` marks the exact expression that
                            ran — the driver around it is just import + print. */}
                        {tryLog.map((e, i) => (
                            <div key={i} className="fade-in mt-3 border-t border-[var(--line-soft)] pt-3">
                                <p className="m-0 text-[var(--violet)]">
                                    <span className="select-none text-[var(--faint)]">&gt;&gt;&gt; </span>{e.expression}
                                </p>
                                <pre className={`m-0 whitespace-pre-wrap ${e.ok ? 'text-[var(--text)]' : 'text-[var(--red)]'}`}>
                                    {e.output || (e.timed_out ? 'timed out' : 'no output')}
                                </pre>
                            </div>
                        ))}

                        {trying && (
                            <div className="mt-3 border-t border-[var(--line-soft)] pt-3">
                                <div className="dots" aria-label="running"><i /><i /><i /></div>
                            </div>
                        )}
                    </div>
                )}

                {/* ---- cases: the spec the suite was written FROM ---- */}
                {tab === 'cases' && (
                    <div>
                        {testSpec.slice(0, revealed).map((c, i) => {
                            // Cases and pytest results are two separately produced
                            // arrays, matched here by position. If the model wrote
                            // fewer tests than cases there is no row to match, so
                            // `failed` stays null and we render neutral rather than
                            // claiming an outcome we don't have.
                            const t = sandbox.tests[i]
                            const failed = t ? t.outcome !== 'passed' : null
                            const accent = failed === null ? 'var(--faint)'
                                         : failed          ? 'var(--red)'
                                         :                   'var(--green)'
                            return (
                                <div
                                    key={i}
                                    // `group` lets the row's hover state reach its children —
                                    // that's what turns the text and the button along with
                                    // the border, from one hover target. (Only `hover:` here:
                                    // `group-hover:` styles DESCENDANTS of the group, so on
                                    // the group element itself it never matches.)
                                    className="group fade-in flex items-center gap-3 border-b border-l-2 border-[var(--line-soft)] border-l-transparent px-4 py-2.5 transition-colors hover:border-l-[var(--accent)]"
                                    style={{ ['--accent' as string]: accent }}
                                >
                                    <span
                                        className="font-mono text-[13px] transition-colors"
                                        style={{ color: failed === null ? 'var(--faint)' : accent }}
                                    >
                                        {failed === null ? '·' : failed ? '×' : '✓'}
                                    </span>

                                    <div className="min-w-0 flex flex-col gap-0.5">
                                        <p className="m-0 truncate text-[13px] text-[var(--text)] transition-colors group-hover:text-[var(--accent)]">
                                            {c.description}
                                        </p>
                                        {/* the fields the Test button will read — shown as code
                                            because that's what they are: an argument and a value */}
                                        <p className="m-0 truncate font-mono text-[11px] text-[var(--faint)]">
                                            input={c.input || '—'} · expected={c.expected || '—'}
                                        </p>
                                    </div>

                                    {/* Two independent hovers, on purpose. The row's hover
                                        REVEALS the button (opacity), the button's own hover
                                        LIGHTS it (.case-run, which reads --accent off the row).
                                        Keeping them apart is what makes the button feel like a
                                        target rather than part of the row's paint. */}
                                    <button
                                        className="case-run ml-auto shrink-0 rounded-md border border-[var(--line)] px-2.5 py-1 font-mono text-[11px] text-[var(--faint)] opacity-0 group-hover:opacity-100"
                                        // `c`, not testSpec[i] — the object that rendered
                                        // this row IS the one to send. Re-indexing only
                                        // agrees while the slice starts at 0; filter or
                                        // sort the list and the row and the button would
                                        // quietly disagree.
                                        onClick={() => setTestCase(c)}
                                    >
                                        test
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
        {/* This footer sits INSIDE the bordered card that Litmus wraps us in, so it
            only needs a top rule to separate it from the panel — a full border here
            would double up against the card's own edge. */}
        <footer className="shrink-0 border-t border-[var(--line)]">
            {!sandbox.all_passed && attempt.explanation != null ? (
                <div className="flex flex-col gap-3 border-l-2 border-l-[var(--amber)] px-5 py-4">
                    {/* "sent back" is only TRUE when a later version exists. If this is
                        the last attempt and still red, the run stopped here — nothing
                        was sent anywhere. */}
                    <span className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-[var(--amber)]">
                        {selected < attempts.length - 1 ? 'Sent back to the model' : 'Still failing — repair budget spent'}
                    </span>
                    <p className="m-0 text-[14px] leading-relaxed text-[var(--text)]">{attempt.explanation}</p>
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-[var(--faint)]">
                        <span className="rounded border border-[var(--line)] px-2 py-1 ">code <b className="font-semibold text-[var(--muted)]">{codeLines.length} lines</b></span>
                        <span className="rounded border border-[var(--line)] px-2 py-1">failing <b className="font-semibold text-[var(--muted)]">{sandbox.failed + sandbox.errors}</b></span>
                        <span className="rounded border border-[var(--line)] px-2 py-1">tests <b className="font-semibold text-[var(--muted)]">{sandbox.total}</b></span>
                    </div>
                </div>
            ) : (
                <div className="flex items-center gap-5 border-l-2 border-l-[var(--green)] px-5 py-4">
                    <div className="min-w-0">
                        <h4 className="m-0 font-mono text-[14px] font-semibold text-[var(--text)]">
                            Verified — {sandbox.passed} of {sandbox.total} in a sealed container
                        </h4>
                        {/* the repair claim is only true for v2+; on a first-try pass
                            there was no bug to survive, so state the sandbox facts */}
                        <p className="m-0 mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
                            {selected > 0
                                ? 'This version is the repair — v1 failed the suite. The code you’re taking has already survived the bug it was going to have.'
                                : 'python:3.12-slim, no network, read straight off pytest’s own report.'}
                        </p>
                    </div>
                    <div className="ml-auto shrink-0 flex items-center gap-2">
                        <button
                            onClick={() => handleCopy('code')}
                            className="rounded-md bg-[var(--violet)] px-3.5 py-2 font-mono text-[12.5px] font-semibold text-white hover:bg-[var(--violet-dim)] transition-colors"
                        >
                            {copied === 'code' ? 'Copied' : 'Copy solution'}
                        </button>
                        <button
                            onClick={() => handleCopy('tests')}
                            className="rounded-md border border-[var(--line)] bg-[var(--panel-3)] px-3.5 py-2 font-mono text-[12.5px] text-[var(--text)] hover:border-[var(--faint)] transition-colors"
                        >
                            {copied === 'tests' ? 'Copied' : 'Copy tests'}
                        </button>
                    </div>
                </div>
            ) }
        </footer>
        </div>
    )
}
