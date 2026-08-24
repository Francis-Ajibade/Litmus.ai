import { useState, useMemo, useEffect, useRef } from "react";
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
// The strip's own chrome — handle + the results line — which sits above the
// scrollable list. The ceiling has to include it or dragging to "full"
// would still clip the last row.
const STRIP_HEAD = 46
// Collapsed floor. Dragging to a true 0 would take the grab handle down with
// it — the console would be gone with no way to bring it back, since the only
// control for it lives inside the thing that just disappeared. This leaves a
// status bar: the verdict, and a handle to pull it open again.
const STRIP_MIN = 34
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
    // the pytest source. Destructured out of this component now that copying
    // lives in the pane header — Litmus reads result.tests directly. Kept on the
    // interface because the parent still passes it and it belongs to this shape.
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
export default function Result({attempts, selected, onSelect, testSpec, setTestCase, tryLog, trying} : ResultProps){
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

    // Copying moved to the pane header in Litmus.tsx, where it sits with the
    // other pane-level actions instead of being buried at the bottom of a tab.

    // ── the results strip, as a draggable console ─────────────────────────
    // null = "as tall as its content". Once dragged it becomes a pixel height,
    // and the code panel above gives up exactly that much room — the same deal
    // an IDE's terminal makes with its editor.
    const [stripH, setStripH] = useState<number | null>(null)
    const [stripDrag, setStripDrag] = useState(false)
    const stripBodyRef = useRef<HTMLDivElement>(null)
    const dragFrom = useRef({ y: 0, h: 0 })

    // The ceiling is the content's own height. Dragging past it would buy empty
    // space, and empty space in a console reads as a bug rather than a choice.
    const naturalH = () => (stripBodyRef.current?.scrollHeight ?? 0) + STRIP_HEAD

    // Collapsed enough that the list would be a sliver — show the summary only.
    const stripCollapsed = stripH != null && stripH <= STRIP_MIN + 12

    function stripDown(e: React.PointerEvent<HTMLDivElement>) {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        dragFrom.current = { y: e.clientY, h: stripH ?? naturalH() }
        setStripDrag(true)
    }
    function stripMove(e: React.PointerEvent<HTMLDivElement>) {
        if (!stripDrag) return
        // Up is negative in client coords and taller here, hence the subtraction.
        const next = dragFrom.current.h - (e.clientY - dragFrom.current.y)
        setStripH(Math.max(STRIP_MIN, Math.min(naturalH(), next)))
    }
    function stripUp(e: React.PointerEvent<HTMLDivElement>) {
        setStripDrag(false)
        e.currentTarget.releasePointerCapture(e.pointerId)
    }



    return(
        <div className="flex flex-col min-h-0 h-full">

        {/* Tabs across the top, not down the side. An editor puts its files in a
            row because the panel below is the subject and every pixel of width
            spent on a rail is width taken from code — which is the one thing here
            that cannot wrap. */}
        <header className="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-[var(--line-soft)]">
            {([
                ['code',    codeLines.length],
                ['tests',   sandbox.tests.length],
                ['console', null],
                ['cases',   testSpec.length],
            ] as [Tab, number | null][]).map(([key, count]) => (
                <button
                    key={key}
                    onClick={() => setTab(key)}
                    // The active tab is LIFTED, not just tinted: an inset highlight
                    // along its top edge plus a shadow underneath, so it reads as a
                    // card sitting above the bar rather than a differently-coloured
                    // rectangle in it. Hovering an inactive tab previews that same
                    // treatment at half strength, which is what makes the row feel
                    // like a set of physical tabs rather than four text links.
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-[12.5px] transition-all duration-150 ease-out ${
                        tab === key
                            ? 'bg-[var(--panel-3)] text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,.07),0_4px_12px_-6px_rgba(0,0,0,.9)]'
                            : 'text-[var(--faint)] hover:-translate-y-px hover:bg-[var(--panel-3)]/55 hover:text-[var(--text)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,.04),0_4px_12px_-8px_rgba(0,0,0,.9)]'
                    }`}
                >
                    {key}
                    {count != null && <span className="text-[10.5px] text-[var(--faint)]">{count}</span>}
                    {/* console has no count — it gets a status dot instead */}
                    {key === 'console' && (trying || tryLog.length > 0) && (
                        <span className={`h-1.5 w-1.5 rounded-full bg-[var(--green)] ${trying || justLanded ? 'animate-pulse' : ''}`} />
                    )}
                </button>
            ))}

            <div className="ml-auto flex items-center gap-2">
                {/* the verdict, stated once, where the eye already is */}
                <span className={`font-mono text-[12px] ${sandbox.all_passed ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                    {sandbox.passed}/{sandbox.total} passed
                </span>

                {/* version switch — only when there IS more than one version. A
                    lone "v1" chip is a control that does nothing. */}
                {attempts.length > 1 && (
                    <span className="flex items-center gap-1 border-l border-[var(--line)] pl-2">
                        {attempts.map((a, index) => (
                            <button
                                key={index}
                                onClick={() => onSelect(index)}
                                className={`flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] transition-colors ${
                                    index === selected
                                        ? 'bg-[var(--panel-3)] text-[var(--text)]'
                                        : 'text-[var(--faint)] hover:text-[var(--muted)]'
                                }`}
                            >
                                <span className={`h-1.5 w-1.5 rounded-full ${a.result.all_passed ? 'bg-[var(--green)]' : 'bg-[var(--red)]'}`} />
                                v{index + 1}
                            </button>
                        ))}
                    </span>
                )}
            </div>
        </header>

        {/* the file strip — which artefact you are looking at, and whose it is */}
        <div className="shrink-0 flex items-center gap-2.5 px-4 py-2 border-b border-[var(--line-soft)] bg-[var(--panel-2)]">
            <span className="font-mono text-[12px] text-[var(--muted)]">
                {tab === 'tests' || tab === 'cases' ? 'test_solution.py' : tab === 'console' ? 'stdout' : 'solution.py'}
            </span>
            <span className="rounded border border-[var(--line)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--faint)]">
                {tab === 'console' ? 'sandbox output' : selected > 0 ? `litmus wrote this · v${selected + 1}` : 'litmus wrote this'}
            </span>
            <span className="ml-auto font-mono text-[10.5px] text-[var(--faint)]">
                {(sandbox.duration_ms / 1000).toFixed(2)}s
            </span>
        </div>

            {/* the panel: everything left over, and the only part that scrolls */}
            <div className="flex-1 min-w-0 min-h-0 overflow-auto">

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

        {/* ---- the results strip: pytest's own verdict, along the bottom ----
            An IDE puts its console under the code, not in a tab beside it, so a
            failing test is visible WHILE you read the line that caused it. The
            "Verified — N of N in a sealed container" card that used to live here
            said the same thing in five times the height; the strip states it in
            one line and gives the room back to the code. */}
        <div
            className="shrink-0 flex flex-col overflow-hidden border-t border-[var(--line)] bg-[var(--panel-2)]"
            style={stripH == null ? undefined : { height: stripH }}
        >
            {/* the grab handle — same language as the pane divider: invisible at
                rest, violet when you reach for it, so the two resizes are visibly
                the same gesture in two directions */}
            <div
                onPointerDown={stripDown}
                onPointerMove={stripMove}
                onPointerUp={stripUp}
                onPointerCancel={stripUp}
                onDoubleClick={() => setStripH(stripCollapsed ? naturalH() : STRIP_MIN)}
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize results"
                title="Drag to resize · double-click to collapse"
                className="group relative h-1.5 shrink-0 cursor-row-resize"
            >
                <span className="absolute inset-x-0 -top-[5px] -bottom-[5px]" />
                <span className={`block h-full w-full rounded-full transition-colors duration-200 ${
                    stripDrag ? 'bg-[var(--violet)]' : 'bg-transparent group-hover:bg-[var(--violet)]/60'
                }`} />
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2.5 px-4 pb-2.5">
                <span className="font-mono text-[11.5px] font-semibold text-[var(--text)]">results</span>
                <span className="font-mono text-[11px] text-[var(--faint)]">docker</span>
                <span className="text-[var(--line)]">·</span>
                <span className="font-mono text-[11px] text-[var(--faint)]">no network</span>
                <span className="text-[var(--line)]">·</span>
                <span className="font-mono text-[11px] text-[var(--faint)]">read-only</span>
                <span className="text-[var(--line)]">·</span>
                <span className="font-mono text-[11px] text-[var(--faint)]">{(sandbox.duration_ms / 1000).toFixed(2)}s</span>

                <span
                    className="ml-auto rounded-md border px-2.5 py-1 font-mono text-[11px]"
                    style={{
                        borderColor: `color-mix(in srgb, ${sandbox.all_passed ? 'var(--green)' : 'var(--red)'} 45%, transparent)`,
                        background:  `color-mix(in srgb, ${sandbox.all_passed ? 'var(--green)' : 'var(--red)'} 10%, transparent)`,
                        color:       sandbox.all_passed ? 'var(--green)' : 'var(--red)',
                    }}
                >
                    {sandbox.passed}/{sandbox.total} · {sandbox.all_passed ? 'all green' : `${sandbox.failed + sandbox.errors} failing`}
                </span>
            </div>

            {/* Two columns of names. Clicking one that failed opens its traceback
                on the tests tab — the strip is the summary, the tab is the detail,
                and neither repeats the other. */}
            <div ref={stripBodyRef} hidden={stripCollapsed} className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 grid content-start gap-x-8 gap-y-1 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                {sandbox.tests.map(t => {
                    const failed = t.outcome !== 'passed'
                    return (
                        <button
                            key={t.name}
                            onClick={() => { if (failed) { setTab('tests'); setOpen(prev => new Set(prev).add(t.name)) } }}
                            className={`flex items-center gap-2 text-left font-mono text-[11.5px] ${
                                failed ? 'text-[var(--red)] hover:underline' : 'text-[var(--green)] cursor-default'
                            }`}
                        >
                            <span>{failed ? '×' : '✓'}</span>
                            <span className="truncate">{t.name.split('::').pop()}</span>
                        </button>
                    )
                })}
            </div>

            {/* the explanation stays — it is the half of the product that isn't
                the code. Only ever shown on a red run, where it has something
                to explain. */}
            {!stripCollapsed && !sandbox.all_passed && attempt.explanation != null && (
                <div className="flex flex-col gap-1.5 border-t border-[var(--line-soft)] border-l-2 border-l-[var(--amber)] px-4 py-3">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--amber)]">
                        {selected < attempts.length - 1 ? 'Sent back to the model' : 'Still failing — repair budget spent'}
                    </span>
                    <p className="m-0 text-[13px] leading-relaxed text-[var(--text)]">{attempt.explanation}</p>
                </div>
            )}
        </div>
        </div>
    )
}
