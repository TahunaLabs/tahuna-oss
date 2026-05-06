"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { EnvironmentConfigDetail, EnvironmentRow } from "@/components/features/dashboard-model"
import type { EnvironmentConfigEditor } from "@/components/features/dashboard/environments/environments-grid-view"
import { ENVIRONMENT_CONFIG_FILE_NAME, renderEnvironmentConfig } from "@/lib/environment-config"
import { useDashboardEnvironmentConfig, useUpdateDashboardEnvironmentConfig } from "@/lib/dashboard-api"

type UseEnvironmentConfigEditorArgs = {
  environments: EnvironmentRow[]
  shouldLoadQueries: boolean
}

function useEnvironmentConfigEditor({ environments, shouldLoadQueries }: UseEnvironmentConfigEditorArgs): {
  configEditorEnvironmentId: string | null
  configEditor: EnvironmentConfigEditor
  openConfigEditor: (environment: EnvironmentRow) => void
} {
  const [configEditorEnvironmentId, setConfigEditorEnvironmentId] = useState<string | null>(null)
  const [configDraft, setConfigDraft] = useState("")
  const [configSourceText, setConfigSourceText] = useState("")
  const [configError, setConfigError] = useState("")
  const [configSaving, setConfigSaving] = useState(false)

  const shouldLoadConfig = shouldLoadQueries && configEditorEnvironmentId !== null
  const environmentConfig = useDashboardEnvironmentConfig(configEditorEnvironmentId, shouldLoadConfig) as
    | EnvironmentConfigDetail
    | undefined

  const updateConfigMutation = useUpdateDashboardEnvironmentConfig()

  // Close editor if its environment is deleted
  useEffect(() => {
    if (!configEditorEnvironmentId) return
    if (environments.some((e) => e.environment_id === configEditorEnvironmentId)) return
    setConfigEditorEnvironmentId(null)
    setConfigDraft("")
    setConfigSourceText("")
    setConfigError("")
  }, [configEditorEnvironmentId, environments])

  // Sync draft from server data (only when user hasn't made changes)
  useEffect(() => {
    if (!environmentConfig || environmentConfig.environment.environment_id !== configEditorEnvironmentId) return
    if (configDraft && configDraft !== configSourceText) return
    setConfigSourceText(environmentConfig.config_text)
    setConfigDraft(environmentConfig.config_text)
  }, [configDraft, configEditorEnvironmentId, configSourceText, environmentConfig])

  function open(environment: EnvironmentRow) {
    const nextConfig = renderEnvironmentConfig({
      name: environment.name,
      framework: environment.framework,
      version: environment.version,
      python_version: environment.python_version,
      gpu_type: environment.gpu_type,
      gpu_count: environment.gpu_count,
      volume_gb: environment.volume_gb,
    })
    setConfigError("")
    setConfigEditorEnvironmentId(environment.environment_id)
    setConfigSourceText(nextConfig)
    setConfigDraft(nextConfig)
  }

  function close() {
    if (configSaving) return
    setConfigEditorEnvironmentId(null)
    setConfigDraft("")
    setConfigSourceText("")
    setConfigError("")
  }

  async function save(environmentId: EnvironmentRow["environment_id"]) {
    setConfigSaving(true)
    setConfigError("")
    try {
      const saved = await updateConfigMutation(environmentId, configDraft)
      setConfigSourceText(saved.config_text)
      setConfigDraft(saved.config_text)
      toast.success(`Saved config for environment ${environmentId}.`)
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : "failed to save environment config")
    } finally {
      setConfigSaving(false)
    }
  }

  const configEditor: EnvironmentConfigEditor = {
    configName: environmentConfig?.config_name || ENVIRONMENT_CONFIG_FILE_NAME,
    configDraft,
    configSourceText,
    configError,
    configLoading: shouldLoadConfig && !environmentConfig,
    configSaving,
    onClose: close,
    onDraftChange: setConfigDraft,
    onCancel: () => { setConfigDraft(configSourceText); setConfigError("") },
    onSave: (environmentId) => { void save(environmentId) },
  }

  return { configEditorEnvironmentId, configEditor, openConfigEditor: open }
}

export { useEnvironmentConfigEditor }
