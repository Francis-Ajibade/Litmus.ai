import { useState, useEffect, useRef } from "react";

// The blueprint as a PIPELINE rather than a card: a rail down the left with a
// numbered node per section, each section fading up as it scrolls into view and
// then staying put. The rail's violet fill grows to the last node reached, so
// scrolling reads as progress through the contract.

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

const LABELS = ['Problem', 'Contract', 'Approach & traps', 'Tests it must survive']
// How long between cards landing. The rail grows to each node as it lights, so
// this also paces the rail — one timer drives both.
const CARD_MS = 520

export default function Blueprint({
    blueprint, style, feedback, setFeedback, onRevise, onLockIn, busy,
}: {
    blueprint: Blueprint
    style: string
    feedback: string
    setFeedback: (v: string) => void
    onRevise: () => void
    onLockIn: () => void
    busy: boolean
}) {
    // which sections have entered view. A Set because entering is one-way — once
    // a section is lit it stays lit, so nothing ever gets removed.
    const [lit, setLit] = useState<Set<number>>(new Set())
    const scrollRef = useRef<HTMLDivElement>(null)

    // Reset when a revise brings back a different blueprint, so the reveal replays
    // instead of the new content appearing already-lit.
    useEffect(() => {
        setLit(new Set())
        scrollRef.current?.scrollTo({ top: 0 })
    }, [blueprint])

    // Cards land on a timer. The rail's height is derived straight from how many
    // are lit — no offsetTop, no offsetHeight, no refs to measure. Measuring was
    // where the bug lived: each section is `relative`, so a node's offsetTop was
    // reported against its own section and came back identical for all four.
    useEffect(() => {
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setLit(new Set(LABELS.map((_, i) => i)))
            return
        }
        if (lit.size >= LABELS.length) return
        const id = setTimeout(() => setLit(prev => new Set([...prev, prev.size])), CARD_MS)
        return () => clearTimeout(id)
    }, [lit, blueprint])

    const sections = [
        <p className="text-[16px] leading-relaxed text-[var(--text)]">{blueprint.problem_definition}</p>,

        // whitespace-pre + overflow-x-auto: a signature scrolls sideways rather
        // than folding mid-parameter, which is unreadable for code.
        <pre className="m-0 overflow-x-auto whitespace-pre rounded-[10px] border border-[var(--line)] bg-[#0a0a0e] px-4 py-3.5 font-mono text-[13px] text-[#c9d1d9]">
            {blueprint.interface_contract}
        </pre>,

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <ol className="m-0 list-none p-0">
                {blueprint.algorithmic_steps.map((step, i) => (
                    <li key={i} className="mb-3.5 flex gap-3 text-[14.5px] leading-snug">
                        <span className="mt-px grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md border border-[var(--violet)] font-mono text-[12px] text-[var(--violet)]">{i + 1}</span>
                        <span>{step}</span>
                    </li>
                ))}
            </ol>
            <ul className="m-0 list-none p-0">
                {blueprint.lecturer_traps.map((trap, i) => (
                    <li key={i} className="mb-3.5 flex gap-3 text-[14.5px] leading-snug text-[var(--muted)]">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-[2px] bg-[var(--amber)]" />
                        <span>{trap}</span>
                    </li>
                ))}
            </ul>
        </div>,

        <div className="flex flex-wrap gap-2">
            {blueprint.required_test_cases.map((tc, i) => (
                <span
                    key={i}
                    title={`${tc.input} → ${tc.expected}`}
                    className="rounded-[7px] border border-[var(--line)] bg-[var(--panel)] px-2.5 py-1.5 font-mono text-[11.5px] text-[var(--muted)] transition-colors hover:border-[var(--violet)]"
                >
                    <span className="mr-1.5 text-[var(--green)]">✓</span>{tc.description}
                </span>
            ))}
        </div>,
    ]

    return (
        <div className="flex h-full min-h-0 flex-col">

            {/* header — outside the scroll area so it never moves */}
            <div className="flex shrink-0 items-center gap-3.5 pb-5">
                <span className="font-mono text-[13px] font-bold tracking-[1px] text-[var(--violet)]">BLUEPRINT</span>
                <span
                    title={style || 'PEP 8 default — no overrides'}
                    className="max-w-[42%] truncate rounded-[7px] border border-[var(--line)] px-2.5 py-1 font-mono text-[12px] text-[var(--muted)]"
                >
                    style: {style || 'PEP 8 default'}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-2 font-mono text-[12.5px] text-[var(--amber)]">
                    <span className="h-[7px] w-[7px] rounded-full bg-[var(--amber)] shadow-[0_0_8px_var(--amber)]" />
                    awaiting approval
                </span>
            </div>

            {/* the rail + sections: the only part that scrolls */}
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="relative pl-10">
                    {/* the track, and the fill that grows down it */}
                    <div className="absolute bottom-1.5 left-[11px] top-1.5 w-0.5 bg-[var(--line)]">
                        <div
                            className="absolute left-0 top-0 w-full bg-[linear-gradient(180deg,var(--violet),var(--violet-dim))] transition-[height] duration-300 ease-out"
                            style={{ height: `${(lit.size / LABELS.length) * 100}%` }}
                        />
                    </div>

                    {LABELS.map((label, i) => {
                        const isLit = lit.has(i)
                        return (
                            <section
                                key={i}
                                data-index={i}
                                className="relative pb-8 pt-3.5"
                            >
                                <div
                                    className={`absolute -left-10 top-4 z-[2] grid h-6 w-6 place-items-center rounded-full border-2 bg-[var(--panel)] font-mono text-[11px] transition-all duration-[350ms] ${
                                        isLit
                                            ? 'border-[var(--violet)] text-[var(--violet)] shadow-[0_0_0_4px_rgba(139,92,246,0.12)]'
                                            : 'border-[var(--line)] text-[var(--faint)]'
                                    }`}
                                >
                                    {i + 1}
                                </div>
                                <div className={`mb-3 font-mono text-[12px] uppercase tracking-[1.5px] transition-colors duration-[350ms] ${isLit ? 'text-[var(--muted)]' : 'text-[var(--faint)]'}`}>
                                    {label}
                                </div>
                                {/* the reveal: fade up on enter, then stay. Two utility sets
                                    swapped by state — no keyframes needed for a one-shot. */}
                                <div className={`transition-all duration-500 ease-out ${isLit ? 'translate-y-0 opacity-100' : 'translate-y-3.5 opacity-0'}`}>
                                    {sections[i]}
                                </div>
                            </section>
                        )
                    })}
                </div>
            </div>

            {/* the decision bar. The mockup fixes this to the viewport; here it's a
                flex sibling of the scroll area, because this panel is a grid column —
                position:fixed would float it over the chat thread too. */}
            <div className="shrink-0 pt-4">
                <div className="rounded-[14px] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_-8px_40px_rgba(0,0,0,0.4)]">
                    {blueprint.clarifying_question && (
                        <div className="mb-3 flex items-start gap-2.5">
                            <span className="mt-px font-mono text-[15px] font-bold text-[var(--violet)]">?</span>
                            <p className="m-0 text-[14px] leading-snug text-[var(--text)]">{blueprint.clarifying_question}</p>
                        </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2.5">
                        <input
                            type="text"
                            value={feedback}
                            onChange={e => setFeedback(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && feedback.trim() && !busy) onRevise() }}
                            placeholder="Answer the question, or ask for a change…"
                            spellCheck={false}
                            className="min-w-0 flex-1 rounded-[9px] border border-[var(--line)] bg-[#0a0a0e] px-3.5 py-2.5 text-[14px] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--faint)] focus:border-[var(--violet)]"
                        />
                        <button
                            onClick={onRevise}
                            disabled={busy || !feedback.trim()}
                            className="rounded-[9px] border border-[var(--line)] bg-[var(--panel-2)] px-4 py-2.5 text-[14px] font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Revise
                        </button>
                        <button
                            onClick={onLockIn}
                            className="rounded-[9px] bg-[var(--violet)] px-4 py-2.5 text-[14px] font-semibold text-white shadow-[0_4px_16px_rgba(139,92,246,0.4)] transition-[filter] hover:brightness-110"
                        >
                            Lock it in
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
