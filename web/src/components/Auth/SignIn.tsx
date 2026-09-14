type AuthMode = 'signUp' | 'signIn' | 'oauth';
 
import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router"
import { supabase } from "../../lib/supabase";

// The mark is inlined rather than imported — it also lives in Landing.tsx.
function Mark({ size = 22, fill = "#ffffff" }: { size?: number; fill?: string }) {
    return (
        <svg viewBox="165.6 157.7 693.1 693.1" width={size} height={size} role="img" aria-label="Litmus">
            <path fill={fill} d="M 499.26 818.41 C498.64,819.02 491.36,819.00 487.00,818.37 C485.62,818.17 480.45,817.53 475.50,816.95 C396.96,807.74 320.08,764.42 268.71,700.45 C232.77,655.70 210.39,602.61 202.33,543.00 C199.79,524.24 199.78,480.56 202.30,464.00 C211.82,401.64 232.72,352.75 270.16,305.33 C279.83,293.08 306.18,267.29 320.68,255.87 C362.96,222.61 410.73,201.78 463.79,193.47 C481.61,190.68 500.00,189.24 500.00,190.64 C500.00,191.15 497.77,198.24 495.04,206.39 C492.31,214.54 490.13,221.50 490.19,221.86 C490.26,222.21 490.06,223.18 489.74,224.00 C487.59,229.55 479.41,259.46 472.52,287.00 C462.82,325.74 452.59,377.42 450.05,400.50 C449.51,405.45 448.18,415.80 447.10,423.50 C441.81,461.07 439.71,513.37 442.02,549.52 C443.45,571.84 445.79,596.69 447.57,608.50 C448.39,614.00 449.11,619.40 449.16,620.50 C449.26,622.73 452.24,640.98 454.64,654.00 C456.48,664.02 463.97,697.87 467.03,710.00 C468.21,714.67 469.41,719.62 469.70,721.00 C472.30,733.36 489.20,788.70 496.31,808.16 C498.26,813.47 499.58,818.08 499.26,818.41 ZM 824.00 490.62 C824.00,498.33 823.68,500.96 822.75,500.86 C819.52,500.51 815.38,499.58 801.00,495.99 C723.36,476.57 657.13,438.91 602.98,383.37 C558.31,337.55 527.73,284.23 513.01,226.50 C508.54,208.94 505.33,191.33 506.41,190.26 C506.83,189.84 512.64,189.61 519.34,189.73 C599.93,191.28 673.90,222.90 731.60,280.44 C748.56,297.35 759.16,310.25 771.39,328.84 C794.86,364.52 809.49,399.65 818.05,440.83 C821.19,455.95 824.00,479.46 824.00,490.62 ZM 559.73 815.48 C548.70,817.29 538.09,818.25 524.47,818.69 L 504.99 819.32 L 505.47 816.41 C509.56,791.80 512.70,778.84 519.03,760.50 C533.29,719.16 552.15,685.14 580.83,649.00 C597.08,628.52 632.50,595.47 657.09,577.83 C693.77,551.52 744.55,527.45 787.91,515.84 C805.33,511.17 823.42,507.21 824.16,507.89 C824.53,508.23 824.42,514.58 823.92,522.00 C821.39,560.02 814.48,590.32 800.33,625.50 C793.99,641.25 782.52,662.50 771.72,678.50 C746.69,715.57 718.97,743.03 681.19,768.15 C673.87,773.02 667.74,777.00 667.57,777.00 C667.40,777.00 663.04,779.33 657.88,782.18 C628.74,798.28 595.13,809.68 559.73,815.48 Z"/>
        </svg>
    )
}

// Real provider marks, not dashed placeholder boxes.
const GoogleMark = () => (
    <svg viewBox="0 0 24 24" width="17" height="17" className="shrink-0" aria-hidden="true">
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9Z"/>
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8H1.4v3.1A12 12 0 0 0 12 24Z"/>
        <path fill="#FBBC05" d="M5.4 14.3a7.1 7.1 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1Z"/>
        <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.5-3.5A12 12 0 0 0 1.4 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z"/>
    </svg>
)
const AppleMark = () => (
    <svg viewBox="0 0 24 24" width="17" height="17" className="shrink-0" fill="currentColor" aria-hidden="true">
        <path d="M16.4 12.8c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.8-3.5.8-.7 0-1.8-.8-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.2-2.6-.1 0-2.4-.9-2.4-3.5ZM14.2 5.9c.6-.8 1-1.9.9-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-.9 2.9 1 .1 2-.5 2.7-1.3Z"/>
    </svg>
)
const GitHubMark = () => (
    <svg viewBox="0 0 24 24" width="17" height="17" className="shrink-0" fill="currentColor" aria-hidden="true">
        <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C16.1 5.2 17.1 5.5 17.1 5.5c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5Z"/>
    </svg>
)

const HEADLINE = 'Your work, where you left it.'

// The lines that rotate underneath, one true claim about the product each.
const LINES = [
    "Sign in to save your sessions and styles. Everything you've worked through stays put: the transcript, the code, and the tests that proved it.",
    "Every line of code Litmus hands you ran in a sealed container first. Nothing is called working until it ran.",
    "Quick fix writes it and proves it. The tutor lands next: it makes you write it, and still proves it.",
    "Your lecturer's tests and your lecturer's style, saved once and reused all semester.",
]

const LINE_MS = 5200   // how long a line holds before it goes
const FADE_MS = 320    // the crossfade — long enough to read as a fade, short enough not to stall

const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

function useTypedHeadline(text: string) {
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

function useRotatingLine(lines: string[], start: boolean) {
    const [index, setIndex] = useState(0)
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        if (!start) return
        setVisible(true)
        if (prefersReducedMotion() || lines.length < 2) return

        const id = window.setInterval(() => {
            setVisible(false)
            window.setTimeout(() => {
                setIndex(i => (i + 1) % lines.length)
                setVisible(true)
            }, FADE_MS)
        }, LINE_MS)
        return () => window.clearInterval(id)
    }, [start, lines])

    return { line: lines[index], visible }
}

type Provider = 'google' | 'apple' | 'github'

export default function SignIn() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [busy, setBusy] = useState<Provider | 'email' | null>(null)
    const [errorMsg, setErrorMsg] = useState('')
    // Inside the component body: a hook at module scope runs before React exists.
    const navigate = useNavigate()
    // One source of truth for the mode.
    const [authMode, setAuthMode] = useState<AuthMode>("signIn")
    const isSignUp = authMode === "signUp"

    // A guest session carries into the new account on sign-in.
    const [guestSession] = useState<{ title: string } | null>(null)

    // The subtitle only starts once the headline has finished typing.
    const { shown: headline, done: headlineDone } = useTypedHeadline(HEADLINE)
    const { line, visible: lineVisible } = useRotatingLine(LINES, headlineDone)

    // The seam: every button lands here, so wiring Supabase is one function body.
    async function signIn(provider: Provider | 'email') {
        setErrorMsg('')
        setBusy(provider)
        try {
            if( provider != 'email'){
                const{error} = await supabase.auth.signInWithOAuth({
                    provider : provider,
                    options : {redirectTo : `${window.location.origin}/sandbox`},
                })
                if (error){
                    setBusy(null)
                    setErrorMsg(error.message)
                    return;
                }
                return;
            }

            if (authMode === "signUp") {
                const{data, error} = await supabase.auth.signUp({
                    email, password
                });
                if (error){
                    setErrorMsg(error.message)
                    setBusy(null)
                    return;
                }
                if (!data.session) {
                    setErrorMsg('Check your email to confirm your account.')
                    setBusy(null)
                    return
                }
                navigate('/sandbox');
                return;
            }

            const {error} = await supabase.auth.signInWithPassword({
                email, password
            });
            if(error){
                setErrorMsg(error.message)
                setBusy(null)
                return
            }
            navigate('/sandbox');
        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'Could not sign in.')
        } finally {
            setBusy(null)
        }
    }

    return (
        <div className="grid min-h-dvh grid-cols-1 bg-(--bg) lg:grid-cols-[minmax(0,560px)_1fr]">

            <div className="mesh relative hidden flex-col justify-between p-12 lg:flex">

                <Link to="/" className="relative z-2 flex items-center gap-2.5">
                    <Mark />
                    <span className="font-mono text-[15px] font-semibold text-white">
                        litmus<span className="text-[#c4b5fd]">.</span>
                    </span>
                </Link>

                <div className="relative z-2 flex max-w-[420px] flex-col gap-5">
                    <h1 className="display flex min-h-[84px] items-center text-[32px] text-white">
                        {headline}
                        <span
                            aria-hidden="true"
                            className={`ml-1 inline-block h-[.82em] w-[.5em] bg-white ${
                                headlineDone ? 'animate-[caretBlink_1.06s_steps(1,end)_infinite]' : ''
                            }`}
                        />
                    </h1>

                    <p
                        className={`min-h-[102px] text-[15px] leading-[1.7] text-white/70 text-pretty transition-opacity duration-300 ${
                            lineVisible ? 'opacity-100' : 'opacity-0'
                        }`}
                    >
                        {line}
                    </p>

                    {guestSession && (
                        <div className="flex items-start gap-2.5 rounded-[10px] border border-(--glass-line) bg-(--glass-strong) px-3.5 py-3 backdrop-blur-lg">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--green)" />
                            <span className="text-[12.5px] leading-[1.6] text-white/82">
                                Your guest session, <span className="font-mono text-[12px]">{guestSession.title}</span>, will attach to this account.
                            </span>
                        </div>
                    )}
                </div>

                <span className="relative z-2 font-mono text-[11px] text-white/42">
                    v0 &nbsp;·&nbsp; Python for now &nbsp;·&nbsp; built by a student
                </span>
            </div>
            <div className="flex flex-col items-center justify-center px-6 py-12 sm:px-14">
                <div className="flex w-full max-w-[380px] flex-col gap-5">

                    <Link to="/" className="mb-2 flex items-center gap-2.5 lg:hidden">
                        <Mark size={20} fill="#8b5cf6" />
                        <span className="font-mono text-[15px] font-semibold text-(--text)">
                            litmus<span className="text-(--violet)">.</span>
                        </span>
                    </Link>

                    <div className="flex flex-col gap-1.5">
                        <h2 className="display text-[22px] text-(--text)">{isSignUp ? 'Create an account' : 'Sign in to Litmus'}</h2>
                        <span className="text-[13px] text-(--muted)">
                            No wizard, no setup. You land straight in the sandbox.
                        </span>
                    </div>

                    <div className="flex flex-col gap-2.5">
                        <ProviderButton onClick={() => signIn('google')} busy={busy === 'google'} disabled={busy !== null}>
                            <GoogleMark /> Continue with Google
                        </ProviderButton>
                        <ProviderButton onClick={() => signIn('apple')} busy={busy === 'apple'} disabled={busy !== null}>
                            <AppleMark /> Continue with Apple
                        </ProviderButton>
                        <ProviderButton onClick={() => signIn('github')} busy={busy === 'github'} disabled={busy !== null}>
                            <GitHubMark /> Continue with GitHub
                        </ProviderButton>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className="h-px flex-1 bg-(--line-soft)" />
                        <span className="font-mono text-[10.5px] tracking-[.04em] text-(--faint)">or</span>
                        <span className="h-px flex-1 bg-(--line-soft)" />
                    </div>

                    <form
                        onSubmit={e => { e.preventDefault(); signIn('email') }}
                        className="flex flex-col gap-3.5"
                    >
                        <label className="flex flex-col gap-1.5">
                            <span className="font-mono text-[10.5px] tracking-[.04em] text-(--faint)">EMAIL</span>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                autoComplete="email"
                                placeholder="you@school.edu"
                                className="h-11 rounded-[10px] border border-(--line) bg-(--panel-2) px-3.5 text-[14px] text-(--text) outline-none transition-colors placeholder:text-(--faint) focus:border-(--violet)"
                            />
                        </label>

                        <label className="flex flex-col gap-1.5">
                            <span className="font-mono text-[10.5px] tracking-[.04em] text-(--faint)">PASSWORD</span>
                            <div className="flex h-11 items-center rounded-[10px] border border-(--line) bg-(--panel-2) px-3.5 transition-colors focus-within:border-(--violet)">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    className="min-w-0 flex-1 bg-transparent text-[14px] text-(--text) outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(s => !s)}
                                    className="ml-2 shrink-0 text-[12px] text-(--faint) transition-colors hover:text-(--text)"
                                >
                                    {showPassword ? 'hide' : 'show'}
                                </button>
                            </div>
                        </label>

                        {errorMsg && (
                            <p className="m-0 rounded-lg border border-(--red)/40 bg-(--red)/10 px-3 py-2 font-mono text-[12px] text-(--red)">
                                {errorMsg}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={busy !== null || !email.trim() || !password}
                            className="h-11 rounded-[10px] bg-(--violet) text-[14px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {busy === 'email'
                                ? (isSignUp ? 'Creating account…' : 'Signing in…')
                                : (isSignUp ? 'Create account' : 'Sign in')}
                        </button>
                    </form>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[12.5px] text-(--muted)">
                            {isSignUp ? 'Already have an account? ' : 'New here? '}
                            <button
                                type="button"
                                onClick={() => setAuthMode(m => m === 'signUp' ? 'signIn' : 'signUp')}
                                className="text-(--violet) hover:underline"
                            >
                                {isSignUp ? 'Sign in' : 'Create an account'}
                            </button>
                        </span>
                        <span className="text-[12.5px] text-(--faint)">Forgot password?</span>
                    </div>

                    <span className="mt-1 text-center font-mono text-[10.5px] leading-[1.7] text-(--faint)">
                        Sign-in runs on Supabase. Your password never touches Litmus&rsquo;s servers.
                    </span>
                </div>
            </div>
        </div>
    )
}

function ProviderButton({ onClick, busy, disabled, children }: {
    onClick: () => void; busy: boolean; disabled: boolean; children: React.ReactNode
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="flex h-11.5 items-center gap-3 rounded-[10px] border border-(--line) bg-(--panel-2) px-4 text-[14px] text-(--text) transition-colors hover:border-(--faint) hover:bg-(--panel-3) disabled:cursor-not-allowed disabled:opacity-50"
        >
            {busy ? <span className="dots" aria-label="signing in"><i /><i /><i /></span> : children}
        </button>
    )
}
