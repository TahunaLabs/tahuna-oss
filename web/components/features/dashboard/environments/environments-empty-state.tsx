"use client"

import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { LINKS_CONFIG } from "@/config"

function EnvironmentsEmptyState() {
  return (
    <Card variant="ghost" className="flex min-h-72 items-center justify-center">
      <div className="w-full max-w-md space-y-5 text-center">
        <p className="text-sm leading-relaxed text-muted-foreground">
          No environments yet. Initialize one with the Tahuna CLI to get started.
        </p>
        <div className="rounded-lg border border-border bg-secondary-dim px-4 py-2.5 text-left">
          <code className="font-mono text-sm text-foreground">tahuna init .</code>
        </div>
        <Button asChild variant="secondary" size="compact" className="w-full justify-center rounded-lg text-sm">
          <Link href={LINKS_CONFIG.docsUrl}>Go to docs</Link>
        </Button>
      </div>
    </Card>
  )
}

export { EnvironmentsEmptyState }
