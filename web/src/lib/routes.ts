// One place for the workspace path, so the route table and every navigate agree.
// The mode is in the path because Tutor gets its own workspace later.
export const WORKSPACE = '/sandbox/verifier/workspace'

export const workspacePath = (sessionId?: string | null) =>
    sessionId ? `${WORKSPACE}/${sessionId}` : WORKSPACE
