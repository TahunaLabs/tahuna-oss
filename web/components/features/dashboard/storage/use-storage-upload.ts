"use client"

import { useState } from "react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import type { FormEvent } from "react"
import { api } from "@convex/_generated/api"

type UseStorageUploadArgs = {
  onSuccess: () => void
}

function useStorageUpload({ onSuccess }: UseStorageUploadArgs) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [fileInputKey, setFileInputKey] = useState(0)

  const generateUploadUrlMutation = useMutation(api.data.generateUploadUrl)
  const syncMetadataMutation = useMutation(api.data.syncMetadata)

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
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unexpected error"
      toast.error(
        msg === "Failed to fetch"
          ? "Upload failed. Check the R2 bucket CORS policy for PUT requests from this app origin."
          : msg,
      )
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
