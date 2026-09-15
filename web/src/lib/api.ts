import { ensureSession } from "./session"

export async function authHeaders() {
    const session = await ensureSession()
    const token = session?.access_token

    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
}
