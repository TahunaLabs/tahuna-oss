"use client"

import { CircleDot } from "lucide-react"

export function MyIssuesView() {
  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border">
        <h1 className="text-sm font-medium text-foreground">My issues</h1>
      </header>

      {/* Empty state */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="mb-6 flex justify-center">
            <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
              <CircleDot className="w-8 h-8 text-muted-foreground" />
            </div>
          </div>

          <h2 className="text-lg font-semibold text-foreground mb-2">No issues assigned</h2>
          <p className="text-sm text-muted-foreground">
            Issues assigned to you will appear here.
          </p>
        </div>
      </div>
    </div>
  )
}
