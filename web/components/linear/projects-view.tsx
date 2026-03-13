"use client"

import { useState } from "react"
import { Plus, SlidersHorizontal, LayoutGrid } from "lucide-react"
import { cn } from "@/lib/utils"

export function ProjectsView() {
  const [activeTab, setActiveTab] = useState("all")

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border">
        <h1 className="text-sm font-medium text-foreground">Projects</h1>
        <button className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground">
          <Plus className="w-4 h-4" />
        </button>
      </header>

      {/* Tabs and filters */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-1">
          <TabButton label="All projects" active={activeTab === "all"} onClick={() => setActiveTab("all")} />
          <button className="flex items-center gap-1 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded">
            <Plus className="w-3.5 h-3.5" />
            <span>New view</span>
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground">
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          <button className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground">
            <SlidersHorizontal className="w-4 h-4" />
          </button>
          <button className="p-1.5 hover:bg-secondary rounded text-muted-foreground hover:text-foreground">
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Empty state */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          {/* Projects illustration */}
          <div className="mb-6 flex justify-center">
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-muted-foreground">
              <g opacity="0.5">
                {/* Isometric cubes representation */}
                <path d="M40 20L60 32V56L40 68L20 56V32L40 20Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <path d="M40 44L60 32" stroke="currentColor" strokeWidth="1.5" />
                <path d="M40 44L20 32" stroke="currentColor" strokeWidth="1.5" />
                <path d="M40 44V68" stroke="currentColor" strokeWidth="1.5" />
                {/* Additional cube layers */}
                <path d="M30 26L50 38V54L30 66" stroke="currentColor" strokeWidth="1" opacity="0.5" />
                <path d="M50 26L30 38V54L50 66" stroke="currentColor" strokeWidth="1" opacity="0.5" />
              </g>
            </svg>
          </div>

          <h2 className="text-lg font-semibold text-foreground mb-2">Projects</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Projects are larger units of work with a clear outcome, such as a new feature you want to ship. They can be shared across multiple teams and are comprised of issues and optional documents.
          </p>

          <div className="flex items-center justify-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded text-sm font-medium hover:bg-accent/90">
              Create new project
              <kbd className="px-1.5 py-0.5 bg-accent-foreground/20 rounded text-xs">N</kbd>
              <span className="text-xs">then</span>
              <kbd className="px-1.5 py-0.5 bg-accent-foreground/20 rounded text-xs">P</kbd>
            </button>
            <button className="px-4 py-2 bg-secondary text-foreground rounded text-sm hover:bg-secondary/80">
              Documentation
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface TabButtonProps {
  label: string
  active?: boolean
  onClick?: () => void
}

function TabButton({ label, active, onClick }: TabButtonProps) {
  return (
    <button
      className={cn(
        "px-3 py-1.5 text-sm rounded",
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
      )}
      onClick={onClick}
    >
      {label}
    </button>
  )
}
