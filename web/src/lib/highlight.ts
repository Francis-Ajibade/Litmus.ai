import hljs from "highlight.js/lib/core"
import python from "highlight.js/lib/languages/python"

// highlight.js/lib/core ships with NO grammars. Registering here — once, at module
// scope — is what makes highlight() do anything, and keeps the bundle to the
// languages we actually use rather than the ~190 in the full build.
hljs.registerLanguage("python", python)

// Java is the schema's second language (session.program_lang) but is not built
// yet. When it is, one import and one registerLanguage line here covers it
// everywhere, because nothing else in the app touches hljs.

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
}

// Code in, an HTML string of <span class="hljs-*"> tags out — ready for
// dangerouslySetInnerHTML. Safe to insert: hljs escapes the source before
// wrapping it, and the fallback path escapes it too.
//
// Unknown or unregistered languages fall back to escaped plain text rather than
// throwing, so a language the schema allows but we have not registered renders
// uncoloured instead of blanking the pane.
export function highlight(code: string, language = "python"): string {
    if (!code) return ""
    if (!hljs.getLanguage(language)) return escapeHtml(code)

    try {
        return hljs.highlight(code, { language }).value
    } catch {
        return escapeHtml(code)
    }
}
