"use client"

import type { EnvironmentRow } from "@/components/features/dashboard-model"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Notice } from "@/components/ui/notice"
import { Textarea } from "@/components/ui/textarea"

type EnvironmentConfigPanelProps = {
  environmentId: EnvironmentRow["environment_id"]
  configName: string
  configDraft: string
  configSourceText: string
  configError: string
  configLoading: boolean
  configSaving: boolean
  onClose: () => void
  onDraftChange: (value: string) => void
  onCancel: () => void
  onSave: (environmentId: EnvironmentRow["environment_id"]) => void
}

function EnvironmentConfigPanel({
  environmentId,
  configName,
  configDraft,
  configSourceText,
  configError,
  configLoading,
  configSaving,
  onClose,
  onDraftChange,
  onCancel,
  onSave,
}: EnvironmentConfigPanelProps) {
  const configDirty = configDraft !== configSourceText

  return (
    <Card variant="dashboard-panel" className="p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">Environment config</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-mono text-foreground">{configName}</span> is generated from the stored
            environment record. Saving changes updates future runs for this environment.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {configDirty ? (
            <span className="text-xs text-warning">Unsaved changes</span>
          ) : (
            <span className="text-xs text-muted-foreground">Saved</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={configSaving}
          >
            Close
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {configError ? <Notice variant="error">{configError}</Notice> : null}
        {configLoading ? (
          <p className="text-xs text-muted-foreground">Loading current config…</p>
        ) : null}

        <Textarea
          value={configDraft}
          onChange={(event) => onDraftChange(event.target.value)}
          disabled={configSaving}
          rows={11}
          spellCheck={false}
        />

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Supported keys: <code>name</code>, <code>framework</code>, <code>version</code>,{" "}
            <code>python_version</code>, <code>gpu_type</code>, <code>gpu_count</code>,{" "}
            <code>volume_gb</code>.
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={configSaving || !configDirty}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => onSave(environmentId)}
              disabled={configSaving || !configDirty}
            >
              {configSaving ? "Saving…" : "Save config"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

export { EnvironmentConfigPanel }
