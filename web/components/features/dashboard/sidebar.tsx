"use client"

import { HardDrive, Server, Play, Monitor, LogOut, Moon, Sun, ClipboardList, Settings, BookOpen, FileText, Layers, ChevronsUpDown, ChevronRight } from "lucide-react"
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { type DashboardView } from "@/components/features/dashboard-model"

interface SidebarProps {
  activeView: DashboardView
  onViewChange: (view: DashboardView) => void
  userInitial: string
  isDark: boolean
  onThemeToggle: () => void
  onLogout: () => void
}

const navPlatform = [
  { icon: HardDrive, label: "Storage", view: "storage" },
  { icon: Server, label: "Environments", view: "environments" },
  { icon: Play, label: "Runs", view: "runs" },
] as const satisfies { icon: React.ElementType; label: string; view: DashboardView }[]

const navAdmin = [
  { icon: Monitor, label: "Machines", view: "machines" },
  { icon: ClipboardList, label: "Audit logs", view: "audit_logs" },
  { icon: Settings, label: "Settings", view: "settings" },
] as const satisfies { icon: React.ElementType; label: string; view: DashboardView }[]

const navDocs = [
  { icon: BookOpen, label: "Getting started", href: "https://docs.tahuna.io/getting-started" },
  { icon: FileText, label: "API reference", href: "https://docs.tahuna.io/api" },
  { icon: Layers, label: "Changelog", href: "https://docs.tahuna.io/changelog" },
]

export function Sidebar({ activeView, onViewChange, userInitial, isDark, onThemeToggle, onLogout }: SidebarProps) {
  return (
    <>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <button type="button">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-semibold text-sm">
                  T
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Tahuna</span>
                  <span className="truncate text-xs text-muted-foreground">Cloud</span>
                </div>
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navPlatform.map(({ icon: Icon, label, view }) => (
                <SidebarMenuItem key={view}>
                  <SidebarMenuButton isActive={activeView === view} onClick={() => onViewChange(view)}>
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Collapsible defaultOpen className="group/collapsible">
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger>
                Administration
                <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenuSub>
                  {navAdmin.map(({ label, view }) => (
                    <SidebarMenuSubItem key={view}>
                      <SidebarMenuSubButton isActive={activeView === view} onClick={() => onViewChange(view)}>
                        {label}
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        <Collapsible defaultOpen className="group/collapsible mt-auto">
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger>
                Docs
                <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenuSub>
                  {navDocs.map(({ label, href }) => (
                    <SidebarMenuSubItem key={label}>
                      <SidebarMenuSubButton asChild>
                        <a href={href} target="_blank" rel="noopener noreferrer">
                          {label}
                        </a>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      </SidebarContent>

      <SidebarRail />

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton>
                  <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                    {userInitial}
                  </div>
                  <span className="truncate">My account</span>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuItem onClick={onThemeToggle}>
                  {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
                  <span>{isDark ? "Switch to light" : "Switch to dark"}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout}>
                  <LogOut className="size-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  )
}
