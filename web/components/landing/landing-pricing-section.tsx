import { CLOUD_BILLING_CONFIG } from "@/cloud/config"
import { listRunpodGpuPricingRows } from "@/cloud/providers/runpod-gpu-pricing"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { ChevronDown } from "lucide-react"

const displayedGpuRows = listRunpodGpuPricingRows()
const vramGroups = [
  { label: ">80GB VRAM", rows: displayedGpuRows.filter((row) => row.vramGb > 80), defaultOpen: true },
  { label: "80GB VRAM", rows: displayedGpuRows.filter((row) => row.vramGb === 80), defaultOpen: true },
  { label: "48GB VRAM", rows: displayedGpuRows.filter((row) => row.vramGb === 48), defaultOpen: false },
  { label: "32GB VRAM", rows: displayedGpuRows.filter((row) => row.vramGb === 32), defaultOpen: false },
  { label: "24GB VRAM", rows: displayedGpuRows.filter((row) => row.vramGb === 24), defaultOpen: false },
].filter((group) => group.rows.length > 0)

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
              Pay for compute
              <br />
              <span className="italic">and Storage you use</span>
            </h2>
          </div>

          <p className="max-w-lg text-lg font-serif font-medium text-foreground md:text-xl">
            Runs and serves draw down credits for active GPU time and attached volume.
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
                <div className="hidden border-b border-border px-5 py-2 font-mono text-xs uppercase tracking-ui-eyebrow text-muted-foreground md:grid md:grid-cols-5">
                  <span>GPU</span>
                  <span>VRAM</span>
                  <span>RAM</span>
                  <span>vCPUs</span>
                  <span className="text-right">Price</span>
                </div>
                {vramGroups.map((group) => (
                  <details key={group.label} open={group.defaultOpen} className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-3">
                      <span className="font-mono text-xs uppercase tracking-ui-eyebrow text-muted-foreground">
                        {group.label}
                      </span>
                      <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="divide-y divide-border border-t border-border">
                      {group.rows.map((row) => (
                        <div
                          key={row.gpuType}
                          className="grid grid-cols-2 gap-x-4 gap-y-2 px-5 py-3 md:grid-cols-5 md:items-center"
                        >
                          <span className="text-sm text-foreground md:col-span-1">{row.gpuType}</span>
                          <span className="font-mono text-xs text-muted-foreground">{row.vramGb} GB VRAM</span>
                          <span className="font-mono text-xs text-muted-foreground">{row.ramGb} GB RAM</span>
                          <span className="font-mono text-xs text-muted-foreground">{row.vcpus} vCPUs</span>
                          <span className="font-mono text-sm text-foreground md:text-right">
                            {formatDollars(row.pricePerHour)} / hr
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </CardContent>
          </Card>

          <div>
            <Card variant="default" className="bg-card/95">
              <CardContent>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="font-serif text-2xl text-foreground">Volumes</h3>
                  <Badge variant="ghost">Flexible and persisitent storage</Badge>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Attached volume</span>
                    <span className="font-mono text-foreground">
                      {formatCents(CLOUD_BILLING_CONFIG.computeVolumeGbMonthlyRateCents)} / GB / mo
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
