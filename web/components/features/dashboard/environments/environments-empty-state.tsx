"use client"

import { ExternalLink } from "lucide-react"
import Link from "next/link"

import { CliStep } from "@/components/features/dashboard/environments/cli-step"
import { Button } from "@/components/ui/button"

function EnvironmentsEmptyState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
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
            <Link href={process.env.NEXT_PUBLIC_DOCS_URL!}>
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
