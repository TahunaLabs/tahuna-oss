"use client"

import { Check, Copy } from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const commands = {
  brew: "brew tap Pazuzzu/tahuna && brew install tahuna",
  direct: "brew install Pazuzzu/tahuna/tahuna",
} as const

const terminalSteps = [
  { kind: "command", value: "$ tahuna init ." },
  { kind: "status", value: "config def" },
  { kind: "status", value: "entrypoint detected, environment scaffolded" },
  { kind: "command", value: "$ tahuna sync" },
  { kind: "status", value: "syncing code, data, env config" },
  { kind: "command", value: "$ tahuna train" },
  { kind: "status", value: "materializing" },
  { kind: "status", value: "finetuning minimax2.5" },
  { kind: "status", value: "streaming metrics" },
]

export function LandingTerminalSection() {
  const [activeCommand, setActiveCommand] = useState<keyof typeof commands>("brew")
  const [copiedCommand, setCopiedCommand] = useState(false)

  function handleCopy() {
    void navigator.clipboard.writeText(commands[activeCommand])
    setCopiedCommand(true)
    window.setTimeout(() => setCopiedCommand(false), 2000)
  }

  return (
    <section id="loop" className="border-t border-border px-6 py-20 md:py-28">
      <div className="mx-auto flex max-w-7xl flex-col gap-12 lg:flex-row lg:gap-20">
        <div className="shrink-0 lg:w-1/3">
          <div className="mb-4 flex items-center gap-2">
            <Badge variant="filled">Install</Badge>
            <Badge variant="ghost">Tahuna</Badge>
          </div>
          <h2 className="font-serif text-3xl tracking-tight text-foreground md:text-4xl">
            A gentle control plane
            <br />
            for post-training
          </h2>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-muted-foreground">
            Tahuna is the RL training substrate that keeps your code and your loop intact while handling provisioning,
            sync, dependencies, monitoring, and artifacts.
          </p>
        </div>

        <div className="lg:w-2/3">
          <Card variant="default" className="mb-8 rounded-lg bg-card/95">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
                <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
                <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
              </div>
              <span className="ml-2 text-xs font-mono text-muted-foreground">tahuna train</span>
            </div>

            <CardContent className="min-h-80 space-y-4 p-5 font-mono text-sm">
              <div className="space-y-1.5">
                {terminalSteps.map((step) => (
                  <div key={step.value} className="flex items-center gap-2 text-xs">
                    <span className={cn(step.kind === "command" ? "text-primary" : "text-success")}>
                      {step.kind === "command" ? ">" : "•"}
                    </span>
                    <span className={cn(
                      "leading-relaxed",
                      step.kind === "command" ? "text-foreground/85" : "text-muted-foreground",
                    )}>
                      {step.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
                  <span>runtime/warden</span>
                  <span>wandb-compatible metrics</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <span className="text-xs font-mono uppercase tracking-ui-eyebrow text-muted-foreground">Install</span>
            <div className="flex items-center gap-1 rounded-full border border-border bg-card">
              <Button
                variant="ghost"
                size="compact-sm"
                className={cn(
                  "rounded-full px-4 font-mono",
                  activeCommand === "brew" ? "bg-secondary text-foreground" : "text-muted-foreground",
                )}
                onClick={() => setActiveCommand("brew")}
              >
                Homebrew
              </Button>
              <Button
                variant="ghost"
                size="compact-sm"
                className={cn(
                  "rounded-full px-4 font-mono",
                  activeCommand === "direct" ? "bg-secondary text-foreground" : "text-muted-foreground",
                )}
                onClick={() => setActiveCommand("direct")}
              >
                Direct
              </Button>
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5">
              <code className="truncate text-sm text-foreground/85">{commands[activeCommand]}</code>
              <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={handleCopy} aria-label="Copy command">
                {copiedCommand ? <Check className="text-success" /> : <Copy />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
