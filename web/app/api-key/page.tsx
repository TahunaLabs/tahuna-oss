"use client"

import { AuthPageShell } from "@/components/auth-page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageLoader } from "@/components/ui/spinner"
import { api } from "@/convex/_generated/api"
import { type Id } from "@/convex/_generated/dataModel"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { formatDistanceToNow } from "date-fns"
import { Trash2 } from "lucide-react"
import { useMemo, useState, type FormEvent } from "react"

const DEFAULT_API_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.trim() || "https://your-deployment.convex.site"

type BootstrapResponse = {
  user_id: string
  api_key: string
  api_key_id: string
}

export default function ApiKeyPage() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const createApiKeyMutation = useMutation(api.auth.createApiKey)
  const revokeApiKeyMutation = useMutation(api.auth.revokeApiKey)
  const apiKeys = useQuery(api.auth.listApiKeys)

  const [name, setName] = useState("cli")
  const [busy, setBusy] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [result, setResult] = useState<BootstrapResponse | null>(null)

  const exportSnippet = useMemo(() => {
    if (!result) return ""
    return `export TAHUNA_API_URL=${DEFAULT_API_URL}
export TAHUNA_API_KEY=${result.api_key}`
  }, [result])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError("")
    setResult(null)

    try {
      const data = await createApiKeyMutation({ name })
      setResult(data as BootstrapResponse)
      setName("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "unexpected error")
    } finally {
      setBusy(false)
    }
  }

  async function onRevoke(id: string) {
    if (!confirm("Are you sure you want to revoke this API key?")) return
    setRevoking(id)
    setError("")
    try {
      await revokeApiKeyMutation({ id: id as Id<"apiKeys"> })
      if (result && result.api_key_id === id) {
        setResult(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "unexpected error")
    } finally {
      setRevoking(null)
    }
  }

  return (
    <AuthPageShell
      eyebrow="CLI Credentials"
      title="Get an API key"
      subtitle="Generate a key to connect the CLI. Make sure to copy it — it's only shown once."
    >
      <div className="space-y-10">
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">Key Name</Label>
            <Input
              id="name"
              required
              placeholder="cli"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <Button type="submit" disabled={busy || isLoading || !isAuthenticated} className="w-full sm:w-auto">
            {busy ? "Creating key..." : "Create API key"}
          </Button>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {result ? (
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-4 space-y-3">
              <p className="text-sm text-foreground/90">
                Key generated successfully. Please copy it now, it won't be shown again.
              </p>
              <div className="rounded-md border border-border bg-background/70 p-3 flex justify-between items-center gap-4">
                <span className="font-mono text-xs break-all selection:bg-primary/20">{result.api_key}</span>
              </div>
              <pre className="rounded-md border border-border bg-background/70 p-3 text-xs overflow-x-auto selection:bg-primary/20">
                <code>{exportSnippet}</code>
              </pre>
            </div>
          ) : null}
        </form>

        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-foreground border-b border-border pb-2">Active API Keys</h2>
          
          {!apiKeys ? (
            <div className="py-8 flex justify-center"><PageLoader /></div>
          ) : apiKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">No active API keys found</p>
          ) : (
            <div className="space-y-3">
              {apiKeys.map((key) => {
                const isRevoked = !!key.revokedAt;
                return (
                  <Card key={key._id} className="p-4 flex items-start justify-between gap-4">
                    <div className="space-y-1 overflow-hidden">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-sm truncate">{key.name}</span>
                        {isRevoked ? (
                          <Badge className="text-[10px] px-1.5 py-0 h-4 uppercase tracking-wider bg-rose-900/10 text-rose-400 border-none hover:bg-rose-900/10">Revoked</Badge>
                        ) : null}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">{key.keyPrefix}••••••••••••••••••••</div>
                      <div className="text-[11px] text-muted-foreground/70">
                        Created {formatDistanceToNow(key._creationTime, { addSuffix: true })}
                        {key.lastUsedAt && !isRevoked ? ` • Last used ${formatDistanceToNow(key.lastUsedAt, { addSuffix: true })}` : ""}
                      </div>
                    </div>
                    {!isRevoked && (
                      <Button
                        type="button"
                        onClick={() => onRevoke(key._id)}
                        disabled={revoking === key._id}
                        variant="ghost" 
                        size="icon"
                        className="text-muted-foreground hover:text-rose-400 hover:bg-rose-900/10 h-8 w-8 shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Revoke</span>
                      </Button>
                    )}
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </AuthPageShell>
  )
}
