export default function Footer() {
  return (
    // mockup <footer>: margin-top 70px; border-top 1px line; padding 26px top / 44px bottom;
    // flex row, mono 11px, faint colour.
    <footer className="mt-[70px] border-t border-[#22222b] pt-[26px] pb-11 flex items-center gap-3 font-mono text-[11px] text-[#5a5a68]">
      {/* small brand mark — same violet→magenta gradient as the nav logo, at 16px */}
      <div className="size-4 rounded-[5px] bg-linear-135 from-[#8b5cf6] to-[#c026d3]" />
      <span>CodeRace</span>
      {/* ml-auto shoves this to the far right — the tidy alternative to a flex-1 spacer div */}
      <span className="ml-auto">Built in Saint John, New Brunswick</span>
    </footer>
  )
}
