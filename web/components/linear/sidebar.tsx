"use client"

import { useState } from "react"
import {
  ChevronDown,
  MoreHorizontal,
  Search,
  Settings,
  HardDrive,
  Server,
  Play,
  Monitor,
  LogOut,
  Moon,
  Sun,
} from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { Button } from "@/components/ui/button"

interface SidebarProps {
  activeView: string
  onViewChange: (view: string) => void
  userInitial: string
  isDark: boolean
  onThemeToggle: () => void
  onLogout: () => void
}

export function Sidebar({ activeView, onViewChange, userInitial, isDark, onThemeToggle, onLogout }: SidebarProps) {
  const [workspaceOpen, setWorkspaceOpen] = useState(true)
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <aside className="w-56 h-screen bg-sidebar flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="-ml-1.5">
          <Button type="button" variant="sidebar-brand" size="none">
            <span>Tahuna</span>
          </Button>
        </div>
        <div className="flex items-center gap-0.5">
          <Button type="button" variant="sidebar-icon" size="none">
            <Search className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-1">
        {/* Workspace section */}
        <div>
          <Button
            type="button"
            variant="sidebar-workspace"
            size="none"
            onClick={() => setWorkspaceOpen(!workspaceOpen)}
          >
            <span>Workspace</span>
            <ChevronDown className={cn("w-3 h-3 transition-transform", !workspaceOpen && "-rotate-90")} />
          </Button>
          {workspaceOpen && (
            <div className="mt-1 space-y-0.5">
              <SidebarItem
                icon={<HardDrive className="w-4 h-4" />}
                label="Storage"
                active={activeView === "storage"}
                onClick={() => onViewChange("storage")}
              />
              <SidebarItem
                icon={<Server className="w-4 h-4" />}
                label="Environments"
                active={activeView === "environments"}
                onClick={() => onViewChange("environments")}
              />
              <SidebarItem
                icon={<Play className="w-4 h-4" />}
                label="Runs"
                active={activeView === "runs"}
                onClick={() => onViewChange("runs")}
              />
              <div className="relative">
                <SidebarItem
                  icon={<MoreHorizontal className="w-4 h-4" />}
                  label="More"
                  onClick={() => setMoreOpen(!moreOpen)}
                />
                {moreOpen && (
                  <div className="absolute left-0 top-full mt-1 w-48 bg-popover border border-border rounded-lg shadow-lg py-1 z-50">
                    <Link
                      href="/machines"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-secondary w-full"
                    >
                      <Monitor className="w-4 h-4" />
                      <span>Machines</span>
                    </Link>
                    <div className="border-t border-border my-1" />
                    <Button type="button" variant="sidebar-menu-item" size="none">
                      <Settings className="w-4 h-4" />
                      <span>Customize sidebar</span>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 h-10 border-t border-sidebar-border shrink-0">
        <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[11px] font-semibold text-secondary-foreground shrink-0">
          {userInitial}
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="sidebar-icon"
            size="none"
            onClick={onThemeToggle}
          >
            {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </Button>
          <Button
            type="button"
            variant="sidebar-icon"
            size="none"
            onClick={onLogout}
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </aside>
  )
}

interface SidebarItemProps {
  icon: React.ReactNode
  label: string
  badge?: number
  active?: boolean
  onClick?: () => void
}

function SidebarItem({ icon, label, badge, active, onClick }: SidebarItemProps) {
  return (
    <Button
      type="button"
      variant={active ? "sidebar-item-active" : "sidebar-item"}
      size="none"
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
      {badge !== undefined && (
        <span className="ml-auto text-xs text-muted-foreground">{badge}</span>
      )}
    </Button>
  )
}
