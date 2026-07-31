import { useState, useRef, useEffect } from "react";
import Pipeline from "./Pipeline";
import Results from "./Results";
import BlueprintPanel, { type Blueprint } from "./Blueprint";



// The blueprint is now a CONTRACT with the backend, not a loose bag of keys.
// Record<string, unknown> was fine while we only passed it around — but the
// moment we read fields off it to render, every field would come out as
// `unknown` and TS would refuse to .map() or drop it into JSX.
// These names must match the JSON keys /api/blueprint returns, exactly.
// One row of the test list. Mirrors _build_test() in sandbox/runner.py — the
// union on `outcome` is what lets TS catch a typo like === 'pass'.
export type TestOutcome = {
    name: string,
    outcome: 'passed' | 'failed' | 'error',
    duration_ms: number,
    stdout: string,
    stderr: string,
    message: string,        // pytest's full longrepr; empty when passed
}

export interface SandboxResult {
    ok: boolean,
    timed_out: boolean,
    exit_code: number | null,
    passed: number,
    failed: number,
    errors: number,
    total: number,
    duration_ms: number,
    tests: TestOutcome[],
    captured_stdout: string,
    captured_stderr: string,
    log: string,
    all_passed : boolean,
}
export type Attempt = {
            code : string,
            explanation : string | null,
            result : SandboxResult,
}

// One line of the REPL scrollback. Mirrors what POST /api/try returns.
export type TryEntry = {
    expression: string
    output: string
    ok: boolean
    timed_out: boolean
    duration_ms: number
}

// One approved case from the blueprint. Same shape as Blueprint.required_test_cases —
// the run response hands these back so the results panel doesn't need the blueprint.
export type TestCase = {
    description: string
    input: string
    expected: string
    // Runnable Python that exercises THIS case — one expression for a plain
    // function, several lines for anything needing setup (a class, say).
    // Optional: blueprints made before this field existed won't have it, so the
    // prefill falls back to assembling entry_point(input).
    call?: string
}

// Blueprint moved to ./Blueprint alongside the component that renders it — the
// type and its only consumer live together, and it's re-exported here so nothing
// else has to know where it went.
export type { Blueprint }

  type RunResponse = {
    tests: string
    // the blueprint's required_test_cases passed straight through, unflattened —
    // the UI reads these as fields, the test model gets a formatted string built
    // from the same source (see test_spec_from_blueprint).
    test_spec : TestCase[]
    attempts : Attempt[]
  }
// One variable that can only ever hold ONE legal value, instead of a pile of
// booleans that let illegal combos like (loading && done) both be true.
// 'styling' = the three options are on screen, waiting for a click.
// 'awaiting_style' = they picked one that needs typing, so the composer is the input.
// Both sit BEFORE any model call, which is why Pipeline treats them as Blueprint-pending.
export type Stage = 'idle' | 'styling' | 'awaiting_style' | 'planning' | 'blueprint'
                  | 'generating' | 'verifying' | 'repairing' | 'done' 

//It forces any function that returns a RunResult to always include the counts and the overall pass/fail flag.
//TypeScript will give you autocomplete and catch mistakes (e.g. forgetting total or putting a string in passed).
//The optional explanation lets you attach a message only when needed.

type StyleChoice = 'default' | 'own' | 'extend'

// One entry in the chat log. role decides which side + styling it renders on.
// `options` turns a litmus message into a question; `chosen` records the answer,
// which is what disables the other buttons and marks the one that was picked.
// Keeping the question in the thread (rather than collapsing it) means scrolling
// back still shows that a decision point existed, and what the alternatives were.
type Msg = {
    role: 'user' | 'litmus'
    text: string
    options?: StyleChoice[]
    chosen?: StyleChoice
}

const API_URL = import.meta.env.VITE_API_URL;

// How long the bar sits on "Generate" before flipping to "Verify". This is a
// guess, not a measurement — the backend returns once, at the end. Tune it after
// timing a real run: generation is the long pole, the sandbox is only seconds.
const GENERATING_MS = 18_000;

// The three answers, and the copy for each. Labels stay short; the hint is the
// consequence, so nobody has to guess what a choice does.
const STYLE_OPTIONS: Record<StyleChoice, { label: string; hint: string }> = {
    default: { label: 'Stick with the default',      hint: 'idiomatic PEP 8 — no extra instructions' },
    own:     { label: 'Specify my own style',        hint: 'replaces the default entirely' },
    extend:  { label: 'Add my style to the default', hint: 'PEP 8, with your overrides on top' },
}

// PEP 8's sections don't change, so this is a constant rather than a model call:
// generating a fixed list would cost latency and money to produce something
// slightly different every time.
const PEP8_AREAS = [
    'naming (snake_case functions, CAPS constants)',
    'indentation and line length',
    'import order and grouping',
    'whitespace around operators and arguments',
    'comments and docstrings',
    'type hints',
]

// Tips under the sandbox caption. The slot used to hold one static line about
// the container — true, but it only ever said the box was empty. These teach
// what the app can do while nothing is running, and they loop.
const TIPS = [
    'click a case to run it with your own input',
    'switch between v1 and v2 to see what the repair changed',
    'read the tests before the code — they are the actual contract',
    'a failing run is the useful one; it names what the code got wrong',
    'edit the blueprint before locking it in — nothing runs until you approve',
    'the console prints whatever your snippet returns, like a Python prompt',
    'paste a file you have written to have Litmus match your style',
]
const TIP_MS = 4200

// phrases the "thinking" indicator cycles through per phase, to fake the feel of
// the model streaming its work back. Purely cosmetic — no real tokens involved.
const THINKING: Record<string, string[]> = {
    planning:   ['reading the problem…', 'sketching the contract…', 'naming the traps a grader would set…'],
    revising:   ['folding in your note…', 'reworking the plan…'],
    generating: ['writing the solution…', 'generating tests from the traps…', 'sealing the sandbox…'],
    verifying:  ['running pytest in the sandbox…', 'collecting the results…'],
    repairing:  ['reading the failures…', 'revising the solution…', 'widening the tests…'],
}

export default function Litmus(){
    // `problem` is the composer's DRAFT; `locked` is the problem we committed to.
    // They were one variable, but clearing the draft after submit would then blank
    // the problem that run()/revise() still send — and the backend uses it as the
    // anchor for repair_code and explain_failure, so it would degrade silently.
    const [problem, setProblem] = useState('')
    const [lockedProblem, setLockedProblem] = useState('')
    const [style, setStyle] = useState('')
    const [ blueprint, setBlueprint] = useState<Blueprint | null>(null)
    const [selected, setSelected] = useState<number | null>(null)
    // the case whose input is currently loaded in the composer. null = not in
    // try mode. This is the ONLY thing that puts the composer into try mode, so
    // clearing it is how we leave.
    const [testSelected, setTestSelected] = useState<TestCase | null>(null)
    // REPL scrollback. Appending (not replacing) is the point — trying three
    // inputs is only useful if you can compare them.
    const [tryLog, setTryLog] = useState<TryEntry[]>([])
    const [trying, setTrying] = useState(false)
    const [feedback, setFeedback] = useState('')
    // <RunResult | null>TypeScript generic – the state can be either a RunResult or null(
    // (null)Initial value – the state starts as null
    const [result, setResult] = useState<RunResponse | null>(null)
    const [stage, setStage] = useState<Stage>('idle')
    const [errorMsg, setErrorMsg] = useState("")
    // the chat log — user + litmus messages, interleaved in the order they happened.
    // state, not ref — appending must re-render for the new bubble to appear.
    const [messages, setMessages] = useState<Msg[]>([])
    const [tick, setTick] = useState(0)   // drives the rotating thinking phrase
    const [tipIndex, setTipIndex] = useState(0)   // drives the looping tips
    // an empty div pinned to the bottom of the thread; we scroll it into view on
    // every new message so the log follows the conversation like a normal chat.
    const bottomRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, stage])

    // One interval for the whole session — deliberately NOT keyed on stage, so
    // the tips keep their rhythm instead of restarting from the top every time
    // the pipeline moves. The panel it renders in is conditional; the timer isn't.
    useEffect(() => {
        const id = setInterval(() => setTipIndex(i => (i + 1) % TIPS.length), TIP_MS)
        return () => clearInterval(id)
    }, [])

    // styleOverride exists because setState is NOT synchronous: a caller that does
    // setStyle(x) then getBlueprint() would still send the PREVIOUS style, since
    // this closure captured it at render time. Passing the value sidesteps that.
    async function getBlueprint (styleOverride?: string) {
        const useStyle = styleOverride ?? style
// when getting blueprint user sends request based on problem 
// anytime user changes or sends a feedback the function is called 
// the api backend returns the bp / updated bp
        setStage('planning');   // was setLoading(true) — now we name WHERE we are
        setErrorMsg('');
        try{
            const response = await fetch(`${API_URL}/api/blueprint`,{
                method: 'POST',
                headers : {'Content-Type' : 'application/json'},
                body: JSON.stringify({problem: lockedProblem, style: useStyle, prior:blueprint, feedback})
            })

            if(!response.ok){
                throw new Error(`Blueprint request failed (${response.status})`);
            }
            const data = await response.json();
            setBlueprint(data)
            setStage('blueprint')   // success has its own destination
            setFeedback('')         // consumed — clear it so the next revise starts empty
        }catch(err){
            console.log(err);
            setErrorMsg (err instanceof Error ? err.message: "something went wrong");
            // failure sends us back so the composer stays usable and the card doesn't show
            setStage(blueprint ? 'blueprint' : 'idle')
        }
        // No finally: each path already sets its own stage. With a machine there's
        // no single "always reset to false" line to put here.
    }

    async function run(){
        // stage is owned by lockIn (see the timer there) — setting it here would
        // land in the same React batch and clobber 'generating' before it renders.
        setErrorMsg("");
        setSelected(null);
        setResult(null)
        try{
            const response = await fetch (`${API_URL}/api/run`,{
                method:"POST",
                headers : {'Content-Type' : 'application/json'},
                body: JSON.stringify({
                    problem: lockedProblem, style, blueprint
                })
            })
            if(!response.ok){
                throw new Error(`Run failed (${response.status})`);
            }
            const data  = await response.json();
            setResult(data);
            setStage('done');
        }catch(err){
            console.log(err);
            setErrorMsg(err instanceof Error ? err.message: 'Something went wrong');
            setStage('blueprint');
        }
    }

    // Runs whatever is in the composer against the code already on screen.
    // Takes no argument on purpose: at submit time the truth is the edited text,
    // not the case that seeded it — the user may have changed every character.
    async function runTestCase(){
        const expression = problem.trim()
        if (!expression || trying || !result) return
        const shown = result.attempts[shownIndex]
        setTrying(true)
        setErrorMsg('')
        try {
            const response = await fetch(`${API_URL}/api/try`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // the code the user is LOOKING AT, not a regenerated one
                    code: shown.code,
                    expression,
                }),
            })
            if (!response.ok) throw new Error(`Try failed (${response.status})`)
            const data: TryEntry = await response.json()
            setTryLog(l => [...l, data])
            setProblem('')          // clear the draft, keep the log
        } catch (err) {
            console.log(err)
            setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
        } finally {
            setTrying(false)
        }
    }

    // Derived from stage — never their own useState, or they'd drift out of sync.
    const busy = stage === 'planning'                       // waiting on a blueprint
    // `testSelected` is the escape hatch: 'done' normally freezes the composer,
    // but try mode reuses that same box AFTER a run, so it has to unfreeze.
    const locked = (stage === 'generating' || stage === 'verifying'
                || stage === 'repairing' || stage === 'done'   // building — composer frozen
                || stage === 'styling')                        // must answer the question first
                && testSelected === null
    // the composer does double duty: normally it takes the problem, but after a
    // 'own'/'extend' pick it takes the style instead.
    const composingStyle = stage === 'awaiting_style'


    // Step 1: commit the problem, then ASK about style before spending a model call.
    // Nothing is generated here — the blueprint waits until style is settled, so it
    // gets written once with the right instructions instead of twice.
    function submitProblem(){
        if (!problem.trim() || busy) return
        setLockedProblem(problem)
        setMessages(m => [...m,
            { role: 'user',   text: problem },
            { role: 'litmus', text: 'Before I draft anything — how should the code be styled?',
              options: ['default', 'own', 'extend'] },
        ])
        setProblem('')          // clear the DRAFT only; lockedProblem holds the real one
        setStage('styling')
    }

    // Step 2: they picked. Mark the question answered (which disables the buttons),
    // then either go straight to the blueprint or ask them to type.
    function chooseStyle(choice: StyleChoice){
        if (stage !== 'styling') return         // a stale question can't be re-answered
        setMessages(m => m.map(msg =>
            msg.options && msg.chosen === undefined ? { ...msg, chosen: choice } : msg
        ))
        if (choice === 'default') {
            setStyle('')                        // no instruction == idiomatic PEP 8
            setMessages(m => [...m, { role: 'litmus', text: 'Default it is. Reading the problem and drafting a contract before I write anything.' }])
            getBlueprint('')                    // pass it — setStyle hasn't landed yet
            return
        }
        setMessages(m => [...m, {
            role: 'litmus',
            text: choice === 'own'
                ? 'Describe your style in the box below — naming, headers, comments, whatever matters. It replaces the default.'
                : `PEP 8 covers:\n${PEP8_AREAS.map(a => `  · ${a}`).join('\n')}\n\nTell me below which of those to override, and what to do instead.`,
        }])
        setStage('awaiting_style')
    }

    // Step 3 (only for 'own' / 'extend'): whatever they typed becomes the style.
    function submitStyle(){
        if (!problem.trim()) return
        const text = problem
        // the chosen option is the last answered question in the thread
        const choice = [...messages].reverse().find(m => m.chosen)?.chosen
        const nextStyle = choice === 'extend' ? `Follow PEP 8, except: ${text}` : text
        setStyle(nextStyle)
        setMessages(m => [...m,
            { role: 'user',   text },
            { role: 'litmus', text: 'Got it. Drafting the contract against your style.' },
        ])
        setProblem('')
        getBlueprint(nextStyle)                 // pass it — setStyle hasn't landed yet
    }
    // Revise = same endpoint (prior + feedback), but choreographed: first flip the
    // live pipeline to 'revising' (amber + redo) and let that ease in, THEN drop the
    // new user message + litmus reply and refetch — so it reads as one continuous loop.
    function revise(){
        if (!feedback.trim() || busy) return
        const note = feedback
        setStage('planning')                    // revising === true, since a blueprint already exists
        setTimeout(() => {
            setMessages(m => [...m,
                { role: 'user',   text: note },
                { role: 'litmus', text: 'Revising — folding that into the plan.' },
            ])
            getBlueprint()
        }, 650)
    }
    function lockIn(){
        setStage('generating')
        // One response arrives at the very end, so the browser can't know when
        // generation stops and verification starts — we advance on a timer.
        // The functional form only moves us on if nothing else already has: if
        // the fetch finished (or errored) first, this is a no-op instead of
        // dragging a done run back to 'verifying'.
        setTimeout(() => setStage(s => s === 'generating' ? 'verifying' : s), GENERATING_MS)
        run();
    }              // seam into Brick 3

    function sendTestinput(i : TestCase){
        setMessages(m => [...m, 
            {role : 'user', text :`Test ${i.description} with input ${i.input}`},
            {role : 'litmus', text : `Loaded "${i.description}" into the composer below. Change the input to anything you want to try, then hit Run — the result appears in the Console tab.`},])
        // `call` is written BY the model that wrote the case, so it always
        // matches — including multi-step ones like a stack push/pop sequence,
        // which entry_point(input) can't express at all. The assembly below is
        // only a fallback for blueprints generated before `call` existed.
        const fn = blueprint?.entry_point
        setProblem(i.call ?? (fn ? `${fn}(${i.input})` : i.input))
        setTestSelected(i)
        // deliberately does NOT run — seeding the composer is the whole job.
        // The user edits the value, then Run submits it.
    }
    // Leaves try mode WITHOUT resetting the session: the run and its results stay
    // on screen, the composer goes back to being frozen (which is the correct
    // state after a finished run — there's nothing to type until you start over).
    function exitTryMode(){
        setTestSelected(null)
        setProblem('')
    }

    // A full reset back to the empty app. Every piece of session state is listed
    // here on purpose: this is the one place that has to know the complete set,
    // and a forgotten field would leak the old run into the new one (a stale
    // blueprint is the worst of them — getBlueprint would send it as `prior` and
    // "revise" a problem the user never asked about).
    function startOver(){
        setProblem('')
        setLockedProblem('')
        setStyle('')
        setBlueprint(null)
        setFeedback('')
        setResult(null)
        setSelected(null)
        setMessages([])
        setErrorMsg('')
        setTestSelected(null)
        setTryLog([])
        setStage('idle')
    }

    // is the model actively working? drives the pulsing dots + rotating thinking text
    const thinking = stage === 'planning' || stage === 'generating'
                  || stage === 'verifying' || stage === 'repairing'
    // which phrase set to cycle. A revise has its own set; a first draft that has a
    // style to honour gets the 'styled' set, so the thoughts match what's happening.
    const phaseKey = stage === 'planning'
        ? (blueprint ? 'revising' : style ? 'styled' : 'planning')
        : stage
    const phrases  = THINKING[phaseKey] ?? []
    const phrase   = phrases.length ? phrases[tick % phrases.length] : ''

    // rotate the phrase every ~1.9s while thinking; reset when the phase changes
    useEffect(() => {
        if (!thinking) { setTick(0); return }
        const id = setInterval(() => setTick(t => t + 1), 1900)
        return () => clearInterval(id)
    }, [thinking, phaseKey])

    // the status light in the top-right of the bar (replaces the old status text):
    // idle grey, working green (pulsing), revise/repair amber (pulsing), done green.
    const statusDot =
          stage === 'idle'      ? { c: 'bg-[var(--faint)]', pulse: false }
        : stage === 'done'      ? { c: 'bg-[var(--green)]',  pulse: false }
        : stage === 'blueprint' ? { c: 'bg-[var(--violet)]', pulse: false }
        : (stage === 'repairing' || (stage === 'planning' && blueprint))
                                ? { c: 'bg-[var(--amber)]',  pulse: true }
        :                         { c: 'bg-[var(--green)]',  pulse: true }

    // the thin accent line on top of the bar — colour tracks the stage
    const topLine =
          stage === 'idle'                      ? 'bg-[var(--line-soft)]'
        : stage === 'done'                      ? 'bg-[var(--green)]'
        : (stage === 'planning' && blueprint)   ? 'bg-[var(--amber)]'
        :                                         'bg-[var(--violet)]'

    // did the run take a repair attempt? drives whether Repair/Re-verify show.
    // Brick 3/4 will set this from the real attempts; false until the engine exists.
    // (flip to `true` temporarily to preview the full 5-step bar.)
    const repaired = (result?.attempts.length ?? 0) > 1

    // Resolve "null means the latest" ONCE, here. Both the header and <Results>
    // read this same index, so the convention lives in exactly one line and the
    // child never has to know that null was ever a possibility.
    const shownIndex = selected ?? (result ? result.attempts.length - 1 : 0)
    const shown = result?.attempts[shownIndex]

    return(
        //352px: The first column stays locked at a fixed width of 352 pixels (great for a sidebar).1fr: The fr means "fraction". 
        // The second column grows to fill one share (all) of the leftover empty space on the screen
        <div className="h-dvh grid grid-cols-[352px_1fr] grid-rows-[minmax(0,1fr)] overflow-hidden bg-[var(--bg)] text-[var(--text)]">

            {/* ============ LEFT: chat column ============ */}
            {/* min-h-0: the vertical twin of min-w-0. Without it a grid item won't
                shrink below its content, so the thread grows instead of scrolling. */}
            <aside className="flex flex-col min-w-0 min-h-0 border-r border-[var(--line)] bg-[var(--panel)]">

                {/* header — fixed */}
                <header className="shrink-0 flex items-center gap-3 px-4 py-3.5 border-b border-[var(--line-soft)]">
                    <span className="font-mono font-semibold text-[15px]">litmus
                        <span className="text-[var(--violet)]">.</span>
                    </span>
                    {/* hidden at idle — there is nothing to start over from */}
                    {stage !== 'idle' && (
                        <button
                            onClick={startOver}
                            className="ml-auto rounded-md px-2.5 py-1.5 font-mono text-[11px] text-[var(--faint)] transition-colors hover:bg-[var(--panel-3)] hover:text-[var(--text)]"
                        >
                            + new problem
                        </button>
                    )}
                </header>

                {/* thread — the only part of this column that scrolls */}
                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 flex flex-col gap-5">

                    {/* the interleaved chat log — user right, litmus left, in order */}
                    {messages.map((m, i) => {
                        // Only the newest litmus bubble pulses. Older ones are settled
                        // history — a ring on every past reply turns the thread into a
                        // wall of blinking and stops meaning "here".
                        const isCurrent = i === messages.length - 1
                        return (
                        m.role === 'user' ? (
                            <div key={i} className="self-end max-w-[85%] rounded-[12px_12px_3px_12px] border border-[var(--line)] bg-[var(--panel-3)] px-3.5 py-2.5 text-[14px]">
                                {m.text}
                            </div>
                        ) : (
                            <div key={i} className="fade-in self-start max-w-[92%] flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                    <span className={`${isCurrent ? 'pulse-ring ' : ''}grid place-items-center w-[17px] h-[17px] rounded-full bg-[var(--violet)] text-white font-mono text-[9px] font-bold`}>L</span>
                                    <span className="font-mono text-[11px] text-[var(--faint)]">litmus</span>
                                </div>
                                {/* whitespace-pre-line so the PEP 8 list keeps its line breaks */}
                                <p className="m-0 text-[14px] text-[var(--muted)] leading-relaxed whitespace-pre-line">{m.text}</p>

                                {/* a question: options stacked one above the other. They stay in
                                    the thread after answering — the chosen one keeps its violet
                                    edge, the rest go dim and unclickable, so scrolling back shows
                                    what was asked AND what the alternatives were. */}
                                {m.options && (
                                    <div className="mt-1 flex flex-col gap-1.5">
                                        {m.options.map(opt => {
                                            const picked   = m.chosen === opt
                                            const answered = m.chosen !== undefined
                                            return (
                                                <button
                                                    key={opt}
                                                    onClick={() => chooseStyle(opt)}
                                                    disabled={answered}
                                                    className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                                                        picked
                                                            ? 'border-[var(--violet)] bg-[var(--violet)]/10'
                                                            : answered
                                                                ? 'border-[var(--line-soft)] opacity-40'
                                                                : 'border-[var(--line)] bg-[var(--panel-2)] hover:border-[var(--violet-dim)]'
                                                    }`}
                                                >
                                                    <span className={`font-mono text-[12.5px] ${picked ? 'text-[var(--violet)]' : 'text-[var(--text)]'}`}>
                                                        {picked ? '✓ ' : ''}{STYLE_OPTIONS[opt].label}
                                                    </span>
                                                    <span className="font-mono text-[11px] text-[var(--faint)]">
                                                        {STYLE_OPTIONS[opt].hint}
                                                    </span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )
                        )
                    })}

                    {/* model thinking: pulsing dots + a rotating phrase that fades as it cycles */}
                    {thinking && (
                        <div className="self-start flex flex-col gap-2">
                            <div className="dots" aria-label="thinking"><i /><i /><i /></div>
                            {phrase && (
                                <span key={phrase} className="fade-in font-mono text-[12px] text-[var(--faint)]">{phrase}</span>
                            )}
                        </div>
                    )}

                    {/* errors never get swallowed into the console alone */}
                    {errorMsg && (
                        <div className="rounded-lg border border-[var(--red)]/40 bg-[var(--red)]/10 px-3 py-2 font-mono text-[12px] text-[var(--red)]">
                            {errorMsg}
                        </div>
                    )}

                    {/* scroll anchor — the effect keeps this in view on every new message */}
                    <div ref={bottomRef} />
                </div>

                {/* composer — fixed to the bottom. Dims + freezes once we lock in. */}
                <div className="shrink-0 border-t border-[var(--line-soft)] px-3.5 py-3">
                    <div className={`rounded-[10px] border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2.5 flex flex-col gap-2 focus-within:border-[var(--violet-dim)] transition-opacity ${locked ? 'opacity-40 pointer-events-none' : ''}`}>
                        <textarea
                            rows={2}
                            value={problem}
                            onChange={(e) => setProblem(e.target.value)}
                            // Enter submits, Shift+Enter makes a newline. preventDefault
                            // stops Enter from also inserting a line break.
                            onKeyDown={(e) => {
                                if (e.key === 'Escape' && testSelected) { e.preventDefault(); exitTryMode(); return }
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); composingStyle ? submitStyle() : testSelected ? runTestCase() : submitProblem() }
                            }}
                            disabled={locked}
                            placeholder={composingStyle ? 'Describe your style…' : testSelected ? "edit the input": 'What should Litmus build?'}
                            spellCheck={false}
                            className="w-full min-h-[44px] resize-none bg-transparent text-[14px] text-[var(--text)] placeholder:text-[var(--faint)] focus:outline-none"
                        />
                        <div className="flex items-center justify-between gap-2.5">
                            <span className="font-mono text-[10.5px] text-[var(--faint)]">
                                {testSelected ? '⏎ to run · esc to exit' : '⏎ to send'}
                            </span>
                            <button
                                onClick={composingStyle ? submitStyle : testSelected ? runTestCase : submitProblem}
                                disabled={busy || trying || !problem.trim()}
                                className="rounded-md bg-[var(--violet)] px-3.5 py-1.5 font-mono text-[12.5px] font-semibold text-white hover:bg-[var(--violet-dim)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {busy ? 'Generating…' : trying ? 'Running…' : composingStyle ? 'Set style' : testSelected ? 'Run' : 'Generate'}
                    </button>
                        </div>
                    </div>
                </div>
                
            </aside>

            {/* ============ RIGHT: workspace ============ */}
            <main className="flex flex-col min-w-0 min-h-0">

                {/* thin accent line on top of the bar; colour tracks the stage */}
                <div className={`shrink-0 h-0.5 transition-colors duration-500 ${topLine}`} />

                {/* pipeline bar — fixed at the top; steps on the left, live status on the right */}
                <header className="shrink-0 flex items-center gap-3 flex-wrap px-5 py-3 border-b border-[var(--line)] bg-[var(--panel)]">
                    <Pipeline stage={stage} revising={stage === 'planning' && blueprint !== null} repaired={repaired} />
                    <div className="ml-auto flex items-center gap-1.5 font-mono text-[12.5px] text-[var(--muted)]">
                        <span>python:3.12-slim</span><span className="text-[var(--line)]">·</span><span>no network</span><span className="text-[var(--line)]">·</span>
                        {shown  ?(
                            <>
                                <span className={`font-semibold ${shown.result.all_passed ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                                    {shown.result.passed}/{shown.result.total} passed
                                </span>
                                {!shown.result.all_passed && (
                                    <><span className="text-[var(--line)]">·</span><span className="text-[var(--red)]">{shown.result.failed} failed</span></>
                                )}
                                {shown.result.duration_ms != null && (
                                    <><span className="text-[var(--line)]">·</span><span>{(shown.result.duration_ms / 1000).toFixed(2)}s</span></>
                                )}
                            </>
                        ) : (
                            <span className={`w-2 h-2 rounded-full ${statusDot.c} ${statusDot.pulse ? 'animate-pulse' : ''}`} />
                        )}
                    </div>
                </header>

                {/* stage area — the only part of this column that scrolls */}
                <div className="flex-1 min-h-0 overflow-y-auto p-5">

                    {/* idle + planning + generating share the centered scanbox layout,
                        only the caption changes — so one block, dynamic text */}
                    {stage !== 'blueprint' && !result && (
                    <div className="h-full min-h-[300px] flex flex-col items-center justify-center gap-5 text-center">
                        <div className="scanbox w-[190px] h-[112px] rounded-[10px] border border-[var(--line)] bg-[var(--panel)]">
                            <div className="absolute inset-4 flex flex-col gap-2.5">
                                <i className="h-1.5 rounded-sm bg-[var(--line-soft)]" />
                                <i className="h-1.5 w-[76%] rounded-sm bg-[var(--line-soft)]" />
                                <i className="h-1.5 w-[54%] rounded-sm bg-[var(--line-soft)]" />
                                <i className="h-1.5 w-[84%] rounded-sm bg-[var(--line-soft)]" />
                </div>
                        </div>
                        {/* Fixed width so the tips don't reflow the block as they rotate:
                            they vary from ~30 to ~57 characters, and letting the box size
                            to its content would resize the whole centred group every few
                            seconds. min-h on the <p> does the same job vertically, holding
                            the row open for the couple of tips that wrap to two lines. */}
                        <div className="flex w-[420px] max-w-full flex-col items-center gap-2.5">
                                <h3 className="font-mono text-[14.5px] font-semibold text-[var(--text)]">
                                    {stage === 'planning'   ? 'Awaiting blueprint lock'
                                   : stage === 'generating' ? 'Writing solution and tests'
                                   :                          'Sandbox idle'}
                                </h3>
                                {/* key= is what replays the fade: a new key unmounts the
                                    old <p> and mounts a fresh one, restarting the CSS
                                    animation. Reuse the element and the animation has
                                    already run, so the text would swap with no transition.

                                    No ornament here on purpose. The scanbox above is
                                    already the moving, coloured thing; the tip's job is to
                                    be readable underneath it. The weight and the near-white
                                    --tip are what lift it off the panel — decoration on top
                                    of that only competed for attention. */}
                                <p key={TIPS[tipIndex]}
                                   className="fade-in m-0 min-h-[17px] text-center font-mono text-[12px] font-medium text-[var(--tip)]">
                                    {TIPS[tipIndex]}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* the blueprint card — wide and short, built from real fields */}
                    {stage === 'blueprint' && blueprint && (
                        <BlueprintPanel
                            blueprint={blueprint}
                            style={style}
                            feedback={feedback}
                            setFeedback={setFeedback}
                            onRevise={revise}
                            onLockIn={lockIn}
                            busy={busy}
                        />
                    )}

                    { stage === "done" && result &&(
                        <div className="flex flex-col min-w-0 min-h-0 rounded-[11px] border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
                            <Results
                                attempts={result.attempts}
                                testSource={result.tests}
                                testSpec={result.test_spec}
                                selected={shownIndex}
                                onSelect={setSelected}
                                setTestCase={sendTestinput}
                                tryLog={tryLog}
                                trying={trying}
                            />
                        </div>
                    )}

            </div>
            </main>
        </div>
    )
}