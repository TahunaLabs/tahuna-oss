"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { ChevronDown, Cpu, Search, Zap } from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"

type MachineInfo = {
  id: string
  displayName: string
  memoryInGb: number
  maxGpuCount: number
  pricePerHour?: number | null
}

type MachineSelectorProps = {
  machines: MachineInfo[]
  value: string
  onChange: (value: string) => void
  loading?: boolean
  disabled?: boolean
}

type MachineTab = "gpu" | "cpu"

const machineTabs: { id: MachineTab; label: string; icon: typeof Zap }[] = [
  { id: "gpu", label: "GPU", icon: Zap },
  { id: "cpu", label: "CPU", icon: Cpu },
]

function formatMachineMeta(machine: MachineInfo) {
  const price = typeof machine.pricePerHour === "number" ? `$${machine.pricePerHour.toFixed(2)}/hr` : "Pricing unavailable"
  return `${machine.memoryInGb} GB VRAM | Up to ${machine.maxGpuCount} GPUs | ${price}`
}

function MachineSelectorEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-[#e5e5e5] bg-[#fafafa] px-4 py-8 text-center text-sm text-[#6e6e80]">
      {children}
    </div>
  )
}

export function MachineSelector({
  machines,
  value,
  onChange,
  loading = false,
  disabled = false,
}: MachineSelectorProps) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<MachineTab>("gpu")
  const [query, setQuery] = useState("")

  const selectedMachine = useMemo(() => {
    return machines.find((machine) => machine.id === value) ?? null
  }, [machines, value])

  const filteredMachines = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return machines
    return machines.filter((machine) => {
      return [machine.displayName, machine.id, `${machine.memoryInGb}`, `${machine.maxGpuCount}`]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    })
  }, [machines, query])

  const emptyLabel = loading ? "Loading machines..." : "No GPU machines available"
  const canExpand = !disabled && (machines.length > 0 || loading)

  return (
    <div className="space-y-2">
      <Label htmlFor="machine-selector-trigger">Machine</Label>
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            id="machine-selector-trigger"
            type="button"
            aria-expanded={open}
            aria-controls="machine-selector-panel"
            variant="dashboard-machine-trigger"
            size="none"
            disabled={!canExpand}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-base font-semibold text-foreground">
                  {selectedMachine?.displayName ?? emptyLabel}
                </p>
                {selectedMachine ? (
                  <>
                    <Badge variant="dashboard-chip">
                      GPU
                    </Badge>
                    <Badge variant="dashboard-chip">
                      {selectedMachine.id}
                    </Badge>
                  </>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-[#6e6e80]">
                {selectedMachine ? formatMachineMeta(selectedMachine) : "Choose a machine to run your training environment."}
              </p>
            </div>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 text-[#6e6e80] transition-transform", open ? "rotate-180" : "")}
            />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          id="machine-selector-panel"
          variant="dashboard"
          align="start"
          sideOffset={8}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6e6e80]" />
            <Input
              variant="dashboard"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search machines..."
              className="pl-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {machineTabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              const isDisabled = tab.id !== "gpu"
              return (
                <Button
                  key={tab.id}
                  type="button"
                  variant={isActive ? "dashboard-tab-active" : "dashboard-tab"}
                  size="none"
                  disabled={isDisabled}
                  onClick={() => setActiveTab(tab.id)}
                  className="w-full"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </Button>
              )
            })}
          </div>

          {activeTab !== "gpu" ? (
            <MachineSelectorEmptyState>
              CPU machines are not available in Tahuna yet.
            </MachineSelectorEmptyState>
          ) : filteredMachines.length === 0 ? (
            <MachineSelectorEmptyState>
              {loading ? "Loading available machines..." : "No machines match your search."}
            </MachineSelectorEmptyState>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {filteredMachines.map((machine) => {
                const isSelected = machine.id === value
                return (
                  <button
                    key={machine.id}
                    type="button"
                    onClick={() => {
                      onChange(machine.id)
                      setOpen(false)
                    }}
                    className={cn(
                      "w-full rounded-lg border px-4 py-3 text-left transition",
                      isSelected
                        ? "border-[#d0d0d0] bg-[#f4f4f4]"
                        : "border-[#e5e5e5] bg-white hover:bg-[#f8f8f8]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">{machine.displayName}</p>
                          <Badge variant="dashboard-chip">
                            GPU
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs uppercase tracking-[0.22em] text-[#8e8ea0]">
                          {machine.id}
                        </p>
                      </div>
                      {isSelected ? (
                        <Badge variant="dashboard-chip">
                          Selected
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm text-[#6e6e80]">{formatMachineMeta(machine)}</p>
                  </button>
                )
              })}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
