// WORKED EXAMPLE — study this, then you'll convert the Hero the same way.
// This is the <nav> from coderace-waitlist.html, translated to a React component
// with Tailwind utilities. Each className is the CSS rule it replaces.

export default function Nav() {
  return (
    // CSS: padding:24px 0 0; display:flex; align-items:center; gap:11px
    //  → pt-6 (24px), flex, items-center, gap-3 (12px ≈ 11px; use gap-[11px] for exact)
    <nav className="flex items-center gap-[11px] pt-6">
      {/* .logo — 24px square, rounded 7px, violet→magenta 135° gradient.
          bg-linear-135 =linear gradient to 135 deg Colors happen to be
          rounded-md = 6px, rounded-lg = 8px so use custom rounded-[7px]

          Tailwind's violet-500 (#8b5cf6) and fuchsia-600 (#c026d3). */}
      <div className="size-6 rounded-[7px] bg-linear-135 from-violet-500 to-fuchsia-600" />

      {/* .wordmark — monospace, bold, 15px, tight letter-spacing 
          font-weight:700 -> font bold(weight 700), font-medium(weight 500), font-semibold(weight 600)
          text-[15px] -> text-sm( 14px), text-base(16px)
          tracking-[-0.02em] -> tracking-tight (-0.025em) little to no diff
      */}
      <div className="font-mono font-bold text-[15px] tracking-tight">CodeRace</div>

      {/* .navspace — flex:1 spacer that pushes the link to the far right it grows to sawllow leftover space
          flex-1 → flex: 1 1 0% — grow, shrink, ignore natural size. The workhorse. Use for "fill remaining space."
          flex-none → don't grow or shrink, stay natural size. You'll use this on the lane names in the demo (that's what flex-shrink:0 was doing).
          flex-auto → grow/shrink but starting from natural size. Rare.
          There is no flex-3 in the core scale — if you ever need proportional splits like 3:1, it's flex-[3] and flex-1. Almost never needed.
      */}
      <div className="flex-1 " />

      {/* .navlink — muted grey, 13.5px, no underline, turns white on hover 
          -muted grey -  text-[#8a8a99]
          text - 13.5px -> text-[13.5px]
      */}
      {/* text-* handles both color and size */}
      <a
        href="#"
        className="text-[#8a8a99] text-[13.5px] no-underline hover:text-[#e9e9ef]"
      >
        GitHub
      </a>
    </nav>
  )
}
