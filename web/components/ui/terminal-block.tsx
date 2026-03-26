'use client'

import { Copy } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

function TerminalBlock({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    void navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card variant="surface">
      {/* Window chrome — traffic lights built from design-system color tokens */}
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
        <div className="size-2.5 rounded-full bg-destructive" />
        <div className="size-2.5 rounded-full bg-warning" />
        <div className="size-2.5 rounded-full bg-success" />
      </div>

      <CardContent className="flex items-center gap-3 py-3">
        <span className="font-mono text-sm text-primary select-none" aria-hidden>
          {'>'}
        </span>
        <span className="flex-1 font-mono text-sm">{command}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleCopy}
          aria-label={copied ? 'Copied' : 'Copy command'}
        >
          <Copy />
        </Button>
      </CardContent>
    </Card>
  )
}

export { TerminalBlock }
