"use client"

import { Monitor } from "lucide-react"

import { DashboardViewLayout } from "@/components/app-shell/layout-shell"
import { type ApiKeyRow } from "@/components/features/dashboard-settings-model"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Notice } from "@/components/ui/notice"
import { StatusDot } from "@/components/ui/status-dot"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Id } from "@convex/_generated/dataModel"

type MachinesViewProps = {
  keys: ApiKeyRow[]
  message: string
  error: string
  revokingId: Id<"apiKeys"> | null
  onRevoke: (id: Id<"apiKeys">, name: string) => void
  onClearFeedback: () => void
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "—"
  return new Date(timestamp).toLocaleString()
}

export function MachinesView({ keys, message, error, revokingId, onRevoke, onClearFeedback }: MachinesViewProps) {
  return (
    <DashboardViewLayout
      sectionLabel="Machines"
      title="Machines"
      titleIcon={<Monitor size={24} />}
      toolbar={null}
    >
      {error ? <Notice variant="error" className="mb-4">{error}</Notice> : null}
      {message ? <Notice className="mb-4">{message}</Notice> : null}

      {keys.length === 0 ? (
        <Card variant="dashboard-surface" className="p-6">
          <p className="text-sm text-muted-foreground">No machine sessions found yet.</p>
        </Card>
      ) : (
        <Card variant="dashboard-surface" className="overflow-hidden">
          <Table variant="dashboard">
            <TableHeader variant="dashboard">
              <TableRow variant="dashboard-head">
                <TableHead variant="dashboard">Name</TableHead>
                <TableHead variant="dashboard">Machine</TableHead>
                <TableHead variant="dashboard">Prefix</TableHead>
                <TableHead variant="dashboard">Created</TableHead>
                <TableHead variant="dashboard">Last Used</TableHead>
                <TableHead variant="dashboard">Status</TableHead>
                <TableHead variant="dashboard">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => {
                const isActive = key.status === "active"
                const isBusy = revokingId === key._id
                return (
                  <TableRow key={key._id} variant="dashboard">
                    <TableCell variant="dashboard" className="font-medium">
                      {key.name}
                    </TableCell>
                    <TableCell variant="dashboard" className="text-muted-foreground">
                      {key.machineId || "Unknown machine"}
                    </TableCell>
                    <TableCell variant="dashboard" className="font-mono text-xs text-muted-foreground">
                      {key.keyPrefix}
                    </TableCell>
                    <TableCell variant="dashboard" className="text-muted-foreground">
                      {formatDate(key._creationTime)}
                    </TableCell>
                    <TableCell variant="dashboard" className="text-muted-foreground">
                      {formatDate(key.lastUsedAt)}
                    </TableCell>
                    <TableCell variant="dashboard">
                      <div className="flex items-center gap-2 text-sm capitalize">
                        <StatusDot variant={isActive ? "success" : "muted"} size="sm" />
                        <span>{key.status}</span>
                      </div>
                    </TableCell>
                    <TableCell variant="dashboard">
                      {isActive ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              variant="dashboard-outline"
                              size="none"
                              disabled={isBusy}
                              onClick={onClearFeedback}
                            >
                              Revoke
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Revoke machine session?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Session <code>{key.name}</code> ({key.machineId || "unknown machine"}) will lose API access immediately and must run <code>tahuna login</code> again.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep session</AlertDialogCancel>
                              <AlertDialogAction onClick={() => onRevoke(key._id, key.name)} disabled={isBusy}>
                                {isBusy ? "Revoking..." : "Revoke session"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </DashboardViewLayout>
  )
}
