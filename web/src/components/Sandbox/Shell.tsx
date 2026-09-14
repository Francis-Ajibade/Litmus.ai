import { useState } from "react"
import { Outlet } from "react-router"
import Sidebar from "./Sidebar"

// The app shell: a two-column grid that owns the viewport.
export default function Shell() {
    // Collapse lives here, not in the sidebar — the grid track is what animates.
    const [collapsed, setCollapsed] = useState(false)

    return (
        <div
            className="grid h-dvh overflow-hidden bg-(--bg) text-(--text) antialiased"
            style={{
                gridTemplateColumns: `${collapsed ? 64 : 260}px minmax(0, 1fr)`,
                transition: 'grid-template-columns .18s ease',
            }}
        >
            <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />

            <main className="min-h-0 min-w-0 overflow-y-auto">
                <Outlet />
            </main>
        </div>
    )
}

// Every rail item routes somewhere real; missing surfaces render ComingSoon.
export function ComingSoon({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="flex min-h-full items-center justify-center px-6 py-16">
            <div className="flex max-w-[440px] flex-col items-center gap-3 rounded-[14px] border border-dashed border-(--line) px-8 py-14 text-center">
                <h1 className="font-mono text-[14px] font-semibold text-(--text)">{title}</h1>
                <p className="text-[13px] leading-[1.65] text-(--muted)">{children}</p>
            </div>
        </div>
    )
}
