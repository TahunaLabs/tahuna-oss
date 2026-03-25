"use client"

import { HardDrive, Server, Play, Monitor, LogOut, ClipboardList, Settings, BookOpen, FileText, Layers, ChevronsUpDown, ChevronRight, Wallet } from "lucide-react"
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
} from "@/components/ui/sidebar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CreditsGauge } from "@/components/ui/credits-gauge"
import { type DashboardView } from "@/components/features/dashboard-model"
import { LINKS_CONFIG } from "@/config"

interface NavItem {
  icon: React.ElementType
  label: string
  view: DashboardView
}

interface NavDocItem {
  icon: React.ElementType
  label: string
  href: string
}

interface SidebarProps {
  activeView: DashboardView
  onViewChange: (view: DashboardView) => void
  userInitial: string
  onLogout: () => void
  navPlatform?: NavItem[]
  navAdmin?: NavItem[]
  navDocs?: NavDocItem[]
  balanceCents?: number
  maxCents?: number
}

const DEFAULT_NAV_PLATFORM: NavItem[] = [
  { icon: HardDrive, label: "Storage", view: "storage" },
  { icon: Server, label: "Environments", view: "environments" },
  { icon: Play, label: "Runs", view: "runs" },
]

const DEFAULT_NAV_ADMIN: NavItem[] = [
  { icon: Monitor, label: "Machines", view: "machines" },
  { icon: ClipboardList, label: "Audit logs", view: "audit_logs" },
  { icon: Settings, label: "Settings", view: "settings" },
]

const DEFAULT_NAV_DOCS: NavDocItem[] = [
  { icon: BookOpen, label: "Getting started", href: LINKS_CONFIG.gettingStartedUrl },
  { icon: FileText, label: "API reference", href: LINKS_CONFIG.apiReferenceUrl },
  { icon: Layers, label: "Changelog", href: LINKS_CONFIG.changelogUrl },
]

export function Sidebar({
  activeView,
  onViewChange,
  userInitial,
  onLogout,
  navPlatform = DEFAULT_NAV_PLATFORM,
  navAdmin = DEFAULT_NAV_ADMIN,
  navDocs = DEFAULT_NAV_DOCS,
  balanceCents,
  maxCents,
}: SidebarProps) {
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
              <CollapsibleTrigger className="hover:text-sidebar-foreground/80 focus-visible:outline-hidden cursor-pointer">
                Administration
                <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenuSub className="mx-2 border-l-0 px-2">
                  {navAdmin.map(({ icon: Icon, label, view }) => (
                    <SidebarMenuSubItem key={view}>
                      <SidebarMenuSubButton isActive={activeView === view} onClick={() => onViewChange(view)}>
                        <Icon className="size-4" />
                        <span>{label}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      </SidebarContent>

      <SidebarFooter>
        {balanceCents !== undefined && maxCents !== undefined && (
          <>
            <div className="rounded border border-sidebar-border bg-sidebar-accent/30 p-2.5 group-data-[collapsible=icon]:hidden">
              <CreditsGauge balanceCents={balanceCents} maxCents={maxCents} />
            </div>
            <SidebarMenu className="hidden group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center">
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Credits">
                  <Wallet />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </>
        )}
        <SidebarGroup>
          <SidebarGroupLabel>Help</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-2">
              {navDocs.map(({ icon: Icon, label, href }) => (
                <SidebarMenuItem key={label}>
                  <SidebarMenuButton asChild tooltip={label}>
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      <Icon className="size-4" />
                      <span className="group-data-[collapsible=icon]:hidden">{label}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

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
                <DropdownMenuItem onClick={() => onViewChange("settings")}>
                  <Settings className="size-4" />
                  <span>Settings</span>
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
