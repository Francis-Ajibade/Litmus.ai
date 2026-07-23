import { useState } from "react";

//typescript definition that creates a flexible layout for an object where the exact property names are unknown 
// indiretcly we are defining an object type for examp[le same way number : str can be used we can also do const userprofile : Blueprint to tell js the tyoe of blueprint we are expecting 
// but every key is a text string and the values can be absolutely anything 
//rECORD IS A TYPESCRIPT utility that maps out the structure of an object by defining its allowed keys and values 
// using typescript we wana define the type of values to prevent erros from happening 
type Blueprint = Record<string, unknown>

//It forces any function that returns a RunResult to always include the counts and the overall pass/fail flag.
//TypeScript will give you autocomplete and catch mistakes (e.g. forgetting total or putting a string in passed).
//The optional explanation lets you attach a message only when needed.
type RunResult = {all_passed : boolean; passed : number ; failed : number; total: number; explanation? : string }

const API_URL = import.meta.env.VITE_API_URL;

const prev_style = " at the beginning of the code maintain this formatting *********(ABOUT 20 ) then a /* on the next line with my name : francis , and date : curr date, then close with this  ********* same number as the first one"

export default function Litmus(){
    const [problem, setProblem] = useState('')
    const [ style, setStyle ] = useState(prev_style)
    const [ blueprint, setBlueprint] = useState<Blueprint | null>(null)
    const [feedback, setFeedback] = useState('')
    // <RunResult | null>TypeScript generic – the state can be either a RunResult or null(
    // (null)Initial value – the state starts as null
    const [result, setResult] = useState<RunResult | null>(null)
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState("")
    async function getBlueprint () {
// when getting blueprint user sends request based on problem 
// we send a request to the api baclend wiht the blueprint object
// anytime user changes or sends a feedback the function is called 
// the api backend returns the bp / updated bp
        setLoading(true);
        setErrorMsg('');
        try{
            const response = await fetch(`${API_URL}/api/blueprint`,{
                method: 'POST',
                headers : {'Content-Type' : 'application/json'},
                body: JSON.stringify({problem, style, prior:blueprint, feedback})
            })

            if (response.ok){
                const data  = await response.json();
                setBlueprint(data);
            }
            if(!response.ok){
                throw new Error(`Run failed (${response.status})`);
            }
            const data = await response.json();
            setResult(data)
            // other erros of for exampke 500, 504, 404 
        }catch(err){
            console.log(err);
            setErrorMsg (err instanceof Error ? err.message: "something went wrong");
        }finally{
            setLoading(false);
        }
    }

    async function run(){
        setLoading(true);
        setErrorMsg("");
        try{
            const response = await fetch (`${API_URL}/api/run`,{
                method:"POST",
                headers : {'Content-Type' : 'application/json'},
                body: JSON.stringify({
                    problem, style, blueprint
                })
            })
            if(response.ok){
                const data  = await response.json();
                setResult(data);
            }
            if(!response.ok){
                throw new Error(`Run failed (${response.status})`);
            }

        }catch(err){
            console.log(err);
            setErrorMsg(err instanceof Error ? err.message: 'Something went wrong');
        }finally{
            setLoading(false);
        }
    }

    return(
        <div>

        </div>
    )
}