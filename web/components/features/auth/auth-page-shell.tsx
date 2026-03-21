import { Badge } from "@/components/ui/badge"
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
        <div className="mx-auto max-w-7xl px-6 py-4">
          <Link href="/" className="text-2xl font-serif font-semibold tracking-tight text-foreground">
            Tahuna
          </Link>
        </div>
      </header>

      <main className="flex-1 px-6 py-16 md:py-24">
        <div className="mx-auto max-w-3xl">
          <Badge variant="ghost" className="mb-4 block text-primary tracking-ui-eyebrow">{eyebrow}</Badge>
          <h1 className="mb-6 font-serif text-4xl leading-display-tight tracking-tight text-foreground md:text-6xl">{title}</h1>
          <p className="text-lg text-foreground/80 max-w-2xl">{subtitle}</p>

          <Card variant="elevated" className="mt-10">
            <CardContent className="p-6 md:p-8">{children}</CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
