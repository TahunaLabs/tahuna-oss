"use client"

import { useEffect, useState } from "react"
import { ConvexError } from "convex/values"
import { toast } from "sonner"
import { validateArtifactRenameName, type StorageItem } from "@/components/features/dashboard-model"
import { useRenameDashboardArtifact } from "@/lib/dashboard-api"
import { ERROR_MESSAGES } from "@/lib/error-messages"

type UseArtifactRenameArgs = {
  storageItems: StorageItem[]
  onSuccess: () => void
}

function useArtifactRename({ storageItems, onSuccess }: UseArtifactRenameArgs) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState("")
  const [renameBusyId, setRenameBusyId] = useState<string | null>(null)

  const renameArtifactAction = useRenameDashboardArtifact()

  // Cancel rename if the item disappears
  useEffect(() => {
    if (!renamingId) return
    if (storageItems.some((item) => item.id === renamingId)) return
    setRenamingId(null)
    setRenameDraft("")
  }, [renamingId, storageItems])

  function start(item: StorageItem) {
    if (item.source !== "run_artifact") return
    setRenamingId(item.id)
    setRenameDraft(item.name)
  }

  function cancel() {
    if (renameBusyId) return
    setRenamingId(null)
    setRenameDraft("")
  }

  async function save(item: StorageItem) {
    const runId = item.run?.id
    if (item.source !== "run_artifact" || !runId) {
      toast.error("only run artifacts can be renamed")
      return
    }
    let nextName = ""
    try {
      nextName = validateArtifactRenameName(renameDraft)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "invalid artifact name")
      return
    }
    if (nextName === item.name) {
      toast.error("new artifact name must differ from the current name")
      return
    }
    setRenameBusyId(item.id)
    try {
      const renamed = await renameArtifactAction({
        runId,
        key: item.key,
        name: nextName,
      })
      setRenamingId(null)
      setRenameDraft("")
      onSuccess()
      toast.success(
        renamed.cleanup_warning
          ? `Renamed artifact to ${renamed.name}. Old object cleanup needs a retry.`
          : `Renamed artifact to ${renamed.name}.`,
      )
    } catch (error) {
      const reason = error instanceof ConvexError ? error.data : undefined
      if (reason === "new artifact name must differ from the current name") {
        toast.error(ERROR_MESSAGES.artifactNameMustDiffer)
      } else if (reason === "artifact not found in run outputs") {
        toast.error(ERROR_MESSAGES.artifactNotFoundInRunOutputs)
      } else if (reason === "artifact name already exists in this run") {
        toast.error(ERROR_MESSAGES.artifactNameAlreadyExistsInRun)
      } else if (reason === "artifact object is missing from storage") {
        toast.error(ERROR_MESSAGES.artifactObjectMissingFromStorage)
      } else if (reason === "artifact name already exists in storage") {
        toast.error(ERROR_MESSAGES.artifactNameAlreadyExistsInStorage)
      } else if (reason === "renamed artifact metadata could not be loaded") {
        toast.error(ERROR_MESSAGES.renamedArtifactMetadataNotLoaded)
      } else {
        toast.error(ERROR_MESSAGES.failedToRenameArtifact)
      }
    } finally {
      setRenameBusyId(null)
    }
  }

  return {
    renamingId,
    renameDraft,
    renameBusyId,
    onDraftChange: setRenameDraft,
    onStart: start,
    onCancel: cancel,
    onSave: save,
  }
}

export { useArtifactRename }
