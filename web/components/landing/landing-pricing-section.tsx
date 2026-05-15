import { CLOUD_BILLING_CONFIG } from "@/cloud/config"
import { listRunpodGpuPricingRows } from "@/cloud/providers/runpod-gpu-pricing"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

const displayedGpuRows = listRunpodGpuPricingRows().sort((a, b) => b.pricePerHour - a.pricePerHour)

function formatDollars(value: number) {
  return `$${value.toFixed(2)}`
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

export function LandingPricingSection() {
  return (
    <section id="pricing" className="border-t border-border px-6 py-14 md:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-3 text-xs font-mono uppercase tracking-ui-eyebrow text-muted-foreground">Pricing</p>
            <h2 className="font-serif text-3xl leading-tight tracking-tight text-foreground md:text-4xl">
              Pay for the compute
              <br />
              <span className="italic">and storage</span> you use
            </h2>
          </div>

          <p className="max-w-lg text-lg font-serif font-medium text-foreground md:text-xl">
            Runs and serves draw down credits for active GPU time, attached volume, and storage growth.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card variant="default" className="bg-card/95 lg:col-span-2">
            <CardContent className="p-0">
              <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-serif text-2xl text-foreground">GPU compute</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Hourly prices from the current Tahuna GPU catalog.</p>
                </div>
                <Badge variant="filled">Per hour</Badge>
              </div>

              <div className="divide-y divide-border">
                {displayedGpuRows.map((row) => (
                  <div key={row.gpuType} className="flex items-center justify-between gap-4 px-5 py-3">
                    <span className="text-sm text-muted-foreground">{row.gpuType}</span>
                    <span className="shrink-0 font-mono text-sm text-foreground">
                      {formatDollars(row.pricePerHour)} / hr
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div>
            <Card variant="default" className="bg-card/95">
              <CardContent>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="font-serif text-2xl text-foreground">Storage</h3>
                  <Badge variant="ghost">Growth</Badge>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Attached volume</span>
                    <span className="font-mono text-foreground">
                      {formatCents(CLOUD_BILLING_CONFIG.computeVolumeGbHourlyRateCents)} / GB / hr
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Stored data growth</span>
                    <span className="font-mono text-foreground">
                      {formatCents(CLOUD_BILLING_CONFIG.storageGiBDeltaRateCents)} / GiB
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Minimum charge</span>
                    <span className="font-mono text-foreground">
                      {formatCents(CLOUD_BILLING_CONFIG.minimumChargeCents)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  )
}
