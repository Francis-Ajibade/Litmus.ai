import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { WORKSPACE, workspacePath } from "../../lib/routes";
import { authHeaders } from "../../lib/api";
import { highlight } from "../../lib/highlight";

// The server's stages, copied from main/new_code.py:22. The browser never invents one.
export type Stage = 'idle' | 'styling' | 'accepted'
                  | 'planning' | 'approved' | 'done'

// The three built-in ids, plus a saved style's uuid. `string & {}` keeps
// autocomplete on the literals while allowing an id the server invented.
export type StyleChoice = 'default' | 'describe or paste code' | 'choose style' | (string & {})

export type ButtonChoice = "Restyle" | "Continue" | "Save & Continue"

export type StyleChoiceItem = {
    id: StyleChoice
    label: string
    hint: string
    off?: boolean
}


// "Save & Continue" is in the type but not offered yet — it needs the styles
// table and its picker, and a saved style is a write nothing can read back.
const BUTTON_CHOICES: {id: ButtonChoice, hint: string}[] = [
    {id: "Restyle", hint: 'change it, or go back on this'},
    {id: "Continue", hint: 'keep this style and move on'},
    {id: "Save & Continue", hint: " Save the style and move on "}
]



// One entry in the chat log. role decides which side + styling it renders on.
export type Msg = {
    role: 'user' | 'litmus'
    text: string
    pasted?: string
    options? : StyleChoiceItem[]
    choices ?: ButtonChoice[]
}

// A paste past either of these stops being something you read in a 2-row box.
const PASTE_LINES = 6
const PASTE_CHARS = 400

// A reply past either of these stops being something you skim in the thread.
const REPLY_LINES = 12
const REPLY_CHARS = 700

// Long replies keep a lead line in the thread and park the rest in a card.
function splitReply(text: string): [string, string | null] {
    if (text.length <= REPLY_CHARS && text.split('\n').length <= REPLY_LINES) return [text, null]
    const para = text.indexOf('\n\n')
    if (para > 0 && para <= REPLY_CHARS) return [text.slice(0, para).trim(), text.slice(para).trim()]
    const stop = text.slice(0, REPLY_CHARS).lastIndexOf('. ')
    if (stop > 40) return [text.slice(0, stop + 1).trim(), text.slice(stop + 1).trim()]
    return ['Here is what I changed \u2014 open the card to read it.', text]
}

const API_URL = import.meta.env.VITE_API_URL;

// fetch only rejects on a NETWORK-level failure (DNS, refused connection, CORS).
function throwForStatus(response: Response, label: string): never {
    if (response.status === 429) {
        // Seconds remaining, set by slowapi's 429 handler.
        const seconds = Number(response.headers.get('Retry-After'))
        const minutes = Math.ceil(seconds / 60)
        const wait =
            !Number.isFinite(seconds) || seconds <= 0 ? 'a little while'
            : seconds < 60 ? 'under a minute'
            : `about ${minutes} minute${minutes === 1 ? '' : 's'}`
        throw new Error(`You've hit the usage limit. Try again in ${wait}.`)
    }
    throw new Error(`${label} (${response.status})`)
}

// Tips under the sandbox caption, rotating while nothing is running.
const TIPS = [
    'click a case to run it with your own input',
    'switch between v1 and v2 to see what the repair changed',
    'read the tests before the code; they are the actual contract',
    'a failing run is the useful one; it names what the code got wrong',
    'edit the blueprint before locking it in; nothing runs until you approve',
    'the console prints whatever your snippet returns, like a Python prompt',
    'paste a file you have written to have Litmus match your style',
]
const TIP_MS = 4200

// Phrases the "thinking" indicator cycles through, one set per phase.
const THINKING: Record<string, string[]> = {
    idle:       ['reading your problem…', 'checking there is something here to build…'],
    planning:   ['reading the problem…', 'sketching the contract…', 'naming the traps a grader would set…'],
    revising:   ['folding in your note…', 'reworking the plan…'],
    generating: ['writing the solution…', 'generating tests from the traps…', 'sealing the sandbox…'],
    verifying:  ['running pytest in the sandbox…', 'collecting the results…'],
    repairing:  ['reading the failures…', 'revising the solution…', 'widening the tests…'],
}


// Generic used to type check making sure T is a subset of StyleChoice
// this is used so that an id is unique to each list item 
// so wheneever you try and edit it to something else it is flagged 
function OptionRow<T extends string>({ id, label, hint, off, active, locked, delay, onPick }: {
    id: T
    label: string
    hint?: string
    off?: boolean
    active?: boolean
    locked?: boolean
    delay?: number
    onPick: (id: T) => void
}) {
    const disabled = off || locked
    return (
        <button
            onClick={() => onPick(id)}
            disabled={disabled}
            aria-pressed={active}
            // The rows arrive one after another rather than as a block. `both` on
            // the fade-in keyframes holds them invisible until their turn.
            style={delay ? { animationDelay: `${delay}ms` } : undefined}
            className={`fade-in flex w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed ${
                active
                    ? 'border-[var(--pick)] bg-[var(--pick)]/8'
                    : off
                        ? 'border-[var(--line-soft)] opacity-40'
                        : locked
                            ? 'border-[var(--line-soft)] opacity-50'
                            : 'border-[var(--line)] bg-[var(--panel-2)] hover:border-[var(--pick-dim)]'
            }`}
        >
            <span className={`text-[13.5px] font-medium ${active ? 'text-[var(--pick)]' : 'text-[var(--text)]'}`}>
                {active ? '\u2713 ' : ''}{label}
            </span>
            {hint && <span className="text-[12px] text-[var(--faint)]">{hint}</span>}
        </button>
    )
}




// A long paste, parked as an attachment instead of flooding the composer.
// Click to read it in full; onRemove is only passed while it is still editable —
// in the thread it is history and there is nothing to remove.
function PastedCard({ text, onOpen, onRemove, label = 'PASTED', prose }: {
    text: string
    onOpen: () => void
    onRemove?: () => void
    label?: string
    prose?: boolean
}) {
    const lines = text.split('\n').length
    return (
        <div className="relative w-[230px] rounded-xl border border-[var(--line)] bg-[var(--panel-2)] p-3">
            <button
                onClick={onOpen}
                className="block w-full text-left"
                aria-label="Open pasted content"
            >
                {/* break-all, not truncate: a wall of wrapped text reads as "there is
                    a lot here", which a single ellipsised line does not. */}
                <p className={`m-0 h-[92px] overflow-hidden text-[var(--faint)] leading-[1.55] ${
                    prose ? 'text-[12px]' : 'break-all font-mono text-[11.5px]'
                }`}>
                    {text}
                </p>
                <span className="mt-2.5 inline-block rounded-md border border-[var(--line)] px-2 py-0.5 font-mono text-[10.5px] tracking-[0.08em] text-[var(--muted)]">
                    {label} · {lines} lines
                </span>
            </button>
            {onRemove && (
                <button
                    onClick={onRemove}
                    aria-label="Remove pasted content"
                    className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full border border-[var(--line)] bg-[var(--panel-3)] text-[var(--faint)] transition-colors hover:border-[var(--red)] hover:text-[var(--red)]"
                >
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
            )}
        </div>
    )
}

// The expanded read. Fixed to the viewport rather than the pane so it sits above
// everything, including the sandbox and the header.
function PastedOverlay({ text, onClose, label = 'PASTED', prose }: {
    text: string
    onClose: () => void
    label?: string
    prose?: boolean
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    return (
        <div
            onClick={onClose}
            className="fade-in fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-[2px]"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="flex max-h-[80vh] w-full max-w-[760px] flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-[0_24px_70px_-20px_rgba(0,0,0,.9)]"
            >
                <div className="flex items-center gap-2 border-b border-[var(--line-soft)] bg-[var(--panel-2)] px-4 py-2.5">
                    <span className="font-mono text-[10.5px] tracking-[0.08em] text-[var(--muted)]">{label}</span>
                    <span className="font-mono text-[10.5px] text-[var(--faint)]">{text.split('\n').length} lines</span>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="ml-auto rounded-md p-1 text-[var(--faint)] transition-colors hover:bg-[var(--panel-3)] hover:text-[var(--text)]"
                    >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                    </button>
                </div>
                {prose ? (
                    <p className="m-0 overflow-auto whitespace-pre-line p-4 text-[13.5px] leading-[1.7] text-[var(--text)]">{text}</p>
                ) : (
                    <pre className="m-0 overflow-auto p-4 font-mono text-[12.5px] leading-[1.62] text-[var(--text)]">{text}</pre>
                )}
            </div>
        </div>
    )
}

type SavedStyle = { style_id: string; title: string; description: string | null; updated_at: string }
type SavedStyleDetail = SavedStyle & { sample_code: string | null }
// The list rides along into the detail view, so Esc can go back without a refetch.
type StyleView =
    | { view: 'list'; styles: SavedStyle[] | null }
    | { view: 'detail'; styles: SavedStyle[]; style: SavedStyleDetail }

function ago(iso: string) {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
    if (days <= 0) return 'today'
    if (days === 1) return 'yesterday'
    if (days < 30) return `${days} days ago`
    const months = Math.floor(days / 30)
    return months === 1 ? 'a month ago' : `${months} months ago`
}

function StyleOverlay({ view, onOpen, onBack, onClose, onAccept }: {
    view: StyleView
    onOpen: (id: string) => void
    onBack: () => void
    onClose: () => void
    onAccept: (id: string) => void
}) {
    const detail = view.view === 'detail'

    // Esc steps back one level: detail -> list -> closed.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') (detail ? onBack : onClose)() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [detail, onBack, onClose])

    return (
        <div
            onClick={onClose}
            className="fade-in fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-[2px]"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="flex max-h-[80vh] w-full max-w-[680px] flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-[0_24px_70px_-20px_rgba(0,0,0,.9)]"
            >
                <div className="flex items-center gap-2 border-b border-[var(--line-soft)] bg-[var(--panel-2)] px-3 py-2.5">
                    <button
                        onClick={detail ? onBack : onClose}
                        aria-label={detail ? 'Back to saved styles' : 'Close'}
                        className="rounded-md p-1 text-[var(--faint)] transition-colors hover:bg-[var(--panel-3)] hover:text-[var(--text)]"
                    >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                    </button>
                    <span className="truncate font-mono text-[10.5px] tracking-[0.08em] text-[var(--muted)]">
                        {detail ? view.style.title : 'SAVED STYLES'}
                    </span>
                </div>

                {detail ? (
                    <>
                        <div className="min-h-0 flex-1 overflow-auto">
                            <div className="px-4 pt-4">
                                <span className="font-mono text-[10.5px] text-[var(--faint)]">saved {ago(view.style.updated_at)}</span>
                                {view.style.description && (
                                    <p className="m-0 mt-2 whitespace-pre-line text-[13.5px] leading-[1.65] text-[var(--text)]">
                                        {view.style.description}
                                    </p>
                                )}
                            </div>
                            <pre className="m-4 overflow-auto rounded-lg border border-[var(--line-soft)] bg-[var(--panel-2)] p-4 font-mono text-[12.5px] leading-[1.62] text-[var(--text)]">
                                <code dangerouslySetInnerHTML={{ __html: highlight(view.style.sample_code ?? '') }} />
                            </pre>
                        </div>
                        <div className="flex justify-end border-t border-[var(--line-soft)] px-4 py-3">
                            <button
                                onClick={() => onAccept(view.style.style_id)}
                                className="rounded-lg bg-[var(--violet)] px-4 py-1.5 text-[13px] font-semibold text-white transition hover:brightness-110"
                            >
                                Accept
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3">
                        {view.styles === null ? (
                            <div className="dots self-center py-6" aria-label="loading"><i /><i /><i /></div>
                        ) : view.styles.map((st, i) => (
                            <button
                                key={st.style_id}
                                onClick={() => onOpen(st.style_id)}
                                style={{ animationDelay: `${i * 60}ms` }}
                                className="slide-in-left w-full rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-3.5 py-3 text-left transition-colors hover:border-[var(--violet)]"
                            >
                                <div className="flex items-baseline justify-between gap-3">
                                    <span className="truncate text-[14px] font-medium text-[var(--text)]">{st.title}</span>
                                    <span className="shrink-0 font-mono text-[10.5px] text-[var(--faint)]">{ago(st.updated_at)}</span>
                                </div>
                                {st.description && (
                                    // Clipped and faded, so the row invites a click rather than being read in full.
                                    <p className="m-0 mt-1.5 max-h-[2.9em] overflow-hidden text-[12.5px] leading-[1.45] text-[var(--muted)] [mask-image:linear-gradient(to_bottom,black_50%,transparent)]">
                                        {st.description}
                                    </p>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <span className="group/tip relative inline-flex">
            {children}
            <span
                role="tooltip"
                className="pointer-events-none absolute left-1/2 top-full z-40 mt-2 -translate-x-1/2 translate-y-1 scale-95 whitespace-nowrap rounded-md border border-[var(--line)] bg-[var(--panel-3)] px-2 py-1 text-[10.5px] text-[var(--text)] opacity-0 shadow-[0_10px_28px_-10px_rgba(0,0,0,.95)] transition-all duration-150 ease-out group-hover/tip:translate-y-0 group-hover/tip:scale-100 group-hover/tip:opacity-100"
            >
                {label}
            </span>
        </span>
    )
}

export default function Litmus(){
    // `problem` is the composer's draft; `lockedProblem` is what we committed to.
    const [problem, setProblem] = useState('')
    // The URL owns which session this is; state holds it for the gap between the
    // server minting an id and the navigate that puts it in the URL.
    const { sessionId } = useParams()
    const navigate = useNavigate()
    const [session_id, setSessionId] = useState<string | null>(sessionId ?? null)
    const [lockedProblem, setLockedProblem] = useState('')
    const [style, setStyle] = useState('')
    // Submit is a network call, so it needs its own flag — `busy` is derived from stage.
    const [checking, setChecking] = useState(false)
    const [ code, setCode ] = useState<string | null>(null)
    const [ diff, setDiff ] = useState<string | null>(null)
    const [ restyling, setRestyling ] = useState(false)
    const [picked, setPicked] = useState<StyleChoice>('default')
    // The attachment waiting to be sent, and whichever one is open for reading.
    const [pasted, setPasted] = useState<string | null>(null)
    const [expanded, setExpanded] = useState<{ text: string; label?: string; prose?: boolean } | null>(null)
    // The saved-style overlay: null when shut, otherwise which level is showing.
    const [styleView, setStyleView] = useState<StyleView | null>(null)


    const highlighted = useMemo(() => highlight(code ?? ''), [code])

    // ── layout ────────────────────────────────────────────────────────────
    const [layoutOverride, setLayoutOverride] = useState<'thread' | 'split' | 'sandbox' | null>(null)
    const [leftPct, setLeftPct] = useState(42)
    const [dragging, setDragging] = useState(false)
    // True while the cursor is near the right edge — the only affordance in thread mode.
    const [edgeHot, setEdgeHot] = useState(false)
    const shellRef = useRef<HTMLDivElement>(null)
    const [stage, setStage] = useState<Stage>('idle')
    const [errorMsg, setErrorMsg] = useState("")
    // The chat log — user and litmus messages, in the order they happened.
    const [messages, setMessages] = useState<Msg[]>([])
    const [tick, setTick] = useState(0)   // drives the rotating thinking phrase
    const [tipIndex, setTipIndex] = useState(0)   // drives the looping tips
    // An empty div pinned to the bottom of the thread, scrolled into view on each message.
    const bottomRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, stage])

    useEffect(() => {
        const id = setInterval(() => setTipIndex(i => (i + 1) % TIPS.length), TIP_MS)
        return () => clearInterval(id)
    }, [])

    // Derived from stage — never their own useState, or they'd drift out of sync.
    const busy = stage === 'planning'
    
    const describing = stage === 'styling' && picked === 'describe or paste code'
    const locked = !(stage === 'idle' || describing) || restyling

  

    // Which session the thread on screen already shows, so the effect doesn't
    // re-fetch one send() just populated. Starts null even when the URL has an
    // id: a fresh mount shows nothing yet, and seeding it would skip the fetch.
    const hydrated = useRef<string | null>(null)

    function clearSession() {
        hydrated.current = null
        setSessionId(null)
        setMessages([])
        setStage('idle')
        setCode(null)
        setDiff(null)
    }

    // Keyed on the param, not on mount: switching sessions from the sidebar
    // re-renders this same component instead of remounting it.
    useEffect(() => {
        if (!sessionId) {
            clearSession()
            return
        }

        if (hydrated.current === sessionId) return

        let cancelled = false
        setSessionId(sessionId)
        setErrorMsg('')

        ;(async () => {
            try {
                const response = await fetch(`${API_URL}/api/session/${sessionId}`, {
                    headers: await authHeaders(),
                })
                if (cancelled) return
                // Dead or not ours. Drop back to an empty workspace rather than
                // stranding the user on a session that can never load.
                if (response.status === 404) {
                    clearSession()
                    navigate(WORKSPACE, { replace: true })
                    setErrorMsg('That conversation is no longer on the server. Start over.')
                    return
                }
                if (!response.ok) throwForStatus(response, 'Could not open that session')
                const data = await response.json()
                if (cancelled) return
                hydrated.current = sessionId
                setMessages(data.msgs)
                setStage(data.stage)
                setCode(data.code)
                setDiff(data.diff)
            } catch (err) {
                if (cancelled) return
                setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
            }
        })()

        // A fast second switch must not let the first response overwrite it.
        return () => { cancelled = true }
    }, [sessionId])

    async function send(new_event: {kind: string, text: string, type ? : string , code_pasted ? : string | null, }){
        setChecking(true)
        setErrorMsg('')
        try {
            const response = await fetch(`${API_URL}/api/chat`, {
                method: 'POST',
                headers: await authHeaders(),
                body: JSON.stringify({event: new_event, session_id: session_id}),
            })
            // Not retryable: the server restarted and its in-memory store is empty,
            // so this session_id will 404 forever. Drop it and start clean.
            if (response.status === 404) {
                clearSession()
                navigate(WORKSPACE, { replace: true })
                setErrorMsg('That conversation is no longer on the server. Start over.')
                return
            }
            if (!response.ok) throwForStatus(response, 'Chat failed')
            const data = await response.json()
            setSessionId(data.session_id)
            // replace, not push — Back should leave the workspace, not step
            // between the empty one and this session.
            if (data.session_id && data.session_id !== sessionId) {
                hydrated.current = data.session_id
                navigate(workspacePath(data.session_id), { replace: true })
            }
            setStage(data.stage)
            setCode(data.code)
            setDiff(data.diff)
            setMessages(m => [...m, ...data.msgs])
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
            console.log(err)
        } finally {
            setChecking(false)
        }
    }

    function handleClick(btn : ButtonChoice){
        // 3 button cases to handle 
        // Restyle, Save & Continue , Continue 
        if (btn === "Restyle"){
            // no new state: `describing` is derived from picked, so pointing it at
            // the describe id is what re-opens the composer
            setPicked('describe or paste code')
            send({kind: "action", text: "describe or paste code"})
            return
        }        
        
        // the id itself — the server needs to tell Continue from Save & Continue
        send({ kind: 'action', text: btn.toLowerCase() })
    }

    async function openStyles() {
        setStyleView({ view: 'list', styles: null })
        try {
            const r = await fetch(`${API_URL}/api/styles`, { headers: await authHeaders() })
            if (!r.ok) throwForStatus(r, 'Could not load your styles')
            setStyleView({ view: 'list', styles: await r.json() })
        } catch (err) {
            setStyleView(null)
            setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
        }
    }

    async function openStyle(id: string) {
        const styles = styleView?.styles ?? []
        try {
            const r = await fetch(`${API_URL}/api/styles/${id}`, { headers: await authHeaders() })
            if (!r.ok) throwForStatus(r, 'Could not open that style')
            setStyleView({ view: 'detail', styles, style: await r.json() })
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
        }
    }

    function acceptStyle(id: string) {
        setStyleView(null)
        setPicked('choose style')
        send({ kind: 'action', text: id })
    }

    function handlePick(id : StyleChoice){
        // Opening the saved list is a read, not a turn — no chat call.
        if (id === 'choose style') {
            openStyles()
            return
        }
        setPicked(id)
        send({kind:"action",text : id})
    }

    // Step 1: send the problem. The server classifies it and answers with a stage.
    // A paste long enough to make the composer unreadable is parked as an
    // attachment instead. preventDefault is what stops it also landing in the box.
    function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
        const clip = e.clipboardData.getData('text')
        if (clip.split('\n').length <= PASTE_LINES && clip.length <= PASTE_CHARS) return
        e.preventDefault()
        setPasted(clip)
    }

    async function submitProblem(){
        if ((!problem.trim() && !pasted) || busy || checking || restyling) return
        const text = problem
        const attachment = pasted
        setProblem('')
        setPasted(null)
        
        if (describing) setRestyling(true)
        // One string goes over the wire, so the attachment is labelled rather than
        // just appended — that label is how Litmus tells a pasted sample from the
        // sentence describing it.
        const body = attachment
            ? `${text}\n\n--- pasted ---\n${attachment}`
            : text
        try {
        
            await send({ kind: 'message', text: body , type : describing ? "Restyling" : undefined , code_pasted : describing ? attachment : undefined})
        } finally {
            setRestyling(false)
        }
    }

    // A full reset. Every piece of session state is listed here on purpose.
    function startOver(){
        setProblem('')
        setLockedProblem('')
        setStyle('')
        setMessages([])
        setErrorMsg('')
        setPicked('default')
        setPasted(null)
        setExpanded(null)
        setStage('idle')
    }

    // is the model actively working? drives the pulsing dots + rotating thinking text
    const thinking = checking || stage === 'planning'
    // Which phrase set to cycle, so the thoughts match what is actually happening.
    const phaseKey = stage === 'planning'
        ? (style ? 'styled' : 'planning')
        : stage
    const phrases  = THINKING[phaseKey] ?? []
    const phrase   = phrases.length ? phrases[tick % phrases.length] : ''

    useEffect(() => {
        if (!thinking) { setTick(0); return }
        const id = setInterval(() => setTick(t => t + 1), 1900)
        return () => clearInterval(id)
    }, [thinking, phaseKey])

    // The sandbox earns half the screen only once there is code to put in it.
    const codeStage = code !== null
    const autoLayout: 'thread' | 'split' = codeStage ? 'split' : 'thread'
    const layout = layoutOverride ?? autoLayout

    useEffect(() => { setLayoutOverride(null) }, [autoLayout])

    
    const cols = layout === 'thread'  ? '100% 0px 0%'
               : layout === 'sandbox' ? '0% 0px 100%'
               :                        `${leftPct}% 6px calc(${100 - leftPct}% - 6px)`

    // One subtraction and a comparison; setState only fires when the boolean flips.
    function trackEdge(e: React.PointerEvent<HTMLDivElement>) {
        if (layout !== 'thread' || !shellRef.current) return
        const rect = shellRef.current.getBoundingClientRect()
        setEdgeHot(rect.right - e.clientX < 28)
    }

    // The pane's edge colour IS the status readout, published as a custom property.
    const paneAccent = stage === 'idle' ? 'var(--line)' : 'var(--violet)'
    // "working" breathes, "lit" holds. Anything mid-flight breathes.
    const paneWorking = restyling || stage === 'planning'
    const paneLit = stage === 'accepted' || stage === 'done'

    // Which copy button just fired, so the label can confirm it. Clears after 1.4s.
    const [copied, setCopied] = useState<'code' | 'tests' | null>(null)
    async function copy(what: 'code' | 'tests') {
        const text = what === 'code' ? code : diff
        if (!text) return
        await navigator.clipboard.writeText(text)
        setCopied(what)
        setTimeout(() => setCopied(c => (c === what ? null : c)), 1400)
    }

    // The header only frosts once there is something behind it to frost.
    const [threadScrolled, setThreadScrolled] = useState(false)

    function startDrag(e: React.PointerEvent<HTMLDivElement>) {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
    }
    function onDrag(e: React.PointerEvent<HTMLDivElement>) {
        if (!dragging || !shellRef.current) return
        const rect = shellRef.current.getBoundingClientRect()
        const pct = ((e.clientX - rect.left) / rect.width) * 100
        setLeftPct(Math.min(72, Math.max(24, pct)))
    }
    function endDrag(e: React.PointerEvent<HTMLDivElement>) {
        setDragging(false)
        e.currentTarget.releasePointerCapture(e.pointerId)
    }

    return(
        <div
            ref={shellRef}
            onPointerMove={trackEdge}
            onPointerLeave={() => setEdgeHot(false)}
            className="relative h-dvh flex flex-col overflow-hidden bg-[var(--bg)] text-[var(--text)] lg:grid lg:grid-rows-[minmax(0,1fr)]"
            style={{
                gridTemplateColumns: cols,
                transition: dragging ? 'none' : 'grid-template-columns .28s cubic-bezier(.4,0,.2,1)',
            }}
        >
            <aside className="relative w-full h-full min-w-0 min-h-0 overflow-hidden bg-[var(--panel)]">

                <header className={`absolute inset-x-0 top-0 z-30 flex items-center gap-2.5 px-4 py-3.5 transition-[background-color,backdrop-filter,border-color] duration-300 ${
                    threadScrolled
                        ? 'border-b border-[var(--line-soft)] bg-[color-mix(in_srgb,var(--panel)_72%,transparent)] backdrop-blur-xl backdrop-saturate-150'
                        : 'border-b border-transparent bg-transparent'
                }`}>
                    <span className="brand-mark">
                        <img src="/favicon.svg" alt="" />
                    </span>
                    <span className="font-mono font-semibold text-[15px]">litmus
                        <span className="text-[var(--violet)]">.</span>
                    </span>

                    {lockedProblem && (
                        <span className="hidden lg:flex min-w-0 items-center gap-1.5 text-[13px] text-[var(--muted)]">
                            <span className="text-[var(--line)]">/</span>
                            <span className="truncate max-w-[280px]">{lockedProblem}</span>
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--faint)]"><path d="m6 9 6 6 6-6"/></svg>
                        </span>
                    )}

                    <div className="ml-auto flex items-center gap-1.5">
                        {stage !== 'idle' && (
                            <button
                                onClick={startOver}
                                className="rounded-md px-2.5 py-1.5 text-[12px] text-[var(--faint)] transition-colors hover:bg-[var(--panel-3)] hover:text-[var(--text)]"
                            >
                                + new problem
                            </button>
                        )}

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

                <div
                    onScroll={(e) => setThreadScrolled(e.currentTarget.scrollTop > 8)}
                    className="h-full overflow-y-auto px-4 pt-20 pb-44"
                >
                    {/* the column is capped, not the scroller, so the wheel works over the margins too */}
                    <div className={`flex flex-col gap-5 ${layout === 'thread' ? 'w-full max-w-[820px] mx-auto' : ''}`}>

    {messages.map((m, i) => {
                            // Only the newest litmus bubble pulses; older ones are settled history.
                            const isCurrent = i === messages.length - 1

                            if (m.role === 'user') return (
                                <div key={i} className="self-end flex max-w-[85%] flex-col items-end gap-2">
                                    {m.pasted && (
                                        <PastedCard text={m.pasted} onOpen={() => setExpanded({ text: m.pasted! })} />
                                    )}
                                    {m.text && (
                                        <div className="rounded-[12px_12px_3px_12px] border border-[var(--line)] bg-[var(--panel-3)] px-3.5 py-2.5 text-[14px]">
                                            {m.text}
                                        </div>
                                    )}
                                </div>
                            )

                            // One litmus message, one bubble. options and choices are
                            // attachments under the text, not message kinds of their own.
                            const [lead, rest] = m.text ? splitReply(m.text) : ['', null]

                            return (
                                <div key={i} className="fade-in self-start max-w-[92%] flex flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className={`${isCurrent ? 'pulse-ring ' : ''}grid place-items-center w-[17px] h-[17px] rounded-full bg-[var(--violet)] text-white font-mono text-[9px] font-bold`}>L</span>
                                        <span className="font-mono text-[11px] text-[var(--faint)]">litmus</span>
                                    </div>

                                    {lead && (
                                        <p className="m-0 text-[14px] text-[var(--muted)] leading-relaxed whitespace-pre-line">{lead}</p>
                                    )}

                                    {rest && (
                                        <PastedCard
                                            text={rest}
                                            label="EXPLANATION"
                                            prose
                                            onOpen={() => setExpanded({ text: rest, label: 'EXPLANATION', prose: true })}
                                        />
                                    )}

                                    {m.options && (
                                        <>
                                            <div className="mt-1 flex flex-col gap-1.5">
                                                {m.options.map((o, j) => (
                                                    <OptionRow
                                                        key={o.id}
                                                        id={o.id}
                                                        label={o.label}
                                                        hint={o.hint}
                                                        off={o.off}
                                                        active={picked === o.id}
                                                        locked={!isCurrent}
                                                        delay={j * 70}
                                                        onPick={handlePick}
                                                    />
                                                ))}
                                            </div>
                                            <p className="m-0 text-[12px] text-[var(--faint)]">
                                                the pane on the right shows your choice and updates as you change it
                                            </p>
                                        </>
                                    )}

                                    {m.choices && (
                                        <div className="mt-1 flex gap-1.5">
                                            {m.choices.map((b, j) => (
                                                <OptionRow
                                                    key={b}
                                                    id={b}
                                                    label={b}
                                                    hint={BUTTON_CHOICES.find(c => c.id === b)?.hint}
                                                    locked={!isCurrent}
                                                    delay={280 + j * 70}
                                                    onPick={handleClick}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        })}

                
                        {thinking && (
                            <div className="self-start flex flex-col gap-2">
                                <div className="dots" aria-label="thinking"><i /><i /><i /></div>
                                {phrase && (
                                    <span key={phrase} className="fade-in font-mono text-[12px] text-[var(--faint)]">{phrase}</span>
                                )}
                            </div>
                        )}

                        {errorMsg && (
                            <div className="rounded-lg border border-[var(--red)]/40 bg-[var(--red)]/10 px-3 py-2 text-[13px] text-[var(--red)]">
                                {errorMsg}
                            </div>
                        )}

                        <div ref={bottomRef} />
                    </div>
                </div>

                <div className={`absolute inset-x-0 bottom-0 z-30 px-3.5 pb-5 pt-10 pointer-events-none ${
                    layout === 'thread' ? 'mx-auto w-full max-w-[820px]' : ''
                }`}>
                    <div className="thread-fade pointer-events-none absolute inset-x-0 top-0 h-full" />
                    <div className="relative pointer-events-auto">
                    <div className={`rounded-[10px] border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2.5 flex flex-col gap-2 focus-within:border-[var(--violet-dim)] transition-opacity ${locked ? 'opacity-40 pointer-events-none' : ''}`}>
                        {pasted && (
                            <div className="pb-1">
                                <PastedCard
                                    text={pasted}
                                    onOpen={() => setExpanded({ text: pasted })}
                                    onRemove={() => setPasted(null)}
                                />
                            </div>
                        )}
                        <textarea
                            rows={2}
                            value={problem}
                            onPaste={onPaste}
                            onChange={(e) => setProblem(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitProblem() }
                            }}
                            disabled={locked}
                            placeholder={describing
                                ? 'camelCase methods, comments instead of docstrings, no type hints…'
                                : 'What should Litmus build?'}
                            spellCheck={false}
                            className="w-full min-h-[44px] resize-none bg-transparent text-[14px] text-[var(--text)] placeholder:text-[var(--faint)] focus:outline-none"
                        />
                        <div className="flex items-center justify-between gap-2.5">
                            <span className="font-mono text-[10.5px] text-[var(--faint)]">
                                {describing ? '⏎ to restyle · describe the rules, or paste code' : '⏎ to send'}
                            </span>
                            <button
                                onClick={submitProblem}
                                disabled={busy || restyling || (!problem.trim() && !pasted)}
                                className="rounded-md bg-[var(--violet)] px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-[var(--violet-dim)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {busy ? 'Generating…' : restyling ? 'Restyling…' : describing ? 'Restyle' : 'Send'}
                    </button>
                        </div>
                    </div>
                    </div>
                </div>

            </aside>

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
                <span className="absolute inset-y-0 -left-[5px] -right-[5px]" />
                <span className={`block h-full w-full rounded-full transition-colors duration-200 ${
                    dragging ? 'bg-[var(--violet)]' : 'bg-transparent group-hover:bg-[var(--violet)]/60'
                }`} />
            </div>

            <main className="hidden lg:flex flex-col min-w-0 min-h-0 overflow-hidden p-2 pl-0">

                <div
                    style={{ ['--pane-accent' as string]: paneAccent }}
                    className={`pane flex flex-1 min-h-0 flex-col overflow-hidden rounded-2xl bg-[var(--panel)] ${
                        paneWorking ? 'is-working' : paneLit ? 'is-lit' : ''
                    }`}
                >

                <header className="relative shrink-0 flex items-center px-4 py-2.5 border-b border-[var(--line-soft)]">

                    <span className="hidden xl:flex items-center gap-1.5 font-mono text-[11px] text-[var(--faint)]">
                        <span>python:3.12-slim</span>
                        <span className="text-[var(--line)]">·</span>
                        <span>no network</span>
                    </span>

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
                            {restyling              ? 'restyling'
                           : stage === 'idle'       ? 'idle'
                           : stage === 'styling'    ? 'style'
                           : stage === 'accepted'   ? 'style set'
                           : stage === 'planning'   ? 'blueprint'
                           : stage === 'approved'   ? 'approved'
                           :                          'done'}
                        </span>
                    </span>

                    <span className="ml-auto flex items-center gap-1">
                        <Tip label="Copy solution">
                            <button
                                onClick={() => copy('code')}
                                disabled={!code}
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
                        <Tip label="Copy diff">
                            <button
                                onClick={() => copy('tests')}
                                disabled={!diff}
                                aria-label="Copy diff"
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

                <div className={`flex flex-1 min-h-0 flex-col ${
                    code !== null ? 'overflow-hidden' : 'overflow-y-auto p-5'
                }`}>

                    {code === null && (
                    <div className="h-full min-h-[300px] flex flex-col items-center justify-center gap-5 text-center">
                        <div className="scanbox w-[190px] h-[112px] rounded-[10px] border border-[var(--line)] bg-[var(--panel)]">
                            <div className="absolute inset-4 flex flex-col gap-2.5">
                                <i className="h-1.5 rounded-sm bg-[var(--line-soft)]" />
                                <i className="h-1.5 w-[76%] rounded-sm bg-[var(--line-soft)]" />
                                <i className="h-1.5 w-[54%] rounded-sm bg-[var(--line-soft)]" />
                                <i className="h-1.5 w-[84%] rounded-sm bg-[var(--line-soft)]" />
                            </div>
                        </div>
                        <div className="flex w-[420px] max-w-full flex-col items-center gap-2.5">
                            <h3 className="text-[15px] font-semibold text-[var(--text)]">
                                {stage === 'planning' ? 'Awaiting blueprint lock' : 'Sandbox idle'}
                            </h3>
                            <p key={TIPS[tipIndex]}
                               className="fade-in m-0 min-h-[17px] text-center text-[13px] text-[var(--tip)]">
                                {TIPS[tipIndex]}
                            </p>
                        </div>
                    </div>
                    )}

                    {code !== null && (
                        <div className="fade-in flex h-full min-w-0 min-h-0 flex-col overflow-hidden">
                            <div className="flex items-center border-b border-[var(--line-soft)] bg-[var(--panel-2)]">
                                <span className="border-b-[1.5px] border-[var(--violet)] bg-[var(--panel)] px-3.5 py-2 font-mono text-[11.5px] text-[var(--text)]">
                                    sample.py
                                </span>
                                <span className="ml-auto pr-3.5 font-mono text-[10.5px] text-[var(--faint)]">
                                    {restyling ? 'restyling…' : diff ? 'your style' : 'default'}
                                </span>
                            </div>

                            <div className="relative min-h-0 flex-1 overflow-auto bg-[var(--panel)]">
                                <pre className="m-0 p-4 font-mono text-[12.5px] leading-[1.62] text-[var(--text)]">
                                    <code dangerouslySetInnerHTML={{ __html: highlighted }} />
                                </pre>
                                {restyling && (
                                    <div className="absolute inset-0 grid place-items-center bg-[var(--panel)]/78 backdrop-blur-[1px]">
                                        <span className="dots flex gap-1.5"><i /><i /><i /></span>
                                    </div>
                                )}
                            </div>

                            <div className="border-t border-[var(--line)] bg-[#0c0c0f]">
                                <div className="flex items-center gap-2 border-b border-[var(--line-soft)] px-3.5 py-1.5">
                                    <b className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--faint)]">terminal</b>
                                    <span className="ml-auto font-mono text-[10.5px] text-[var(--faint)]">
                                        {diff ? `${diff.split('\n').length - 1} lines` : 'idle'}
                                    </span>
                                </div>
                                <div className="h-[186px] overflow-auto">
                                    {diff ? (
                                        <pre className="m-0 p-4 font-mono text-[12px] leading-[1.6]">
                                            {diff.split('\n').map((line, i) => (
                                                <div key={i} className={
                                                    line.startsWith('+++') || line.startsWith('---') ? 'text-[var(--faint)]'
                                                  : line.startsWith('@@')  ? 'text-[var(--violet)]'
                                                  : line.startsWith('+')   ? 'text-[var(--green)]'
                                                  : line.startsWith('-')   ? 'text-[var(--red)]'
                                                  :                          'text-[var(--muted)]'
                                                }>{line || '\u00a0'}</div>
                                            ))}
                                        </pre>
                                    ) : (
                                        <p className="m-0 p-4 font-mono text-[11.5px] text-[var(--faint)]">
                                            nothing to show yet; the diff appears after a restyle
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

            </div>
                </div>
            </main>

            {expanded !== null && (
                <PastedOverlay
                    text={expanded.text}
                    label={expanded.label}
                    prose={expanded.prose}
                    onClose={() => setExpanded(null)}
                />
            )}
            {styleView !== null && (
                <StyleOverlay
                    view={styleView}
                    onOpen={openStyle}
                    onBack={() => setStyleView(v => v?.view === 'detail' ? { view: 'list', styles: v.styles } : v)}
                    onClose={() => setStyleView(null)}
                    onAccept={acceptStyle}
                />
            )}
        </div>
    )
}