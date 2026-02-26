import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
            <Link href="/auth" className="text-muted-foreground hover:text-foreground transition-colors">
              Sign In
            </Link>
            <Button variant="pill" size="sm" asChild className="px-4 py-1.5 h-auto">
              <Link href="/api-key">
                API Key
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 py-16 md:py-24">
        <div className="mx-auto max-w-3xl">
          <Badge variant="ghost" className="text-primary mb-4 block tracking-[0.22em]">{eyebrow}</Badge>
          <h1 className="font-serif text-4xl md:text-6xl tracking-tight leading-[0.95] text-foreground mb-6">{title}</h1>
          <p className="text-lg text-foreground/80 max-w-2xl">{subtitle}</p>

          <Card variant="elevated" className="mt-10">
            <CardContent className="p-6 md:p-8">{children}</CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
