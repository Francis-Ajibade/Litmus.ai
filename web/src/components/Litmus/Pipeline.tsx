import { type Stage } from "./Litmus";

// Presentational: props in, JSX out. No hooks, no fetch — the parent owns state,
// this only draws it. All visuals live in index.css, keyed off .pstep's data-state.

type StepState = 'pending' | 'active' | 'done' | 'revising'

const CORE = [
    { key: 'blueprint', label: 'Blueprint' },
    { key: 'generate',  label: 'Generate'  },
    { key: 'verify',    label: 'Verify'    },
] as const
// Repair + Re-verify only exist when a run actually fails — so they render only
// when `repaired` is true, exactly like the real loop skips them on a clean pass.
const REPAIR = [
    { key: 'repair',   label: 'Repair'    },
    { key: 'reverify', label: 'Re-verify' },
] as const

// DERIVE each step's state from the machine. Blueprint can be `done` while Verify
// is still `pending`, which is why one shared stepState prop could never work.
function stateFor(step: string, stage: Stage, revising: boolean): StepState {
    if (step === 'blueprint') {
        // the style question happens BEFORE any model call — nothing is being
        // generated yet, so the bar must not claim work is underway.
        if (stage === 'idle' || stage === 'styling' || stage === 'awaiting_style') return 'pending'
        if (stage === 'planning') return revising ? 'revising' : 'active'
        if (stage === 'blueprint') return 'active'
        return 'done'
    }
    if (step === 'generate') {
        if (stage === 'generating') return 'active'
        if (stage === 'verifying' || stage === 'repairing' || stage === 'done') return 'done'
        return 'pending'
    }
    if (step === 'verify') {
        if (stage === 'verifying') return 'active'
        if (stage === 'repairing' || stage === 'done') return 'done'
        return 'pending'
    }
    if (step === 'repair') {
        if (stage === 'repairing') return 'active'
        if (stage === 'done') return 'done'
        return 'pending'
    }
    // reverify
    if (stage === 'done') return 'done'
    return 'pending'
}

export default function Pipeline({ stage, revising, repaired }: { stage: Stage; revising: boolean; repaired: boolean }) {
    const steps = repaired ? [...CORE, ...REPAIR] : CORE
    return (
        <ol className="pipe">
            {steps.map((s, i) => {
                const state = stateFor(s.key, stage, revising)
                const isRepairBranch = s.key === 'repair' || s.key === 'reverify'
                // numbers stay (they don't flip to a check); only a revise or the
                // Repair step shows the redo glyph.
                const glyph = (s.key === 'repair' || state === 'revising') ? '↻' : i + 1
                return (
                    <li
                        key={s.key}
                        data-state={state}
                        data-branch={isRepairBranch ? 'repair' : undefined}
                        className="pstep"
                    >
                        {/* leading leg into this step — fills left→right as it activates */}
                        <span className="connector"><span className="fill" /></span>
                        <span className="item"><span className="icon">{glyph}</span></span>
                        <span className="label">{s.label}</span>
                    </li>
                )
            })}
        </ol>
    )
}
