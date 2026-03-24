"use client"

import { X } from "lucide-react"
import type { FormEvent, RefObject } from "react"

import { formatBytes } from "@/components/features/dashboard-model"
import { Button } from "@/components/ui/button"
import { Notice } from "@/components/ui/notice"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

type StorageUploadDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileInputRef: RefObject<HTMLInputElement | null>
  dataFileInputKey: number
  selectedDataFiles: File[]
  uploadingData: boolean
  uploadError: string
  uploadMessage: string
  onUploadData: (event: FormEvent<HTMLFormElement>) => void
  onSelectDataFiles: (files: File[]) => void
  onOpenFilePicker: () => void
}

function StorageUploadDrawer({
  open,
  onOpenChange,
  fileInputRef,
  dataFileInputKey,
  selectedDataFiles,
  uploadingData,
  uploadError,
  uploadMessage,
  onUploadData,
  onSelectDataFiles,
  onOpenFilePicker,
}: StorageUploadDrawerProps) {
  const selectedFileCount = selectedDataFiles.length
  const selectedTotalBytes = selectedDataFiles.reduce((total, file) => total + file.size, 0)

  return (
    <>
      <input
        key={dataFileInputKey}
        ref={fileInputRef}
        type="file"
        multiple
        disabled={uploadingData}
        onChange={(e) => onSelectDataFiles(Array.from(e.target.files ?? []))}
        className="hidden"
      />

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full max-w-sm p-0">
          <form onSubmit={onUploadData} className="flex h-full flex-col">
            <div className="border-b border-border px-4 py-3">
              <SheetHeader>
                <SheetTitle>Upload files</SheetTitle>
                <SheetDescription>Data uploads for storage</SheetDescription>
              </SheetHeader>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
              <p className="text-sm text-foreground">
                {selectedFileCount > 0
                  ? `${selectedFileCount} file${selectedFileCount > 1 ? "s" : ""} selected (${formatBytes(selectedTotalBytes)})`
                  : "No files selected"}
              </p>

              {uploadError ? (
                <div className="mt-2">
                  <Notice variant="error">{uploadError}</Notice>
                </div>
              ) : null}
              {!uploadError && uploadMessage ? (
                <div className="mt-2">
                  <Notice>{uploadMessage}</Notice>
                </div>
              ) : null}

              {selectedFileCount > 0 ? (
                <div className="mt-3 min-h-0 flex-1 rounded border border-border">
                  <ul className="h-full divide-y divide-border overflow-y-auto">
                    {selectedDataFiles.map((file) => (
                      <li
                        key={`${file.name}-${file.size}-${file.lastModified}`}
                        className="flex items-center justify-between gap-3 px-2.5 py-2 text-xs"
                      >
                        <span className="min-w-0 truncate text-foreground">{file.name}</span>
                        <span className="shrink-0 text-muted-foreground">{formatBytes(file.size)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  Choose files to start an upload. Errors will stay in this drawer for quick retry.
                </p>
              )}
            </div>

            <SheetFooter className="justify-between gap-2 border-t border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="compact-toggle"
                  size="compact-xs"
                  onClick={onOpenFilePicker}
                  disabled={uploadingData}
                >
                  Choose files
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onSelectDataFiles([])}
                  disabled={uploadingData || selectedFileCount === 0}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <Button
                type="submit"
                variant="default"
                size="compact-sm"
                className="min-w-20"
                disabled={selectedFileCount === 0 || uploadingData}
              >
                {uploadingData ? "Uploading..." : "Upload"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}

export { StorageUploadDrawer }
