"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { ChevronDown, Cpu, Search, Sparkles, Zap } from "lucide-react"
import { useMemo, useState } from "react"

type MachineInfo = {
  id: string
  displayName: string
  memoryInGb: number
  maxGpuCount: number
}

type MachineSelectorProps = {
  machines: MachineInfo[]
  value: string
  onChange: (value: string) => void
  loading?: boolean
  disabled?: boolean
}

type MachineTab = "gpu" | "cpu" | "ipu"

const machineTabs: { id: MachineTab; label: string; icon: typeof Zap }[] = [
  { id: "gpu", label: "GPU", icon: Zap },
  { id: "cpu", label: "CPU", icon: Cpu },
  { id: "ipu", label: "IPU", icon: Sparkles },
]

function formatMachineMeta(machine: MachineInfo) {
  return `${machine.memoryInGb} GB VRAM | Up to ${machine.maxGpuCount} GPUs`
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
      <div className="rounded-2xl border border-border bg-background/60 p-3 shadow-[0_0_0_1px_rgba(30,62,64,0.2)]">
        <button
          id="machine-selector-trigger"
          type="button"
          aria-expanded={open}
          aria-controls="machine-selector-panel"
          disabled={!canExpand}
          onClick={() => setOpen((current) => !current)}
          className={cn(
            "flex w-full items-center justify-between gap-4 rounded-xl border border-border/70 bg-card/80 px-4 py-4 text-left transition",
            "disabled:cursor-not-allowed disabled:opacity-60",
            canExpand ? "hover:border-primary/40 hover:bg-card" : "",
          )}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-base font-semibold text-foreground">
                {selectedMachine?.displayName ?? emptyLabel}
              </p>
              {selectedMachine ? (
                <>
                  <Badge variant="default" className="rounded-full border-primary/35 bg-primary/10 px-2 py-0.5 text-[9px] text-primary">
                    GPU
                  </Badge>
                  <Badge variant="default" className="rounded-full px-2 py-0.5 text-[9px]">
                    {selectedMachine.id}
                  </Badge>
                </>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedMachine ? formatMachineMeta(selectedMachine) : "Choose a machine to run your training environment."}
            </p>
          </div>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open ? "rotate-180" : "")}
          />
        </button>

        {open ? (
          <div id="machine-selector-panel" className="mt-3 space-y-3 rounded-xl border border-border/60 bg-card/50 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search machines..."
                className="pl-9"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {machineTabs.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                const isDisabled = tab.id !== "gpu"
                return (
                  <Button
                    key={tab.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isDisabled}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "h-9 rounded-lg border-border/70 bg-background/50 text-xs tracking-[0.2em]",
                      isActive ? "border-primary/50 bg-primary/15 text-primary hover:bg-primary/15" : "",
                      isDisabled ? "opacity-45" : "",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </Button>
                )
              })}
            </div>

            {activeTab !== "gpu" ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-background/40 px-4 py-8 text-center text-sm text-muted-foreground">
                {activeTab.toUpperCase()} machines are not available in Tahuna yet.
              </div>
            ) : filteredMachines.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-background/40 px-4 py-8 text-center text-sm text-muted-foreground">
                {loading ? "Loading available machines..." : "No machines match your search."}
              </div>
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
                        "w-full rounded-xl border px-4 py-3 text-left transition",
                        isSelected
                          ? "border-primary/45 bg-primary/12 shadow-[inset_0_0_0_1px_rgba(200,168,78,0.18)]"
                          : "border-border/70 bg-background/45 hover:border-primary/30 hover:bg-secondary/45",
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">{machine.displayName}</p>
                            <Badge
                              variant="default"
                              className="rounded-full border-primary/35 bg-primary/10 px-2 py-0.5 text-[9px] text-primary"
                            >
                              GPU
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs uppercase tracking-[0.22em] text-muted-foreground/80">
                            {machine.id}
                          </p>
                        </div>
                        {isSelected ? (
                          <Badge variant="default" className="rounded-full border-primary/35 bg-primary/10 px-2 py-0.5 text-[9px] text-primary">
                            Selected
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{formatMachineMeta(machine)}</p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
