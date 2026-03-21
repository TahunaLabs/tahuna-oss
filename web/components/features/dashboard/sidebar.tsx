"use client"

import { useState } from "react"
import {
  ChevronDown,
  Search,
  HardDrive,
  Server,
  Play,
  Monitor,
  LogOut,
  Moon,
  Sun,
  Wallet,
  ClipboardList,
  Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface SidebarProps {
  activeView: "storage" | "environments" | "runs" | "machines" | "billing" | "audit_logs" | "settings"
  onViewChange: (view: "storage" | "environments" | "runs" | "machines" | "billing" | "audit_logs" | "settings") => void
  userInitial: string
  isDark: boolean
  onThemeToggle: () => void
  onLogout: () => void
}

export function Sidebar({ activeView, onViewChange, userInitial, isDark, onThemeToggle, onLogout }: SidebarProps) {
  const [workspaceOpen, setWorkspaceOpen] = useState(true)
  const [accountOpen, setAccountOpen] = useState(true)

  return (
    <aside className="h-full w-full bg-sidebar flex flex-col">
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
              <SidebarItem
                icon={<Monitor className="w-4 h-4" />}
                label="Machines"
                active={activeView === "machines"}
                onClick={() => onViewChange("machines")}
              />
            </div>
          )}
        </div>

        <div className="mt-2">
          <Button
            type="button"
            variant="sidebar-workspace"
            size="none"
            onClick={() => setAccountOpen(!accountOpen)}
          >
            <span>Account</span>
            <ChevronDown className={cn("w-3 h-3 transition-transform", !accountOpen && "-rotate-90")} />
          </Button>
          {accountOpen && (
            <div className="mt-1 space-y-0.5">
              <SidebarItem
                icon={<Wallet className="w-4 h-4" />}
                label="Billing"
                active={activeView === "billing"}
                onClick={() => onViewChange("billing")}
              />
              <SidebarItem
                icon={<ClipboardList className="w-4 h-4" />}
                label="Audit logs"
                active={activeView === "audit_logs"}
                onClick={() => onViewChange("audit_logs")}
              />
              <SidebarItem
                icon={<Settings className="w-4 h-4" />}
                label="Settings"
                active={activeView === "settings"}
                onClick={() => onViewChange("settings")}
              />
            </div>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border shrink-0">
        <div className="flex items-center justify-between px-3 h-10">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-ui-caption font-semibold text-secondary-foreground">
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
