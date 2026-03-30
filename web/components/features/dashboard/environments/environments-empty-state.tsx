"use client"

import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const cliCommands = [
  {
    command: "tahuna init .",
    description: "Initialize the project and scaffold the environment config.",
  },
  {
    command: "tahuna sync",
    description: "Sync code, data, and pinned manifests to Tahuna.",
  },
  {
    command: "tahuna train",
    description: "Start training from the current project configuration.",
  },
]

function EnvironmentsEmptyState() {
  return (
    <Card variant="ghost" className="flex min-h-72 items-center justify-center">
      <div className="w-full max-w-md space-y-5 text-center">
        <p className="text-sm leading-relaxed text-muted-foreground">
          No environments yet. Initialize one with the Tahuna CLI to get started.
        </p>
        <Card variant="default" className="overflow-hidden rounded-lg bg-card/95 text-left">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <div className="flex gap-1.5">
              <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
              <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
              <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
            </div>
            <span className="ml-2 truncate font-mono text-xs text-muted-foreground">tahuna workflow</span>
          </div>
          <CardContent className="space-y-3 px-4 py-3">
            {cliCommands.map((entry) => (
              <div key={entry.command} className="flex gap-2">
                <span className="font-mono text-sm text-primary" aria-hidden>
                  $
                </span>
                <div className="min-w-0 flex-1">
                  <code className="block font-mono text-sm text-foreground/85">{entry.command}</code>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{entry.description}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Button asChild variant="secondary" size="compact" className="w-full justify-center rounded-lg text-sm">
          <Link href="https://docs.tahuna.app/quickstart" target="_blank" rel="noopener noreferrer">
            Get started
          </Link>
        </Button>
      </div>
    </Card>
  )
}

export { EnvironmentsEmptyState }
