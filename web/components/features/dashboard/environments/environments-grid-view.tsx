"use client"

import {
  type DataBlobRow,
  type EnvironmentRow,
} from "@/components/features/dashboard-model"
import { EnvironmentCard } from "@/components/features/dashboard/environments/environment-card"

type EnvironmentsGridViewProps = {
  environments: EnvironmentRow[]
  dataBlobsById: ReadonlyMap<string, DataBlobRow>
  configEditorEnvironmentId: string | null
  sharedByMeResourceIds?: ReadonlySet<string>
  configName: string
  configDraft: string
  configSourceText: string
  configError: string
  configLoading: boolean
  configSaving: boolean
  busy: boolean
  onCloseConfigEditor: () => void
  onDeleteEnvironments: (ids: EnvironmentRow["environment_id"][]) => Promise<boolean>
  onLaunchRun: (id: EnvironmentRow["environment_id"]) => void
  onOpenConfigEditor: (environment: EnvironmentRow) => void
  onShareEnvironment?: (id: string) => void
  onConfigDraftChange: (value: string) => void
  onCancelConfigEdit: () => void
  onSaveConfig: (id: EnvironmentRow["environment_id"]) => void
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
export type { EnvironmentsGridViewProps }
