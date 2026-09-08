"use client"

import { useState } from "react"
import { ConvexError } from "convex/values"
import { toast } from "sonner"
import type { FormEvent } from "react"
import { UPLOAD_LIMITS_BYTES } from "@/config"
import { formatBytes } from "@/components/features/dashboard-model"
import { useGenerateDashboardUploadUrl, useSyncDashboardDataMetadata } from "@/lib/dashboard-api"
import { ERROR_MESSAGES } from "@/lib/error-messages"

type UseStorageUploadArgs = {
  onSuccess: () => void
}

function useStorageUpload({ onSuccess }: UseStorageUploadArgs) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [fileInputKey, setFileInputKey] = useState(0)

  const generateUploadUrlMutation = useGenerateDashboardUploadUrl()
  const syncMetadataMutation = useSyncDashboardDataMetadata()

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selectedFiles.length === 0) return
    setUploading(true)
    try {
      for (const file of selectedFiles) {
        const upload = await generateUploadUrlMutation({ filename: file.name, size_bytes: file.size })
        const response = await fetch(upload.url, {
          method: "PUT",
          headers: file.type ? { "Content-Type": file.type } : undefined,
          body: file,
        })
        if (!response.ok) throw new Error(`upload failed with status ${response.status}`)
        await syncMetadataMutation({ key: upload.key })
      }
      const count = selectedFiles.length
      setSelectedFiles([])
      setFileInputKey((n) => n + 1)
      onSuccess()
      toast.success(count === 1 ? "Uploaded 1 file." : `Uploaded ${count} files.`)
    } catch (error) {
      if (error instanceof ConvexError && typeof error.data === "string" && error.data.startsWith("data file exceeds limit of")) {
        toast.error(`${ERROR_MESSAGES.fileTooLargePrefix} ${formatBytes(UPLOAD_LIMITS_BYTES.dataBlob)}.`)
      } else if (error instanceof Error && error.message === "Failed to fetch") {
        toast.error(ERROR_MESSAGES.uploadCorsFailure)
      } else {
        toast.error(ERROR_MESSAGES.failedToUploadFile)
      }
    } finally {
      setUploading(false)
    }
  }

  return {
    selectedFiles,
    uploading,
    fileInputKey,
    onSelectFiles: setSelectedFiles,
    onUpload: upload,
  }
}

export { useStorageUpload }
