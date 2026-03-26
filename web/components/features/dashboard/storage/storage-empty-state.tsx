"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

type StorageEmptyStateProps = {
  hasFilters: boolean
  onUpload?: () => void
}

function StorageEmptyState({ hasFilters, onUpload }: StorageEmptyStateProps) {
  const message = hasFilters
    ? "No storage items match your current filters."
    : "Manage your storage buckets and artifacts. Store and organize files, build outputs, and other assets for your projects."

  return (
    <Card variant="ghost" className="flex min-h-72 items-center justify-center">
      <div className="max-w-md text-center">
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">{message}</p>
        {!hasFilters && onUpload ? (
          <div className="flex items-center justify-center">
            <Button type="button" variant="default" size="compact" onClick={onUpload}>
              Upload data
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  )
}

export { StorageEmptyState }
