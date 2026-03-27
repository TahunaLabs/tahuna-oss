"use client"

import { useEffect, useState } from "react"
import { useAction } from "convex/react"
import { toast } from "sonner"
import { api } from "@convex/_generated/api"
import { validateArtifactRenameName, type StorageItem } from "@/components/features/dashboard-model"
import type { Id } from "@convex/_generated/dataModel"

type UseArtifactRenameArgs = {
  storageItems: StorageItem[]
  onSuccess: () => void
}

function useArtifactRename({ storageItems, onSuccess }: UseArtifactRenameArgs) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState("")
  const [renameBusyId, setRenameBusyId] = useState<string | null>(null)

  const renameArtifactAction = useAction(api.storage.renameArtifact)

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
        runId: runId as Id<"runs">,
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "failed to rename artifact")
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
