import { useState } from 'react'


// 🎯 YOUR EXERCISE — the interactive part. Styling is done; you write the logic.
// This is the .signup block from coderace-waitlist.html, but instead of the
// mockup's fake "hide the form" trick, it really POSTs to your /api/waitlist.

const API_URL = import.meta.env.VITE_API_URL
export default function SignupForm() {
  // ---- STATE (provided — study the shapes) ----

  // `email` is a CONTROLLED value: React owns it. The <input> displays `email`,
  // and each keystroke calls setEmail to update it. (You'll wire that below.)
  const [email, setEmail] = useState('')

  // `status` is a tiny state machine for the request lifecycle. Naming the four
  // states (instead of juggling isLoading/isDone/isError booleans) makes illegal
  // combos impossible — you can't be "submitting AND success" at once.
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')

  // Human-readable message shown only when status === 'error'.
  const [errorMsg, setErrorMsg] = useState('')

  // ---- THE SUBMIT HANDLER: your main TODO ----
  async function handleSubmit(e: React.FormEvent) {
    // TODO(you):
    // 1) e.preventDefault()  — CRITICAL. Without it the browser does a full page
    //    reload on submit and everything here is thrown away. #1 form gotcha.
    e.preventDefault();
    // 2) setStatus('submitting'); clear any old errorMsg.
    setStatus('submitting')
    setErrorMsg('')
    try{
    const response = await fetch(`${API_URL}/api/waitlist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        })
        // handle success first 
        if(response.ok){
          const data = await response.json();
          if(data.status === 'added') {
            setStatus('success');
            // becasue duplicqated email also returns respoinse 200(ok)
            //but email already existing is an error and should be handled 
          } else if (data.status === 'already_on_list') {
            setStatus('error');
            setErrorMsg("That email is already on the waitlist.");
          }
          return; // Exit early since we handled the 200 response
        }
        // cehck for speicifc 422 validation error 
        // emailstr from pyndatic returns 422 on invalid email
        if(response.status === 422){
          setStatus('error');
          setErrorMsg("That doesn't look like a valid email");
          return;
        }
        //handles 500,503,404 
          setStatus('error'); 
          setErrorMsg("Something went wrong");

      }catch(err){
        //Handle network failures
        setStatus('error');
        setErrorMsg("Couldnt't reach the server")
      }
    //    (the Content-Type header is what makes FastAPI parse JSON — same as the
    //     -H flag from your curl tests.)
    // 4) Branch on the result:
    //      res.ok            -> setStatus('success')
    //      res.status === 422 -> setStatus('error') + "That doesn't look like a valid email."
    //      anything else     -> setStatus('error') + a generic "Something went wrong."
    // 5) Wrap the fetch in try/catch. A network failure (API server down) THROWS
    //    rather than returning a response, so catch it and show "Couldn't reach
    //    the server." — this is the edge case beginners always forget.
  }

  // ---- RENDER ----

  // On success, swap the whole form out for a confirmation. (Early return =
  // "if we're done, render this and nothing else.")
  if (status === 'success') {
    return (
      //mx-auto utility for horizontally centering a block element in its parent container 
      <div className="mx-auto mt-[34px] max-w-[440px] rounded-[13px] border border-green-500/30 bg-green-500/[0.07] p-[15px] text-center text-sm text-[#3fb950]">
        You're on the list. I'll email you when the sandbox is running — nothing before that.
      </div>
    )
  }

  return (
    <div className="mx-auto mt-[34px] max-w-[440px]">
      {/* TODO(you): attach the handler — add  onSubmit={handleSubmit}  to this <form>. */}
      <form className="flex gap-2 rounded-[13px] border border-white/10 bg-[#14141a]/55 p-[7px] backdrop-saturate-[1.3] backdrop-blur-[20px] transition-colors duration-200
focus-within:border-[#8b5cf6]"

      onSubmit={handleSubmit}>

        {/* TODO(you): make this a CONTROLLED input —
              value={email}  and  onChange={(e) => setEmail(e.target.value)} */}
        <input
          type="email"
          value={email}
          onChange={(e)=> setEmail(e.target.value)}
          required
          placeholder="you@gmail.com"
          className="flex-1 bg-transparent px-[11px] py-[9px] text-[14.5px] text-[#e9e9ef] outline-none placeholder:text-[#5a5a68]"
        />
        {/* TODO(you): while submitting, disable the button and change its label —
              disabled={status === 'submitting'}
              and show "Joining…" instead of "Get early access". */}
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="whitespace-nowrap rounded-[9px] bg-violet-500 px-[18px] py-[10px] text-sm font-semibold text-white shadow-[0_4px_18px_rgba(139,92,246,0.42)] hover:brightness-110"
        >
          {status === 'submitting' ? "Joining..." : "Get early access"}
        </button>
      </form>

      {/* Conditional rendering with && : the <div> renders ONLY when the left
          side is truthy. This one is done for you as the pattern to copy. */}
      {status === 'error' && (
        <div className="mt-3 text-[13px] text-[#f85149]">{errorMsg}</div>
      )}

      <div className="mt-3 font-mono text-[11px] leading-relaxed text-[#5a5a68]">
        CS students first · no spam, one email when it's ready · unsubscribe anytime
      </div>
    </div>
  )
}
