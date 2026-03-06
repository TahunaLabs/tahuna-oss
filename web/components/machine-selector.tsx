"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { ChevronDown, Cpu, Search, Zap } from "lucide-react"
import { useMemo, useState } from "react"

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
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id="machine-selector-trigger"
            type="button"
            aria-expanded={open}
            aria-controls="machine-selector-panel"
            disabled={!canExpand}
            className={cn(
              "flex w-full items-center justify-between gap-4 rounded-lg border border-[#e5e5e5] bg-white px-4 py-3 text-left transition",
              "disabled:cursor-not-allowed disabled:opacity-60",
              canExpand ? "hover:bg-[#f8f8f8]" : "",
            )}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-base font-semibold text-foreground">
                  {selectedMachine?.displayName ?? emptyLabel}
                </p>
                {selectedMachine ? (
                  <>
                    <Badge variant="default" className="rounded-full border-[#dcdcdc] bg-[#f8f8f8] px-2 py-0.5 text-[9px] text-[#4d4d59]">
                      GPU
                    </Badge>
                    <Badge variant="default" className="rounded-full border-[#dcdcdc] bg-[#f8f8f8] px-2 py-0.5 text-[9px] text-[#4d4d59]">
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
          </button>
        </PopoverTrigger>

        <PopoverContent
          id="machine-selector-panel"
          align="start"
          sideOffset={8}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="z-50 w-[var(--radix-popover-trigger-width)] space-y-3 rounded-lg border-[#e5e5e5] bg-white p-3"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6e6e80]" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search machines..."
              className="rounded-md border-[#e5e5e5] bg-white pl-9 font-sans text-[#0d0d0d]"
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
                  variant="outline"
                  size="sm"
                  disabled={isDisabled}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "h-9 rounded-md border-[#e5e5e5] bg-white text-xs tracking-[0.1em] text-[#6e6e80]",
                    isActive ? "bg-[#f4f4f4] text-[#0d0d0d] hover:bg-[#f0f0f0]" : "hover:bg-[#f8f8f8]",
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
            <div className="rounded-lg border border-dashed border-[#e5e5e5] bg-[#fafafa] px-4 py-8 text-center text-sm text-[#6e6e80]">
              CPU machines are not available in Tahuna yet.
            </div>
          ) : filteredMachines.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#e5e5e5] bg-[#fafafa] px-4 py-8 text-center text-sm text-[#6e6e80]">
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
                          <Badge
                            variant="default"
                            className="rounded-full border-[#dcdcdc] bg-[#f8f8f8] px-2 py-0.5 text-[9px] text-[#4d4d59]"
                          >
                            GPU
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs uppercase tracking-[0.22em] text-[#8e8ea0]">
                          {machine.id}
                        </p>
                      </div>
                      {isSelected ? (
                        <Badge variant="default" className="rounded-full border-[#dcdcdc] bg-[#f8f8f8] px-2 py-0.5 text-[9px] text-[#4d4d59]">
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
        </PopoverContent>
      </Popover>
    </div>
  )
}
