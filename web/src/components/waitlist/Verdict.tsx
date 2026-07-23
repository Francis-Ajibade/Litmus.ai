interface VerdictProps{
    headline : string;
    detail : string;
}

function getVerdict(headline:string, detail:string){
    if (headline.includes("wins")){
        return <div>
                <span className="vg transition">{headline}</span>
                <span>{detail} </span>
            </div>
    }
    else{
        return <div>
        <span className="va">{headline}</span>
        <span>{detail} </span>
    </div>
    }
}
export default function Verdict({headline,detail}:VerdictProps){
    
    const text = getVerdict(headline, detail)

    return <>
        {text}
    </>
}