import { supabase } from "./supabase"
import type { Session } from "@supabase/supabase-js"


let pending: Promise<Session | null> | null = null


export async function ensureSession(): Promise<Session | null> {
    const { data } = await supabase.auth.getSession()
    if (data.session) return data.session

    if (pending) return await pending

    const mint = (async () => {
        try {
            const { data, error } = await supabase.auth.signInAnonymously()
            if (error) throw error
            return data.session
        } catch (err) {
            console.error("Failed to mint anonymous session:", err)
            throw err  // surfaces in the thread's error bubble
        } finally {
            pending = null
        }
    })()

    // Awaited through the local, not `pending` — the finally above nulls that,
    // so reading it back after any suspension would hand out null instead.
    pending = mint
    return await mint
}
