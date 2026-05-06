"use client"

import { useCallback } from "react"
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react"

import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import type {
  ApiKeyRow,
  DashboardShareLink,
  DashboardUser,
  DataBlobRow,
  EnvironmentConfigDetail,
  EnvironmentRow,
  ResourceType,
  RunDetail,
  RunLogsOnlyDetail,
  RunMetricsOnlyDetail,
  RunRow,
  ServeLogsOnlyDetail,
  ServeRow,
  StorageListResult,
  StorageSort,
  StorageSourceFilter,
} from "@/lib/dashboard-api-types"

type DashboardAuthState = {
  isAuthenticated: boolean
  isLoading: boolean
}

type DashboardEnvironmentListResult = {
  environments: EnvironmentRow[]
}

type DashboardDataBlobListResult = {
  blobs: DataBlobRow[]
}

type DashboardRunListResult = {
  runs: RunRow[]
}

type DashboardServeListResult = {
  serves: ServeRow[]
}

type DashboardShareLinkListResult = {
  shareLinks: DashboardShareLink[]
}

type DashboardStorageListArgs = {
  visibility: StorageSourceFilter
  sort: StorageSort
  search?: string
  offset: number
  limit: number
}

type DashboardUploadUrl = {
  blob_id: string
  filename: string
  key: string
  url: string
}

type DashboardDeleteResult = {
  deleted: number
}

type DashboardArtifactRenameResult = {
  run_id: string
  key: string
  name: string
  path: string
  download_url: string
  cleanup_warning: boolean
}

type DashboardStopServeResult = {
  serve_id: string
  status: string
}

type DashboardCreateShareLinkResult = {
  share_link_id: string
  token: string
}

type DashboardRevokeShareLinkResult = {
  revoked: boolean
}

const toRunId = (id: string) => id as Id<"runs">
const toEnvironmentId = (id: string) => id as Id<"environments">
const toServeId = (id: string) => id as Id<"serves">
const toApiKeyId = (id: string) => id as Id<"apiKeys">
const toShareLinkId = (id: string) => id as Id<"shareLinks">

export function useDashboardAuthState(): DashboardAuthState {
  return useConvexAuth()
}

export function useDashboardCurrentUser(shouldLoad: boolean) {
  return useQuery(api.auth.getCurrentUser, shouldLoad ? {} : "skip") as DashboardUser | undefined
}

export function useDashboardEnvironments(shouldLoad: boolean) {
  return useQuery(api.environments.list, shouldLoad ? {} : "skip") as DashboardEnvironmentListResult | undefined
}

export function useDashboardDataBlobs(shouldLoad: boolean) {
  return useQuery(api.data.list, shouldLoad ? {} : "skip") as DashboardDataBlobListResult | undefined
}

export function useDashboardEnvironmentConfig(environmentIdValue: string | null, shouldLoad: boolean) {
  return useQuery(
    api.environments.getConfig,
    shouldLoad && environmentIdValue !== null ? { environmentId: toEnvironmentId(environmentIdValue) } : "skip",
  ) as EnvironmentConfigDetail | undefined
}

export function useDashboardRuns(shouldLoad: boolean) {
  return useQuery(api.runs.list, shouldLoad ? {} : "skip") as DashboardRunListResult | undefined
}

export function useDashboardRunDetail(runIdValue: string | null, shouldLoad: boolean) {
  return useQuery(
    api.runs.get,
    shouldLoad && runIdValue !== null ? { runId: toRunId(runIdValue) } : "skip",
  ) as RunDetail | undefined
}

export function useDashboardRunLogs(runIdValue: string | null, shouldLoad: boolean) {
  return useQuery(
    api.runs.getRunLogs,
    shouldLoad && runIdValue !== null ? { runId: toRunId(runIdValue) } : "skip",
  ) as RunLogsOnlyDetail | undefined
}

export function useDashboardRunMetrics(runIdValue: string | null, shouldLoad: boolean) {
  return useQuery(
    api.runs.getRunMetrics,
    shouldLoad && runIdValue !== null ? { runId: toRunId(runIdValue) } : "skip",
  ) as RunMetricsOnlyDetail | undefined
}

export function useDashboardServes(shouldLoad: boolean) {
  return useQuery(api.serves.list, shouldLoad ? {} : "skip") as DashboardServeListResult | undefined
}

export function useDashboardServeLogs(serveIdValue: string | null, shouldLoad: boolean) {
  return useQuery(
    api.serves.getLogs,
    shouldLoad && serveIdValue !== null ? { serveId: toServeId(serveIdValue) } : "skip",
  ) as ServeLogsOnlyDetail | undefined
}

export function useDashboardApiKeys(shouldLoad: boolean) {
  return useQuery(api.auth.listApiKeys, shouldLoad ? {} : "skip") as ApiKeyRow[] | undefined
}

export function useDashboardShareLinks(
  shouldLoad: boolean,
  target: { resourceType: ResourceType; resourceId: string } | null,
) {
  return useQuery(
    api.sharing.listShareLinksForResource,
    shouldLoad && target !== null
      ? { resourceType: target.resourceType, resourceId: target.resourceId }
      : "skip",
  ) as DashboardShareLinkListResult | undefined
}

export function useListDashboardStorage() {
  return useAction(api.storage.list) as (args: DashboardStorageListArgs) => Promise<StorageListResult>
}

export function useDeleteDashboardStorageItems() {
  return useMutation(api.storage.deleteMany) as (args: { keys: string[] }) => Promise<DashboardDeleteResult>
}

export function useSetDashboardStorageVisibility() {
  return useMutation(api.storage.setVisibility) as (args: {
    key: string
    visibility: "shared" | "private"
  }) => Promise<null>
}

export function useGenerateDashboardUploadUrl() {
  return useMutation(api.data.generateUploadUrl) as (args: {
    filename: string
    size_bytes: number
  }) => Promise<DashboardUploadUrl>
}

export function useSyncDashboardDataMetadata() {
  return useMutation(api.data.syncMetadata) as (args: { key: string }) => Promise<unknown>
}

export function useRenameDashboardArtifact() {
  const renameArtifact = useAction(api.storage.renameArtifact)
  return useCallback(
    (args: { runId: string; key: string; name: string }) =>
      renameArtifact({
        runId: toRunId(args.runId),
        key: args.key,
        name: args.name,
      }) as Promise<DashboardArtifactRenameResult>,
    [renameArtifact],
  )
}

export function useRemoveDashboardEnvironment() {
  const removeEnvironment = useMutation(api.environments.remove)
  return useCallback((id: string) => removeEnvironment({ environmentId: toEnvironmentId(id) }), [removeEnvironment])
}

export function useCreateDashboardRun() {
  const createRun = useMutation(api.runs.create)
  return useCallback((id: string) => createRun({ environmentId: toEnvironmentId(id) }) as Promise<unknown>, [createRun])
}

export function useBindDashboardEnvironmentData() {
  const bindData = useMutation(api.environments.bindData)
  return useCallback(
    (id: string, dataIds: string[]) => bindData({ environmentId: toEnvironmentId(id), data_ids: dataIds }),
    [bindData],
  )
}

export function useUnbindDashboardEnvironmentData() {
  const unbindData = useMutation(api.environments.unbindData)
  return useCallback(
    (id: string, dataIds: string[]) =>
      unbindData({ environmentId: toEnvironmentId(id), data_ids: dataIds }),
    [unbindData],
  )
}

export function useUpdateDashboardEnvironmentConfig() {
  const updateConfig = useMutation(api.environments.updateConfig)
  return useCallback(
    (id: string, configText: string) =>
      updateConfig({ environmentId: toEnvironmentId(id), config_text: configText }) as Promise<EnvironmentConfigDetail>,
    [updateConfig],
  )
}

export function useCancelDashboardRun() {
  const cancelRun = useMutation(api.runs.cancel)
  return useCallback((id: string) => cancelRun({ runId: toRunId(id), force: false }) as Promise<unknown>, [cancelRun])
}

export function useRemoveDashboardRun() {
  const removeRun = useMutation(api.runs.remove)
  return useCallback(
    (id: string) => removeRun({ runId: toRunId(id), cancelActive: true, force: false }) as Promise<unknown>,
    [removeRun],
  )
}

export function useStopDashboardServe() {
  const stopServe = useMutation(api.serves.stop)
  return useCallback(
    (id: string) => stopServe({ serveId: toServeId(id), force: false }) as Promise<DashboardStopServeResult>,
    [stopServe],
  )
}

export function useRevokeDashboardApiKey() {
  const revokeApiKey = useMutation(api.auth.revokeApiKey)
  return useCallback((id: string) => revokeApiKey({ id: toApiKeyId(id) }) as Promise<unknown>, [revokeApiKey])
}

export function useCreateDashboardShareLink() {
  return useMutation(api.sharing.createShareLink) as (args: {
    resourceType: ResourceType
    resourceId: string
    permission: "read" | "edit"
  }) => Promise<DashboardCreateShareLinkResult>
}

export function useRevokeDashboardShareLink() {
  const revokeShareLink = useMutation(api.sharing.revokeShareLink)
  return useCallback(
    (id: string) => revokeShareLink({ shareLinkId: toShareLinkId(id) }) as Promise<DashboardRevokeShareLinkResult>,
    [revokeShareLink],
  )
}
