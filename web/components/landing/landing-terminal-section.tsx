"use client"

import { Check, Copy } from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const commands = {
  brew: "brew tap Pazuzzu/tahuna && brew install tahuna",
  script: "curl -fsSL https://tahuna.dev/install | sh",
} as const

const terminalSteps = [
  { kind: "read", label: "Read", value: "pyproject.toml" },
  { kind: "read", label: "Read", value: "tahuna.yaml" },
  { kind: "read", label: "Read", value: "data manifest snapshot" },
  { kind: "run", label: "Sync", value: "upload changed blobs only" },
  { kind: "run", label: "Provision", value: "request H100 on RunPod" },
  { kind: "run", label: "Capture", value: "stream logs, metrics, and artifacts" },
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
              <div className="flex items-start gap-2">
                <span className="shrink-0 text-primary">{">"}</span>
                <span className="text-foreground/80">Thinking</span>
                <span className="text-muted-foreground">{">"}</span>
              </div>

              <p className="pl-5 text-xs leading-relaxed text-muted-foreground">
                You keep your training loop. Tahuna handles the machinery around it: snapshotting code and data,
                materializing the workspace, installing dependencies, running on GPU, and persisting artifacts.
              </p>

              <div className="space-y-1.5 pl-5">
                {terminalSteps.map((step) => (
                  <div key={step.value} className="flex items-center gap-2 text-xs">
                    <span className={cn(step.kind === "read" ? "text-destructive" : "text-success")}>
                      {step.kind === "read" ? "x" : ">"}
                    </span>
                    <span className="text-muted-foreground">{step.label}</span>
                    <span className="text-primary/80 underline underline-offset-2">{step.value}</span>
                  </div>
                ))}
              </div>

              <p className="pl-5 text-xs leading-relaxed text-muted-foreground">
                Init. Align. Converge. Emerge. The heavy machinery stays out of sight. The run remains pinned to exact
                snapshots.
              </p>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <Badge variant="status">smart</Badge>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>runtime/warden</span>
                  <span>artifacts persisted</span>
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
                  activeCommand === "script" ? "bg-secondary text-foreground" : "text-muted-foreground",
                )}
                onClick={() => setActiveCommand("script")}
              >
                Install Script
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
