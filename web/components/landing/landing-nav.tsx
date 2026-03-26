import Link from 'next/link'

import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'

const NAV_LINKS = [
  'Product',
  'Enterprise',
  'Pricing',
  'News',
  'Company',
  'Careers',
  'Docs',
] as const

export function LandingNav() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 px-8">
      <Link href="/" className="flex shrink-0 items-center gap-2.5">
        <Logo className="h-6 w-auto" />
        <span className="text-sm font-semibold tracking-ui-eyebrow uppercase">
          Tahuna
        </span>
      </Link>

      <nav className="flex flex-1 items-center justify-center gap-0.5">
        {NAV_LINKS.map((label) => (
          <Button key={label} variant="ghost" size="sm" asChild>
            <Link href="#">{label}</Link>
          </Button>
        ))}
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/login">Log in</Link>
        </Button>
        <Button size="sm" asChild>
          <Link href="/login">Get started</Link>
        </Button>
      </div>
    </header>
  )
}
