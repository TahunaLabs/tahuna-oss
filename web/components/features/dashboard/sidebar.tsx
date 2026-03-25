"use client"

import { Search, HardDrive, Server, Play, Monitor, LogOut, Moon, Sun, ClipboardList, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { type DashboardView } from "@/components/features/dashboard-model"

interface SidebarProps {
  activeView: DashboardView
  onViewChange: (view: DashboardView) => void
  userInitial: string
  isDark: boolean
  onThemeToggle: () => void
  onLogout: () => void
}

export function Sidebar({ activeView, onViewChange, userInitial, isDark, onThemeToggle, onLogout }: SidebarProps) {
  return (
    <>
      <SidebarHeader className="gap-0 px-3 py-2.5">
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
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <SidebarGroup className="px-2 py-1.5">
          <Button type="button" variant="default" size="compact" className="w-full justify-center">
            <span>+ New environment</span>
          </Button>
        </SidebarGroup>

        <SidebarGroup className="px-2 py-1">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto px-2 py-1">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              <SidebarItem
                icon={<Monitor className="w-4 h-4" />}
                label="Machines"
                active={activeView === "machines"}
                onClick={() => onViewChange("machines")}
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-0">
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
      </SidebarFooter>
    </>
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
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        isActive={active}
        onClick={onClick}
      >
        {icon}
        <span>{label}</span>
        {badge !== undefined && (
          <span className="ml-auto text-xs text-muted-foreground">{badge}</span>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
