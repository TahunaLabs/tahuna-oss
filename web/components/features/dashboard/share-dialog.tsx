"use client"

import { useState } from "react"
import { Check, Copy, Link, Share2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

type ResourceType = "environment" | "run" | "data"

type ShareLinkItem = {
  share_link_id: string
  token: string
  permission: string
}

type ShareDialogProps = {
  resourceType: ResourceType
  resourceId: string
  isOwner: boolean
  open: boolean
  shareLinks: ShareLinkItem[]
  busy: boolean
  onOpenChange: (open: boolean) => void
  onCreateLink: (permission: "read" | "edit") => void
  onRevokeLink: (shareLinkId: string) => void
}

const RESOURCE_LABELS: Record<ResourceType, string> = {
  environment: "environment",
  run: "run",
  data: "data",
}

function buildShareUrl(token: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : ""
  return `${origin}/share/${token}`
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={handleCopy}
      title="Copy link"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
    </Button>
  )
}

export function ShareDialog({
  resourceType,
  isOwner,
  open,
  shareLinks,
  busy,
  onOpenChange,
  onCreateLink,
  onRevokeLink,
}: ShareDialogProps) {
  const [permission, setPermission] = useState<"read" | "edit">("read")

  const resourceLabel = RESOURCE_LABELS[resourceType]

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
                ? `Generate a shareable link for this ${resourceLabel}.`
                : `You have shared access to this ${resourceLabel}.`}
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="flex flex-col gap-4 px-4 py-4">
          {isOwner ? (
            <>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Permission</label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="compact-toggle"
                    data-active={permission === "read" || undefined}
                    size="compact-xs"
                    onClick={() => setPermission("read")}
                    disabled={busy}
                  >
                    Read
                  </Button>
                  <Button
                    type="button"
                    variant="compact-toggle"
                    data-active={permission === "edit" || undefined}
                    size="compact-xs"
                    onClick={() => setPermission("edit")}
                    disabled={busy}
                  >
                    Edit
                  </Button>
                </div>
              </div>
              <Button
                type="button"
                variant="default"
                size="compact"
                onClick={() => onCreateLink(permission)}
                disabled={busy}
              >
                <Link className="w-3.5 h-3.5" />
                Generate link
              </Button>
            </>
          ) : (
            <div className="rounded border border-border bg-secondary/30 px-3 py-2">
              <p className="text-sm text-muted-foreground">
                You have shared access to this {resourceLabel}. Only the owner can manage sharing.
              </p>
            </div>
          )}

          {isOwner && shareLinks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground">Active links</h3>
              <div className="rounded border border-border divide-y divide-border">
                {shareLinks.map((link) => {
                  const url = buildShareUrl(link.token)
                  return (
                    <div key={link.share_link_id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <input
                            readOnly
                            value={url}
                            className="h-6 w-full rounded border border-border bg-secondary/50 px-2 text-xs font-mono text-foreground focus:outline-none"
                          />
                          <CopyButton text={url} />
                        </div>
                        <span className={
                          link.permission === "edit"
                            ? "mt-1 inline-flex rounded bg-accent/20 px-1.5 py-0.5 text-ui-caption text-accent"
                            : "mt-1 inline-flex rounded bg-secondary px-1.5 py-0.5 text-ui-caption text-muted-foreground"
                        }>
                          {link.permission}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onRevokeLink(link.share_link_id)}
                        disabled={busy}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {isOwner && shareLinks.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Link className="w-4 h-4" />
              No active share links.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
