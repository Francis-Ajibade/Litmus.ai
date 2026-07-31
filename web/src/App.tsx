
import Litmus from "./components/Litmus/Litmus"

function App() {
  // The page shell: dark background (mockup --bg #08080a), light text
  // (--text #e9e9ef), and a centered max-width column that everything lives in
  // (mockup .wrap = max-width 1080px, auto margins, 24px side padding).
  return (
    // antialiased: Smooths font edges for crisp, premium text rendering (especially light text on dark).
  //leading-normal: Sets standard 150% line-height spacing for optimal readability on body copy.
  // min-h-screen ensures that an element stretches vertically to be at least as tall as the user's browser window  
     // it sets the minimum height of an element to 100vh 
    <div className="min-h-screen bg-[#08080a] text-[#e9e9ef] text-[15px] leading-normal antialiased">
      {/*
          position : relative -> relative(tailwind)
          z-index : 2 -> z-2
          max-wodth: 1080px -> max-w-[1080px]
          margin : 0 auto - > mx-auto this is always paried with max-w this is the centered page column idiom
       */}
       
     {/* layer 0: glow — fixed, behind everything, click-through 
          inset-0 = top,left,bottom, right = 0(fill the viewport)
          pointer events none = lets click pass through it (so elemenst on top of the background gets clicked and not the bg)
          fixed = it pulls the element completely out of the webopage flow and glues it directly to the browser window 
          so it gives the scroll effect 
     */}
     <div className="glow fixed inset-0 pointer-events-none z-0" />

      {/* layer 1: grain */}
      <div className="grain fixed inset-0 pointer-events-none z-1" />

      <div className="relative z-2">
          <Litmus />
      </div>
    </div>
  )
}

export default App
