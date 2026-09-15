import { useEffect, useRef, useState } from "react"
import { Link } from "react-router"

// Fades a section up as it scrolls into view. Two deliberate choices:
// `still` keeps the scroll signal but drops the fade-up, for sections that move their own parts.
function Reveal({ children, still = false }: { children: React.ReactNode; still?: boolean }) {
    const ref = useRef<HTMLDivElement>(null)
    const [shown, setShown] = useState(false)

    useEffect(() => {
        const el = ref.current
        if (!el) return
        const io = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setShown(true)
                    io.disconnect()
                }
            },
            { rootMargin: "0px 0px -12% 0px" },
        )
        io.observe(el)
        return () => io.disconnect()
    }, [])

    return (
        <div
            ref={ref}
            data-shown={shown}
            className={still ? undefined : `transition-all duration-700 ease-out motion-reduce:transition-none ${
                shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
            }`}
        >
            {children}
        </div>
    )
}
// The mark is used four times; a local component keeps the 2KB path in one place.
function Mark({ size = 22, fill = "#ffffff", className = "" }: { size?: number; fill?: string; className?: string }) {
    return (
        <svg viewBox="165.6 157.7 693.1 693.1" width={size} height={size} className={className} role="img" aria-label="Litmus">
            <path fill={fill} d="M 499.26 818.41 C498.64,819.02 491.36,819.00 487.00,818.37 C485.62,818.17 480.45,817.53 475.50,816.95 C396.96,807.74 320.08,764.42 268.71,700.45 C232.77,655.70 210.39,602.61 202.33,543.00 C199.79,524.24 199.78,480.56 202.30,464.00 C211.82,401.64 232.72,352.75 270.16,305.33 C279.83,293.08 306.18,267.29 320.68,255.87 C362.96,222.61 410.73,201.78 463.79,193.47 C481.61,190.68 500.00,189.24 500.00,190.64 C500.00,191.15 497.77,198.24 495.04,206.39 C492.31,214.54 490.13,221.50 490.19,221.86 C490.26,222.21 490.06,223.18 489.74,224.00 C487.59,229.55 479.41,259.46 472.52,287.00 C462.82,325.74 452.59,377.42 450.05,400.50 C449.51,405.45 448.18,415.80 447.10,423.50 C441.81,461.07 439.71,513.37 442.02,549.52 C443.45,571.84 445.79,596.69 447.57,608.50 C448.39,614.00 449.11,619.40 449.16,620.50 C449.26,622.73 452.24,640.98 454.64,654.00 C456.48,664.02 463.97,697.87 467.03,710.00 C468.21,714.67 469.41,719.62 469.70,721.00 C472.30,733.36 489.20,788.70 496.31,808.16 C498.26,813.47 499.58,818.08 499.26,818.41 ZM 824.00 490.62 C824.00,498.33 823.68,500.96 822.75,500.86 C819.52,500.51 815.38,499.58 801.00,495.99 C723.36,476.57 657.13,438.91 602.98,383.37 C558.31,337.55 527.73,284.23 513.01,226.50 C508.54,208.94 505.33,191.33 506.41,190.26 C506.83,189.84 512.64,189.61 519.34,189.73 C599.93,191.28 673.90,222.90 731.60,280.44 C748.56,297.35 759.16,310.25 771.39,328.84 C794.86,364.52 809.49,399.65 818.05,440.83 C821.19,455.95 824.00,479.46 824.00,490.62 ZM 559.73 815.48 C548.70,817.29 538.09,818.25 524.47,818.69 L 504.99 819.32 L 505.47 816.41 C509.56,791.80 512.70,778.84 519.03,760.50 C533.29,719.16 552.15,685.14 580.83,649.00 C597.08,628.52 632.50,595.47 657.09,577.83 C693.77,551.52 744.55,527.45 787.91,515.84 C805.33,511.17 823.42,507.21 824.16,507.89 C824.53,508.23 824.42,514.58 823.92,522.00 C821.39,560.02 814.48,590.32 800.33,625.50 C793.99,641.25 782.52,662.50 771.72,678.50 C746.69,715.57 718.97,743.03 681.19,768.15 C673.87,773.02 667.74,777.00 667.57,777.00 C667.40,777.00 663.04,779.33 657.88,782.18 C628.74,798.28 595.13,809.68 559.73,815.48 Z"/>
        </svg>
    )
}

// The avatar that fronts every litmus turn — same anatomy as the app's thread.
function LitmusTag() {
    return (
        <div className="flex items-center gap-2">
            <span className="grid place-items-center w-[19px] h-[19px] rounded-full bg-(--violet) text-white font-mono text-[9.5px] font-bold">L</span>
            <span className="font-mono text-[11.5px] text-(--faint)">litmus</span>
        </div>
    )
}

// Section eyebrow + heading + dek. Repeated four times with the same rhythm.
function SectionHead({ eyebrow, eyebrowColor, title, children }:
    { eyebrow: string; eyebrowColor: string; title: string; children?: React.ReactNode }) {
    return (
        <>
            <span className={`font-mono text-[11px] tracking-[.1em] uppercase ${eyebrowColor}`}>{eyebrow}</span>
            <h2 className="display text-[27px] md:text-[36px] mt-4 text-center text-balance">{title}</h2>
            {children && (
                <p className="mt-4 max-w-[640px] text-[14px] md:text-[15px] leading-[1.7] text-(--muted) text-center text-pretty">{children}</p>
            )}
        </>
    )
}

// A user bubble, using the app's own 12/12/3/12 radius.
function UserTurn({ delay, green = false, children }: { delay: string; green?: boolean; children: React.ReactNode }) {
    return (
        <div
            className={`turn self-end max-w-[88%] md:max-w-[82%] px-4 py-3 rounded-[12px_12px_3px_12px] border text-[14px] md:text-[15px] leading-[1.55] text-(--text) ${
                green ? "border-(--green)/40 bg-(--green)/10" : "border-(--line) bg-(--panel-3)"
            }`}
            style={{ animationDelay: delay }}
        >
            {children}
        </div>
    )
}

function ScrollCue() {
    const [gone, setGone] = useState(false)

    useEffect(() => {
        const onScroll = () => setGone(window.scrollY > 80)
        onScroll()
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [])

    return (
        <a
            href="#how-it-works"
            aria-label="Scroll to how it works"
            className={`scroll-cue mt-12 grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white/55 transition-opacity duration-500 hover:border-white/35 hover:text-white ${
                gone ? 'pointer-events-none opacity-0' : 'opacity-100'
            }`}
        >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>
            </svg>
        </a>
    )
}

// The surface each section after the hero sits on: one step above the page, so
// the sections read as separate rather than one merged field of black.
function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`mx-auto w-full max-w-[1240px] rounded-[20px] md:rounded-[24px] border border-(--line-soft) bg-[#0d0d11] px-5 py-10 sm:px-8 md:px-10 md:py-14 lg:py-16 ${className}`}>
            {children}
        </div>
    )
}

// Header and dek on the left, the display on the right, inside the panel. Stacks
// below lg. The words slide in from the left and the display from the right.
function SplitSection({ id, eyebrow, eyebrowColor, title, children, display, after }: {
    id: string; eyebrow: string; eyebrowColor: string; title: string
    children?: React.ReactNode; display: React.ReactNode; after?: React.ReactNode
}) {
    return (
        <div id={id} className="px-5 md:px-14 pt-15 md:pt-20 lg:pt-27.5">
            <Panel>
                <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
                    <div className="split-from-left flex flex-col items-start">
                        <span className={`font-mono text-[11px] tracking-[.1em] uppercase ${eyebrowColor}`}>{eyebrow}</span>
                        <h2 className="display mt-4 text-[27px] md:text-[36px] lg:text-[40px] text-balance">{title}</h2>
                        {children && (
                            <p className="mt-4 max-w-[480px] text-[14px] md:text-[15.5px] leading-[1.7] text-(--muted) text-pretty">{children}</p>
                        )}
                    </div>
                    <div className="slide-in-right min-w-0" style={{ animationDelay: "120ms" }}>{display}</div>
                </div>
                {after && <div className="mt-14 md:mt-16">{after}</div>}
            </Panel>
        </div>
    )
}

const RECEIPT_CODE = (
    <div className="border border-(--line) rounded-[14px] bg-[#0b0b0e] overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 md:px-4.5 py-3 border-b border-(--line-soft) bg-(--panel)">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#8a8a99" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M4 19V5a2 2 0 0 1 2-2h11l3 3v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/></svg>
            <span className="font-mono text-[12px] md:text-[12.5px] text-(--text)">bounded_stack.py</span>
            <span className="font-mono text-[10.5px] md:text-[11px] text-(--faint) ml-auto">what you wrote</span>
        </div>

        <div className="overflow-x-auto py-4.5">
            <div className="font-mono text-[11px] md:text-[13.5px] leading-[1.95] w-max min-w-full">
                <div className="px-4 md:px-5.5 whitespace-pre"><span className="text-(--code-key)">class</span> <span className="text-(--code-fn)">BoundedStack</span>:</div>
                <div className="px-4 md:px-5.5 whitespace-pre">{'    '}<span className="text-(--code-key)">def</span> <span className="text-(--code-fn)">__init__</span>(<span className="text-(--code-key)">self</span>, capacity):</div>
                <div className="px-4 md:px-5.5 whitespace-pre">{'        '}<span className="text-(--code-key)">self</span>._capacity = capacity</div>
                <div className="px-4 md:px-5.5 whitespace-pre">{'        '}<span className="text-(--code-key)">self</span>._items = []</div>
                <div className="px-4 md:px-5.5 whitespace-pre">{' '}</div>
                <div className="px-4 md:px-5.5 whitespace-pre">{'    '}<span className="text-(--code-key)">def</span> <span className="text-(--code-fn)">push</span>(<span className="text-(--code-key)">self</span>, item):</div>
                <div className="px-4 md:px-5.5 whitespace-pre">{'        '}<span className="text-(--code-key)">if</span> <span className="text-(--code-fn)">len</span>(<span className="text-(--code-key)">self</span>._items) &gt;= <span className="text-(--code-key)">self</span>._capacity:</div>
                <div className="px-4 md:px-5.5 whitespace-pre">{'            '}<span className="text-(--code-key)">raise</span> <span className="text-(--code-fn)">StackFullError</span>(<span className="text-(--code-str)">"full"</span>)</div>
                <div className="px-4 md:px-5.5 whitespace-pre">{'        '}<span className="text-(--code-key)">self</span>._items.append(item)</div>
                <div className="px-4 md:px-5.5 whitespace-pre">{' '}</div>
                <div className="px-4 md:px-5.5 whitespace-pre">{'    '}<span className="text-(--code-key)">def</span> <span className="text-(--code-fn)">pop</span>(<span className="text-(--code-key)">self</span>):</div>
                <div className="flex items-center gap-4 px-4 md:px-5.5 py-0.5 bg-(--red)/10 border-l-2 border-l-(--red) whitespace-pre">
                    <span className="underline decoration-wavy decoration-(--red) decoration-[1.5px] underline-offset-[5px]">{'        '}<span className="text-(--code-key)">return</span> <span className="text-(--code-key)">self</span>._items.pop()</span>
                    <span className="text-[10.5px] md:text-[11px] text-(--red) ml-auto pl-3">line 17</span>
                </div>
            </div>
        </div>
    </div>
)

const RECEIPT_TERMINAL = (
    <div className="border border-(--line) rounded-[14px] bg-[#0b0b0e] overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 md:px-4.5 py-3 border-b border-(--line-soft) bg-(--panel)">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#8a8a99" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3"/><path d="M13 15h4"/></svg>
            <span className="font-mono text-[12px] md:text-[12.5px] text-(--text)">container &#8250; stdout</span>
            <span className="font-mono text-[10.5px] md:text-[11px] text-(--faint) ml-auto">docker &nbsp;·&nbsp; no network &nbsp;·&nbsp; read-only</span>
        </div>

        <div className="overflow-x-auto py-4.5">
            <div className="font-mono text-[11px] md:text-[13.5px] leading-[1.95] px-4 md:px-5.5 w-max min-w-full">
                <div className="term-line whitespace-pre text-(--muted)" style={{ animationDelay: "0s" }}><span className="text-(--violet)">$</span> pytest -q test_bounded_stack.py</div>
                <div className="whitespace-pre">{' '}</div>
                <div className="term-line whitespace-pre text-(--green)" style={{ animationDelay: ".22s" }}>[PASS]  test_push_within_capacity</div>
                <div className="term-line whitespace-pre text-(--green)" style={{ animationDelay: ".34s" }}>[PASS]  test_push_past_capacity_raises</div>
                <div className="term-line whitespace-pre text-(--green)" style={{ animationDelay: ".46s" }}>[PASS]  test_pop_returns_last</div>
                <div className="term-line whitespace-pre text-(--green)" style={{ animationDelay: ".58s" }}>[PASS]  test_lifo_order</div>
                <div className="term-line whitespace-pre text-(--red) font-medium" style={{ animationDelay: ".86s" }}>[FAIL]  test_empty_stack_pop</div>
                <div className="term-line whitespace-pre text-(--red)/75 text-[10.5px] md:text-[12.5px]" style={{ animationDelay: "1.02s" }}>{'    '}IndexError: pop from empty list</div>
                <div className="term-line whitespace-pre text-(--red)/55 text-[10.5px] md:text-[12.5px]" style={{ animationDelay: "1.12s" }}>{'    '}bounded_stack.py:17 in pop</div>
                <div className="whitespace-pre">{' '}</div>
                <div className="term-line whitespace-pre text-(--muted)" style={{ animationDelay: "1.32s" }}>4 passed, <span className="text-(--red)">1 failed</span> in 1.42s</div>
            </div>
        </div>
    </div>
)

// Two views of one run. The back card peeks out above so it reads as there;
// clicking it springs forward with a little overshoot and the other tucks behind.
function ReceiptStack() {
    const [front, setFront] = useState<'terminal' | 'code'>('terminal')

    const layer = (which: 'terminal' | 'code', children: React.ReactNode) => {
        const isFront = front === which
        const bring = () => setFront(which)
        return (
            <div
                role={isFront ? undefined : 'button'}
                tabIndex={isFront ? -1 : 0}
                aria-label={isFront ? undefined : which === 'code' ? 'Show what you wrote' : 'Show what actually ran'}
                onClick={isFront ? undefined : bring}
                onKeyDown={isFront ? undefined : e => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bring() }
                }}
                className={`[grid-area:1/1] origin-top rounded-[14px] transition-[translate,scale,opacity,filter] duration-500 ease-[cubic-bezier(.34,1.36,.64,1)] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--violet) ${
                    isFront
                        ? 'z-2'
                        : 'z-1 cursor-pointer -translate-y-7 scale-[.95] opacity-60 brightness-75 hover:-translate-y-9 hover:opacity-85'
                }`}
            >
                {children}
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center">
            <div className="grid w-full pt-9">
                {layer('code', RECEIPT_CODE)}
                {layer('terminal', RECEIPT_TERMINAL)}
            </div>
            <span className="mt-4 font-mono text-[11px] text-(--faint)">
                click the card behind to see {front === 'terminal' ? 'what you wrote' : 'what actually ran'}
            </span>
        </div>
    )
}

// "Why not ChatGPT" as rows, not boxes: all three visible at once, the one
// that wins the argument accented.
const WHY_ROWS = (
    <div className="flex flex-col border-y border-(--line-soft)">
        <div className="flex flex-col gap-2.5 py-6 pl-5 md:pl-6 border-l-2 border-l-(--green)/70">
            <h4 className="text-[17px] md:text-[19px] font-semibold tracking-[-0.01em] text-white">Proof, not vibes.</h4>
            <p className="text-[14px] md:text-[15px] leading-[1.7] text-(--muted)">
                When a chat AI says &ldquo;this passes,&rdquo; it is grading its own homework. Litmus hands your code to a sealed sandbox, and the verdict comes from the tests, not the model.
            </p>
            <p className="text-[14px] md:text-[15px] leading-[1.7] text-(--text)">
                A chat box can tell you your code works when it doesn&rsquo;t. Litmus structurally can&rsquo;t.
            </p>
        </div>

        <div className="flex flex-col gap-2.5 py-6 pl-5 md:pl-6 border-l-2 border-l-transparent border-t border-t-(--line-soft)">
            <h4 className="text-[17px] md:text-[19px] font-semibold tracking-[-0.01em] text-white">Reliability by default.</h4>
            <p className="text-[14px] md:text-[15px] leading-[1.7] text-(--muted)">
                No re-pasting your professor&rsquo;s tests, no reminding it of your style every chat. Litmus saves your style and your test suites once and reuses them. Your course comes next.
            </p>
            <p className="text-[14px] md:text-[15px] leading-[1.7] text-(--text)">
                ChatGPT starts every chat from zero.
            </p>
        </div>

        <div className="flex flex-col gap-2.5 py-6 pl-5 md:pl-6 border-l-2 border-l-transparent border-t border-t-(--line-soft)">
            <div className="flex flex-wrap items-center gap-2.5">
                <h4 className="text-[17px] md:text-[19px] font-semibold tracking-[-0.01em] text-white">Runs while it teaches.</h4>
                <span className="px-2 py-0.5 rounded-md bg-(--amber)/10 border border-(--amber)/35 font-mono text-[10px] text-(--amber)">
                    coming next
                </span>
            </div>
            <p className="text-[14px] md:text-[15px] leading-[1.7] text-(--muted)">
                A chat box&rsquo;s run button executes one isolated script. The tutor I&rsquo;m building runs your own code in the sandbox while it guides you.
            </p>
            <p className="text-[14px] md:text-[15px] leading-[1.7] text-(--text)">
                You write it, run it and learn it in one place.
            </p>
        </div>
    </div>
)

// The two modes, stacked in the right column; they slide in one after the other.
function BridgeModes() {
    return (
        <div className="flex flex-col gap-4.5">
            <div className="flex flex-col gap-3 p-5 md:p-6 border border-(--violet)/40 rounded-[14px] bg-(--panel)">
                <div className="flex flex-wrap items-center gap-2.5">
                    <span className="px-2.5 py-1 rounded-md bg-(--violet)/15 border border-(--violet)/40 font-mono text-[10.5px] text-[#c4b5fd]">Walk me through it</span>
                    <span className="px-2 py-0.5 rounded-md bg-(--amber)/10 border border-(--amber)/35 font-mono text-[10px] text-(--amber)">coming next</span>
                </div>
                <h4 className="text-[16px] md:text-[17px] font-semibold tracking-[-0.01em] text-white">Guides you to write it yourself.</h4>
                <p className="text-[14px] md:text-[15px] leading-[1.7] text-(--muted)">
                    Won&rsquo;t hand you the answer. Checks your code in the sandbox as you learn.
                </p>
            </div>

            <div className="flex flex-col gap-3 p-5 md:p-6 border border-(--green)/35 rounded-[14px] bg-(--panel)">
                <div className="flex flex-wrap items-center gap-2.5">
                    <span className="px-2.5 py-1 rounded-md bg-(--green)/10 border border-(--green)/35 font-mono text-[10.5px] text-(--green)">Quick fix</span>
                </div>
                <h4 className="text-[16px] md:text-[17px] font-semibold tracking-[-0.01em] text-white">Generates it, tests it, repairs it.</h4>
                <p className="text-[14px] md:text-[15px] leading-[1.7] text-(--muted)">
                    Then hands you the receipt: every test it ran, and the verdict from the sandbox.
                </p>
            </div>
        </div>
    )
}

function DegreePanel() {
    return (
        <div className="w-full border border-(--line) rounded-[14px] bg-[#0b0b0e] overflow-hidden shadow-[0_18px_50px_rgba(0,0,0,.4)]">
            <div className="flex items-center gap-2.5 px-4 md:px-5 py-3 border-b border-(--line-soft) bg-(--panel)">
                <span className="font-mono text-[12px] md:text-[12.5px] text-(--text)">what it keeps</span>
                <span className="font-mono text-[10.5px] md:text-[11px] text-(--faint) ml-auto">across every session</span>
            </div>
            <ul className="divide-y divide-(--line-soft)">
                {REMEMBERED.map(r => (
                    <li key={r.what} className="flex items-center gap-3 px-4 md:px-5 py-3.5">
                        {r.live ? (
                            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#3fb950" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M20 6 9 17l-5-5"/></svg>
                        ) : (
                            <span className="grid h-[15px] w-[15px] shrink-0 place-items-center"><span className="h-2 w-2 rounded-full border border-(--faint)" /></span>
                        )}
                        <span className={`min-w-0 text-[14px] md:text-[15px] text-pretty ${r.live ? 'text-(--text)' : 'text-(--muted)'}`}>{r.what}</span>
                        <span className={`ml-auto shrink-0 font-mono text-[11px] md:text-[12px] ${
                            r.live ? 'text-(--green)' : r.status === 'coming' ? 'text-(--amber)' : 'text-(--faint)'
                        }`}>{r.status}</span>
                    </li>
                ))}
            </ul>
        </div>
    )
}

// The one-click handoff between the modes, under the split, inside the same panel.
function BridgeHandoff() {
    return (
        <Reveal>
            <div className="flex flex-col items-center">
                <span className="font-mono text-[11px] tracking-[.1em] uppercase text-(--violet)">the bridge</span>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_236px_1fr] items-center gap-5 lg:gap-0 w-full max-w-[1120px] mt-5 md:mt-6">

                    <div className="border border-(--green)/35 rounded-[14px] bg-(--panel) overflow-hidden transition hover:border-(--violet)/85 hover:-translate-y-0.5">
                        <div className="flex items-center gap-2.5 px-4 md:px-4.5 py-3 border-b border-(--line-soft)">
                            <span className="px-2.5 py-1 rounded-md bg-(--green)/10 border border-(--green)/35 font-mono text-[10.5px] text-(--green)">Quick fix</span>
                            <span className="font-mono text-[11px] text-(--green) ml-auto">5/5 &nbsp;·&nbsp; verified</span>
                        </div>
                        <div className="overflow-x-auto py-4">
                            <div className="font-mono text-[11.5px] md:text-[13px] leading-[1.9] w-max min-w-full">
                                <div className="px-4 md:px-5 whitespace-pre">{'    '}<span className="text-(--code-key)">def</span> <span className="text-(--code-fn)">pop</span>(<span className="text-(--code-key)">self</span>):</div>
                                <div className="px-4 md:px-5 whitespace-pre bg-(--green)/8 border-l-2 border-l-(--green)">{'        '}<span className="text-(--code-key)">if</span> <span className="text-(--code-key)">not</span> <span className="text-(--code-key)">self</span>._items:</div>
                                <div className="px-4 md:px-5 whitespace-pre bg-(--green)/8 border-l-2 border-l-(--green)">{'            '}<span className="text-(--code-key)">raise</span> <span className="text-(--code-fn)">StackEmptyError</span>(<span className="text-(--code-str)">"empty"</span>)</div>
                                <div className="px-4 md:px-5 whitespace-pre">{'        '}<span className="text-(--code-key)">return</span> <span className="text-(--code-key)">self</span>._items.pop()</div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-center gap-3 lg:px-4.5">
                        <div aria-hidden="true" className="flex items-center justify-center gap-2.5 w-full sm:w-auto lg:w-full h-12 px-6 rounded-xl bg-(--violet) text-white text-[14px] font-semibold shadow-[0_6px_28px_rgba(139,92,246,.55)]">
                            <span>Now teach me this</span>
                            <span className="text-[15px] rotate-90 lg:rotate-0 inline-block">&#8594;</span>
                        </div>
                        <span className="font-mono text-[10.5px] text-(--faint) text-center leading-[1.6]">
                            same code &nbsp;·&nbsp; same tests<br/>now with the why
                        </span>
                    </div>

                    <div className="border border-(--violet)/40 rounded-[14px] bg-(--panel) overflow-hidden transition hover:border-(--violet)/85 hover:-translate-y-0.5">
                        <div className="flex items-center gap-2.5 px-4 md:px-4.5 py-3 border-b border-(--line-soft)">
                            <span className="px-2.5 py-1 rounded-md bg-(--violet)/15 border border-(--violet)/40 font-mono text-[10.5px] text-[#c4b5fd]">Walk me through it</span>
                        </div>
                        <div className="flex flex-col gap-2.5 px-4 md:px-5 py-4">
                            <LitmusTag />
                            <p className="text-[13.5px] md:text-[14px] leading-[1.7] text-(--muted)">
                                You&rsquo;ve got working code. So why does the guard have to come <i>before</i> the removal? What breaks if you swap them?
                            </p>
                        </div>
                    </div>
                </div>
                <p className="mt-6 max-w-[620px] text-center text-[14px] md:text-[15px] leading-[1.65] text-(--muted) text-pretty">
                    Get the fast answer. When the tutor lands, one click carries it in, so you learn why it works.
                </p>
            </div>
        </Reveal>
    )
}

// What Litmus remembers per student. Verifier-side items read as live, since
// launch waits for them; the rest keep their real status.
const REMEMBERED = [
    { what: 'your style', status: 'saved and reused', live: true },
    { what: 'your test suites', status: 'saved and reused', live: true },
    { what: 'your courses', status: 'coming', live: false },
    { what: 'where you actually get stuck, verified from real runs', status: 'later', live: false },
]

export default function Landing(){
    // The bar is invisible at rest and becomes glass once the page moves.
    const [scrolled, setScrolled] = useState(false)
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8)
        onScroll()                                   // correct on a restored scroll position
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [])

    return (
        <div className="w-full overflow-x-clip bg-(--bg) font-sans">

            <div className={`sticky top-0 z-50 flex items-center gap-2.5 py-3 px-5 md:px-14 transition-[background-color,backdrop-filter,border-color] duration-300 ${
                scrolled
                    ? "border-b border-white/10 bg-[rgba(10,10,14,.55)] backdrop-blur-2xl backdrop-saturate-150"
                    : "border-b border-transparent bg-transparent"
            }`}>
                    <Mark />
                    <span className="font-mono font-semibold text-[15px] text-white">
                        litmus<span className="text-[#c4b5fd]">.</span>
                    </span>
                    <div className="flex items-center ml-auto gap-4 md:gap-6">
                        <a
                            href="#how-it-works"
                            className="text-[13.5px] text-white/60 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70 rounded-xs"
                        >
                            How it works
                        </a>
                        <Link
                            to="/signin"
                            className="text-[13.5px] text-white/60 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70 rounded-xs"
                        >
                            Sign in
                        </Link>
                        <Link
                            to="/sandbox"
                            className="flex items-center h-8 px-3.5 rounded-[9px] bg-(--violet) text-white text-[13px] font-semibold transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                        >
                            Try it
                        </Link>
                    </div>
            </div>

            <div id="hero" className="mesh relative -mt-[58px] pt-[58px] pb-20 md:pb-32">

                <div className="relative z-2 flex flex-col items-center text-center px-5 md:px-14 pt-16 md:pt-24 lg:pt-29.5">

                    <div className="flex max-w-full items-center gap-2.5 py-1.5 pl-2 pr-4 mb-8 md:mb-10 rounded-[20px] sm:rounded-full bg-(--glass-strong) border border-(--glass-line) backdrop-blur-lg">
                        <span className="shrink-0 py-1 px-2.5 rounded-full bg-(--violet) text-white text-[11.5px] font-semibold">v0</span>
                        <span className="text-[12.5px] md:text-[13.5px] text-white/85 text-left text-balance">built by a student who got tired of not knowing</span>
                    </div>

                    <h1 className="display text-[length:clamp(22px,calc((100vw_-_48px)/9.6),38px)] md:text-[length:clamp(40px,calc((100vw_-_128px)/9.6),78px)] tracking-[-0.038em] text-white/45 max-w-250 text-balance">
                        <span className="relative block w-fit mx-auto">
                            <span className="type-line block whitespace-nowrap">AI writes your code.</span>
                            <span className="type-caret" aria-hidden="true" />
                        </span>
                        <span className="type-answer block w-fit mx-auto text-white">Can you?</span>
                    </h1>

                    <p className="mt-6 md:mt-7.5 max-w-160 text-[16px] md:text-[18px] leading-[1.6] text-white/70 text-pretty">
                        You&rsquo;ve been copying answers all semester. <b className="text-white font-semibold">The exam won&rsquo;t let you.</b>
                    </p>

                    <p className="mt-3.5 max-w-150 text-[14px] md:text-[15.5px] leading-[1.65] text-white/55 text-pretty">
                        Litmus is the AI that makes you write it, and runs it to prove you got there.
                    </p>

                    <div className="flex flex-col items-center gap-4 mt-10 md:mt-10.5 w-full">
                        <Link to="/sandbox" className="flex items-center justify-center gap-2.5 w-full sm:w-auto h-13.5 px-8 rounded-[13px] bg-(--violet) text-white text-[15.5px] md:text-[17px] font-semibold tracking-[-0.01em] shadow-[0_6px_28px_rgba(139,92,246,.55)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                            <span>Try it on your assignment</span>
                            <span className="text-[17px]">&#8594;</span>
                        </Link>
                        <span className="font-mono text-[11px] md:text-[12px] text-white/45">
                            free &nbsp;·&nbsp; no card &nbsp;·&nbsp; sign in to start
                        </span>
                        <ScrollCue />
                    </div>
                </div>
            </div>

            <Reveal>
            <div id="how-it-works" className="px-5 md:px-14 pt-15 md:pt-20 lg:pt-25">
                <Panel className="flex flex-col items-center">
                <SectionHead eyebrow="watch it refuse" eyebrowColor="text-(--violet)" title="The AI that won't do your homework.">
                    Every other assistant hands over the fix. This one asks you a question and waits. This is the tutor I&rsquo;m building next: the student arrives wanting the answer, and leaves having written it.
                </SectionHead>

                <div className="relative w-full max-w-[1180px] mt-10 md:mt-11.5 flex flex-col items-center gap-7 2xl:block 2xl:gap-0">

                    <div className="w-full max-w-[780px] lg:mx-auto border border-(--line) rounded-2xl bg-(--panel) overflow-hidden shadow-[0_24px_70px_rgba(0,0,0,.5)]">

                        <div className="flex flex-wrap items-center gap-2.5 px-4 md:px-5 py-3.5 border-b border-(--line-soft)">
                            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-(--violet)/15 border border-(--violet)/40 font-mono text-[10.5px] text-[#c4b5fd]">
                                Walk me through it
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-(--amber)/10 border border-(--amber)/35 font-mono text-[10px] text-(--amber)">
                                coming next
                            </span>
                            <span className="font-mono text-[11px] text-(--faint)">Data Structures &nbsp;·&nbsp; BoundedStack</span>
                        </div>

                        <div className="flex flex-col gap-5 px-4 md:px-5 py-5">

                            <UserTurn delay="0s">my stack crashes when I pop. just fix it</UserTurn>

                            <div className="turn flex flex-col gap-2.5 self-start max-w-[95%] md:max-w-[92%]" style={{ animationDelay: ".55s" }}>
                                <LitmusTag />
                                <p className="text-[14px] md:text-[15px] leading-[1.7] text-(--muted)">
                                    I ran it. It throws an <span className="font-mono text-[13px] md:text-[14px] text-(--red)">IndexError</span> the moment you pop an empty stack.
                                </p>
                                <p className="text-[14px] md:text-[15px] leading-[1.7] text-(--text) font-medium">
                                    Before I say more: what do <i>you</i> think should happen when someone pops from a stack that&rsquo;s empty?
                                </p>
                            </div>

                            <UserTurn delay="1.5s">idk, return nothing?</UserTurn>

                            <div className="turn flex flex-col gap-2.5 self-start max-w-[95%] md:max-w-[92%]" style={{ animationDelay: "2.1s" }}>
                                <LitmusTag />
                                <p className="text-[14px] md:text-[15px] leading-[1.7] text-(--muted)">
                                    A stack that can&rsquo;t finish an operation (like popping when it&rsquo;s empty) should raise an exception, not return a value.
                                </p>
                                <p className="text-[14px] md:text-[15px] leading-[1.7] text-(--muted)">
                                    So given that, what should your <span className="font-mono text-[13px] md:text-[14px] text-(--text)">pop()</span> do instead?
                                </p>
                            </div>

                            <UserTurn delay="3.1s" green>ohh so it should raise an error? like an exception?</UserTurn>

                            <div className="turn flex flex-col gap-2.5 self-start max-w-[95%] md:max-w-[92%]" style={{ animationDelay: "3.7s" }}>
                                <LitmusTag />
                                <p className="text-[14px] md:text-[15px] leading-[1.7] text-(--muted)">Exactly. Want to try writing that check yourself?</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2.5 px-4 md:px-5 py-3.5 border-t border-(--line-soft) bg-(--panel-2)">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#3fb950" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M20 6 9 17l-5-5"/></svg>
                            <span className="font-mono text-[11px] md:text-[12px] text-(--green)">the student wrote the line. litmus never typed it.</span>
                        </div>
                    </div>

                    <div className="callout-in flex flex-col items-center gap-3 max-w-[320px] text-center 2xl:absolute 2xl:left-[calc(50%+402px)] 2xl:top-[118px] 2xl:max-w-[176px] 2xl:items-start 2xl:text-left">
                        <svg viewBox="0 0 60 20" width="52" height="18" fill="none" stroke="rgba(139,92,246,.55)" strokeWidth="1.4" strokeDasharray="4 4" className="shrink-0 rotate-90 2xl:rotate-0">
                            <path d="M58 10H2"/>
                            <path d="M8 5 2 10l6 5" strokeDasharray="0"/>
                        </svg>
                        <span className="text-[13px] md:text-[13.5px] leading-[1.6] text-(--tip)">
                            Every other AI would have pasted the fix <b className="text-[#c4b5fd] font-semibold">right here.</b>
                        </span>
                    </div>
                </div>
                </Panel>
            </div>

            </Reveal>

            <Reveal still>
            <SplitSection
                id="receipt"
                eyebrow="the receipt"
                eyebrowColor="text-(--green)"
                title="It can say that because it ran your code."
                display={<ReceiptStack />}
            >
                A tutor that guesses is worse than no tutor. When Litmus says your empty pop crashes, it isn&rsquo;t reading your code. It executed it in a container and read the log.
            </SplitSection>

            </Reveal>

            <Reveal still>
            <SplitSection
                id="why"
                eyebrow="the honest question"
                eyebrowColor="text-(--violet)"
                title="Claude can do it. GPT can do it. So why Litmus?"
                display={WHY_ROWS}
            >
                They can write the code, match a style, even run a snippet. Here&rsquo;s what a chat box can&rsquo;t do.
            </SplitSection>
            </Reveal>

            <Reveal still>
            <SplitSection
                id="bridge"
                eyebrow="two ways in"
                eyebrowColor="text-(--violet)"
                title="Ship it tonight. Understand it before the exam."
                display={<BridgeModes />}
                after={<BridgeHandoff />}
            >
                Deadline in twenty minutes? Take the working code. Exam next week? Learn it properly.
            </SplitSection>


            </Reveal>

            <Reveal still>
            <SplitSection
                id="degree"
                eyebrow="it gets to know your degree"
                eyebrowColor="text-(--violet)"
                title="The longer you use it, the more it knows your semester."
                display={<DegreePanel />}
            >
                ChatGPT starts every chat from a blank slate. Litmus keeps what makes your work yours.
            </SplitSection>
            </Reveal>

            <Reveal>
            <div id="honest" className="px-5 md:px-14 pt-15 md:pt-20 lg:pt-27.5">
                <Panel className="flex flex-col items-center">
                <SectionHead eyebrow="transparency" eyebrowColor="text-(--amber)" title="What Litmus can't do yet." />

                <div className="w-full max-w-200 mt-10 md:mt-11 border border-(--line) rounded-[14px] bg-[#0b0b0e] overflow-hidden shadow-[0_18px_50px_rgba(0,0,0,.4)]">
                    <div className="flex items-center gap-2.5 px-4 md:px-5 py-3 border-b border-(--line-soft) bg-(--panel)">
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#8a8a99" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M4 19V5a2 2 0 0 1 2-2h11l3 3v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/></svg>
                        <span className="font-mono text-[12px] md:text-[12.5px] text-(--text)">litmus.config.json</span>
                        <span className="font-mono text-[10.5px] md:text-[11px] text-(--faint) ml-auto">read-only</span>
                    </div>

                    <div className="overflow-x-auto py-5">
                        <div className="font-mono text-[11.5px] md:text-[14px] leading-[2.05] w-max min-w-full">
                            <div className="px-5 md:px-6.5 whitespace-pre text-(--muted)">{'{'}</div>
                            <div className="px-5 md:px-6.5 whitespace-pre">{'  '}<span className="text-(--code-key)">"version"</span><span className="text-(--muted)">:</span> <span className="text-(--code-str)">"v0.1-rough"</span><span className="text-(--muted)">,</span></div>
                            <div className="px-5 md:px-6.5 whitespace-pre">{'  '}<span className="text-(--code-key)">"current_limitations"</span><span className="text-(--muted)">: [</span></div>
                            <div className="px-5 md:px-6.5 whitespace-pre">{'    '}<span className="text-(--code-str)">"Single Python files only"</span><span className="text-(--muted)">,</span></div>
                            <div className="px-5 md:px-6.5 whitespace-pre">{'    '}<span className="text-(--code-str)">"Sign-in required"</span><span className="text-(--muted)">,</span></div>
                            <div className="px-5 md:px-6.5 whitespace-pre">{'    '}<span className="text-(--code-str)">"Tutor: landing next"</span><span className="text-(--muted)">,</span></div>
                            <div className="px-5 md:px-6.5 whitespace-pre">{'    '}<span className="text-(--code-str)">"Course notes: coming"</span></div>
                            <div className="px-5 md:px-6.5 whitespace-pre text-(--muted)">{'  ],'}</div>
                            <div className="px-5 md:px-6.5 pt-2 whitespace-pre bg-(--green)/8 border-l-2 border-l-(--green)">{'  '}<span className="text-[#a78bfa]">"unbreakable_promise"</span><span className="text-(--muted)">:</span></div>
                            <div className="px-5 md:px-6.5 pb-2 whitespace-pre bg-(--green)/8 border-l-2 border-l-(--green)">{'    '}<span className="text-(--green)">"I will never show you unverified code execution."</span></div>
                            <div className="px-5 md:px-6.5 whitespace-pre text-(--muted)">{'}'}</div>
                        </div>
                    </div>
                </div>
                <p className="mt-6 max-w-[620px] text-center text-[14px] md:text-[15px] leading-[1.65] text-(--muted) text-pretty">
                    Litmus is v0 and rough. Python for now, more coming. Try it, break it, tell me what&rsquo;s wrong.
                </p>
                {/* Inert until the feedback form exists: drop `disabled` and add the handler. */}
                <button
                    type="button"
                    disabled
                    title="The feedback form is on its way"
                    className="mt-4 flex items-center gap-2 h-10 px-4.5 rounded-[11px] border border-(--line) bg-(--panel) text-[13.5px] text-(--text) disabled:cursor-not-allowed disabled:opacity-60"
                >
                    Send feedback
                    <span className="rounded-[5px] bg-(--line) px-1 py-px font-mono text-[9px] tracking-[.04em] text-(--faint)">soon</span>
                </button>
                </Panel>
            </div>

            </Reveal>

            <Reveal>
            <div id="start" className="flex flex-col items-center gap-5 px-5 md:px-14 pt-16 md:pt-24 lg:pt-29.5">
                <h3 className="display text-[28px] md:text-[40px] text-center text-balance max-w-[720px]">
                    Bring the assignment you don&rsquo;t understand.
                </h3>
                <Link to="/sandbox" className="flex items-center justify-center gap-2.5 w-full sm:w-auto h-13.5 px-8 rounded-[13px] bg-(--violet) text-white text-[15.5px] md:text-[17px] font-semibold tracking-[-0.01em] shadow-[0_6px_28px_rgba(139,92,246,.5)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                    <span>Try it on your assignment</span>
                    <span className="text-[17px]">&#8594;</span>
                </Link>
                <span className="font-mono text-[11px] md:text-[12px] text-(--faint) text-center text-pretty">
                    sign in first, so every run and every saved style is still there tomorrow
                </span>
            </div>

            </Reveal>

            <div className="flex flex-wrap items-center justify-center gap-2.5 px-5 md:px-14 pt-16 md:pt-19 pb-10 mt-12 md:mt-14 border-t border-(--line-soft)">
                <Mark size={15} fill="#8b5cf6" className="opacity-55" />
                <span className="font-mono text-[11px] md:text-[11.5px] text-(--faint) text-center">
                    litmus &nbsp;·&nbsp; the AI that makes you learn it &nbsp;·&nbsp; building in public
                </span>
            </div>

        </div>
    )
}
