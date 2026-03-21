"use client"

import { HardDrive } from "lucide-react"

import { Button } from "@/components/ui/button"

type StorageEmptyStateProps = {
  hasFilters: boolean
  onUpload?: () => void
}

function StorageEmptyState({ hasFilters, onUpload }: StorageEmptyStateProps) {
  const message = hasFilters
    ? "No storage items match your current filters."
    : "Manage your storage buckets and artifacts. Store and organize files, build outputs, and other assets for your projects."

  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md text-center">
        <HardDrive className="mx-auto mb-6 h-16 w-16 text-icon-faint" strokeWidth={1} />
        <h2 className="mb-3 text-lg font-medium text-foreground">Storage</h2>
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">{message}</p>
        {!hasFilters && onUpload ? (
          <div className="flex items-center justify-center">
            <Button type="button" variant="dashboard-primary-compact" size="none" onClick={onUpload}>
              Upload data
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export { StorageEmptyState }
