import { useState, useRef, useEffect } from "react";
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

// fetch only rejects on a NETWORK-level failure (DNS, refused connection, CORS).
// A 429 is a perfectly successful round-trip, so nothing throws on its own —
// checking response.ok and throwing is what routes it into the catch blocks.
// Returning `never` tells TS this always throws, so callers don't need `throw`
// in front of it and the code after the if-block still narrows correctly.
// Instead of finishing normally, a function with a never type will always crash, stop the program, or run forever.
function throwForStatus(response: Response, label: string): never {
    if (response.status === 429) {
        // Seconds remaining, set by slowapi's 429 handler. This is only readable
        // because the API lists Retry-After in the CORS expose_headers — without
        // that the browser strips it and .get() returns null.
        const seconds = Number(response.headers.get('Retry-After'))
        const minutes = Math.ceil(seconds / 60)
        const wait =
            !Number.isFinite(seconds) || seconds <= 0 ? 'a little while'
            : seconds < 60 ? 'under a minute'
            : `about ${minutes} minute${minutes === 1 ? '' : 's'}`
        // Deliberately not "today" — every limit on this API is per hour.
        throw new Error(`You've hit the usage limit. Try again in ${wait}.`)
    }
    throw new Error(`${label} (${response.status})`)
}

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

// A label that only exists on hover — the same job `title` does, without the
// browser's ~1s delay, its unstyleable system chrome, and its habit of never
// appearing at all on touch. An icon button is only honest if the word behind it
// is one hover away; without that, the user is guessing at a glyph.
//
// `group/tip` is a NAMED group: several of these sit inside rows that already
// use a plain `group`, and an unnamed one here would fire on the parent's hover
// as well as its own.
function Tip({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <span className="group/tip relative inline-flex">
            {children}
            <span
                role="tooltip"
                // pointer-events-none so the tooltip can never sit between the
                // cursor and the button that summoned it — which would make the
                // button flicker as the tooltip stole and lost the hover.
                className="pointer-events-none absolute left-1/2 top-full z-40 mt-2 -translate-x-1/2 translate-y-1 scale-95 whitespace-nowrap rounded-md border border-[var(--line)] bg-[var(--panel-3)] px-2 py-1 font-mono text-[10.5px] text-[var(--text)] opacity-0 shadow-[0_10px_28px_-10px_rgba(0,0,0,.95)] transition-all duration-150 ease-out group-hover/tip:translate-y-0 group-hover/tip:scale-100 group-hover/tip:opacity-100"
            >
                {label}
            </span>
        </span>
    )
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
    // submit is a network call now, so it needs its own in-flight flag — `busy` is
    // derived from stage, and this check happens while the stage is still 'idle'.
    const [checking, setChecking] = useState(false)

    // ── layout ────────────────────────────────────────────────────────────
    // Three states, not a boolean: the thread alone, both panes, or the sandbox
    // alone. `null` means "follow the stage" — the override exists only to let
    // someone disagree with the automatic choice for as long as that stage lasts.
    const [layoutOverride, setLayoutOverride] = useState<'thread' | 'split' | 'sandbox' | null>(null)
    const [leftPct, setLeftPct] = useState(42)
    const [dragging, setDragging] = useState(false)
    // True while the cursor is within a few pixels of the right edge. The edge is
    // the affordance: there is no divider to grab in full-page mode, so the page
    // has to volunteer that one is available.
    const [edgeHot, setEdgeHot] = useState(false)
    const shellRef = useRef<HTMLDivElement>(null)
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
                throwForStatus(response, 'Blueprint request failed');
            }

            const data = await response.json();

            if (data.declined  == true ) {
                setStage('idle')
                setMessages(m => [...m,
                    { role: 'user',   text: lockedProblem },
                    { role: 'litmus', text: data.message,
                    },
                ])
            }

            else{
            setBlueprint(data)
            setStage('blueprint')   // success has its own destination
            setFeedback('')         // consumed — clear it so the next revise starts empty
            }
            
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
                throwForStatus(response, 'Run failed');

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
            if (!response.ok) throwForStatus(response, 'Try failed')
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


    // Step 1: check the input is even a coding problem, then commit it and ASK about
    // style before spending a model call. Nothing is generated here — the blueprint
    // waits until style is settled, so it gets written once with the right
    // instructions instead of twice.
    //
    // The check has to happen HERE and not deeper in the pipeline. Everything below
    // this line is local state: the style question costs nothing and reaches no
    // model, so a guard further in would still have asked someone how they'd like
    // their weather question formatted before turning them away.
    async function submitProblem(){
        if (!problem.trim() || busy || checking) return

        setErrorMsg('')
        setChecking(true)
        let declined: { message?: string } | null = null
        try {
            const response = await fetch(`${API_URL}/api/check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ problem }),
            })
            // Fails open, exactly like the backend does: if the checker is
            // unreachable the submission proceeds unguarded rather than stranding
            // someone with a real question behind a service they can't see.
            if (response.ok) {
                const data = await response.json()
                if (data.declined) declined = data
            }
        } catch (err) {
            console.log('check unavailable, proceeding:', err)
        } finally {
            setChecking(false)
        }

        if (declined) {
            // A decline is something Litmus SAYS, not an error — errorMsg would
            // paint failure chrome on a perfectly reasonable off-topic question.
            setMessages(m => [...m, {
                role: 'litmus',
                text: declined.message ?? 'I help with coding problems — try pasting a coding question, an assignment, or the code that\'s breaking.',
            }])
            // No stage change and no setProblem(''): nothing was committed, so the
            // composer keeps their text to edit instead of making them retype it.
            return
        }

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

    // statusDot / topLine / repaired lived here to drive the old pipeline bar.
    // The pane's own border is the status light now (paneAccent above), so the
    // three of them had one consumer between them and it is gone. Pipeline.tsx is
    // still on disk — unused by this component, kept for the rebuild.

    // Resolve "null means the latest" ONCE, here. Both the header and <Results>
    // read this same index, so the convention lives in exactly one line and the
    // child never has to know that null was ever a possibility.
    const shownIndex = selected ?? (result ? result.attempts.length - 1 : 0)
    const shown = result?.attempts[shownIndex]

    // The sandbox earns its half of the screen only once there is code to put in
    // it. Everything before that — the problem, the style question, the blueprint
    // — is conversation, and conversation reads better across the full width than
    // squeezed into a rail beside an empty panel.
    const codeStage = stage === 'generating' || stage === 'verifying'
                   || stage === 'repairing'  || stage === 'done'
    const autoLayout: 'thread' | 'split' = codeStage ? 'split' : 'thread'
    const layout = layoutOverride ?? autoLayout

    // Drop the override whenever the automatic answer changes. That is what makes
    // "ask a new problem and the blueprint takes the whole page again" free: the
    // stage returns to a thread stage and the override clears with it. WITHIN a
    // stage the override survives, so a minimised sandbox stays minimised.
    useEffect(() => { setLayoutOverride(null) }, [autoLayout])

    // Percentages, not pixels: the split has to survive a window resize, and a
    // fixed 352px rail is half the screen on a laptop and a sliver on a 4K.
    const cols = layout === 'thread'  ? '1fr 0px 0px'
               : layout === 'sandbox' ? '0px 0px 1fr'
               :                        `${leftPct}% 6px 1fr`

    // Cheap enough to run on every move: one subtraction and a comparison, and
    // setState only fires when the boolean actually flips.
    function trackEdge(e: React.PointerEvent<HTMLDivElement>) {
        if (layout !== 'thread' || !shellRef.current) return
        const rect = shellRef.current.getBoundingClientRect()
        setEdgeHot(rect.right - e.clientX < 28)
    }

    // The pane's edge colour IS the status readout. One variable, published as an
    // inline custom property, so the CSS never branches on stage.
    const paneAccent =
          stage === 'repairing'                 ? 'var(--amber)'
        : stage === 'done' && shown             ? (shown.result.all_passed ? 'var(--green)' : 'var(--red)')
        : stage === 'idle'                      ? 'var(--line)'
        :                                         'var(--violet)'
    // "working" breathes, "lit" holds. Anything mid-flight breathes.
    const paneWorking = stage === 'planning' || stage === 'generating'
                     || stage === 'verifying' || stage === 'repairing'
    const paneLit = stage === 'done' || stage === 'blueprint'

    // Which copy button just fired, so the label can confirm it. Null after 1.4s —
    // a confirmation that never clears stops being a confirmation.
    const [copied, setCopied] = useState<'code' | 'tests' | null>(null)
    async function copy(what: 'code' | 'tests') {
        const text = what === 'code' ? shown?.code : result?.tests
        if (!text) return
        await navigator.clipboard.writeText(text)
        setCopied(what)
        setTimeout(() => setCopied(c => (c === what ? null : c)), 1400)
    }

    // The header only frosts once there is something behind it to frost.
    const [threadScrolled, setThreadScrolled] = useState(false)

    function startDrag(e: React.PointerEvent<HTMLDivElement>) {
        e.preventDefault()
        // Pointer capture keeps the drag alive when the cursor outruns the 6px
        // handle — without it the divider drops the moment you move quickly.
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
    }
    function onDrag(e: React.PointerEvent<HTMLDivElement>) {
        if (!dragging || !shellRef.current) return
        const rect = shellRef.current.getBoundingClientRect()
        const pct = ((e.clientX - rect.left) / rect.width) * 100
        // Clamped so neither pane can be dragged into uselessness.
        setLeftPct(Math.min(72, Math.max(24, pct)))
    }
    function endDrag(e: React.PointerEvent<HTMLDivElement>) {
        setDragging(false)
        e.currentTarget.releasePointerCapture(e.pointerId)
    }

    return(
        //352px: The first column stays locked at a fixed width of 352 pixels (great for a sidebar).1fr: The fr means "fraction". 
        // The second column grows to fill one share (all) of the leftover empty space on the screen
        <div
            ref={shellRef}
            onPointerMove={trackEdge}
            onPointerLeave={() => setEdgeHot(false)}
            className="relative h-dvh flex flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)] lg:grid lg:grid-rows-[minmax(0,1fr)]"
            style={{
                gridTemplateColumns: cols,
                // Animating the TRACK means the content reflows with the column
                // instead of being slid over by a transform. Off during a drag —
                // a transition there makes the divider lag behind the cursor.
                transition: dragging ? 'none' : 'grid-template-columns .28s cubic-bezier(.4,0,.2,1)',
            }}
        >
            {/* ============ LEFT: chat column ============ */}
            {/* min-h-0: the vertical twin of min-w-0. Without it a grid item won't
                shrink below its content, so the thread grows instead of scrolling. */}
            {/* `relative` because the header and composer are lifted OUT of the
                flow and float over the thread. That is what makes the glass real:
                a header that sits above content in the flow has nothing behind it
                to blur, and blurring the flat panel colour looks like nothing. */}
            <aside className="relative w-full h-full min-w-0 min-h-0 overflow-hidden bg-[var(--panel)]">

                {/* header — fixed. No bottom border in full-page mode: a rule across
                    an empty page draws a line for no reason, and the reference has
                    the title floating on the same surface as the thread. */}
                <header className={`absolute inset-x-0 top-0 z-30 flex items-center gap-2.5 px-4 py-3.5 transition-[background-color,backdrop-filter,border-color] duration-300 ${
                    threadScrolled
                        ? 'border-b border-[var(--line-soft)] bg-[color-mix(in_srgb,var(--panel)_72%,transparent)] backdrop-blur-xl backdrop-saturate-150'
                        : 'border-b border-transparent bg-transparent'
                }`}>
                    {/* alt="" on purpose: the wordmark right next to it already
                        says "litmus", so naming the image too would make a screen
                        reader announce the brand twice. */}
                    <span className="brand-mark">
                        <img src="/favicon.svg" alt="" />
                    </span>
                    <span className="font-mono font-semibold text-[15px]">litmus
                        <span className="text-[var(--violet)]">.</span>
                    </span>

                    {/* Once a problem is locked it becomes the document title, the way
                        the reference names the thing you are working on rather than
                        the tool you are working in. Truncated — a pasted assignment
                        is a paragraph, not a title. */}
                    {lockedProblem && (
                        <span className="hidden lg:flex min-w-0 items-center gap-1.5 text-[13px] text-[var(--muted)]">
                            <span className="text-[var(--line)]">/</span>
                            <span className="truncate max-w-[280px]">{lockedProblem}</span>
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--faint)]"><path d="m6 9 6 6 6-6"/></svg>
                        </span>
                    )}

                    <div className="ml-auto flex items-center gap-1.5">
                        {/* hidden at idle — there is nothing to start over from */}
                        {stage !== 'idle' && (
                            <button
                                onClick={startOver}
                                className="rounded-md px-2.5 py-1.5 font-mono text-[11px] text-[var(--faint)] transition-colors hover:bg-[var(--panel-3)] hover:text-[var(--text)]"
                            >
                                + new problem
                            </button>
                        )}

                        {/* The pane control. Its ICON changes on edge-hover — arrows
                            at rest, a split panel when you are near the edge that
                            would open it — so the corner and the edge are visibly
                            the same control reached two ways. */}
                        <Tip label={layout === 'thread' ? 'Split the pane' : 'Collapse to full page'}>
                        <button
                                onClick={() => setLayoutOverride(layout === 'thread' ? 'split' : 'thread')}
                                aria-label={layout === 'thread' ? 'Split the pane' : 'Collapse to full page'}
                                className={`hidden lg:grid place-items-center rounded-md p-1.5 transition-colors ${
                                    edgeHot ? 'bg-[var(--violet)]/15 text-[var(--violet)]'
                                            : 'text-[var(--faint)] hover:bg-[var(--panel-3)] hover:text-[var(--text)]'
                                }`}
                            >
                                {layout === 'thread' && edgeHot ? (
                                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16"/></svg>
                                ) : (
                                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3v6H3M15 21v-6h6M3 9l6-6M21 15l-6 6"/></svg>
                                )}
                            </button>
                        </Tip>
                    </div>
                </header>

                {/* thread — the only part of this column that scrolls.
                    Full page does NOT mean full width. A line of prose spanning a
                    27" monitor is unreadable, so the column is capped and centred
                    and the page around it stays empty on purpose. When the pane is
                    split it is already narrow, so the cap does nothing and comes
                    off. */}
                <div
                    onScroll={(e) => setThreadScrolled(e.currentTarget.scrollTop > 8)}
                    className={`h-full overflow-y-auto px-4 pt-20 pb-44 flex flex-col gap-5 ${
                        layout === 'thread' ? 'w-full max-w-[820px] mx-auto' : ''
                    }`}
                >

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

                    {/* The blueprint renders IN the thread, not in the side pane.
                        It is the thing being discussed, and at this stage there is
                        no code yet — so it gets the whole page, in line with the
                        conversation that produced it. */}
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

                    {/* scroll anchor — the effect keeps this in view on every new message */}
                    <div ref={bottomRef} />
                </div>

                {/* composer — fixed to the bottom. Dims + freezes once we lock in.
                    It tracks the thread's width so the two read as one column. */}
                <div className={`absolute inset-x-0 bottom-0 z-30 px-3.5 pb-5 pt-10 pointer-events-none ${
                    layout === 'thread' ? 'mx-auto w-full max-w-[820px]' : ''
                }`}>
                    {/* the fade lives behind the box, not on it */}
                    <div className="thread-fade pointer-events-none absolute inset-x-0 top-0 h-full" />
                    <div className="relative pointer-events-auto">
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
                                className="rounded-md bg-[var(--violet)] px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-[var(--violet-dim)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {busy ? 'Generating…' : trying ? 'Running…' : composingStyle ? 'Set style' : testSelected ? 'Run' : 'Generate'}
                    </button>
                        </div>
                    </div>
                    </div>
                </div>

            </aside>

            {/* ============ THE LIVE EDGE ============ */}
            {/* In full-page mode there is no divider to grab, so the edge itself is
                the handle: approach it and it lights, click it and the pane splits.
                A 28px hit zone lit by a 3px line — the target has to be forgiving,
                the mark does not. */}
            {layout === 'thread' && (
                <button
                    onClick={() => setLayoutOverride('split')}
                    aria-label="Split the pane"
                    className="absolute inset-y-0 right-0 z-20 hidden w-7 lg:block cursor-col-resize"
                >
                    <span className={`absolute inset-y-0 right-0 w-[3px] transition-colors duration-150 ${
                        edgeHot ? 'bg-[var(--violet)]' : 'bg-transparent'
                    }`} />
                </button>
            )}

            {/* ============ DIVIDER ============ */}
            {/* Its own grid track rather than a border on either pane: a border
                cannot be grabbed, and a positioned overlay would have to be kept
                in sync with a column width it doesn't own. */}
            <div
                onPointerDown={startDrag}
                onPointerMove={onDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize panes"
                className={`hidden lg:block relative group ${
                    layout === 'split' ? 'cursor-col-resize' : 'pointer-events-none'
                }`}
            >
                {/* The visible line is 6px but the grab area is 16px — a 6px hit
                    target is a fight with the mouse.

                    Transparent at rest. The panes are already separated by the gap
                    around the sandbox's rounded card, so a permanent rule would be
                    a second divider drawn on top of the one the layout already
                    implies. It appears when you reach for it and not before. */}
                <span className="absolute inset-y-0 -left-[5px] -right-[5px]" />
                <span className={`block h-full w-full rounded-full transition-colors duration-200 ${
                    dragging ? 'bg-[var(--violet)]' : 'bg-transparent group-hover:bg-[var(--violet)]/60'
                }`} />
            </div>

            {/* ============ RIGHT: workspace ============ */}
            {/* Padding, not margin, and box-border everywhere — so when the grid
                track collapses to 0px the padding clips with it instead of holding
                the pane open at 16px. */}
            <main className="hidden lg:flex flex-col min-w-0 min-h-0 overflow-hidden p-2 pl-0">

                {/* The sandbox is a CARD, not a column: inset from the window and
                    rounded, so the gap around it separates the panes and no rule
                    has to be drawn between them. Its border is the status light —
                    see .pane in index.css. */}
                <div
                    style={{ ['--pane-accent' as string]: paneAccent }}
                    className={`pane flex flex-1 min-h-0 flex-col overflow-hidden rounded-2xl bg-[var(--panel)] ${
                        paneWorking ? 'is-working' : paneLit ? 'is-lit' : ''
                    }`}
                >

                {/* top bar: environment left, stage in the CENTRE, actions right.
                    Absolute centring rather than justify-between, so the stage pill
                    stays put as the actions on the right change width. */}
                <header className="relative shrink-0 flex items-center px-4 py-2.5 border-b border-[var(--line-soft)]">

                    <span className="hidden xl:flex items-center gap-1.5 font-mono text-[11px] text-[var(--faint)]">
                        <span>python:3.12-slim</span>
                        <span className="text-[var(--line)]">·</span>
                        <span>no network</span>
                    </span>

                    {/* the pipeline, compressed to one pill. The long horizontal
                        stepper could not survive the checks that now sit between
                        stages; a single pill that names WHERE you are and takes the
                        stage's colour says the same thing in a tenth of the space. */}
                    <span
                        className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full border px-3 py-1"
                        style={{
                            borderColor: `color-mix(in srgb, ${paneAccent} 45%, transparent)`,
                            background:  `color-mix(in srgb, ${paneAccent} 10%, transparent)`,
                        }}
                    >
                        <span
                            className={`h-1.5 w-1.5 rounded-full ${paneWorking ? 'animate-pulse' : ''}`}
                            style={{ background: paneAccent }}
                        />
                        <span className="font-mono text-[11.5px] font-medium" style={{ color: paneAccent }}>
                            {stage === 'idle'       ? 'idle'
                           : stage === 'styling'    ? 'style'
                           : stage === 'awaiting_style' ? 'style'
                           : stage === 'planning'   ? (blueprint ? 'revising' : 'blueprint')
                           : stage === 'blueprint'  ? 'blueprint'
                           : stage === 'generating' ? 'generating'
                           : stage === 'verifying'  ? 'verifying'
                           : stage === 'repairing'  ? 'repairing'
                           :                          'done'}
                        </span>
                        {shown && stage === 'done' && (
                            <span className="font-mono text-[11.5px] text-[var(--muted)]">
                                {shown.result.passed}/{shown.result.total}
                            </span>
                        )}
                    </span>

                    {/* actions. Disabled rather than hidden until there is something
                        to copy — a control that appears and disappears makes the bar
                        jump every time a run finishes. */}
                    <span className="ml-auto flex items-center gap-1">
                        {/* Icons, not labels. Two text buttons put ~24 characters of
                            chrome above a code panel that has to fit a signature; the
                            title attribute carries the name for anyone who needs it,
                            and a tick replaces the glyph for a moment on success. */}
                        <Tip label="Copy solution">
                            <button
                                onClick={() => copy('code')}
                                disabled={!shown}
                                aria-label="Copy solution"
                                className={`grid place-items-center rounded-md p-1.5 transition-colors hover:bg-[var(--panel-3)] disabled:opacity-30 disabled:hover:bg-transparent ${
                                    copied === 'code' ? 'text-[var(--green)]' : 'text-[var(--faint)] hover:text-[var(--text)]'
                                }`}
                            >
                                {copied === 'code' ? (
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                                ) : (
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
                                )}
                            </button>
                        </Tip>
                        <Tip label="Copy tests">
                            <button
                                onClick={() => copy('tests')}
                                disabled={!result?.tests}
                                aria-label="Copy tests"
                                className={`grid place-items-center rounded-md p-1.5 transition-colors hover:bg-[var(--panel-3)] disabled:opacity-30 disabled:hover:bg-transparent ${
                                    copied === 'tests' ? 'text-[var(--green)]' : 'text-[var(--faint)] hover:text-[var(--text)]'
                                }`}
                            >
                                {copied === 'tests' ? (
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                                ) : (
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m9 12 2 2 4-4"/><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
                                )}
                            </button>
                        </Tip>

                        <span className="mx-1 h-4 w-px bg-[var(--line)]" />

                        <Tip label={layout === 'sandbox' ? 'Back to split view' : 'Expand to full page'}>
                            <button
                                onClick={() => setLayoutOverride(layout === 'sandbox' ? 'split' : 'sandbox')}
                                aria-label={layout === 'sandbox' ? 'Back to split view' : 'Expand to full page'}
                                className="rounded-md p-1.5 text-[var(--faint)] transition-colors hover:bg-[var(--panel-3)] hover:text-[var(--text)]"
                            >
                                {layout === 'sandbox' ? (
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3v6H3M15 21v-6h6"/></svg>
                                ) : (
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                                )}
                            </button>
                        </Tip>
                        <Tip label="Minimise the sandbox">
                            <button
                                onClick={() => setLayoutOverride('thread')}
                                aria-label="Minimise the sandbox"
                                className="rounded-md p-1.5 text-[var(--faint)] transition-colors hover:bg-[var(--panel-3)] hover:text-[var(--text)]"
                            >
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/></svg>
                            </button>
                        </Tip>
                    </span>
                </header>

                {/* Stage area. When the IDE is up it does NOT scroll and carries no
                    padding: the pane above is already the card, and a scrolling
                    parent is exactly what let the results panel grow with its
                    content instead of filling a fixed height. Every other stage is
                    a short centred block, so it scrolls and pads as before. */}
                <div className={`flex flex-1 min-h-0 flex-col ${
                    stage === 'done' && result ? 'overflow-hidden' : 'overflow-y-auto p-5'
                }`}>

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
                                <h3 className="text-[15px] font-semibold text-[var(--text)]">
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

                    { stage === "done" && result &&(
                        /* h-full, and no border of its own: the pane wrapping this
                           column already draws the card, and a second rounded border
                           4px inside the first reads as a rendering bug. */
                        <div className="flex h-full min-w-0 min-h-0 flex-col overflow-hidden">
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
                </div>
            </main>
        </div>
    )
}