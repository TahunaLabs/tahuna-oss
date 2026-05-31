import { ChevronDown } from "lucide-react"

import { CLOUD_LINKS_CONFIG } from "@/cloud/links"

const FAQS = [
  {
    q: "What is Tahuna?",
    a: "A control plane between your training code and cloud GPUs. You keep the loop; Tahuna handles the infrastructure around it.",
  },
  {
    q: "Do I have to change my training code?",
    a: "No. Tahuna runs your configured Python entrypoint, so your code owns the training loop.",
  },
  {
    q: "Which frameworks are supported?",
    a: "PyTorch, Hugging Face, Unsloth, TRL, and Verifiers — and anything that runs from a standard Python entrypoint.",
  },
  {
    q: "Where do my metrics go?",
    a: "Logs and metrics stream live. Metrics are Weights & Biases-compatible, so you can keep using familiar dashboards.",
  },
  {
    q: "How does pricing work?",
    a: "You pay for active GPU time and attached volume from prepaid credits. See the pricing section for the current GPU catalog.",
  },
  {
    q: "Which GPUs are available?",
    a: "From L4 and RTX 3090/4090 up to A100, H100/H200, RTX PRO 6000, and B200 — billed per hour.",
  },
]

export function LandingFaqSection() {
  return (
    <section id="faq" className="border-t border-border px-6 py-24 md:px-8 md:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-4 lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 text-xs uppercase tracking-ui-eyebrow text-muted-foreground">FAQ</p>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl">
            Frequently asked
            <br />
            questions
          </h2>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-muted-foreground">
            Everything else, in plain terms. Still stuck?{" "}
            <a href={CLOUD_LINKS_CONFIG.docsUrl} target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-4">
              Read the docs
            </a>
            .
          </p>
        </div>

        <div className="border-y border-border lg:col-span-8">
          {FAQS.map((faq) => (
            <details key={faq.q} className="group border-b border-border last:border-b-0">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5">
                <span className="text-base font-medium text-foreground">{faq.q}</span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="max-w-2xl pb-5 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
