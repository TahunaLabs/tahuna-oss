"use client"

import { ExternalLink, Server } from "lucide-react"
import Link from "next/link"

import { CliStep } from "@/components/features/dashboard/environments/cli-step"
import { Button } from "@/components/ui/button"

function EnvironmentsEmptyState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <Server className="mx-auto mb-4 h-12 w-12 text-icon-faint" strokeWidth={1} />
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

          <Button asChild variant="dashboard-secondary" size="none">
            <Link href="https://github.com/Pazuzzu/tahuna/tree/develop/docs">
              Full Documentation
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

export { EnvironmentsEmptyState }
