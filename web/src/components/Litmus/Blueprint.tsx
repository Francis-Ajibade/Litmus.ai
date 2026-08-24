import { useEffect, useState } from "react";

// The blueprint as a CARD, not a full-height panel.
//
// It used to be a `h-full` column built for the right pane, with a timed rail
// revealing four sections. Moved into the thread it had no height to fill, so
// every section collapsed onto the next. A card doesn't care where it lives: it
// shows a clipped preview inline, and opens into an overlay when you want the
// whole thing. That also matches how the contract is actually used — glanced at
// while deciding, read properly only when something looks wrong.

export type Blueprint = {
    problem_definition: string
    // just the callable's name ('solve', 'BoundedStack') — used to build the
    // prefilled call when you try a case. Optional: blueprints generated before
    // this field existed won't have it.
    entry_point?: string
    interface_contract: string
    lecturer_traps: string[]
    algorithmic_steps: string[]
    required_test_cases: { description: string; input: string; expected: string }[]
    clarifying_question: string
}

// How tall the collapsed card lets the contract run before clipping it. Enough
// to show the problem and the signature — the two things you check first — and
// short enough that the decision buttons stay on screen without scrolling.
const PREVIEW_MAX = 320

type Props = {
    blueprint: Blueprint
    style: string
    feedback: string
    setFeedback: (v: string) => void
    onRevise: () => void
    onLockIn: () => void
    busy: boolean
}

// ── the contract itself, rendered once and used in both places ────────────
function Sections({ blueprint }: { blueprint: Blueprint }) {
    return (
        <div className="flex flex-col gap-7">

            <Section n={1} label="Problem">
                <p className="m-0 text-[14.5px] leading-relaxed text-[var(--text)]">
                    {blueprint.problem_definition}
                </p>
            </Section>

            <Section n={2} label="Contract">
                {/* whitespace-pre + overflow-x-auto: a signature scrolls sideways
                    rather than folding mid-parameter, which is unreadable in code */}
                <pre className="m-0 overflow-x-auto whitespace-pre rounded-[10px] border border-[var(--line)] bg-[#0a0a0e] px-3.5 py-3 font-mono text-[12.5px] text-[#c9d1d9]">
                    {blueprint.interface_contract}
                </pre>
            </Section>

            <Section n={3} label="Approach & traps">
                {/* One column until there is room for two. In the split pane this
                    card is ~400px wide, and two columns there would give each list
                    about twenty characters a line. */}
                <div className="grid grid-cols-1 gap-6 @[560px]:grid-cols-2">
                    <ol className="m-0 list-none p-0">
                        {blueprint.algorithmic_steps.map((step, i) => (
                            <li key={i} className="mb-3 flex gap-2.5 text-[13.5px] leading-snug">
                                <span className="mt-px grid h-[20px] w-[20px] shrink-0 place-items-center rounded-md border border-[var(--violet)] font-mono text-[11px] text-[var(--violet)]">{i + 1}</span>
                                <span>{step}</span>
                            </li>
                        ))}
                    </ol>
                    <ul className="m-0 list-none p-0">
                        {blueprint.lecturer_traps.map((trap, i) => (
                            <li key={i} className="mb-3 flex gap-2.5 text-[13.5px] leading-snug text-[var(--muted)]">
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-[2px] bg-[var(--amber)]" />
                                <span>{trap}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </Section>

            <Section n={4} label={`Tests it must survive · ${blueprint.required_test_cases.length}`}>
                <div className="flex flex-wrap gap-1.5">
                    {blueprint.required_test_cases.map((tc, i) => (
                        <span
                            key={i}
                            title={`${tc.input} → ${tc.expected}`}
                            className="rounded-[7px] border border-[var(--line)] bg-[var(--panel)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--muted)] transition-colors hover:border-[var(--violet)]"
                        >
                            <span className="mr-1.5 text-[var(--green)]">✓</span>{tc.description}
                        </span>
                    ))}
                </div>
            </Section>
        </div>
    )
}

function Section({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
    return (
        <section>
            <div className="mb-2.5 flex items-center gap-2.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[var(--violet)]/50 font-mono text-[10px] text-[var(--violet)]">{n}</span>
                <span className="font-mono text-[11px] uppercase tracking-[1.4px] text-[var(--faint)]">{label}</span>
            </div>
            {children}
        </section>
    )
}

// ── shared chrome ─────────────────────────────────────────────────────────
function IconBtn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            title={label}
            aria-label={label}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 font-mono text-[11px] text-[var(--faint)] transition-colors hover:bg-[var(--panel-3)] hover:text-[var(--text)]"
        >
            {children}
        </button>
    )
}

function DecisionBar({ blueprint, feedback, setFeedback, onRevise, onLockIn, busy }: Props) {
    return (
        <div className="flex flex-col gap-2.5">
            {blueprint.clarifying_question && (
                <div className="flex items-start gap-2.5 rounded-[10px] border border-[var(--amber)]/30 bg-[var(--amber)]/[0.06] px-3 py-2.5">
                    <span className="mt-px font-mono text-[14px] font-bold text-[var(--amber)]">?</span>
                    <p className="m-0 text-[13px] leading-snug text-[var(--text)]">{blueprint.clarifying_question}</p>
                </div>
            )}
            <input
                type="text"
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && feedback.trim() && !busy) onRevise() }}
                placeholder="Answer the question, or say what to change…"
                spellCheck={false}
                className="w-full rounded-[9px] border border-[var(--line)] bg-[#0a0a0e] px-3.5 py-2.5 text-[13.5px] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--faint)] focus:border-[var(--violet)]"
            />
            {/* Two buttons, equal width, the way the reference pairs them. Approve
                carries the fill because it is the path most blueprints take — the
                reviewer's whole job is to make revision the exception. */}
            <div className="grid grid-cols-2 gap-2.5">
                <button
                    onClick={onRevise}
                    disabled={busy || !feedback.trim()}
                    className="rounded-[10px] border border-[var(--line)] bg-[var(--panel-2)] px-4 py-2.5 text-[13.5px] font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                    Revise
                </button>
                <button
                    onClick={onLockIn}
                    disabled={busy}
                    className="rounded-[10px] bg-[var(--violet)] px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_4px_16px_rgba(139,92,246,0.35)] transition-[filter] hover:brightness-110 disabled:opacity-40"
                >
                    Approve
                </button>
            </div>
        </div>
    )
}

// ── the card ──────────────────────────────────────────────────────────────
export default function BlueprintCard(props: Props) {
    const { blueprint, style } = props
    const [expanded, setExpanded] = useState(false)
    const [copied, setCopied] = useState(false)

    // Escape closes the overlay. A modal you can only leave by hitting a specific
    // 14px × is a modal people feel trapped in.
    useEffect(() => {
        if (!expanded) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [expanded])

    const asJson = () => JSON.stringify(blueprint, null, 2)

    async function copy() {
        await navigator.clipboard.writeText(asJson())
        setCopied(true)
        setTimeout(() => setCopied(false), 1400)
    }

    function download() {
        // A blob URL rather than a data: URI — a blueprint with eight test cases
        // is comfortably past the length some browsers will accept in an href.
        const url = URL.createObjectURL(new Blob([asJson()], { type: 'application/json' }))
        const a = document.createElement('a')
        a.href = url
        a.download = 'blueprint.json'
        a.click()
        // Revoking immediately is safe: the download has already been handed off.
        URL.revokeObjectURL(url)
    }

    const actions = (
        <>
            <IconBtn onClick={download} label="Download blueprint">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 11l5 5 5-5M4 21h16"/></svg>
                Download
            </IconBtn>
            <IconBtn onClick={copy} label="Copy blueprint as JSON">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
                {copied ? 'Copied' : 'Copy'}
            </IconBtn>
        </>
    )

    return (
        <>
            {/* @container so the sections can respond to the CARD's width rather
                than the viewport's — the same card renders at ~400px in the split
                pane and ~780px on the full page. */}
            <div className="@container w-full overflow-hidden rounded-[14px] border border-[var(--violet)]/55 bg-[var(--panel-2)] shadow-[0_0_0_1px_rgba(139,92,246,.10),0_18px_50px_-20px_rgba(0,0,0,.7)]">

                {/* header */}
                <div className="flex items-center gap-2.5 border-b border-[var(--line-soft)] px-4 py-3">
                    <span className="font-mono text-[12px] font-bold tracking-[1px] text-[var(--violet)]">BLUEPRINT</span>
                    <span
                        title={style || 'PEP 8 default — no overrides'}
                        className="hidden @[420px]:block max-w-[40%] truncate rounded-[6px] border border-[var(--line)] px-2 py-0.5 font-mono text-[11px] text-[var(--muted)]"
                    >
                        {style || 'PEP 8 default'}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-1">{actions}</span>
                </div>

                {/* the clipped preview. The button IS the region, so the whole
                    thing is one target rather than a small "expand" link floating
                    in a corner of content you are already trying to click. */}
                <button
                    onClick={() => setExpanded(true)}
                    className="group relative block w-full cursor-zoom-in overflow-hidden px-4 pt-4 text-left"
                    style={{ maxHeight: PREVIEW_MAX }}
                >
                    <Sections blueprint={blueprint} />

                    {/* the tease: content dissolves rather than being sliced, and
                        the prompt rides the fade so it is never over text */}
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 flex h-28 items-end justify-center bg-[linear-gradient(180deg,transparent,var(--panel-2)_72%)] pb-3">
                        <span className="flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 font-mono text-[11px] text-[var(--muted)] transition-colors group-hover:border-[var(--violet)] group-hover:text-[var(--text)]">
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                            expand
                        </span>
                    </span>
                </button>

                {/* decision bar — present on the card too, so an obvious blueprint
                    can be approved without ever opening it */}
                <div className="border-t border-[var(--line-soft)] px-4 py-3.5">
                    <DecisionBar {...props} />
                </div>
            </div>

            {/* ── the expanded view ── */}
            {expanded && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm md:p-8"
                    onMouseDown={() => setExpanded(false)}
                >
                    <div
                        onMouseDown={e => e.stopPropagation()}
                        className="@container flex max-h-full w-full max-w-[980px] flex-col overflow-hidden rounded-[16px] border border-[var(--line)] bg-[var(--panel-2)] shadow-[0_40px_100px_-20px_rgba(0,0,0,.8)]"
                    >
                        <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--line-soft)] px-5 py-3.5">
                            <span className="font-mono text-[12px] font-bold tracking-[1px] text-[var(--violet)]">BLUEPRINT</span>
                            <span className="font-mono text-[11px] text-[var(--faint)]">{style || 'PEP 8 default'}</span>
                            <span className="ml-auto flex items-center gap-1">
                                {actions}
                                <span className="mx-1 h-4 w-px bg-[var(--line)]" />
                                <IconBtn onClick={() => setExpanded(false)} label="Close">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                                </IconBtn>
                            </span>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                            <Sections blueprint={blueprint} />
                        </div>

                        {/* the same decision, reachable without closing first */}
                        <div className="shrink-0 border-t border-[var(--line-soft)] px-5 py-4">
                            <DecisionBar {...props} />
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
