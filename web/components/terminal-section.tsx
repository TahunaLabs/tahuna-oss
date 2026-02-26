"use client"

import { Section, SectionContainer } from "@/components/section"
import { SectionHeading } from "@/components/section-heading"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDots, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { CommandPill, TabToggle } from "@/components/ui/tab-toggle"
import { Check, Copy } from "lucide-react"
import { useState } from "react"

export function TerminalSection() {
  const [copiedCommand, setCopiedCommand] = useState(false)
  const [activeTab, setActiveTab] = useState<"mac" | "windows">("mac")

  const commands = {
    mac: "curl -fsSL https://Tahuna.dev/install | sh",
    windows: "irm https://Tahuna.dev/install | iex",
  }

  const tabOptions = [
    { value: "mac" as const, label: "Mac/Linux" },
    { value: "windows" as const, label: "Windows" },
  ]

  const handleCopy = () => {
    navigator.clipboard.writeText(commands[activeTab])
    setCopiedCommand(true)
    setTimeout(() => setCopiedCommand(false), 2000)
  }

  return (
    <Section>
      <SectionContainer>
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-20">
          {/* Left side - Label and heading */}
          <div className="lg:w-1/3 shrink-0">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="filled">Install</Badge>
              <Badge variant="ghost">Tahuna</Badge>
            </div>
            <SectionHeading>Available in the terminal</SectionHeading>
          </div>

          {/* Right side - Terminal mockup and install command */}
          <div className="lg:w-2/3">
            {/* Terminal window */}
            <Card className="mb-8">
              <CardHeader>
                <CardDots />
                <CardTitle className="ml-2">Tahuna</CardTitle>
              </CardHeader>

              <CardContent className="font-mono text-sm space-y-3 min-h-[280px]">
                <div className="flex items-start gap-2">
                  <span className="text-primary shrink-0">{">"}</span>
                  <span className="text-foreground/80">Tahuna train</span>
                  <span className="text-muted-foreground">--config reward-shaping.yaml</span>
                </div>
                <p className="text-muted-foreground pl-5 text-xs leading-relaxed">
                  Setting up post-training pipeline for agentic reasoner...
                </p>
                <div className="space-y-1.5 pl-5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-green-400">✓</span>
                    <span className="text-muted-foreground">Loading base model</span>
                    <span className="text-primary/70">MiniMax-M2.5</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-green-400">✓</span>
                    <span className="text-muted-foreground">Initializing reward signals</span>
                    <span className="text-primary/70">quality, safety, cost</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-green-400">✓</span>
                    <span className="text-muted-foreground">Spinning up sandbox environment</span>
                    <span className="text-primary/70">customer-support-sim</span>
                  </div>
                </div>
                <p className="text-muted-foreground pl-5 text-xs leading-relaxed">
                  Running RL training loop — episode 1/500
                </p>
                <div className="space-y-1.5 pl-5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-green-400">{">"}</span>
                    <span className="text-muted-foreground">Reward</span>
                    <span className="text-primary/60">+0.82</span>
                    <span className="text-muted-foreground">| Steps</span>
                    <span className="text-primary/60">14</span>
                    <span className="text-muted-foreground">| Policy loss</span>
                    <span className="text-primary/60">0.031</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-green-400">{">"}</span>
                    <span className="text-muted-foreground">Eval pass rate</span>
                    <span className="text-primary/60">73.2%</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-green-400">89.1%</span>
                    <span className="text-muted-foreground">(+15.9%)</span>
                  </div>
                </div>
              </CardContent>

              <CardFooter>
                <Badge variant="status">training</Badge>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>episode 1/500</span>
                  <span>ETA 2h 14m</span>
                </div>
              </CardFooter>
            </Card>

            {/* Install command */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <Badge variant="ghost">Install</Badge>
              <TabToggle
                options={tabOptions}
                value={activeTab}
                onChange={setActiveTab}
              />
              <CommandPill className="flex-1 min-w-0">
                <code className="truncate">
                  {commands[activeTab]}
                </code>
                <button
                  onClick={handleCopy}
                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-auto"
                  aria-label="Copy command"
                >
                  {copiedCommand ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </CommandPill>
            </div>
          </div>
        </div>
      </SectionContainer>
    </Section>
  )
}
