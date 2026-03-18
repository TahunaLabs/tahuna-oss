"use client"

import { useState } from "react"
import { Share2, Trash2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

type ResourceType = "environment" | "run" | "data"

type ShareItem = {
  share_id: string
  granted_to: string
  permission: string
}

type ShareDialogProps = {
  resourceType: ResourceType
  resourceId: string
  isOwner: boolean
  open: boolean
  shares: ShareItem[]
  busy: boolean
  error: string
  message: string
  onOpenChange: (open: boolean) => void
  onCreateShare: (grantedToUserId: string, permission: "read" | "edit") => void
  onRevokeShare: (shareId: string) => void
}

const RESOURCE_LABELS: Record<ResourceType, string> = {
  environment: "environment",
  run: "run",
  data: "data",
}

export function ShareDialog({
  resourceType,
  isOwner,
  open,
  shares,
  busy,
  error,
  message,
  onOpenChange,
  onCreateShare,
  onRevokeShare,
}: ShareDialogProps) {
  const [userId, setUserId] = useState("")
  const [permission, setPermission] = useState<"read" | "edit">("read")

  const resourceLabel = RESOURCE_LABELS[resourceType]

  function handleSubmit() {
    const trimmed = userId.trim()
    if (!trimmed) return
    onCreateShare(trimmed, permission)
    setUserId("")
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-sm p-0">
        <div className="border-b border-border px-4 py-3">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Share2 className="w-4 h-4" />
              Share {resourceLabel}
            </SheetTitle>
            <SheetDescription>
              {isOwner
                ? `Manage who has access to this ${resourceLabel}.`
                : `You have shared access to this ${resourceLabel}.`}
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="flex flex-col gap-4 px-4 py-4">
          {isOwner ? (
            <>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">User ID</label>
                <input
                  type="text"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="Enter user ID"
                  disabled={busy}
                  className="h-8 w-full rounded border border-border bg-secondary/50 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Permission</label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={permission === "read" ? "dashboard-primary-compact-sm" : "dashboard-outline-compact"}
                    size="none"
                    onClick={() => setPermission("read")}
                    disabled={busy}
                  >
                    Read
                  </Button>
                  <Button
                    type="button"
                    variant={permission === "edit" ? "dashboard-primary-compact-sm" : "dashboard-outline-compact"}
                    size="none"
                    onClick={() => setPermission("edit")}
                    disabled={busy}
                  >
                    Edit
                  </Button>
                </div>
              </div>
              <Button
                type="button"
                variant="dashboard-primary-compact"
                size="none"
                onClick={handleSubmit}
                disabled={busy || !userId.trim()}
              >
                <Share2 className="w-3.5 h-3.5" />
                Share
              </Button>
            </>
          ) : (
            <div className="rounded border border-border bg-secondary/30 px-3 py-2">
              <p className="text-sm text-muted-foreground">
                You have shared access to this {resourceLabel}. Only the owner can manage sharing.
              </p>
            </div>
          )}

          {error && (
            <p className="rounded border border-red-400/40 bg-red-500/10 px-2.5 py-2 text-xs text-red-400">
              {error}
            </p>
          )}
          {!error && message && (
            <p className="rounded border border-border bg-secondary/40 px-2.5 py-2 text-xs text-muted-foreground">
              {message}
            </p>
          )}

          {isOwner && shares.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground">Current shares</h3>
              <div className="rounded border border-border divide-y divide-border">
                {shares.map((share) => (
                  <div key={share.share_id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground font-mono">{share.granted_to}</p>
                      <span className={
                        share.permission === "edit"
                          ? "inline-flex px-1.5 py-0.5 rounded text-[11px] bg-blue-500/20 text-blue-400"
                          : "inline-flex px-1.5 py-0.5 rounded text-[11px] bg-secondary text-muted-foreground"
                      }>
                        {share.permission}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="dashboard-outline-icon-muted"
                      size="none"
                      onClick={() => onRevokeShare(share.share_id)}
                      disabled={busy}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isOwner && shares.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="w-4 h-4" />
              Not shared with anyone yet.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
