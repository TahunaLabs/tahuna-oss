"use client"

import { FileCode2, Play, Share2, Trash2 } from "lucide-react"

import type { EnvironmentRow } from "@/components/features/dashboard-model"
import { ActionsMenu } from "@/components/features/dashboard/actions-menu"
import type { EnvironmentConfigEditor } from "@/components/features/dashboard/environments/environments-grid-view"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"

type EnvironmentActionsMenuProps = {
  environment: EnvironmentRow
  busy: boolean
  configOpen: boolean
  configEditor: EnvironmentConfigEditor
  onDeleteEnvironments: (environmentIds: EnvironmentRow["environment_id"][]) => Promise<boolean>
  onLaunchRun: (environmentId: EnvironmentRow["environment_id"]) => void
  onOpenConfigEditor: (environment: EnvironmentRow) => void
  onShareEnvironment?: (environmentId: string) => void
}

function EnvironmentActionsMenu({
  environment,
  busy,
  configOpen,
  configEditor,
  onDeleteEnvironments,
  onLaunchRun,
  onOpenConfigEditor,
  onShareEnvironment,
}: EnvironmentActionsMenuProps) {
  const { configSaving, onClose: onCloseConfigEditor } = configEditor
  return (
    <ActionsMenu triggerLabel={`Open actions for ${environment.name}`}>
      {(close) => (
        <>
          <DropdownMenuItem
            onClick={() => {
              close()
              if (configOpen) {
                onCloseConfigEditor()
                return
              }
              onOpenConfigEditor(environment)
            }}
            disabled={configSaving}
          >
            <FileCode2 className="h-3.5 w-3.5" />
            Config
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => {
              close()
              onLaunchRun(environment.environment_id)
            }}
            disabled={busy}
          >
            <Play className="h-3.5 w-3.5" />
            Run
          </DropdownMenuItem>

          {onShareEnvironment ? (
            <DropdownMenuItem
              onClick={() => {
                close()
                onShareEnvironment(environment.environment_id)
              }}
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuItem
            onClick={() => {
              close()
              void onDeleteEnvironments([environment.environment_id]).then((deleted) => {
                if (deleted && configOpen) {
                  onCloseConfigEditor()
                }
              })
            }}
            disabled={busy}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </DropdownMenuItem>
        </>
      )}
    </ActionsMenu>
  )
}

export { EnvironmentActionsMenu }
