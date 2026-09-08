"use client"

import { Check, Copy } from "lucide-react"
import { useState } from "react"

import { TerminalMock } from "@/components/landing/terminal-mock"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TruncatedTooltip } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const installerScriptCommand = "curl -fsSL https://tahuna.app/install.sh"

const commands = {
  stable: `${installerScriptCommand} | bash`,
  nightly: `${installerScriptCommand} | bash -s -- --channel nightly`,
} as const

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
      <div className="mx-auto flex max-w-7xl flex-col gap-12 lg:flex-row lg:items-start lg:gap-16">
        <div className="shrink-0 lg:w-2/5 lg:pt-12">
          <div className="mb-4 flex items-center gap-2">
            <Badge variant="filled">Install</Badge>
            <Badge variant="ghost">Tahuna</Badge>
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Three commands
            <br />
            to a remote GPU
          </h2>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-muted-foreground">
            Initialize your project, choose your compute, and run the same Python code you already use.
          </p>
        </div>

        <div className="min-w-0 lg:-mr-12 lg:w-3/5">
          <div className="relative mb-8">
            <TerminalMock
              footer={
                <div className="ml-auto flex items-center gap-4">
                  <span>runtime/warden</span>
                  <span>wandb-compatible metrics</span>
                </div>
              }
            />
          </div>

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
