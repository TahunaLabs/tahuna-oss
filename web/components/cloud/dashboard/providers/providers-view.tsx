"use client"

import Image from "next/image"
import { Cloud } from "lucide-react"

import { DashboardViewLayout } from "@/components/app-shell/dashboard-view-layout"
import { RunpodSettingsCard } from "@/components/cloud/dashboard/providers/runpod-settings-card"
import { PROVIDERS_CONFIG } from "@/components/cloud/dashboard/providers/providers-model"
import type { CloudRunpodCredentialStatus } from "@/cloud/dashboard-api-types"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
  return (
    <DashboardViewLayout
      sectionLabel="Cloud Providers"
      title="Cloud Providers"
      titleIcon={<Cloud size={24} />}
      toolbar={null}
    >
      <Card className="p-4">
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
        </Tabs>
      </Card>
    </DashboardViewLayout>
  )
}
