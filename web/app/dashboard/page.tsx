"use client"

import { AuditLogsContainer } from "@/components/features/dashboard/audit-logs-container"
import {
  useCloudDashboardCredits,
  useEnsureCloudDashboardBillingAccount,
} from "@/cloud/dashboard-api"
import { CLOUD_LINKS_CONFIG } from "@/cloud/links"
import { BillingContainer } from "@/components/cloud/dashboard/billing/billing-container"
import {
  CLOUD_DASHBOARD_VIEW_VALUES,
  type CloudDashboardView,
} from "@/components/cloud/dashboard/dashboard-model"
import { CloudDashboardTopBar } from "@/components/cloud/dashboard/dashboard-top-bar"
import { CLOUD_DASHBOARD_DOCS_NAV } from "@/components/cloud/dashboard/sidebar-links"
import { EnvironmentsContainer } from "@/components/features/dashboard/environments-container"
import { MachinesContainer } from "@/components/features/dashboard/machines-container"
import { OverviewContainer } from "@/components/features/dashboard/overview-container"
import { RunsContainer } from "@/components/features/dashboard/runs-container"
import { SettingsContainer } from "@/components/features/dashboard/settings-container"
import { ServingContainer } from "@/components/features/dashboard/serving-container"
import { StorageContainer } from "@/components/features/dashboard/storage-container"
import { ShareDialog } from "@/components/features/dashboard/share-dialog"
import { Sidebar, type DashboardNavItem } from "@/components/features/dashboard/sidebar"
import { DashboardAppLayout } from "@/components/app-shell/dashboard-app-layout"
import { DashboardContentShell } from "@/components/app-shell/dashboard-content-shell"
import { type ResourceType } from "@/components/features/dashboard-model"
import { authClient } from "@/lib/auth-client"
import {
  useCreateDashboardShareLink,
  useDashboardAuthState,
  useDashboardCurrentUser,
  useDashboardShareLinks,
  useRevokeDashboardShareLink,
} from "@/lib/dashboard-api"
import { useRouter } from "next/navigation"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import { toast } from "sonner"
import { useEffect, useState } from "react"
import { ClipboardList, Monitor, Settings, Wallet } from "lucide-react"

const CLOUD_NAV_ADMIN: DashboardNavItem[] = [
  { icon: Monitor, label: "Machines", view: "machines" },
  { icon: Wallet, label: "Billing", view: "billing" },
  { icon: ClipboardList, label: "Audit logs", view: "audit_logs" },
  { icon: Settings, label: "Settings", view: "settings" },
]

const VIEW_LABELS: Record<string, string> = {
  overview: "Overview",
  storage: "Storage",
  environments: "Environments",
  serving: "Serving",
  runs: "Runs",
  machines: "Machines",
  billing: "Billing",
  audit_logs: "Audit logs",
  settings: "Settings",
}

export default function DashboardPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useDashboardAuthState()
  const [loggingOut, setLoggingOut] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [shareTarget, setShareTarget] = useState<{ resourceType: ResourceType; resourceId: string } | null>(null)
  const [shareBusy, setShareBusy] = useState(false)

  const [activeView, setActiveView] = useQueryState(
    "view",
    parseAsStringLiteral(CLOUD_DASHBOARD_VIEW_VALUES).withDefault("overview"),
  )

  const shouldLoadQueries = !authLoading && isAuthenticated && !loggingOut

  const currentUser = useDashboardCurrentUser(shouldLoadQueries)
  const userMenuLoading = authLoading || loggingOut || (shouldLoadQueries && currentUser === undefined)
  const myCredits = useCloudDashboardCredits(shouldLoadQueries)

  const ensureMyBillingAccountMutation = useEnsureCloudDashboardBillingAccount()
  const createShareLinkMutation = useCreateDashboardShareLink()
  const revokeShareLinkMutation = useRevokeDashboardShareLink()

  const shouldLoadSharesForResource = shouldLoadQueries && shareDialogOpen && shareTarget !== null
  const shareLinksForResource = useDashboardShareLinks(shouldLoadSharesForResource, shareTarget)

  // Bootstrap hosted billing after session auth succeeds.
  useEffect(() => {
    if (!shouldLoadQueries || myCredits?.initialized === true) return
    void ensureMyBillingAccountMutation({}).catch(() => {
      // Ignore — subsequent renders will retry
    })
  }, [ensureMyBillingAccountMutation, myCredits?.initialized, shouldLoadQueries])

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
      await revokeShareLinkMutation(shareLinkId)
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
      case "overview":
        return <OverviewContainer shouldLoadQueries={shouldLoadQueries} />
      case "storage":
        return <StorageContainer shouldLoadQueries={shouldLoadQueries} onOpenShareDialog={openShareDialog} />
      case "environments":
        return (
          <EnvironmentsContainer
            shouldLoadQueries={shouldLoadQueries}
            onOpenShareDialog={openShareDialog}
            quickstartHref={CLOUD_LINKS_CONFIG.quickstartUrl}
          />
        )
      case "serving":
        return <ServingContainer shouldLoadQueries={shouldLoadQueries} />
      case "runs":
        return <RunsContainer shouldLoadQueries={shouldLoadQueries} onOpenShareDialog={openShareDialog} />
      case "billing":
        return <BillingContainer shouldLoadQueries={shouldLoadQueries} />
      case "machines":
        return <MachinesContainer shouldLoadQueries={shouldLoadQueries} />
      case "audit_logs":
        return <AuditLogsContainer shouldLoadQueries={shouldLoadQueries} />
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
        topBar={<CloudDashboardTopBar title={VIEW_LABELS[activeView] ?? ""} />}
        sidebar={(
          <Sidebar
            activeView={activeView}
            onViewChange={(view) => { void setActiveView(view as CloudDashboardView) }}
            userInitial={userInitial}
            userAccountLabel={userAccountLabel}
            userLoading={userMenuLoading}
            onLogout={logout}
            navAdmin={CLOUD_NAV_ADMIN}
            navDocs={CLOUD_DASHBOARD_DOCS_NAV}
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
