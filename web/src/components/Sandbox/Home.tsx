import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { WORKSPACE } from "../../lib/routes"

const HEADLINE = 'Prove it ran.'

// Real homework, not marketing copy — the placeholder cycles through these.
const PROMPTS = [
    "Write a Stack class with push, pop, and a peek that raises on empty…",
    "My binary search returns -1 for a value I know is in the array…",
    "Reverse a linked list without recursion, explicit types throughout…",
    "Here's my merge sort. It works on 4 items and hangs on 5…",
    "Build a grade calculator with strict PEP 8 and no external libraries…",
]

const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

function useTypedOnce(text: string) {
    const [shown, setShown] = useState('')
    const [done, setDone] = useState(false)

    useEffect(() => {
        if (prefersReducedMotion()) { setShown(text); setDone(true); return }
        let i = 0
        let timer: number
        const step = () => {
            setShown(text.slice(0, i))
            if (i++ <= text.length) timer = window.setTimeout(step, 46 + Math.random() * 44)
            else setDone(true)
        }
        timer = window.setTimeout(step, 260)
        return () => window.clearTimeout(timer)
    }, [text])

    return { shown, done }
}

function useRotatingPlaceholder(paused: boolean) {
    const [shown, setShown] = useState('')
    const timer = useRef<number | undefined>(undefined)

    useEffect(() => {
        if (paused) return
        if (prefersReducedMotion()) { setShown(PROMPTS[0]); return }

        let p = 0
        const typeIn = () => {
            const t = PROMPTS[p]
            let i = 0
            const step = () => {
                setShown(t.slice(0, i))
                if (i++ <= t.length) timer.current = window.setTimeout(step, 22 + Math.random() * 26)
                else timer.current = window.setTimeout(eraseOut, 2100)
            }
            step()
        }
        const eraseOut = () => {
            const t = PROMPTS[p]
            let i = t.length
            const step = () => {
                setShown(t.slice(0, i))
                if (i-- >= 0) timer.current = window.setTimeout(step, 11)
                else { p = (p + 1) % PROMPTS.length; timer.current = window.setTimeout(typeIn, 260) }
            }
            step()
        }
        typeIn()
        return () => window.clearTimeout(timer.current)
    }, [paused])

    return paused ? '' : shown
}

// Falling glyphs behind the hero. Canvas rather than DOM — a few hundred
// characters a second would thrash the layout engine.
function MatrixRain() {
    const ref = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        const canvas = ref.current
        if (!canvas || prefersReducedMotion()) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const GLYPHS = '01{}[]()<>/*+-=;:.$#abcdefghijklmnopqrstuvwxyz'
        const SIZE = 14
        // The four knobs. TRAIL is inverted — lower means the wash is weaker, so
        // glyphs linger and more of them are lit at once.
        const GLYPH = 'rgba(139,92,246,.46)'
        const HEAD = 'rgba(63,185,80,.85)'
        const HEAD_ODDS = 0.972
        const TRAIL = 'rgba(8,8,10,.11)'
        let cols = 0
        let drops: number[] = []
        let raf = 0

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2)
            canvas.width = canvas.offsetWidth * dpr
            canvas.height = canvas.offsetHeight * dpr
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            cols = Math.ceil(canvas.offsetWidth / SIZE)
            // negative starts, so the columns arrive staggered rather than as a wall
            drops = Array.from({ length: cols }, () => Math.random() * -40)
        }

        let last = 0
        const draw = (t: number) => {
            raf = requestAnimationFrame(draw)
            // ~18fps on purpose: the rain reads better slow, and costs a third as much
            if (t - last < 55) return
            last = t

            const { offsetWidth: w, offsetHeight: h } = canvas
            // a translucent wash rather than a clear — this is what leaves the trails
            ctx.fillStyle = TRAIL
            ctx.fillRect(0, 0, w, h)
            ctx.font = `${SIZE}px ${getComputedStyle(canvas).getPropertyValue('--font-mono') || 'monospace'}`

            for (let i = 0; i < cols; i++) {
                const y = drops[i] * SIZE
                ctx.fillStyle = Math.random() > HEAD_ODDS ? HEAD : GLYPH
                ctx.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], i * SIZE, y)
                if (y > h && Math.random() > 0.975) drops[i] = 0
                drops[i]++
            }
        }

        resize()
        window.addEventListener('resize', resize)
        raf = requestAnimationFrame(draw)
        return () => {
            cancelAnimationFrame(raf)
            window.removeEventListener('resize', resize)
        }
    }, [])

    // opacity is the one knob for how loud the rain is next to the composer
    return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-55" />
}

export default function SandboxHome() {
    const navigate = useNavigate()
    const [problem, setProblem] = useState('')
    const [focused, setFocused] = useState(false)

    const { shown: headline, done: headlineDone } = useTypedOnce(HEADLINE)
    const placeholder = useRotatingPlaceholder(focused || problem.length > 0)

    const canSubmit = problem.trim().length > 0

    function submit() {
        if (!canSubmit) return
        navigate(WORKSPACE, { state: { prompt: problem.trim() } })
    }

    return (
        <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-y-auto bg-(--bg) px-6 py-16">
            <MatrixRain />

            <div className="relative z-2 flex w-full max-w-[760px] flex-col items-center">

                <h1 className="display flex min-h-[58px] items-center text-center text-[38px] text-white md:text-[58px]">
                    {headline}
                    <span
                        aria-hidden="true"
                        className={`ml-1 inline-block h-[.82em] w-[.5em] bg-white ${
                            headlineDone ? 'animate-[caretBlink_1.06s_steps(1,end)_infinite]' : ''
                        }`}
                    />
                </h1>

                <div className="mt-8 w-full rounded-[20px] border border-(--glass-line) bg-(--glass) px-4.5 pt-4.5 pb-3 shadow-[0_22px_60px_rgba(0,0,0,.42)] backdrop-blur-[24px] backdrop-saturate-[1.3] transition-[border-color,box-shadow] duration-200 focus-within:border-(--violet)/75 focus-within:shadow-[0_0_0_3px_rgba(139,92,246,.18),0_22px_60px_rgba(0,0,0,.42)]">
                    <textarea
                        value={problem}
                        onChange={e => setProblem(e.target.value)}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
                        }}
                        rows={2}
                        placeholder={placeholder}
                        aria-label="Your problem or your code"
                        className="w-full resize-none bg-transparent text-[15px] leading-[1.5] text-white outline-none placeholder:text-white/42"
                    />

                    <div className="mt-1.5 flex items-center gap-2">
                        <span className="flex items-center gap-1.5 rounded-lg border border-(--glass-line) bg-white/4 px-2.5 py-1 text-[12.5px] text-white/55">
                            Python <span className="font-mono text-[10px] text-white/35">· only, for now</span>
                        </span>
                        <button
                            type="button"
                            onClick={submit}
                            disabled={!canSubmit}
                            aria-label="Start"
                            className="ml-auto grid h-8 w-8 place-items-center rounded-[9px] bg-(--violet) text-white shadow-[0_4px_16px_rgba(139,92,246,.5)] transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                        >
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                        </button>
                    </div>
                </div>

            </div>
        </div>
    )
}
