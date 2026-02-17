import Link from "next/link"
import { ArrowRight } from "lucide-react"

export function Hero() {
  return (
    <section className="relative py-20 md:py-32 px-6 overflow-hidden">
      {/* Decorative asterisk */}
      <div className="absolute top-8 right-8 text-primary text-5xl font-serif select-none hidden lg:block" aria-hidden="true">
        {"*"}
      </div>

      <div className="mx-auto max-w-7xl">
        <div className="max-w-4xl">
          <h1 className="font-serif text-5xl md:text-7xl lg:text-[5.5rem] leading-[0.95] tracking-tight mb-10 text-foreground">
            <span className="italic">Engineered</span>
            <br />
            <span>For The Frontier</span>
          </h1>

          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-10">
            <div className="max-w-md">
              <p className="text-lg md:text-xl text-foreground/80 leading-relaxed mb-3">
                Markovi is the frontier training substrate that lets you wield the full power of leading models.
              </p>
              <p className="text-base text-muted-foreground">
                Pay as you go, with no markup for individuals.
              </p>
            </div>

            <Link
              href="#waitlist"
              className="inline-flex items-center gap-2 text-base font-medium text-foreground border border-foreground/30 rounded-full px-8 py-3.5 hover:bg-foreground/5 transition-colors self-start"
            >
              Get Started for Free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
