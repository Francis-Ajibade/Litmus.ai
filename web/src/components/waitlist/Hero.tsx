// 🎯 YOUR EXERCISE — convert the <header> block of coderace-waitlist.html to
// Tailwind. The JSX structure + text are here; you fill in each className="".
// References:
//   - Nav.tsx (the worked example — same CSS→utility mapping)
//   - the CSS in coderace-waitlist.html: .badge, .badge .pip, h1, h1 .quiet, .lede
// Leave the text as-is; your job is the styling. Fill every empty className="".

export default function Hero() {
  return (
    // <header> CSS: padding:78px 0 44px; text-align:center
    //   hint: pt-[78px] pb-11 text-center
    <header className="pt-20 pl-0 pb-11 text-center">
      {/* .badge — inline-flex, centered, gap; small muted text; glass look:
          semi-transparent bg + subtle border + rounded-full (999px) + padding.
          hint: inline-flex items-center gap-2 rounded-full border, a translucent
          bg like bg-white/5, border-white/10, px-3.5 py-1.5, text-xs text-neutral-400,
          plus mb-6 (26px) under it. */}
      <div className="inline-flex items-center gap-[9px] rounded-full text-[12.5px] text-[#8a8a99] bg-[#14141a]/55
                      border border-white/10 backdrop-blur-[14px] px-3.5 py-1.5 mb-[26px] ">
        {/* .badge .pip — a 6px amber dot, rounded-full. hint: h-1.5 w-1.5 rounded-full bg-amber-400 */}
        <span className="size-1.5 rounded-full bg-[#d9a441] shadow-[0_0_9px_#d9a441]" />
        In development · Saint John, NB
      </div>

      {/* h1 — big, monospace, bold, VERY tight tracking, tight line-height.
          hint: font-mono text-5xl font-bold leading-[1.08] tracking-tight, plus mb-5.
          The <br/>s are intentional line breaks — keep them. */}
      <h1 className="font-mono font-bold text-[52px] leading-[1.08] tracking-[-0.045em] mb-5">
        Everyone else gives<br />you an answer.<br />
        {/* h1 .quiet — the faint grey final line. hint: text-neutral-600 */}
        <span className="text-[#5a5a68]">We give you the receipt.</span>
      </h1>

      {/* .lede — muted paragraph, ~17px, capped width, centered, relaxed line-height.
          hint: mx-auto max-w-[560px] text-[17px] leading-relaxed text-neutral-400 */}
      <p className="mx-auto max-w-[560px] text-[17px] leading-relaxed text-[#a3a3a3]">
        Three AI models race the same coding problem. Every solution runs against a
        real test suite in a sandbox.{' '}
        {/* .lede b — brighter emphasis. hint: font-semibold text-white */}
        <b className="font-semibold text-[#e9e9ef]">You only ever see the code that provably passed</b> — and
        exactly what the other two got wrong.
      </p>
    </header>
  )
}
