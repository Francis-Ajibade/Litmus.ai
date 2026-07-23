interface CardProps {
  num: string;
  title: string;
  body: string;
}

export default function Card({ num, title, body }: CardProps) {
  return (
    <div className="bg-[#0e0e13] border border-[#22222b] rounded-[14px] p-5">
      <div className="font-mono text-[10.5px] text-[#8b5cf6] mb-3 tracking-[.1em]">{num}</div>
      <h3 className="text-[15.5px] font-semibold mb-2 tracking-[-.01em]">{title}</h3>
      <p className="text-[13.5px] text-[#8a8a99] leading-[1.65]">{body}</p>
    </div>
  )
}