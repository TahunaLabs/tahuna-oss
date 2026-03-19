"use client"

import { Sidebar } from "@/components/linear/sidebar"
import { StorageView } from "@/components/linear/storage-view"
import { EnvironmentsView } from "@/components/linear/environments-view"
import { RunsView } from "@/components/linear/runs-view"
import { BillingView } from "@/components/linear/billing-view"
import { AuditLogsView } from "@/components/linear/audit-logs-view"
import { SettingsView } from "@/components/linear/settings-view"
import { ShareDialog } from "@/components/linear/share-dialog"
import { EMPTY_PROFILE_DRAFT, toProfileDraft, type ApiKeyRow, type ProfileDraft, type UserProfileResponse } from "@/components/dashboard/settings-types"
import { useTheme } from "@/components/theme-provider"
import { Notice } from "@/components/ui/notice"
import { PageLoader } from "@/components/ui/spinner"
import {
  STORAGE_PAGE_LIMIT,
  TERMINAL_STATUSES,
  validateArtifactRenameName,
  type DataBlobRow,
  type EnvironmentConfigDetail,
  type EnvironmentRow,
  type RunRow,
  type RunDetail,
  type RunLogsOnlyDetail,
  type RunMetricsOnlyDetail,
  type StorageListResult,
  type StorageItem,
} from "@/components/dashboard/shared"
import { ENVIRONMENT_CONFIG_FILE_NAME, renderEnvironmentConfig } from "@/lib/environment-config"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { authClient } from "@/lib/auth-client"
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react"
import { useRouter } from "next/navigation"
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryState } from "nuqs"
import { useEffect, useMemo, useState, type FormEvent } from "react"
import { BILLING_CONFIG } from "@/config"

const DASHBOARD_VIEW_VALUES = ["storage", "environments", "runs", "billing", "audit_logs", "settings"] as const
const STORAGE_SOURCE_FILTER_VALUES = ["all", "shared", "private"] as const
const STORAGE_SORT_VALUES = [
  "created_desc",
  "created_asc",
  "name_asc",
  "name_desc",
  "size_desc",
  "size_asc",
] as const
const RUN_TAB_VALUES = ["all", "active", "completed"] as const
function formatCreditsFromCents(balanceCents: number, currency: string) {
  const amount = Number.isFinite(balanceCents) ? Math.max(0, balanceCents) / 100 : 0
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

export default function DashboardPage() {
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth()
  const [loggingOut, setLoggingOut] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const [activeView, setActiveView] = useQueryState(
    "view",
    parseAsStringLiteral(DASHBOARD_VIEW_VALUES).withDefault("environments"),
  )

  const [selectedDataFiles, setSelectedDataFiles] = useState<File[]>([])
  const [uploadingData, setUploadingData] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [uploadMessage, setUploadMessage] = useState("")
  const [ensuringLedger, setEnsuringLedger] = useState(false)
  const [dataFileInputKey, setDataFileInputKey] = useState(0)
  const [storageSourceFilter, setStorageSourceFilter] = useQueryState(
    "storageSource",
    parseAsStringLiteral(STORAGE_SOURCE_FILTER_VALUES).withDefault("all"),
  )
  const [storageSort, setStorageSort] = useQueryState(
    "storageSort",
    parseAsStringLiteral(STORAGE_SORT_VALUES).withDefault("created_desc"),
  )
  const [storageSearch, setStorageSearch] = useQueryState("storageQ", parseAsString.withDefault(""))
  const [storageSearchDebounced, setStorageSearchDebounced] = useState(storageSearch)
  const [storageOffset, setStorageOffset] = useQueryState("storageOffset", parseAsInteger.withDefault(0))
  const [runsTab, setRunsTab] = useQueryState("runTab", parseAsStringLiteral(RUN_TAB_VALUES).withDefault("all"))
  const [storageResult, setStorageResult] = useState<StorageListResult | undefined>(undefined)
  const [storageLoading, setStorageLoading] = useState(false)
  const [storageError, setStorageError] = useState("")
  const [storageReloadToken, setStorageReloadToken] = useState(0)
  const [renamingStorageId, setRenamingStorageId] = useState<string | null>(null)
  const [artifactRenameDraft, setArtifactRenameDraft] = useState("")
  const [artifactRenameBusyId, setArtifactRenameBusyId] = useState<string | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [bindSelectionByEnvironment, setBindSelectionByEnvironment] = useState<Record<string, string>>({})
  const [configEditorEnvironmentId, setConfigEditorEnvironmentId] = useState<string | null>(null)
  const [configDraft, setConfigDraft] = useState("")
  const [configSourceText, setConfigSourceText] = useState("")
  const [configError, setConfigError] = useState("")
  const [configSaving, setConfigSaving] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [shareTarget, setShareTarget] = useState<{ resourceType: "environment" | "run" | "data"; resourceId: string } | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [shareError, setShareError] = useState("")
  const [shareMessage, setShareMessage] = useState("")
  const [savingSettingsProfile, setSavingSettingsProfile] = useState(false)
  const [settingsProfileDraft, setSettingsProfileDraft] = useState<ProfileDraft>(EMPTY_PROFILE_DRAFT)
  const shouldLoadQueries = !authLoading && isAuthenticated && !loggingOut
  const shouldLoadBillingQueries = shouldLoadQueries && activeView === "billing"

  const currentUser = useQuery(api.auth.getCurrentUser, shouldLoadQueries ? {} : "skip")
  const myCredits = useQuery(api.auth.getMyCredits, shouldLoadQueries ? {} : "skip") as
    | { balance_cents: number; currency: string; initialized: boolean }
    | undefined
  const myProfile = useQuery(api.profile.getMyProfile, shouldLoadQueries ? {} : "skip") as UserProfileResponse | undefined
  const envResult = useQuery(api.environments.list, shouldLoadQueries ? {} : "skip") as
    | { environments: EnvironmentRow[] }
    | undefined
  const dataResult = useQuery(api.data.list, shouldLoadQueries ? {} : "skip") as
    | { blobs: DataBlobRow[] }
    | undefined
  const runResult = useQuery(api.runs.list, shouldLoadQueries ? {} : "skip") as
    | { runs: RunRow[] }
    | undefined
  const apiKeys = useQuery(api.auth.listApiKeys, shouldLoadQueries ? {} : "skip") as ApiKeyRow[] | undefined
  const usageEvents = useQuery(api.auth.listMyUsageEvents, shouldLoadBillingQueries ? { limit: 100 } : "skip") as
    | Array<{
        event_type: string
        credits_delta_cents: number
        balance_after_cents: number
        reference_type: string | null
        reference_id: string | null
        metadata: unknown | null
        created_at: number
      }>
    | undefined

  const selectedRunFromList = runResult?.runs.find((r) => r.run_id === selectedRunId)
  const shouldLoadRunDetail = shouldLoadQueries && selectedRunId !== null && selectedRunFromList !== undefined
  const isSelectedRunTerminal = selectedRunFromList !== undefined && TERMINAL_STATUSES.has(selectedRunFromList.status)
  const [terminalLogsCache, setTerminalLogsCache] = useState<{ runId: string; logs: RunLogsOnlyDetail } | null>(null)
  const [terminalMetricsCache, setTerminalMetricsCache] = useState<{ runId: string; metrics: RunMetricsOnlyDetail } | null>(null)
  const hasTerminalLogsCache = terminalLogsCache !== null && terminalLogsCache.runId === selectedRunId
  const hasTerminalMetricsCache = terminalMetricsCache !== null && terminalMetricsCache.runId === selectedRunId
  const runDetail = useQuery(
    api.runs.get,
    shouldLoadRunDetail ? { runId: selectedRunId as Id<"runs"> } : "skip"
  ) as RunDetail | undefined
  const runLogsLive = useQuery(
    api.runs.getRunLogs,
    shouldLoadRunDetail && !(isSelectedRunTerminal && hasTerminalLogsCache)
      ? { runId: selectedRunId as Id<"runs"> }
      : "skip"
  ) as RunLogsOnlyDetail | undefined
  const runMetricsLive = useQuery(
    api.runs.getRunMetrics,
    shouldLoadRunDetail && !(isSelectedRunTerminal && hasTerminalMetricsCache)
      ? { runId: selectedRunId as Id<"runs"> }
      : "skip"
  ) as RunMetricsOnlyDetail | undefined
  const runLogs = runLogsLive ?? (hasTerminalLogsCache ? terminalLogsCache.logs : undefined)
  const runMetrics = runMetricsLive ?? (hasTerminalMetricsCache ? terminalMetricsCache.metrics : undefined)

  const shouldLoadEnvironmentConfig = shouldLoadQueries && configEditorEnvironmentId !== null
  const environmentConfig = useQuery(
    api.environments.getConfig,
    shouldLoadEnvironmentConfig ? { environmentId: configEditorEnvironmentId as Id<"environments"> } : "skip"
  ) as EnvironmentConfigDetail | undefined

  const environments: EnvironmentRow[] = envResult?.environments ?? []
  const dataBlobs: DataBlobRow[] = dataResult?.blobs ?? []
  const runs: RunRow[] = runResult?.runs ?? []
  const environmentNameById = useMemo(() => {
    const byId = new Map<string, string>()
    for (const environment of environments) {
      byId.set(String(environment.environment_id), environment.name)
    }
    return byId
  }, [environments])
  const runContextById = useMemo(() => {
    const byId = new Map<string, { run_name: string; environment_name: string | null }>()
    for (const run of runs) {
      byId.set(String(run.run_id), {
        run_name: run.name,
        environment_name: environmentNameById.get(run.environment_id) ?? null,
      })
    }
    return byId
  }, [environmentNameById, runs])
  const usageEventsWithContext = useMemo(() => {
    return (usageEvents ?? []).map((event) => {
      if (event.reference_type !== "run" || !event.reference_id) {
        return {
          ...event,
          run_name: null,
          environment_name: null,
        }
      }
      const runContext = runContextById.get(event.reference_id)
      return {
        ...event,
        run_name: runContext?.run_name ?? null,
        environment_name: runContext?.environment_name ?? null,
      }
    })
  }, [runContextById, usageEvents])

  useEffect(() => {
    if (selectedRunId === null || runResult === undefined) {
      return
    }
    const hasSelectedRun = runResult.runs.some((run) => run.run_id === selectedRunId)
    if (hasSelectedRun) {
      return
    }
    setSelectedRunId(null)
    if (terminalLogsCache?.runId === selectedRunId) {
      setTerminalLogsCache(null)
    }
    if (terminalMetricsCache?.runId === selectedRunId) {
      setTerminalMetricsCache(null)
    }
  }, [runResult, selectedRunId, terminalLogsCache, terminalMetricsCache])

  const generateDataUploadUrlMutation = useMutation(api.data.generateUploadUrl)
  const ensureMyLedgerMutation = useMutation(api.auth.ensureMyLedger)
  const removeEnvMutation = useMutation(api.environments.remove)
  const updateEnvironmentConfigMutation = useMutation(api.environments.updateConfig)
  const saveMyProfileMutation = useMutation(api.profile.saveMyProfile)
  const createRunMutation = useMutation(api.runs.create)
  const cancelRunMutation = useMutation(api.runs.cancel)
  const removeRunMutation = useMutation(api.runs.remove)
  const syncDataMetadataMutation = useMutation(api.data.syncMetadata)
  const bindDataMutation = useMutation(api.environments.bindData)
  const unbindDataMutation = useMutation(api.environments.unbindData)

  useEffect(() => {
    if (!shouldLoadQueries || ensuringLedger || myCredits?.initialized === true) {
      return
    }
    let cancelled = false
    setEnsuringLedger(true)
    void ensureMyLedgerMutation({})
      .catch(() => {
        // Ignore bootstrap retries here; subsequent renders can retry.
      })
      .finally(() => {
        if (!cancelled) {
          setEnsuringLedger(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [ensureMyLedgerMutation, ensuringLedger, myCredits?.initialized, shouldLoadQueries])
  const listStorageAction = useAction(api.storage.list)
  const renameArtifactAction = useAction(api.storage.renameArtifact)
  const setStorageVisibilityMutation = useMutation(api.storage.setVisibility)
  const createShareLinkMutation = useMutation(api.sharing.createShareLink)
  const revokeShareLinkMutation = useMutation(api.sharing.revokeShareLink)

  const shouldLoadSharesForResource = shouldLoadQueries && shareDialogOpen && shareTarget !== null
  const shareLinksForResource = useQuery(
    api.sharing.listShareLinksForResource,
    shouldLoadSharesForResource
      ? { resourceType: shareTarget!.resourceType, resourceId: shareTarget!.resourceId }
      : "skip",
  )

  const userEmail = currentUser?.email ?? ""
  const userInitial = userEmail.trim().charAt(0).toUpperCase() || "U"
  const creditsLabel = formatCreditsFromCents(myCredits?.balance_cents ?? 0, myCredits?.currency ?? "USD")
  const storageItems = storageResult?.items ?? []
  const storageTotal = storageResult?.total ?? 0
  const isDark = resolvedTheme === "dark"

  function openShareDialog(resourceType: "environment" | "run" | "data", resourceId: string) {
    setShareError("")
    setShareMessage("")
    setShareTarget({ resourceType, resourceId })
    setShareDialogOpen(true)
  }

  async function handleCreateLink(permission: "read" | "edit") {
    if (!shareTarget) return
    setShareBusy(true)
    setShareError("")
    setShareMessage("")
    try {
      await createShareLinkMutation({
        resourceType: shareTarget.resourceType,
        resourceId: shareTarget.resourceId,
        permission,
      })
      setShareMessage(`Link generated (${permission}).`)
    } catch (shareError) {
      setShareError(shareError instanceof Error ? shareError.message : "Failed to generate link")
    } finally {
      setShareBusy(false)
    }
  }

  async function handleRevokeLink(shareLinkId: string) {
    setShareBusy(true)
    setShareError("")
    setShareMessage("")
    try {
      await revokeShareLinkMutation({ shareLinkId: shareLinkId as Id<"shareLinks"> })
      setShareMessage("Link revoked.")
    } catch (revokeError) {
      setShareError(revokeError instanceof Error ? revokeError.message : "Failed to revoke link")
    } finally {
      setShareBusy(false)
    }
  }

  const uniqueDataBlobs = useMemo(() => {
    const byId = new Map<string, DataBlobRow>()
    for (const blob of dataBlobs) {
      const existing = byId.get(blob.blob_id)
      if (!existing || blob.created_at > existing.created_at) {
        byId.set(blob.blob_id, blob)
      }
    }
    return Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at)
  }, [dataBlobs])

  const dataBlobsById = useMemo(() => {
    return new Map(uniqueDataBlobs.map((blob) => [blob.blob_id, blob]))
  }, [uniqueDataBlobs])

  useEffect(() => {
    if (isSelectedRunTerminal && runLogsLive && selectedRunId) {
      setTerminalLogsCache({ runId: selectedRunId, logs: runLogsLive })
    }
  }, [isSelectedRunTerminal, runLogsLive, selectedRunId])

  useEffect(() => {
    if (isSelectedRunTerminal && runMetricsLive && selectedRunId) {
      setTerminalMetricsCache({ runId: selectedRunId, metrics: runMetricsLive })
    }
  }, [isSelectedRunTerminal, runMetricsLive, selectedRunId])

  useEffect(() => {
    if (!configEditorEnvironmentId) {
      return
    }
    if (environments.some((environment) => environment.environment_id === configEditorEnvironmentId)) {
      return
    }
    setConfigEditorEnvironmentId(null)
    setConfigDraft("")
    setConfigSourceText("")
    setConfigError("")
  }, [configEditorEnvironmentId, environments])

  useEffect(() => {
    if (!environmentConfig || environmentConfig.environment.environment_id !== configEditorEnvironmentId) {
      return
    }
    if (configDraft && configDraft !== configSourceText) {
      return
    }
    setConfigSourceText(environmentConfig.config_text)
    setConfigDraft(environmentConfig.config_text)
  }, [configDraft, configEditorEnvironmentId, configSourceText, environmentConfig])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setStorageSearchDebounced(storageSearch)
    }, 250)
    return () => clearTimeout(timeout)
  }, [storageSearch])

  useEffect(() => {
    if (!shouldLoadQueries) {
      setSettingsProfileDraft(EMPTY_PROFILE_DRAFT)
      return
    }
    setSettingsProfileDraft(toProfileDraft(myProfile))
  }, [myProfile, shouldLoadQueries])

  useEffect(() => {
    void setStorageOffset(0)
  }, [setStorageOffset, storageSearchDebounced, storageSort, storageSourceFilter])

  useEffect(() => {
    let cancelled = false

    if (!shouldLoadQueries) {
      setStorageResult(undefined)
      setStorageLoading(false)
      setStorageError("")
      return
    }

    setStorageLoading(true)
    setStorageError("")
    void listStorageAction({
      visibility: storageSourceFilter,
      sort: storageSort,
      search: storageSearchDebounced.trim() || undefined,
      offset: storageOffset,
      limit: STORAGE_PAGE_LIMIT,
    })
      .then((result) => {
        if (cancelled) return
        setStorageResult(result as StorageListResult)
      })
      .catch((loadError) => {
        if (cancelled) return
        setStorageError(loadError instanceof Error ? loadError.message : "failed to load storage")
      })
      .finally(() => {
        if (!cancelled) {
          setStorageLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    listStorageAction,
    shouldLoadQueries,
    storageOffset,
    storageReloadToken,
    storageSearchDebounced,
    storageSort,
    storageSourceFilter,
  ])

  useEffect(() => {
    if (!storageResult) return
    if (storageTotal === 0 && storageOffset !== 0) {
      void setStorageOffset(0)
      return
    }
    if (storageOffset >= storageTotal && storageTotal > 0) {
      const previousPage = Math.max(0, Math.floor((storageTotal - 1) / STORAGE_PAGE_LIMIT) * STORAGE_PAGE_LIMIT)
      if (previousPage !== storageOffset) {
        void setStorageOffset(previousPage)
      }
    }
  }, [setStorageOffset, storageOffset, storageResult, storageTotal])

  useEffect(() => {
    if (!renamingStorageId) return
    if (storageItems.some((item) => item.id === renamingStorageId)) {
      return
    }
    setRenamingStorageId(null)
    setArtifactRenameDraft("")
  }, [renamingStorageId, storageItems])

  async function withBusy(task: () => Promise<void>) {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      await task()
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "unexpected error")
    } finally {
      setBusy(false)
    }
  }

  async function uploadData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selectedDataFiles.length === 0) return

    setUploadingData(true)
    setUploadError("")
    setUploadMessage("")
    setError("")
    setMessage("")

    try {
      for (const file of selectedDataFiles) {
        const upload = await generateDataUploadUrlMutation({ filename: file.name, size_bytes: file.size })
        const response = await fetch(upload.url, {
          method: "PUT",
          headers: file.type ? { "Content-Type": file.type } : undefined,
          body: file,
        })

        if (!response.ok) {
          throw new Error(`upload failed with status ${response.status}`)
        }

        await syncDataMetadataMutation({ key: upload.key })
      }

      const uploadedCount = selectedDataFiles.length
      setSelectedDataFiles([])
      setDataFileInputKey((current) => current + 1)
      setStorageReloadToken((current) => current + 1)
      setUploadMessage(uploadedCount === 1 ? "Uploaded 1 file." : `Uploaded ${uploadedCount} files.`)
    } catch (uploadError) {
      const uploadMessage = uploadError instanceof Error ? uploadError.message : "unexpected error"
      setUploadError(
        uploadMessage === "Failed to fetch"
          ? "Upload failed. Check the R2 bucket CORS policy for PUT requests from this app origin."
          : uploadMessage,
      )
    } finally {
      setUploadingData(false)
    }
  }

  async function deleteEnvironments(environmentIds: Id<"environments">[]) {
    if (environmentIds.length === 0) return
    await withBusy(async () => {
      for (const environmentId of environmentIds) {
        await removeEnvMutation({ environmentId })
      }
      const deletedCount = environmentIds.length
      setMessage(deletedCount === 1 ? "Deleted 1 environment." : `Deleted ${deletedCount} environments.`)
    })
  }

  async function launchRun(environmentId: Id<"environments">) {
    await withBusy(async () => {
      await createRunMutation({ environmentId })
      setMessage("Run launched.")
    })
  }

  async function cancelRun(runId: Id<"runs">) {
    await withBusy(async () => {
      await cancelRunMutation({ runId, force: false })
      setMessage(`Run ${runId} cancellation requested.`)
    })
  }

  async function deleteRuns(runIds: Id<"runs">[]) {
    if (runIds.length === 0) return
    await withBusy(async () => {
      for (const runId of runIds) {
        await removeRunMutation({ runId, cancelActive: true, force: false })
      }
      if (selectedRunId && runIds.includes(selectedRunId as Id<"runs">)) {
        setSelectedRunId(null)
      }
      const deletedCount = runIds.length
      setMessage(deletedCount === 1 ? "Deleted 1 run." : `Deleted ${deletedCount} runs.`)
    })
  }

  async function bindSelectedData(environment: EnvironmentRow) {
    const selectedDataId = (bindSelectionByEnvironment[environment.environment_id] || "").trim()
    if (!selectedDataId) {
      setError("Select a dataset to bind.")
      return
    }
    await withBusy(async () => {
      await bindDataMutation({
        environmentId: environment.environment_id,
        data_ids: [selectedDataId],
      })
      setBindSelectionByEnvironment((current) => ({
        ...current,
        [environment.environment_id]: "",
      }))
      setMessage(`Bound ${selectedDataId} to environment ${environment.environment_id}.`)
    })
  }

  async function unbindDataFromEnvironment(environmentId: Id<"environments">, dataId: string) {
    await withBusy(async () => {
      await unbindDataMutation({
        environmentId,
        data_ids: [dataId],
      })
      setMessage(`Unbound ${dataId} from environment ${environmentId}.`)
    })
  }

  function openEnvironmentConfigEditor(environment: EnvironmentRow) {
    const nextConfig = renderEnvironmentConfig({
      name: environment.name,
      framework: environment.framework,
      version: environment.version,
      python_version: environment.python_version,
      gpu_type: environment.gpu_type,
      gpu_count: environment.gpu_count,
      volume_gb: environment.volume_gb,
    })
    setError("")
    setMessage("")
    setConfigError("")
    setConfigEditorEnvironmentId(environment.environment_id)
    setConfigSourceText(nextConfig)
    setConfigDraft(nextConfig)
  }

  function closeEnvironmentConfigEditor() {
    if (configSaving) return
    setConfigEditorEnvironmentId(null)
    setConfigDraft("")
    setConfigSourceText("")
    setConfigError("")
  }

  function cancelEnvironmentConfigEdit() {
    setConfigDraft(configSourceText)
    setConfigError("")
  }

  async function saveEnvironmentConfig(environmentId: Id<"environments">) {
    setConfigSaving(true)
    setConfigError("")
    setError("")
    setMessage("")
    try {
      const saved = await updateEnvironmentConfigMutation({
        environmentId,
        config_text: configDraft,
      })
      setConfigSourceText(saved.config_text)
      setConfigDraft(saved.config_text)
      setMessage(`Saved config for environment ${environmentId}.`)
    } catch (saveError) {
      setConfigError(saveError instanceof Error ? saveError.message : "failed to save environment config")
    } finally {
      setConfigSaving(false)
    }
  }

  async function setStorageVisibility(item: StorageItem, visibility: "shared" | "private") {
    try {
      await setStorageVisibilityMutation({ key: item.key, visibility })
      setStorageReloadToken((current) => current + 1)
    } catch (visibilityError) {
      setError(visibilityError instanceof Error ? visibilityError.message : "failed to update visibility")
    }
  }

  function startRenameArtifact(item: StorageItem) {
    if (item.source !== "run_artifact") return
    setError("")
    setMessage("")
    setRenamingStorageId(item.id)
    setArtifactRenameDraft(item.name)
  }

  function cancelRenameArtifact() {
    if (artifactRenameBusyId) return
    setRenamingStorageId(null)
    setArtifactRenameDraft("")
  }

  async function saveRenameArtifact(item: StorageItem) {
    if (item.source !== "run_artifact" || !item.run_id) {
      setError("only run artifacts can be renamed")
      return
    }
    let nextName = ""
    try {
      nextName = validateArtifactRenameName(artifactRenameDraft)
    } catch (renameValidationError) {
      setError(renameValidationError instanceof Error ? renameValidationError.message : "invalid artifact name")
      return
    }
    if (nextName === item.name) {
      setError("new artifact name must differ from the current name")
      return
    }

    setError("")
    setMessage("")
    setArtifactRenameBusyId(item.id)
    try {
      const renamed = await renameArtifactAction({
        runId: item.run_id as Id<"runs">,
        key: item.key,
        name: nextName,
      })
      setRenamingStorageId(null)
      setArtifactRenameDraft("")
      setStorageReloadToken((current) => current + 1)
      setMessage(
        renamed.cleanup_warning
          ? `Renamed artifact to ${renamed.name}. Old object cleanup needs a retry.`
          : `Renamed artifact to ${renamed.name}.`,
      )
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "failed to rename artifact")
    } finally {
      setArtifactRenameBusyId(null)
    }
  }

  async function logout() {
    setLoggingOut(true)
    setError("")
    setMessage("")
    try {
      await authClient.signOut()
      router.replace("/login")
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Failed to sign out.")
      setLoggingOut(false)
    }
  }

  async function saveSettingsProfile(profile: ProfileDraft) {
    setSavingSettingsProfile(true)
    try {
      await saveMyProfileMutation({
        first_name: profile.firstName,
        last_name: profile.lastName,
        address_line_1: profile.addressLine1,
        address_line_2: profile.addressLine2,
        country: profile.country,
        company_name: profile.companyName,
        company_id: profile.companyId,
        tax_id: profile.taxId,
      })
    } catch (settingsError) {
      throw settingsError instanceof Error ? settingsError : new Error("Failed to save settings")
    } finally {
      setSavingSettingsProfile(false)
    }
  }

  if (authLoading || loggingOut || !isAuthenticated) {
    return <PageLoader message="Loading dashboard…" />
  }

  const renderMainContent = () => {
    switch (activeView) {
      case "storage":
        return (
          <StorageView
            creditsLabel={creditsLabel}
            selectedDataFiles={selectedDataFiles}
            uploadingData={uploadingData}
            dataFileInputKey={dataFileInputKey}
            storageSearch={storageSearch}
            storageSourceFilter={storageSourceFilter}
            storageSort={storageSort}
            storageResult={storageResult}
            storageLoading={storageLoading}
            storageError={storageError}
            uploadError={uploadError}
            uploadMessage={uploadMessage}
            renamingStorageId={renamingStorageId}
            artifactRenameDraft={artifactRenameDraft}
            artifactRenameBusyId={artifactRenameBusyId}
            onUploadData={uploadData}
            onSelectDataFiles={(files) => {
              setUploadError("")
              setUploadMessage("")
              setSelectedDataFiles(files)
            }}
            onStorageSearchChange={(value) => {
              void setStorageSearch(value)
            }}
            onStorageSourceFilterChange={(value) => {
              void setStorageSourceFilter(value)
            }}
            onStorageSortChange={(value) => {
              void setStorageSort(value)
            }}
            onArtifactRenameDraftChange={setArtifactRenameDraft}
            onSaveRenameArtifact={(item) => {
              void saveRenameArtifact(item)
            }}
            onCancelRenameArtifact={cancelRenameArtifact}
            onStartRenameArtifact={startRenameArtifact}
            onPreviousStoragePage={() => {
              void setStorageOffset(Math.max(0, storageOffset - STORAGE_PAGE_LIMIT))
            }}
            onNextStoragePage={() => {
              void setStorageOffset(storageOffset + STORAGE_PAGE_LIMIT)
            }}
            onShareStorageItem={(item) => {
              if (item.source === "data" && item.data_blob_id) {
                openShareDialog("data", item.data_blob_id)
              }
            }}
            onSetVisibility={(item, visibility) => {
              void setStorageVisibility(item, visibility)
            }}
          />
        )
      case "environments":
        return (
          <EnvironmentsView
            creditsLabel={creditsLabel}
            environments={environments}
            uniqueDataBlobs={uniqueDataBlobs}
            dataBlobsById={dataBlobsById}
            bindSelectionByEnvironment={bindSelectionByEnvironment}
            busy={busy}
            configEditorEnvironmentId={configEditorEnvironmentId}
            configName={environmentConfig?.config_name || ENVIRONMENT_CONFIG_FILE_NAME}
            configDraft={configDraft}
            configSourceText={configSourceText}
            configError={configError}
            configLoading={shouldLoadEnvironmentConfig && !environmentConfig}
            configSaving={configSaving}
            onBindSelectionChange={(environmentId, value) =>
              setBindSelectionByEnvironment((current) => ({
                ...current,
                [environmentId]: value,
              }))
            }
            onBindSelectedData={(environment) => {
              void bindSelectedData(environment)
            }}
            onUnbindData={(environmentId, dataId) => {
              void unbindDataFromEnvironment(environmentId, dataId)
            }}
            onLaunchRun={(environmentId) => {
              void launchRun(environmentId)
            }}
            onOpenConfigEditor={(environment) => {
              openEnvironmentConfigEditor(environment)
            }}
            onCloseConfigEditor={closeEnvironmentConfigEditor}
            onConfigDraftChange={setConfigDraft}
            onCancelConfigEdit={cancelEnvironmentConfigEdit}
            onSaveConfig={(environmentId) => {
              void saveEnvironmentConfig(environmentId)
            }}
            onDeleteEnvironments={deleteEnvironments}
            onShareEnvironment={(environmentId) => openShareDialog("environment", environmentId)}
          />
        )
      case "runs":
        return (
          <RunsView
            creditsLabel={creditsLabel}
            environments={environments}
            runs={runs}
            busy={busy}
            activeTab={runsTab}
            selectedRunId={selectedRunId}
            runDetail={runDetail}
            runLogs={runLogs}
            runMetrics={runMetrics}
            onActiveTabChange={(tab) => {
              void setRunsTab(tab)
            }}
            onSelectRun={setSelectedRunId}
            onCancelRun={(runId) => {
              void cancelRun(runId)
            }}
            onDeleteRuns={deleteRuns}
            onShareRun={(runId) => openShareDialog("run", runId)}
          />
        )
      case "billing":
        return (
          <BillingView
            balanceCents={myCredits?.balance_cents ?? 0}
            bootstrapCreditCents={BILLING_CONFIG.initialCreditCents}
            currency={myCredits?.currency ?? "USD"}
            initialized={myCredits?.initialized === true}
            usageEvents={usageEventsWithContext}
          />
        )
      case "audit_logs":
        return <AuditLogsView runs={runs} environmentNameById={environmentNameById} />
      case "settings":
        return (
          <SettingsView
            theme={resolvedTheme}
            onThemeChange={(theme) => setTheme(theme)}
            userEmail={currentUser?.email ?? ""}
            apiKeys={apiKeys ?? []}
            profile={settingsProfileDraft}
            onProfileChange={setSettingsProfileDraft}
            savingProfile={savingSettingsProfile}
            onSaveProfile={saveSettingsProfile}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="flex h-screen bg-sidebar">
      <Sidebar
        activeView={activeView}
        onViewChange={(view) => {
          void setActiveView(view)
        }}
        userInitial={userInitial}
        isDark={isDark}
        onThemeToggle={() => setTheme(isDark ? "light" : "dark")}
        onLogout={logout}
      />
      <main className="flex-1 bg-background rounded-tl-xl border-l border-border overflow-hidden flex flex-col">
        {/* Notices */}
        {(error || message) && (
          <div className="px-6 pt-3">
            {error ? <Notice variant="error" className="mb-2">{error}</Notice> : null}
            {message ? <Notice className="mb-2">{message}</Notice> : null}
          </div>
        )}
        {renderMainContent()}
      </main>
      {shareTarget && (
        <ShareDialog
          resourceType={shareTarget.resourceType}
          resourceId={shareTarget.resourceId}
          isOwner={true}
          open={shareDialogOpen}
          shareLinks={shareLinksForResource?.shareLinks ?? []}
          busy={shareBusy}
          error={shareError}
          message={shareMessage}
          onOpenChange={(open) => {
            setShareDialogOpen(open)
            if (!open) setShareTarget(null)
          }}
          onCreateLink={(permission) => {
            void handleCreateLink(permission)
          }}
          onRevokeLink={(shareLinkId) => {
            void handleRevokeLink(shareLinkId)
          }}
        />
      )}
    </div>
  )
}
