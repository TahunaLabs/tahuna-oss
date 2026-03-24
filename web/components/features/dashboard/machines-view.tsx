"use client"

import { Monitor } from "lucide-react"

import { DashboardViewLayout } from "@/components/app-shell/dashboard-view-layout"
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
import { StatusDot } from "@/components/ui/status-dot"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate } from "@/lib/utils"
import type { Id } from "@convex/_generated/dataModel"

type MachinesViewProps = {
  keys: ApiKeyRow[]
  revokingId: Id<"apiKeys"> | null
  onRevoke: (id: Id<"apiKeys">, name: string) => void
}

export function MachinesView({ keys, revokingId, onRevoke }: MachinesViewProps) {
  return (
    <DashboardViewLayout
      sectionLabel="Machines"
      title="Machines"
      titleIcon={<Monitor size={24} />}
      toolbar={null}
    >
      {keys.length === 0 ? (
        <Card variant="surface" className="p-6">
          <p className="text-sm text-muted-foreground">No machine sessions found yet.</p>
        </Card>
      ) : (
        <Card variant="surface" className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow variant="head">
                <TableHead>Name</TableHead>
                <TableHead>Machine</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => {
                const isActive = key.status === "active"
                const isBusy = revokingId === key._id
                return (
                  <TableRow key={key._id}>
                    <TableCell className="font-medium">
                      {key.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {key.machineId || "Unknown machine"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {key.keyPrefix}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(key._creationTime)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(key.lastUsedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm capitalize">
                        <StatusDot variant={isActive ? "success" : "muted"} size="xs" />
                        <span>{key.status}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {isActive ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="control"
                              disabled={isBusy}
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
