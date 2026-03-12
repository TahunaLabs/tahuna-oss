"use client"

import { PageLoader } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Notice } from "@/components/ui/notice"
import { StatusDot } from "@/components/ui/status-dot"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { ArrowLeft, Ban, CheckCircle2, Clock } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

type ApiKeyRow = {
  _id: Id<"apiKeys">
  _creationTime: number
  name: string
  keyPrefix: string
  machineId?: string
  status: "active" | "expired" | "revoked"
  expiresAt: number
  lastUsedAt?: number
  revokedAt?: number
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "—"
  return new Date(timestamp).toLocaleString()
}

export default function MachinesPage() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const shouldLoadQueries = !isLoading && isAuthenticated
  const keys = useQuery(api.auth.listApiKeys, shouldLoadQueries ? {} : "skip") as ApiKeyRow[] | undefined
  const revokeApiKeyMutation = useMutation(api.auth.revokeApiKey)

  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [confirmRevokeId, setConfirmRevokeId] = useState<Id<"apiKeys"> | null>(null)
  const [revokingId, setRevokingId] = useState<Id<"apiKeys"> | null>(null)

  const enrichedKeys = keys ?? []

  const activeCount = enrichedKeys.filter((key) => key.status === "active").length
  const revokedCount = enrichedKeys.filter((key) => key.status === "revoked").length
  const expiredCount = enrichedKeys.filter((key) => key.status === "expired").length

  async function revokeKey(id: Id<"apiKeys">, name: string) {
    setRevokingId(id)
    setMessage("")
    setError("")
    try {
      await revokeApiKeyMutation({ id })
      setConfirmRevokeId(null)
      setMessage(`Revoked ${name}.`)
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Failed to revoke key.")
    } finally {
      setRevokingId(null)
    }
  }

  if (isLoading || !isAuthenticated) {
    return <PageLoader message="Loading machines…" />
  }

  return (
    <main className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Machines</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage active CLI/browser sessions and revoke access when needed.
            </p>
          </div>
          <Button asChild variant="dashboard-outline" size="none">
            <Link href="/dashboard">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to dashboard
            </Link>
          </Button>
        </header>

        {error ? <Notice variant="error">{error}</Notice> : null}
        {message ? <Notice>{message}</Notice> : null}

        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Card variant="dashboard" className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <p className="text-sm text-muted-foreground">Active</p>
            </div>
            <p className="mt-1 text-2xl font-semibold">{activeCount}</p>
          </Card>
          <Card variant="dashboard" className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              <p className="text-sm text-muted-foreground">Expired</p>
            </div>
            <p className="mt-1 text-2xl font-semibold">{expiredCount}</p>
          </Card>
          <Card variant="dashboard" className="p-4">
            <div className="flex items-center gap-2">
              <Ban className="h-4 w-4 text-rose-500" />
              <p className="text-sm text-muted-foreground">Revoked</p>
            </div>
            <p className="mt-1 text-2xl font-semibold">{revokedCount}</p>
          </Card>
        </section>

        {enrichedKeys.length === 0 ? (
          <Card variant="dashboard" className="p-6">
            <p className="text-sm text-muted-foreground">No machine sessions found yet.</p>
          </Card>
        ) : (
          <Card variant="dashboard" className="overflow-hidden">
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
                {enrichedKeys.map((key) => {
                  const isActive = key.status === "active"
                  const isBusy = revokingId === key._id
                  const isConfirming = confirmRevokeId === key._id
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
                          isConfirming ? (
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="dashboard-outline"
                                size="none"
                                disabled={isBusy}
                                onClick={() => revokeKey(key._id, key.name)}
                              >
                                {isBusy ? "Revoking..." : "Confirm revoke"}
                              </Button>
                              <Button
                                type="button"
                                variant="dashboard-outline-icon"
                                size="none"
                                disabled={isBusy}
                                onClick={() => setConfirmRevokeId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="dashboard-outline"
                              size="none"
                              disabled={isBusy}
                              onClick={() => {
                                setConfirmRevokeId(key._id)
                                setMessage("")
                                setError("")
                              }}
                            >
                              Revoke
                            </Button>
                          )
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
      </div>
    </main>
  )
}
