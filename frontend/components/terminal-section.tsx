"use client"

import { useState } from "react"
import { Copy, Check } from "lucide-react"

export function TerminalSection() {
  const [copiedCommand, setCopiedCommand] = useState(false)
  const [activeTab, setActiveTab] = useState<"mac" | "windows">("mac")

  const commands = {
    mac: "curl -fsSL https://markovi.dev/install | sh",
    windows: "irm https://markovi.dev/install | iex",
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(commands[activeTab])
    setCopiedCommand(true)
    setTimeout(() => setCopiedCommand(false), 2000)
  }

  return (
    <section className="py-20 md:py-28 px-6 border-t border-border">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-20">
          {/* Left side - Label and heading */}
          <div className="lg:w-1/3 shrink-0">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-mono uppercase tracking-widest text-foreground bg-secondary px-2 py-1">
                Install
              </span>
              <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                Markovi
              </span>
            </div>
            <h2 className="text-3xl md:text-4xl font-serif tracking-tight text-foreground">
              Available in the terminal
            </h2>
          </div>

          {/* Right side - Terminal mockup and install command */}
          <div className="lg:w-2/3">
            {/* Terminal window */}
            <div className="bg-card border border-border rounded-lg overflow-hidden mb-8">
              {/* Terminal header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
                  <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
                </div>
                <span className="text-xs font-mono text-muted-foreground ml-2">markovi</span>
              </div>

              {/* Terminal content */}
              <div className="p-5 font-mono text-sm space-y-3 min-h-[280px]">
                <div className="flex items-start gap-2">
                  <span className="text-primary shrink-0">{">"}</span>
                  <span className="text-foreground/80">Thinking</span>
                  <span className="text-muted-foreground">{">"}</span>
                </div>
                <p className="text-muted-foreground pl-5 text-xs leading-relaxed">
                  Let me check how the training environments work in the simulated sandbox and how the reward signals propagate.
                </p>
                <div className="space-y-1.5 pl-5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-red-400">x</span>
                    <span className="text-muted-foreground">Read</span>
                    <span className="text-primary/70 underline">/agents/training/sandbox-env.ts</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-red-400">x</span>
                    <span className="text-muted-foreground">Read</span>
                    <span className="text-primary/70 underline">/agents/training/reward-signals.ts</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-red-400">x</span>
                    <span className="text-muted-foreground">Read</span>
                    <span className="text-primary/70 underline">/agents/training/feedback-loop.ts</span>
                  </div>
                </div>
                <p className="text-muted-foreground pl-5 text-xs leading-relaxed">
                  Let me find where these modules actually are:
                </p>
                <div className="space-y-1.5 pl-5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-green-400">{">"}</span>
                    <span className="text-muted-foreground">Grep</span>
                    <span className="text-primary/60">class SandboxEnv</span>
                    <span className="text-muted-foreground">in /agents/training</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-green-400">{">"}</span>
                    <span className="text-muted-foreground">Grep</span>
                    <span className="text-primary/60">class RewardPropagator</span>
                    <span className="text-muted-foreground">in /agents/training</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-green-400">{">"}</span>
                    <span className="text-muted-foreground">Grep</span>
                    <span className="text-primary/60">class FeedbackLoop</span>
                    <span className="text-muted-foreground">in /agents/training</span>
                  </div>
                </div>

                {/* Bottom bar */}
                <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
                  <div className="bg-muted px-3 py-1 rounded text-xs text-muted-foreground">
                    smart
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>/agents/training</span>
                    <span>27% of 168k</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Install command */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                Install
              </span>
              <div className="flex items-center gap-1 bg-card border border-border rounded-full overflow-hidden">
                <button
                  onClick={() => setActiveTab("mac")}
                  className={`text-xs font-mono px-4 py-2 transition-colors ${
                    activeTab === "mac"
                      ? "bg-foreground/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Mac/Linux
                </button>
                <button
                  onClick={() => setActiveTab("windows")}
                  className={`text-xs font-mono px-4 py-2 transition-colors ${
                    activeTab === "windows"
                      ? "bg-foreground/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Windows
                </button>
              </div>
              <div className="flex items-center gap-2 bg-card border border-border rounded-full px-5 py-2.5 flex-1 min-w-0">
                <code className="text-sm font-mono text-foreground/80 truncate">
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
