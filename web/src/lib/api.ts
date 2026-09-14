import { supabase } from "./supabase"

// Headers for a call to our API.
export async function authHeaders() {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token

    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
}
