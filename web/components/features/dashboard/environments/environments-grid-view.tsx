"use client"

import {
  type DataBlobRow,
  type EnvironmentRow,
} from "@/components/features/dashboard-model"
import { EnvironmentCard } from "@/components/features/dashboard/environments/environment-card"

type EnvironmentConfigEditor = {
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

type EnvironmentsGridViewProps = {
  environments: EnvironmentRow[]
  dataBlobsById: ReadonlyMap<string, DataBlobRow>
  configEditorEnvironmentId: string | null
  configEditor: EnvironmentConfigEditor
  sharedByMeResourceIds?: ReadonlySet<string>
  busy: boolean
  onDeleteEnvironments: (ids: EnvironmentRow["environment_id"][]) => Promise<boolean>
  onLaunchRun: (id: EnvironmentRow["environment_id"]) => void
  onOpenConfigEditor: (environment: EnvironmentRow) => void
  onShareEnvironment?: (id: string) => void
}

function EnvironmentsGridView({
  environments,
  dataBlobsById,
  configEditorEnvironmentId,
  sharedByMeResourceIds,
  ...cardProps
}: EnvironmentsGridViewProps) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      {environments.map((environment) => (
        <EnvironmentCard
          key={environment.environment_id}
          environment={environment}
          dataBlobsById={dataBlobsById}
          isShared={environment.access === "shared" || Boolean(sharedByMeResourceIds?.has(environment.environment_id))}
          configOpen={configEditorEnvironmentId === environment.environment_id}
          {...cardProps}
        />
      ))}
    </div>
  )
}

export { EnvironmentsGridView }
export type { EnvironmentConfigEditor, EnvironmentsGridViewProps }
