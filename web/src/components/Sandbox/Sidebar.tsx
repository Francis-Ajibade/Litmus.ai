import { useEffect, useRef, useState } from "react"
import { NavLink, useNavigate } from "react-router"
import { supabase } from "../../lib/supabase"

// ── row primitives ────────────────────────────────────────────────────────
const ROW = "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors"
const IDLE = "text-(--muted) hover:bg-(--panel) hover:text-(--text)"
const ON = "bg-(--panel) text-(--text)"

const Icon = ({ children, size = 16 }: { children: React.ReactNode; size?: number }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
         strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
        {children}
    </svg>
)

const HomeIcon   = () => <Icon><path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></Icon>
const SearchIcon = () => <Icon><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></Icon>
const GridIcon   = () => <Icon><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></Icon>
const LayersIcon = () => <Icon><path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/></Icon>
const StarIcon   = () => <Icon><path d="m12 3.5 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 10l6.1-.9Z"/></Icon>
// BookIcon lives here for the course rows, which appear once courses exist.
const PlusIcon   = () => <Icon><path d="M12 5v14"/><path d="M5 12h14"/></Icon>
const CapIcon    = () => <Icon size={14}><path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="M6 10.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5"/></Icon>
const WandIcon   = () => <Icon size={14}><path d="M14.7 6.3a4 4 0 0 0 5.1 5.1l-8.4 8.4a2.4 2.4 0 0 1-3.4-3.4l8.4-8.4a4 4 0 0 0-5.1-5.1l3 3-1.4 3.5-3.5 1.4-3-3"/></Icon>
const PanelIcon  = () => <Icon size={15}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M10 4v16"/></Icon>
const ChevronUp  = () => <Icon size={13}><path d="m18 15-6-6-6 6"/></Icon>
const GearIcon   = () => <Icon size={15}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55Z"/></Icon>
const MoonIcon   = () => <Icon size={15}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></Icon>
const SignOutIcon = () => <Icon size={15}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></Icon>

// Which tool the sandbox is showing. Tutor is really disabled, not styled to
// look it — there is no tutor route yet.
function ModeToggle({ collapsed }: { collapsed: boolean }) {
    if (collapsed) {
        return (
            <div className="mb-3.5 flex justify-center" title="Verifier · the tutor is coming">
                <span className="grid h-8 w-8 place-items-center rounded-[9px] bg-(--panel-2) text-(--violet)">
                    <WandIcon />
                </span>
            </div>
        )
    }

    return (
        <div className="mb-3.5 grid grid-cols-2 gap-1 rounded-[11px] border border-(--line) bg-(--panel) p-1">
            <button
                type="button"
                disabled
                title="The tutor lands with a later build"
                className="flex cursor-not-allowed items-center justify-center gap-1.5 rounded-[8px] px-2 py-1.5 text-[13px] text-(--faint) opacity-60"
            >
                <CapIcon />
                Tutor
                <span className="rounded-[5px] bg-(--line) px-1 py-px font-mono text-[9px] tracking-[.04em] text-(--faint)">
                    soon
                </span>
            </button>
            <span
                aria-current="true"
                className="flex items-center justify-center gap-1.5 rounded-[8px] bg-(--panel-2) px-2 py-1.5 text-[13px] font-semibold text-(--text) shadow-[0_1px_3px_rgba(0,0,0,.35)]"
            >
                <span className="text-(--violet)"><WandIcon /></span>
                Verifier
            </span>
        </div>
    )
}

function SectionLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
    if (collapsed) return <div className="mx-2.5 my-2 border-t border-(--line-soft)" />
    return <span className="px-2.5 pt-4 pb-1.5 text-[11px] tracking-[.02em] text-(--faint)">{children}</span>
}

function NavRow({ to, end, icon, label, collapsed, trailing }: {
    to: string; end?: boolean; icon: React.ReactNode; label: string
    collapsed: boolean; trailing?: React.ReactNode
}) {
    return (
        <NavLink
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={({ isActive }) => `${ROW} ${isActive ? ON : IDLE} ${collapsed ? "justify-center px-0" : ""}`}
        >
            {({ isActive }) => (
                <>
                    <span className={isActive ? "text-(--violet)" : "text-(--faint)"}>{icon}</span>
                    {!collapsed && <span className="truncate">{label}</span>}
                    {!collapsed && trailing}
                </>
            )}
        </NavLink>
    )
}

function MenuItem({ icon, label, hint, danger, onClick, soon }: {
    icon: React.ReactNode; label: string; hint?: string
    danger?: boolean; onClick?: () => void; soon?: boolean
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={soon}
            role="menuitem"
            className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] ${
                soon ? "cursor-default" : "hover:bg-(--panel-3)"
            } ${danger ? "text-(--red)" : "text-(--muted)"}`}
        >
            <span className={danger ? "text-(--red)" : "text-(--faint)"}>{icon}</span>
            <span>{label}</span>
            <span className="ml-auto flex items-center gap-2">
                {hint && <span className="font-mono text-[10.5px] text-(--faint)">{hint}</span>}
                {soon && <span className="rounded border border-(--line) px-1.5 py-px font-mono text-[9.5px] text-(--faint)">soon</span>}
            </span>
        </button>
    )
}

export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
    const navigate = useNavigate()
    const [menuOpen, setMenuOpen] = useState(false)
    const [email, setEmail] = useState<string | null>(null)
    const footerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null))
        const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
            setEmail(session?.user.email ?? null)
        })
        return () => sub.subscription.unsubscribe()
    }, [])

    useEffect(() => {
        if (!menuOpen) return
        const onDown = (e: MouseEvent) => {
            if (!footerRef.current?.contains(e.target as Node)) setMenuOpen(false)
        }
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('keydown', onKey)
        }
    }, [menuOpen])

    async function signOut() {
        await supabase.auth.signOut()
        navigate('/')
    }

    return (
        <aside className="flex h-full flex-col overflow-hidden bg-(--bg) px-3 py-4">

            <div className={`flex items-center px-1.5 pb-3.5 ${collapsed ? "justify-center" : "justify-between"}`}>
                {!collapsed && (
                    <NavLink to="/sandbox" className="flex items-center gap-2.5">
                        <img src="/favicon.svg" alt="" width={20} height={20} />
                        <span className="font-mono text-[14px] font-semibold text-(--text)">
                            litmus<span className="text-(--violet)">.</span>
                        </span>
                    </NavLink>
                )}
                <button
                    type="button"
                    onClick={onToggle}
                    aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    className="rounded-md p-1 text-(--faint) transition-colors hover:bg-(--panel) hover:text-(--text)"
                >
                    <PanelIcon />
                </button>
            </div>

            <ModeToggle collapsed={collapsed} />

            <button
                type="button"
                title={collapsed ? "Your workspace" : undefined}
                className={`mb-4 flex items-center gap-2.5 rounded-[10px] border border-(--line) bg-(--panel) px-2.5 py-2.5 text-left transition-colors hover:bg-(--panel-2) ${collapsed ? "justify-center px-0" : ""}`}
            >
                <span className="grid h-6.5 w-6.5 shrink-0 place-items-center rounded-md bg-[linear-gradient(135deg,var(--violet),var(--magenta))] text-[12px] font-bold text-white">
                    {(email?.[0] ?? '?').toUpperCase()}
                </span>
                {!collapsed && (
                    <span className="flex-1 truncate text-[13.5px] font-semibold text-(--text)">
                        {email ? `${email.split('@')[0]}'s Litmus` : 'Litmus'}
                    </span>
                )}
            </button>

            <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
                <NavRow to="/sandbox" end collapsed={collapsed} icon={<HomeIcon />} label="Home" />
                <NavRow to="/sandbox/search" collapsed={collapsed} icon={<SearchIcon />} label="Search"
                    trailing={
                        <span className="ml-auto flex gap-0.5">
                            <b className="rounded border border-(--line) px-1 py-px font-mono text-[9.5px] font-normal text-(--faint)">&#8984;</b>
                            <b className="rounded border border-(--line) px-1 py-px font-mono text-[9.5px] font-normal text-(--faint)">K</b>
                        </span>
                    }
                />
                <NavRow to="/sandbox/templates" collapsed={collapsed} icon={<GridIcon />} label="Templates" />

                <SectionLabel collapsed={collapsed}>Sessions</SectionLabel>
                <NavRow to="/sandbox/sessions" end collapsed={collapsed} icon={<LayersIcon />} label="All sessions" />
                <NavRow to="/sandbox/starred" collapsed={collapsed} icon={<StarIcon />} label="Starred" />

                <SectionLabel collapsed={collapsed}>Courses</SectionLabel>
                {!collapsed && (
                    <p className="px-2.5 py-1.5 text-[11.5px] leading-[1.5] text-(--faint)">
                        No courses yet. Add one to ground the tutor in your notes.
                    </p>
                )}
                <NavRow to="/sandbox/courses/new" collapsed={collapsed} icon={<PlusIcon />} label="New course" />

                {!collapsed && (
                    <>
                        <SectionLabel collapsed={false}>Recents</SectionLabel>
                        <p className="px-2.5 py-1.5 text-[11.5px] leading-[1.5] text-(--faint)">
                            Nothing here yet. Your last few sessions land here.
                        </p>
                    </>
                )}
            </nav>

            <div ref={footerRef} className="relative shrink-0 pt-2">
                {menuOpen && !collapsed && (
                    <div
                        role="menu"
                        className="absolute bottom-full left-0 z-30 mb-2 w-[224px] overflow-hidden rounded-xl border border-(--line) bg-(--panel-2) p-1 shadow-[0_18px_40px_rgba(0,0,0,.55)]"
                    >
                        <MenuItem icon={<GearIcon />} label="Settings" soon />
                        <MenuItem icon={<MoonIcon />} label="Appearance" hint="Dark" soon />
                        <div className="my-1 border-t border-(--line-soft)" />
                        {email
                            ? <MenuItem icon={<SignOutIcon />} label="Sign out" danger onClick={signOut} />
                            : <MenuItem icon={<SignOutIcon />} label="Sign in" onClick={() => navigate('/signin')} />}
                    </div>
                )}

                <button
                    type="button"
                    onClick={() => setMenuOpen(o => !o)}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-1.5 py-2 transition-colors hover:bg-(--panel) ${collapsed ? "justify-center px-0" : ""}`}
                >
                    <span className="grid h-6.5 w-6.5 shrink-0 place-items-center rounded-full bg-[linear-gradient(135deg,var(--violet),var(--magenta))] text-[11px] font-bold text-white">
                        {(email?.[0] ?? '').toUpperCase()}
                    </span>
                    {!collapsed && (
                        <>
                            <span className="flex-1 truncate text-left text-[12.5px] text-(--muted)">
                                {email ?? 'Guest · not signed in'}
                            </span>
                            <span className="text-(--faint)"><ChevronUp /></span>
                        </>
                    )}
                </button>
            </div>
        </aside>
    )
}
