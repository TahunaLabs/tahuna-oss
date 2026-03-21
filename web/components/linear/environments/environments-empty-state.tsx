"use client"

import { ExternalLink, Server } from "lucide-react"
import Link from "next/link"

import { CliStep } from "@/components/linear/environments/cli-step"

function EnvironmentsEmptyState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <Server className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" strokeWidth={1} />
          <h2 className="mb-2 text-lg font-medium text-foreground">New Environment</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Create and manage compute environments using the Tahuna CLI.
          </p>
        </div>

        <div className="space-y-5 px-2">
          <CliStep number={1} label="Install the Tahuna CLI" command="brew install tahuna" />
          <CliStep number={2} label="Login to your account" command="tahuna login" />
          <CliStep number={3} label="Set up your environment" command="tahuna init ." />
          <CliStep number={4} label="Start a run" command="tahuna run" />

          <p className="text-center text-xs text-muted-foreground">
            You can explore example configs in <code className="rounded bg-secondary px-1 py-0.5">/configs/</code>, or
            set up your own using <code className="rounded bg-secondary px-1 py-0.5">tahuna init</code>.
          </p>

          <Link
            href="https://github.com/Pazuzzu/tahuna/tree/develop/docs"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-secondary px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-secondary/80"
          >
            Full Documentation
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}

export { EnvironmentsEmptyState }
