interface TestProps {
    state: string;
  }

export default function TestBox({ state } : TestProps){
    return (
      <div className={`size-[15px] rounded-[3px] border grid place-items-center text-[9px] font-bold
        transition-all duration-250
        ${state === 'pass' ? 'border-[#3fb950] bg-[#3fb950]/20 text-[#3fb950] scale-105' : ''}
        ${state === 'fail' ? 'border-[#f85149] bg-[#f85149]/15 text-[#f85149]' : ''}
        ${state === 'idle' ? 'border-white/15' : ''}`}>
        {state === 'pass' ? '✓' : state === 'fail' ? '✕' : ''}
      </div>

      
    )
  }