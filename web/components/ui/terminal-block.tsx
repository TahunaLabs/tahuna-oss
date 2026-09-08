"use client"

import { Check, Copy } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type TerminalBlockProps = {
  command: string
  title?: string
  className?: string
}

function TerminalBlock({ command, title = "terminal", className }: TerminalBlockProps) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    void navigator.clipboard.writeText(command)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card variant="default" className={cn("overflow-hidden rounded-lg bg-card/95", className)}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
          <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
          <div className="h-3 w-3 rounded-full bg-muted-foreground/30" />
        </div>
        <span className="ml-2 truncate font-mono text-xs text-muted-foreground">{title}</span>
      </div>

      <CardContent className="flex items-center gap-2 px-4 py-3">
        <span className="font-mono text-sm text-primary" aria-hidden>
          $
        </span>
        <code className="flex-1 truncate font-mono text-sm text-foreground/85">{command}</code>
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          onClick={handleCopy}
          aria-label={copied ? "Copied command" : "Copy command"}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </CardContent>
    </Card>
  )
}

export { TerminalBlock }
