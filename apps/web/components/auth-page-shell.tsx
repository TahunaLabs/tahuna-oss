import Link from "next/link"
import type { ReactNode } from "react"

type AuthPageShellProps = {
  eyebrow: string
  title: string
  subtitle: string
  children: ReactNode
}

export function AuthPageShell({ eyebrow, title, subtitle, children }: AuthPageShellProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-serif font-semibold tracking-tight text-foreground">
            Tahuna
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/sign-up" className="text-muted-foreground hover:text-foreground transition-colors">
              Sign Up
            </Link>
            <Link href="/sign-in" className="text-muted-foreground hover:text-foreground transition-colors">
              Sign In
            </Link>
            <Link
              href="/api-key"
              className="text-foreground border border-foreground/30 rounded-full px-4 py-1.5 hover:bg-foreground/5 transition-colors"
            >
              API Key
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 py-16 md:py-24">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs tracking-[0.22em] uppercase text-primary mb-4">{eyebrow}</p>
          <h1 className="font-serif text-4xl md:text-6xl tracking-tight leading-[0.95] text-foreground mb-6">{title}</h1>
          <p className="text-lg text-foreground/80 max-w-2xl">{subtitle}</p>

          <div className="mt-10 rounded-xl border border-border bg-card/80 backdrop-blur-sm p-6 md:p-8">{children}</div>
        </div>
      </main>
    </div>
  )
}
