"use client"

import { Check, Copy } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"

type CliStepProps = {
  number: number
  label: string
  command: string
}

function CliStep({ number, label, command }: CliStepProps) {
  const [copied, setCopied] = useState(false)

  const copyCommand = () => {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div>
      <p className="mb-1.5 text-sm text-muted-foreground">
        {number}. {label}
      </p>
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary-dim px-4 py-2.5">
        <code className="font-mono text-sm text-foreground">{command}</code>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={copyCommand}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  )
}

export { CliStep }
