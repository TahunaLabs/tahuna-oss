"use client"

import { useState } from "react"
import Image from "next/image"
import { Cloud } from "lucide-react"

import { DashboardViewLayout } from "@/components/app-shell/dashboard-view-layout"
import { RunpodSettingsCard } from "@/components/cloud/dashboard/providers/runpod-settings-card"
import { PROVIDERS_CONFIG, type ProviderId } from "@/components/cloud/dashboard/providers/providers-model"
import type { CloudRunpodCredentialStatus } from "@/cloud/dashboard-api-types"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// TODO: wire activeProvider to a user preference stored in Convex
//       mutation: api.providerPreferences.setMyProviderPreference
//       query:    api.providerPreferences.getMyProviderPreference
type ActiveProvider = "auto" | ProviderId

const ACTIVE_PROVIDER_OPTIONS: { id: ActiveProvider; label: string; available: boolean }[] = [
  { id: "auto",    label: "Auto",   available: true  },
  { id: "runpod",  label: "Runpod", available: true  },
  // TODO: set available: true for gcp / azure / aws once their credential APIs are implemented
  { id: "gcp",     label: "GCP",    available: false },
  { id: "azure",   label: "Azure",  available: false },
  { id: "aws",     label: "AWS",    available: false },
]

type ProvidersViewProps = {
  runpodStatus?: CloudRunpodCredentialStatus
  savingRunpod: boolean
  revokingRunpod: boolean
  onSaveRunpod: (apiKey: string) => Promise<void>
  onRevokeRunpod: () => Promise<void>
}

export function ProvidersView({
  runpodStatus,
  savingRunpod,
  revokingRunpod,
  onSaveRunpod,
  onRevokeRunpod,
}: ProvidersViewProps) {
  // TODO: initialise from api.providerPreferences.getMyProviderPreference once implemented
  const [activeProvider, setActiveProvider] = useState<ActiveProvider>("auto")

  return (
    <DashboardViewLayout
      sectionLabel="Cloud Providers"
      title="Cloud Providers"
      titleIcon={<Cloud size={24} />}
      toolbar={null}
    >
      <Card className="p-4">
        {/* Active provider selector */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Active provider</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Used when launching runs.</p>
          </div>
          <div className="flex gap-1">
            {ACTIVE_PROVIDER_OPTIONS.map((option) => (
              <Button
                key={option.id}
                type="button"
                variant="tab"
                size="none"
                data-active={activeProvider === option.id || undefined}
                disabled={!option.available}
                title={option.available ? undefined : "Coming soon"}
                onClick={() => setActiveProvider(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        <Separator className="my-4" />

        {/* Per-provider credential configuration */}
        <Tabs defaultValue="runpod">
          <TabsList>
            {PROVIDERS_CONFIG.map(({ id, label, logo, supported }) => (
              <TabsTrigger
                key={id}
                value={id}
                disabled={!supported}
                title={supported ? undefined : "Coming soon"}
              >
                {logo && <Image src={logo} alt={label} width={16} height={16} />}
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <Separator className="mt-2" />

          <TabsContent value="runpod">
            <RunpodSettingsCard
              status={runpodStatus}
              saving={savingRunpod}
              revoking={revokingRunpod}
              onSave={onSaveRunpod}
              onRevoke={onRevokeRunpod}
            />
          </TabsContent>

          {/* TODO: replace with real credential cards once each provider is implemented */}
          {PROVIDERS_CONFIG.filter((p) => !p.supported).map(({ id }) => (
            <TabsContent key={id} value={id} className="opacity-50">
              <div className="space-y-3">
                <label className="mb-1.5 block text-sm text-muted-foreground">API key</label>
                <Input disabled placeholder="Not yet supported" />
                <p className="text-xs text-muted-foreground">This provider is coming soon.</p>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </Card>
    </DashboardViewLayout>
  )
}
