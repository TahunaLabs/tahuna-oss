"use client"

import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type FilterDropdownOption = {
  value: string
  label: string
}

type FilterDropdownProps = {
  ariaLabel: string
  value: string
  options: FilterDropdownOption[]
  onSelect: (value: string) => void
}

function FilterDropdown({
  ariaLabel,
  value,
  options,
  onSelect,
}: FilterDropdownProps) {
  const selected = options.find((option) => option.value === value)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="control"
          aria-label={ariaLabel}
          className="w-full justify-between md:w-auto md:justify-center"
        >
          {selected?.label || options[0]?.label || "Filter"}
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} className="min-w-44">
        {options.map((option) => (
          <DropdownMenuItem key={`${ariaLabel}-${option.value}`} onSelect={() => onSelect(option.value)}>
            <span className="inline-flex w-4 justify-center text-muted-foreground">
              {option.value === value ? "•" : ""}
            </span>
            <span>{option.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { FilterDropdown }
