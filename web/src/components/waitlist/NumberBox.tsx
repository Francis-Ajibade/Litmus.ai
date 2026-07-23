interface NumberBoxProps{
    passed : number,
    failed : number,
}


export default function NumberBox({ passed, failed }: NumberBoxProps) {
    // Nothing revealed yet (0 passed, 0 failed) → neutral placeholder, like the mockup's "—".
    if (passed === 0 && failed === 0) {
      return (
         <div className="font-mono text-[11.5px] w-[76px] text-right shrink-0 text-[#5a5a68]">—</div>
      )
    }
    
  
    return (
      <div className="font-mono text-[11.5px] w-[76px] text-right shrink-0">
        <span className="text-[#3fb950]">{passed}</span>
        {/* the red "/failed" only appears once there's at least one failure */}
        {failed > 0 && <span className="text-[#f85149]">/{failed}</span>}
      </div>
    )
}
