import { ArrowRight } from "lucide-react"
import Link from "next/link"

const newsItems = [
  {
    date: "FEBRUARY 10, 2026",
    title: "Markovi Free Is Full (For Now)",
    description:
      "We need to grow more slowly so we can sprint on the frontier.",
    image: null,
  },
  {
    date: "JANUARY 29, 2026",
    title: "Shareable Walkthroughs",
    description: "Generate interactive shareable annotated diagrams",
    image: null,
  },
  {
    date: "JANUARY 28, 2026",
    title: "Go Deep",
    description:
      "A new agent mode in Markovi: deep. It thinks for longer, plans more, and needs you less.",
    hasImage: true,
  },
  {
    date: "JANUARY 15, 2026",
    title: "Tab, Tab, Dead",
    description:
      "We're removing Markovi Tab. It is not part of the future we see.",
    hasImage: true,
  },
]

export function NewsSection() {
  return (
    <section id="news" className="py-20 md:py-28 px-6 border-t border-border">
      <div className="mx-auto max-w-7xl">
        {/* Section header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-16">
          <div>
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">
              News
            </p>
            <h2 className="text-3xl md:text-4xl font-serif tracking-tight text-foreground">
              Announcements <span className="italic">of</span> Markovi
            </h2>
          </div>
        </div>

        {/* News items */}
        <div className="space-y-0">
          {newsItems.map((item, index) => (
            <article
              key={index}
              className="group border-t border-border py-8 md:py-10 cursor-pointer hover:bg-foreground/[0.02] transition-colors"
            >
              <div className="flex flex-col md:flex-row gap-6 md:gap-0">
                {/* Date */}
                <div className="md:w-[280px] shrink-0 flex items-start">
                  <time className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                    {item.date}
                  </time>
                </div>

                {/* Divider for desktop */}
                <div className="hidden md:block w-px bg-border mx-8 self-stretch" />

                {/* Content */}
                <div className="flex-1">
                  <h3 className="text-xl md:text-2xl font-serif text-foreground mb-2 group-hover:text-primary transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* View more link */}
        <div className="border-t border-border pt-8 text-center">
          <Link
            href="#"
            className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            View more news
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </section>
  )
}
