"use client"

import { FileCode2, Play, Share2, Trash2 } from "lucide-react"

import type { EnvironmentRow } from "@/components/dashboard/shared"
import { ActionsMenu } from "@/components/linear/actions-menu"
import { Button } from "@/components/ui/button"

type EnvironmentActionsMenuProps = {
  environment: EnvironmentRow
  busy: boolean
  configOpen: boolean
  configSaving: boolean
  onCloseConfigEditor: () => void
  onDeleteEnvironments: (environmentIds: EnvironmentRow["environment_id"][]) => Promise<boolean>
  onLaunchRun: (environmentId: EnvironmentRow["environment_id"]) => void
  onOpenConfigEditor: (environment: EnvironmentRow) => void
  onShareEnvironment?: (environmentId: string) => void
}

function EnvironmentActionsMenu({
  environment,
  busy,
  configOpen,
  configSaving,
  onCloseConfigEditor,
  onDeleteEnvironments,
  onLaunchRun,
  onOpenConfigEditor,
  onShareEnvironment,
}: EnvironmentActionsMenuProps) {
  return (
    <ActionsMenu triggerLabel={`Open actions for ${environment.name}`}>
      {(close) => (
        <>
          <Button
            type="button"
            variant="sidebar-menu-item"
            size="none"
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
          </Button>

          <Button
            type="button"
            variant="sidebar-menu-item"
            size="none"
            onClick={() => {
              close()
              onLaunchRun(environment.environment_id)
            }}
            disabled={busy}
          >
            <Play className="h-3.5 w-3.5" />
            Run
          </Button>

          {onShareEnvironment ? (
            <Button
              type="button"
              variant="sidebar-menu-item"
              size="none"
              onClick={() => {
                close()
                onShareEnvironment(environment.environment_id)
              }}
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </Button>
          ) : null}

          <Button
            type="button"
            variant="sidebar-menu-item"
            size="none"
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
          </Button>
        </>
      )}
    </ActionsMenu>
  )
}

export { EnvironmentActionsMenu }
