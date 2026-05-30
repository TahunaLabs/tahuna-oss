"use client"

import { Check, Copy } from "lucide-react"
import { useState } from "react"

import { LandingFoundersIncBadge } from "@/components/landing/landing-founders-inc-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { TruncatedTooltip } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const installerScriptCommand = "curl -fsSL https://tahuna.app/install.sh"

const commands = {
  stable: `${installerScriptCommand} | bash`,
  nightly: `${installerScriptCommand} | bash -s -- --channel nightly`,
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
  const [activeCommand, setActiveCommand] = useState<keyof typeof commands>("stable")
  const [copiedCommand, setCopiedCommand] = useState(false)

  function handleCopy() {
    void navigator.clipboard.writeText(commands[activeCommand])
    setCopiedCommand(true)
    window.setTimeout(() => setCopiedCommand(false), 2000)
  }

  return (
    <section id="loop" className="relative overflow-hidden border-t border-border bg-muted/30 px-6 py-24 md:px-8 md:py-32">
      <div className="absolute right-6 top-6 z-10">
        <LandingFoundersIncBadge />
      </div>
      <div className="mx-auto flex max-w-7xl flex-col gap-12 lg:flex-row lg:items-start lg:gap-16">
        <div className="shrink-0 lg:w-2/5 lg:pt-12">
          <div className="mb-4 flex items-center gap-2">
            <Badge variant="filled">Install</Badge>
            <Badge variant="ghost">Tahuna</Badge>
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            A gentle control plane
            <br />
            for post-training
          </h2>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-muted-foreground">
            Post-training is the new frontier, but the infrastructure hasn&apos;t caught up yet.
          </p>
          <p className="mt-3 max-w-sm text-base leading-relaxed text-muted-foreground">
            Tahuna is a gentle control plane for post-training that keeps your code and your loop intact while
            handling provisioning, sync, dependencies, monitoring, and artifacts — so you can focus on AI agent
            training instead of DevOps.
          </p>
        </div>

        <div className="min-w-0 lg:-mr-12 lg:w-3/5">
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
                    {step.kind === "command" ? (
                      <span className="text-primary">&gt;</span>
                    ) : (
                      <span className="ml-3 h-1 w-1 rounded-full bg-foreground/45" />
                    )}
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
            <div className="flex items-center gap-1 rounded-full border border-border bg-card">
              <Button
                variant="ghost"
                size="compact-sm"
                className={cn(
                  "rounded-full px-4 font-mono",
                  activeCommand === "stable" ? "bg-secondary text-foreground" : "text-muted-foreground",
                )}
                onClick={() => setActiveCommand("stable")}
              >
                Stable
              </Button>
              <Button
                variant="ghost"
                size="compact-sm"
                className={cn(
                  "rounded-full px-4 font-mono",
                  activeCommand === "nightly" ? "bg-secondary text-foreground" : "text-muted-foreground",
                )}
                onClick={() => setActiveCommand("nightly")}
              >
                Nightly
              </Button>
            </div>
            <div className="flex w-full min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5">
              <TruncatedTooltip className="min-w-0 flex-1 font-mono text-sm text-foreground/85">
                {commands[activeCommand]}
              </TruncatedTooltip>
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
