import Link from "next/link"

const footerColumns = [
  {
    title: "Product",
    links: [
      { label: "Get Started", href: "#" },
      { label: "Sign In", href: "#" },
      { label: "Documentation", href: "#" },
      { label: "Models", href: "#" },
      { label: "Markovi Free", href: "#" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Chronicle", href: "#" },
      { label: "Pricing", href: "#" },
      { label: "Podcast", href: "#" },
      { label: "Press Kit", href: "#" },
    ],
  },
  {
    title: "Guides",
    links: [
      { label: "How to Build an Agent", href: "#" },
      { label: "Context Management", href: "#" },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "X @markovi", href: "#" },
      { label: "Markovi Insiders", href: "#" },
      { label: "YouTube", href: "#" },
    ],
  },
]

export function Footer() {
  return (
    <footer className="py-16 md:py-20 px-6 border-t border-border">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-20">
          {/* Left side - Logo and status */}
          <div className="lg:w-1/4 shrink-0">
            <Link href="/" className="text-3xl font-serif font-semibold tracking-tight text-foreground">
              Markovi
            </Link>

            <div className="mt-8 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-sm text-foreground/80">All Systems Operational</span>
              </div>
              <Link href="#" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                Security
              </Link>
              <Link href="#" className="block text-sm text-muted-foreground hover:text-foreground transition-colors">
                Terms of Service
              </Link>
            </div>
          </div>

          {/* Right side - Link columns */}
          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-8">
            {footerColumns.map((column) => (
              <div key={column.title}>
                <h3 className="text-sm font-medium text-foreground mb-4">
                  {column.title}
                </h3>
                <ul className="space-y-3">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
