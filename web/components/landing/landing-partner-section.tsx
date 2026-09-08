import Link from "next/link"
import { ArrowRight, Plus } from "lucide-react"

import { DotGrid } from "@/components/landing/section-decorations"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const steps = [
  {
    step: "Step 1",
    title: "AI Opportunity Audit",
    body: "We run a structured audit of how work moves through your product and organization — across teams, systems, and decision points. The goal is to pinpoint where AI can reduce operational overhead, accelerates execution, or replaces manual coordination entirely.",
  },
  {
    step: "Step 2",
    title: "Architecture & Design",
    body: "We design and build the model-improvement loop that will power the workflow — integrating your company's context, data, and operational logic behind the process.",
  },
  {
    step: "Step 3",
    title: "Production Deployment",
    body: "Tahuna deploys the loop into your enterprise stack, connecting it to live systems and workflows so the model starts improving on real production work. Everything is built on top of your existing software — no migrations required.",
  },
] as const

const selfServeItems = [
  "Instant access",
  "CLI & full documentation",
  "Bring your own training loop",
  "Usage-based pricing",
] as const

function ColumnLabel({ children }: { children: string }) {
  return <p className="mb-6 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">{children}</p>
}

export function LandingPartnerSection() {
  return (
    <section id="partner" className="relative overflow-hidden border-t border-border px-6 py-20 md:px-8 md:py-24">
      <DotGrid className="right-0 top-16 h-64 w-1/3" />
      <div className="relative mx-auto max-w-7xl">
        <div className="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="mb-3 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">How we partner</p>
            <h2 className="text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
              Frontier ML,
              <br />
              Embedded in your stack
            </h2>
          </div>
          <p className="max-w-md text-base leading-relaxed text-muted-foreground md:text-right">
            We pair frontier ML — RL post-training, long-horizon agents — with real enterprise
            deployment, embedded in your team.
          </p>
        </div>

        <Card variant="default" className="overflow-hidden border-border bg-card/95">
          <CardContent className="p-0">
            <div className="grid md:grid-cols-2">
              {/* Forward-deployed — hover to reveal each step */}
              <div className="flex flex-col border-b border-border p-8 md:border-b-0 md:border-r">
                <ColumnLabel>Forward-deployed</ColumnLabel>

                <h3 className="text-2xl font-semibold tracking-tight text-foreground">We embed with your team</h3>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  Our engineers work alongside yours — from first audit to a model improving in production.
                </p>

                <div className="mt-6 flex flex-col">
                  {steps.map((s) => (
                    <div
                      key={s.step}
                      tabIndex={0}
                      className="group border-b border-border/60 py-5 first:pt-0 last:border-b-0 last:pb-0 focus-visible:outline-none"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-ui-eyebrow text-muted-foreground">{s.step}</p>
                          <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">{s.title}</h3>
                        </div>
                        <Plus
                          aria-hidden
                          className="mt-1 hidden size-4 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:rotate-45 group-focus-visible:rotate-45 md:block"
                        />
                      </div>
                      <div className="grid grid-rows-[1fr] transition-[grid-template-rows] duration-300 ease-out md:grid-rows-[0fr] md:group-hover:grid-rows-[1fr] md:group-focus-visible:grid-rows-[1fr]">
                        <div className="overflow-hidden">
                          <p className="mt-3 text-sm leading-relaxed text-muted-foreground transition-opacity duration-300 md:opacity-0 md:group-hover:opacity-100 md:group-focus-visible:opacity-100">
                            {s.body}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-auto pt-8">
                  <Button asChild size="lg">
                    <Link href="https://cal.com/monaimel/15min" target="_blank" rel="noreferrer">
                      Talk to an engineer
                      <ArrowRight />
                    </Link>
                  </Button>
                </div>
              </div>

              {/* Self-serve */}
              <div className="flex flex-col p-8">
                <ColumnLabel>Self-serve</ColumnLabel>

                <h3 className="text-2xl font-semibold tracking-tight text-foreground">Use it however you want</h3>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  Your team designs and runs experiments. We manage the training, serving, and infrastructure load.
                </p>

                <ul className="mt-6 grid gap-3">
                  {selfServeItems.map((item) => (
                    <li
                      key={item}
                      className="border-b border-border/60 pb-2 text-sm text-foreground last:border-b-0 last:pb-0"
                    >
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-8">
                  <Button asChild size="lg" variant="outline">
                    <Link href="/login">
                      Get started
                      <ArrowRight />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
