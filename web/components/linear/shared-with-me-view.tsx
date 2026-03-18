"use client"

import { Share2, Server, Play, HardDrive } from "lucide-react"
import { Button } from "@/components/ui/button"

type SharedItem = {
  share_id: string
  resource_type: string
  resource_id: string
  permission: string
  granted_by: string
}

type SharedWithMeViewProps = {
  shares: SharedItem[]
  onNavigateToResource: (resourceType: string, resourceId: string) => void
}

const RESOURCE_ICONS: Record<string, typeof Server> = {
  environment: Server,
  run: Play,
  data: HardDrive,
}

const RESOURCE_LABELS: Record<string, string> = {
  environment: "Environment",
  run: "Run",
  data: "Data",
}

export function SharedWithMeView({ shares, onNavigateToResource }: SharedWithMeViewProps) {
  const hasData = shares.length > 0

  return (
    <main className="flex-1 flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-medium text-foreground">Shared with me</h1>
          {shares.length > 0 && (
            <span className="text-xs text-muted-foreground">{shares.length}</span>
          )}
        </div>
      </header>

      {/* Content */}
      {!hasData ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="flex justify-center mb-6">
              <Share2 className="w-16 h-16 text-muted-foreground/50" strokeWidth={1} />
            </div>
            <h2 className="text-lg font-medium text-foreground mb-3">No shared resources</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              When someone shares an environment, run, or data with you, it will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b border-border text-left">
                <th className="px-6 py-2 text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Resource ID</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Permission</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Shared by</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shares.map((share) => {
                const Icon = RESOURCE_ICONS[share.resource_type] ?? Share2
                const label = RESOURCE_LABELS[share.resource_type] ?? share.resource_type

                return (
                  <tr
                    key={share.share_id}
                    className="border-b border-border hover:bg-secondary/50 group"
                  >
                    <td className="px-6 py-2.5">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-foreground">{label}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-foreground">
                      {share.resource_id}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={
                        share.permission === "edit"
                          ? "inline-flex px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400"
                          : "inline-flex px-2 py-0.5 rounded text-xs bg-secondary text-muted-foreground"
                      }>
                        {share.permission}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                      {share.granted_by}
                    </td>
                    <td className="px-3 py-2.5">
                      <Button
                        type="button"
                        variant="dashboard-outline-compact"
                        size="none"
                        onClick={() => onNavigateToResource(share.resource_type, share.resource_id)}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
