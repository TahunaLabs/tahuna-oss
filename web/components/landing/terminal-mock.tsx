import type { ReactNode } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type TerminalStep = { kind: "command" | "status"; value: string }

export const DEFAULT_TERMINAL_STEPS: TerminalStep[] = [
  { kind: "command", value: "$ tahuna init ." },
  { kind: "status", value: "project configured" },
  { kind: "status", value: "Python entrypoint detected" },
  { kind: "command", value: "$ tahuna train" },
  { kind: "status", value: "syncing project and data" },
  { kind: "status", value: "provisioning RunPod L4" },
  { kind: "status", value: "running train.py on cuda" },
  { kind: "status", value: "streaming logs and metrics" },
  { kind: "status", value: "artifacts saved, compute terminated" },
]

type TerminalMockProps = {
  title?: string
  steps?: TerminalStep[]
  footer?: ReactNode
  className?: string
}

export function TerminalMock({
  title = "tahuna train",
  steps = DEFAULT_TERMINAL_STEPS,
  footer,
  className,
}: TerminalMockProps) {
  return (
    <Card variant="default" className={cn("rounded-lg bg-card/95", className)}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-muted-foreground/30" />
          <span className="h-3 w-3 rounded-full bg-muted-foreground/30" />
          <span className="h-3 w-3 rounded-full bg-muted-foreground/30" />
        </div>
        <span className="ml-2 text-xs text-muted-foreground">{title}</span>
      </div>

      <CardContent className="min-h-80 space-y-4 p-5 text-sm">
        <div className="space-y-1.5">
          {steps.map((step) => (
            <div key={step.value} className="flex items-center gap-2 text-xs">
              {step.kind === "command" ? (
                <span className="text-foreground">&gt;</span>
              ) : (
                <span className="ml-3 h-1 w-1 rounded-full bg-foreground/45" />
              )}
              <span
                className={cn(
                  "leading-relaxed",
                  step.kind === "command" ? "text-foreground/85" : "text-muted-foreground",
                )}
              >
                {step.value}
              </span>
            </div>
          ))}
        </div>

        {footer ? (
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
            {footer}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
