import { useState, useEffect, useRef } from "react";
import TestBox from "./TestBox";
import NumberBox from "./NumberBox";
import Verdict from "./Verdict";

const SCENARIOS = [
    {
      prompt: '"Write a Stack class with push, pop, and peek"',
      tests: 5,
      lanes: [
        {model:'Claude',  results:[1,1,1,1,1], ms:[380,520,680,810,960]},
        {model:'GPT-4o',  results:[1,1,1,0,1], ms:[300,430,570,700,880]},
        {model:'Gemini',  results:[1,1,0,0,1], ms:[420,600,760,900,1040]}
      ],
      winner:0,
      headline:'✓ Claude wins 5/5.',
      detail: ' GPT-4o returned None on an empty stack instead of raising — failed test_peek_on_empty.'
    },
    {
      prompt: '"Binary search over a 1-indexed array"',
      tests: 6,
      lanes: [
        {model:'Claude',  results:[1,0,1,1,0,1], ms:[340,470,610,760,890,1010]},
        {model:'GPT-4o',  results:[1,1,1,1,1,1], ms:[290,410,540,670,800,930]},
        {model:'Gemini',  results:[1,1,0,1,0,1], ms:[400,530,670,820,950,1080]}
      ],
      winner:1,
      headline:'✓ GPT-4o wins 6/6.',
      detail: ' Claude fell for the trap — treated index 1 as the second element.'
    },
    {
      prompt: '"Merge sort without using sorted() or .sort()"',
      tests: 4,
      lanes: [
        {model:'Claude',  results:[1,1,0,1], ms:[360,500,640,790]},
        {model:'GPT-4o',  results:[1,0,0,1], ms:[310,440,580,720]},
        {model:'Gemini',  results:[1,1,0,1], ms:[430,560,700,850]}
      ],
      winner:0,
      tie:true,
      headline:'⚠ Nobody passed clean.', 
      detail : ' Claude wins 3/4 on speed — but every model missed the empty-list case. Worth a look.'
    }
  ];




 export default function RaceDemo() {
        const [scenarioIndex, setScenarioIndex] = useState(0)
        const [revealed, setRevealed] = useState([0, 0, 0])
        const [status, setStatus] = useState<'racing' | 'settled'>('racing')
      
        //stores the reference of each timers and prevents re renders 
        const timers = useRef<ReturnType<typeof setTimeout>[]>([])   // survives renders, silent
      
        useEffect(() => {
          const scene = SCENARIOS[scenarioIndex]
      
          // 1. reset for THIS scenario
          setRevealed(scene.lanes.map(() => 0))   // [0,0,0] regardless of test count
          setStatus('racing')
      
          // 2. schedule the reve2als — YOUR loop goes here, with two fixes:
          //    - no setScenarioIndex in here (the effect is already keyed to it)
          //    - push into timers.current, not a local array
          scene.lanes.forEach((lane, laneIdx) => {
            lane.ms.forEach((delay, t) => {
              timers.current.push(setTimeout(() => {
                setRevealed(prev => prev.map((n, j) => j === laneIdx ? t + 1 : n))
              }, 900 + delay))
            })
          })
          
          // set timeout for settling status
          timers.current.push(setTimeout(() =>{
            setStatus('settled')
          }, 2400))
          // 3. settle, then advance to next scenario (we'll add these next)
        
          timers.current.push(setTimeout(() => {
            setScenarioIndex(prev => (prev + 1) % SCENARIOS.length)
          }, 5200))
      
          // 4. THE CLEANUP — runs before the effect re-fires and on unmount
          return () => {
            timers.current.forEach(clearTimeout)
            timers.current = []
          }
        }, [scenarioIndex])   // ← re-run the whole thing whenever the scenario changes
    
    return <>
    <div className="mt-16 mx-auto max-w-[840px] bg-[#0e0e13] border rounded-2xl border-[#22222b] overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.6)]">
    <div className="flex items-center gap-2 py-3 px-3.5 border border-[#22222b] rounded-b-xs">
      <div className="flex gap-1.5"> <i className="size-[9px] border rounded-full border-[#22222b]"></i>
        <i className="size-[9px] border rounded-full border-[#22222b]" ></i>
        <i className="size-[9px] border rounded-full border-[#22222b]"></i> 
      </div>
      {/* ont-family:var(--mono);font-size:11px;color:var(--faint);margin-left:6px;flex:1;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis; */}
      <div className="font-mono text-[11px] text-[#5a5a68] ml-[6px] flex-1 whitespace-nowrap overflow-hidden text-ellipsis  " >
        {SCENARIOS[scenarioIndex].prompt}
        </div>
      {/* demo-stat{font-family:var(--mono);font-size:10.5px;color:var(--faint)} */}
      <div className="font-mono text-[10.5px] text-[#5a5a68]">3 models · {SCENARIOS[scenarioIndex].tests} tests</div>
    </div>

    <div className="p-3.5">
      {/* OUTER map → one lane row per lane. Note the PARENS  => ( ... )  so the
          <div> is returned automatically. THAT is the fix for your "void[] is not
          assignable to ReactNode" error: braces with no `return` returned nothing. */}
      {SCENARIOS[scenarioIndex].lanes.map((lane, laneIdx) => {
        // OUTER map now uses BRACES { } + an explicit `return`, because we compute
        // the score here first. (Parens => ( ) can't hold `const` lines; braces can.)
        const shown = revealed[laneIdx]
        // COUNT, don't increment: how many of the REVEALED results are passes.
        // As `shown` grows each render, this recount climbs on its own.
        const passed = lane.results.slice(0, shown).filter((r) => r === 1).length
        const failed = shown - passed

        return (
          <div
            key={lane.model}
            className={`transition-colors duration-[450ms] flex items-center gap-[12px] py-3 px-[13px] border rounded-[10px] ${
                status === 'settled' && SCENARIOS[scenarioIndex].winner === laneIdx
                  ? 'border-[#8b5cf6]/50 bg-[#8b5cf6]/[0.06]'
                  : 'border-transparent'
              }`}
          >
            {/* lane name — fixed width so all three lanes line up */}
            <div className=" font-mono text-[12.5px] w-[104px] shrink-0 flex  items-center gap-[7px]">
                <span className={`transition-opacity duration-[400ms] ${status === 'settled' &&  SCENARIOS[scenarioIndex].winner === laneIdx ? 'opacity-100 ' : 'opacity-0'}`}>🏆</span>
              <span className={`transition-colors duration-[400ms] ${status === 'settled' && SCENARIOS[scenarioIndex].winner === laneIdx ? 'text-[#d9a441]' : ''}`}>{lane.model}</span>
            </div>

            {/* boxes — one per test; state derived from `shown` */}
            <div className="flex gap-1.5 flex-1">
              {lane.results.map((result, t) => {
                const state = t < shown ? (result ? 'pass' : 'fail') : 'idle'
                return <TestBox key={t} state={state} />
              })}
            </div>

            {/* score — ONE per lane, computed above (NOT a map over results) */}
            <NumberBox passed={passed} failed={failed} />
          </div>
        )
      })}
        </div>
        {/* .verdict{
    border-top:1px solid var(--line);padding:13px 15px;
    font-family:var(--mono);font-size:11.5px;color:var(--faint);
    display:flex;align-items:center;gap:8px;min-height:44px;
  } */}
    <div className="border-t border-[#22222b] py-3.5 px-3.5 font-mono text-[11.5px] text-[#5a5a68] flex items-center gap-2 min-h-11">
      <span className={`transition-opacity duration-500 ${status === 'settled' ? 'opacity-100' : 'opacity-0'}`}>
        <Verdict headline={SCENARIOS[scenarioIndex].headline} detail={SCENARIOS[scenarioIndex].detail}/>
      </span>
    </div>
  </div>

  <p className=" text-center mt-5 font-mono text-[11px] text-[#5a5a68] whitespace-nowrap  ">
    Nothing is green until it actually ran.<br/>
    That's the whole product.
  </p>
  
  </>
}