import Card from "./Card";

export default function Claims(){
    const claims = [
        { num: '01', title: "It can't lie to you", body: "ChatGPT can't tell you it's wrong — it doesn't know. Its failure mode is confident wrongness. Ours is a red X you can act on." },
        { num: '02', title: "It knows it's an assignment", body: "Lecturers plant traps — 1-based indexing, empty inputs, banned built-ins. We flag the ones you didn't know to look for, before a line is written." },
        { num: '03', title: "It tells you where you stand", body: "No tool tells a student \"you passed, but Claude's version was 3× faster.\" That's the part that makes you better, not just done." },
      ]
 
    return <>
    {/* Tailwind's breakpoint prefixes (sm: 640px, md: 768px, lg: 1024px, xl: 1280px) are all min-width queries
    SO it applies from width and up 
    so in the code grid-cols-3 gets applied from 768PX and up 
    */}
    <div className="grid grid-cols-1 gap-3.5 mt-[82px] md:grid-cols-3">
    {claims.map((item) => (
         <Card key={item.num} {...item} />
    ))}

    </div>
    </>

}