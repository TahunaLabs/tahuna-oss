"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { ClipboardList, HardDrive, LayoutGrid, Monitor, Play, Rocket, Server, Settings, Wallet } from "lucide-react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { StatusDot, toStatusDotVariant } from "@/components/ui/status-dot"
import { useDashboardEnvironments, useDashboardRuns } from "@/lib/dashboard-api"

const NAV_ITEMS = [
  { view: "overview", label: "Overview", icon: LayoutGrid },
  { view: "storage", label: "Storage", icon: HardDrive },
  { view: "environments", label: "Environments", icon: Server },
  { view: "runs", label: "Runs", icon: Play },
  { view: "serving", label: "Serving", icon: Rocket },
  { view: "machines", label: "Machines", icon: Monitor },
  { view: "billing", label: "Billing", icon: Wallet },
  { view: "audit_logs", label: "Audit logs", icon: ClipboardList },
  { view: "settings", label: "Settings", icon: Settings },
] as const

type DashboardCommandMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  enabled: boolean
  onSelectView: (view: string) => void
}

export function DashboardCommandMenu({ open, onOpenChange, enabled, onSelectView }: DashboardCommandMenuProps) {
  const router = useRouter()
  const runResult = useDashboardRuns(open && enabled)
  const envResult = useDashboardEnvironments(open && enabled)

  const runs = [...(runResult?.runs ?? [])].sort((a, b) => b.created_at - a.created_at).slice(0, 8)
  const environments = (envResult?.environments ?? []).slice(0, 8)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onOpenChange])

  function selectView(view: string) {
    onSelectView(view)
    onOpenChange(false)
  }

  function openRun(runId: string) {
    router.push(`/dashboard/runs/${runId}`)
    onOpenChange(false)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search"
      description="Search runs and environments, or jump to a section."
    >
      <CommandInput placeholder="Search runs, environments, or navigate…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {NAV_ITEMS.map(({ view, label, icon: Icon }) => (
            <CommandItem key={view} value={`go to ${label}`} onSelect={() => selectView(view)}>
              <Icon className="text-muted-foreground" />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>

        {runs.length > 0 ? (
          <CommandGroup heading="Runs">
            {runs.map((run) => (
              <CommandItem
                key={run.run_id}
                value={`run ${run.name ?? run.run_id} ${run.status}`}
                onSelect={() => openRun(run.run_id)}
              >
                <StatusDot variant={toStatusDotVariant(run.status)} size="xs" />
                <span className="truncate">{run.name || "Untitled run"}</span>
                <span className="ml-auto text-ui-micro capitalize text-muted-foreground">{run.status}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {environments.length > 0 ? (
          <CommandGroup heading="Environments">
            {environments.map((environment) => (
              <CommandItem
                key={environment.environment_id}
                value={`environment ${environment.name}`}
                onSelect={() => selectView("environments")}
              >
                <Server className="text-muted-foreground" />
                <span className="truncate">{environment.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  )
}
