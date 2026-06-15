"use client"

import type { ElementType } from "react"
import { ChartNoAxesCombined, HardDrive, Server, Play, LogOut, Settings, ChevronsUpDown, ChevronRight, Rocket, LayoutGrid, Plus } from "lucide-react"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { BrandLockup } from "@/components/brand-lockup"

export interface DashboardNavItem {
  icon: ElementType
  label: string
  view: string
  badge?: string
}

export interface DashboardNavDocItem {
  icon: ElementType
  label: string
  href: string
}

interface SidebarProps {
  activeView: string
  onViewChange: (view: string) => void
  userInitial: string
  userAccountLabel: string
  userLoading?: boolean
  onLogout: () => void
  creditsLabel?: string
  navPlatform?: DashboardNavItem[]
  navAdmin?: DashboardNavItem[]
  navDocs?: DashboardNavDocItem[]
}

const DEFAULT_NAV_PLATFORM: DashboardNavItem[] = [
  { icon: LayoutGrid, label: "Overview", view: "overview" },
  { icon: HardDrive, label: "Storage", view: "storage" },
  { icon: Server, label: "Environments", view: "environments" },
  { icon: Play, label: "Runs", view: "runs" },
  { icon: ChartNoAxesCombined, label: "Hillclimb", view: "hillclimb" },
  { icon: Rocket, label: "Serving", view: "serving", badge: "beta" },
]

const DEFAULT_NAV_ADMIN: DashboardNavItem[] = [
  { icon: Settings, label: "Settings", view: "settings" },
]

const DEFAULT_NAV_DOCS: DashboardNavDocItem[] = []

export function Sidebar({
  activeView,
  onViewChange,
  userInitial,
  userAccountLabel,
  userLoading = false,
  onLogout,
  creditsLabel,
  navPlatform = DEFAULT_NAV_PLATFORM,
  navAdmin = DEFAULT_NAV_ADMIN,
  navDocs = DEFAULT_NAV_DOCS,
}: SidebarProps) {
  return (
    <>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <BrandLockup
              aria-label="Go to home"
              className="px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-0"
              logoClassName="group-data-[collapsible=icon]:h-8"
              wordmarkClassName="text-sidebar-foreground group-data-[collapsible=icon]:hidden"
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <div className="px-2 pt-2 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <Button
            onClick={() => onViewChange("environments")}
            className="w-full justify-center gap-2 group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0"
          >
            <Plus className="size-4" />
            <span className="group-data-[collapsible=icon]:hidden">New run</span>
          </Button>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navPlatform.map(({ icon: Icon, label, view, badge }) => (
                <SidebarMenuItem key={view}>
                  <SidebarMenuButton isActive={activeView === view} onClick={() => onViewChange(view)}>
                    <Icon />
                    <span>{label}</span>
                    {badge && <Badge variant="default" className="ml-auto">{badge}</Badge>}
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
        <div className="px-2 group-data-[collapsible=icon]:hidden">
          <div className="rounded-md border border-sidebar-border bg-sidebar-accent/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">Credits</span>
              <span className="text-ui-caption font-medium text-sidebar-foreground">{creditsLabel ?? "—"}</span>
            </div>
            <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => onViewChange("billing")}>
              Add credits
            </Button>
          </div>
        </div>

        {navDocs.length > 0 ? (
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
        ) : null}

        <SidebarMenu>
          <SidebarMenuItem>
            {userLoading ? (
              <SidebarMenuButton disabled>
                <Skeleton className="size-5 rounded-full" />
                <Skeleton className="h-4 w-20" />
                <ChevronsUpDown className="ml-auto size-4 opacity-40" />
              </SidebarMenuButton>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton>
                    <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                      {userInitial}
                    </div>
                    <span className="truncate">{userAccountLabel}</span>
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
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  )
}
