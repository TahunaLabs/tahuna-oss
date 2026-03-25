"use client"

import { AuditLogsContainer } from "@/components/features/dashboard/audit-logs-container"
import { BillingContainer } from "@/components/features/dashboard/billing-container"
import { EnvironmentsContainer } from "@/components/features/dashboard/environments-container"
import { MachinesContainer } from "@/components/features/dashboard/machines-container"
import { ProvidersContainer } from "@/components/features/dashboard/providers-container"
import { RunsContainer } from "@/components/features/dashboard/runs-container"
import { SettingsContainer } from "@/components/features/dashboard/settings-container"
import { StorageContainer } from "@/components/features/dashboard/storage-container"
import { ShareDialog } from "@/components/features/dashboard/share-dialog"
import { Sidebar } from "@/components/features/dashboard/sidebar"
import { DashboardAppLayout } from "@/components/app-shell/dashboard-app-layout"
import { DashboardContentShell } from "@/components/app-shell/dashboard-content-shell"
import { DASHBOARD_VIEW_VALUES, type ResourceType } from "@/components/features/dashboard-model"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { authClient } from "@/lib/auth-client"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { useRouter } from "next/navigation"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import { toast } from "sonner"
import { useEffect, useState } from "react"

export default function DashboardPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth()
  const [loggingOut, setLoggingOut] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [shareTarget, setShareTarget] = useState<{ resourceType: ResourceType; resourceId: string } | null>(null)
  const [shareBusy, setShareBusy] = useState(false)

  const [activeView, setActiveView] = useQueryState(
    "view",
    parseAsStringLiteral(DASHBOARD_VIEW_VALUES).withDefault("environments"),
  )

  const shouldLoadQueries = !authLoading && isAuthenticated && !loggingOut

  const currentUser = useQuery(api.auth.getCurrentUser, shouldLoadQueries ? {} : "skip")
  const userMenuLoading = authLoading || loggingOut || (shouldLoadQueries && currentUser === undefined)
  const myCredits = useQuery(api.auth.getMyCredits, shouldLoadQueries ? {} : "skip") as
    | { balance_cents: number; currency: string; initialized: boolean }
    | undefined

  const ensureMyLedgerMutation = useMutation(api.auth.ensureMyLedger)
  const createShareLinkMutation = useMutation(api.sharing.createShareLink)
  const revokeShareLinkMutation = useMutation(api.sharing.revokeShareLink)

  const shouldLoadSharesForResource = shouldLoadQueries && shareDialogOpen && shareTarget !== null
  const shareLinksForResource = useQuery(
    api.sharing.listShareLinksForResource,
    shouldLoadSharesForResource
      ? { resourceType: shareTarget!.resourceType, resourceId: shareTarget!.resourceId }
      : "skip",
  )

  // Bootstrap billing ledger on first login
  useEffect(() => {
    if (!shouldLoadQueries || myCredits?.initialized === true) return
    void ensureMyLedgerMutation({}).catch(() => {
      // Ignore — subsequent renders will retry
    })
  }, [ensureMyLedgerMutation, myCredits?.initialized, shouldLoadQueries])

  useEffect(() => {
    if (authLoading || isAuthenticated) return
    router.replace("/login")
  }, [authLoading, isAuthenticated, router])

  async function logout() {
    setLoggingOut(true)
    try {
      await authClient.signOut()
      router.replace("/login")
    } catch {
      setLoggingOut(false)
    }
  }

  function openShareDialog(resourceType: ResourceType, resourceId: string) {
    setShareTarget({ resourceType, resourceId })
    setShareDialogOpen(true)
  }

  async function handleCreateLink(permission: "read" | "edit") {
    if (!shareTarget) return
    setShareBusy(true)
    try {
      await createShareLinkMutation({
        resourceType: shareTarget.resourceType,
        resourceId: shareTarget.resourceId,
        permission,
      })
      toast.success(`Link generated (${permission}).`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate link")
    } finally {
      setShareBusy(false)
    }
  }

  async function handleRevokeLink(shareLinkId: string) {
    setShareBusy(true)
    try {
      await revokeShareLinkMutation({ shareLinkId: shareLinkId as Id<"shareLinks"> })
      toast.success("Link revoked.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to revoke link")
    } finally {
      setShareBusy(false)
    }
  }

  const userEmail = currentUser?.email ?? ""
  const usernameFromUser = typeof currentUser?.username === "string" ? currentUser.username.trim() : ""
  const username = usernameFromUser
  const userName = typeof currentUser?.name === "string" ? currentUser.name.trim() : ""
  const userAccountLabel = username || userEmail || "My account"
  const userInitial = userEmail.trim().charAt(0).toUpperCase() || "U"

  function renderActiveView() {
    switch (activeView) {
      case "storage":
        return <StorageContainer shouldLoadQueries={shouldLoadQueries} onOpenShareDialog={openShareDialog} />
      case "environments":
        return <EnvironmentsContainer shouldLoadQueries={shouldLoadQueries} onOpenShareDialog={openShareDialog} />
      case "runs":
        return <RunsContainer shouldLoadQueries={shouldLoadQueries} onOpenShareDialog={openShareDialog} />
      case "billing":
        return <BillingContainer shouldLoadQueries={shouldLoadQueries} />
      case "machines":
        return <MachinesContainer shouldLoadQueries={shouldLoadQueries} />
      case "audit_logs":
        return <AuditLogsContainer shouldLoadQueries={shouldLoadQueries} />
      case "providers":
        return <ProvidersContainer shouldLoadQueries={shouldLoadQueries} />
      case "settings":
        return (
          <SettingsContainer
            shouldLoadQueries={shouldLoadQueries}
            userName={userName}
            username={username}
            userEmail={userEmail}
          />
        )
      default:
        return null
    }
  }

  return (
    <>
      <DashboardAppLayout
        sidebar={(
          <Sidebar
            activeView={activeView}
            onViewChange={(view) => { void setActiveView(view) }}
            userInitial={userInitial}
            userAccountLabel={userAccountLabel}
            userLoading={userMenuLoading}
            onLogout={logout}
            balanceCents={myCredits?.balance_cents}
            maxCents={100 * 100}
          />
        )}
      >
        <DashboardContentShell>
          {renderActiveView()}
        </DashboardContentShell>
      </DashboardAppLayout>
      {shareTarget && (
        <ShareDialog
          resourceType={shareTarget.resourceType}
          resourceId={shareTarget.resourceId}
          isOwner={true}
          open={shareDialogOpen}
          shareLinks={shareLinksForResource?.shareLinks ?? []}
          busy={shareBusy}
          onOpenChange={(open) => {
            setShareDialogOpen(open)
            if (!open) setShareTarget(null)
          }}
          onCreateLink={(permission) => { void handleCreateLink(permission) }}
          onRevokeLink={(shareLinkId) => { void handleRevokeLink(shareLinkId) }}
        />
      )}
    </>
  )
}
