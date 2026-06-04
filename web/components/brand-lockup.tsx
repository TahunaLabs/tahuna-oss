import Link from "next/link"

import { Logo } from "@/components/logo"
import { cn } from "@/lib/utils"

interface BrandLockupProps {
  className?: string
  logoClassName?: string
  wordmarkClassName?: string
  "aria-label"?: string
}

export function BrandLockup({ className, logoClassName, wordmarkClassName, ...props }: BrandLockupProps) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2", className)} {...props}>
      <Logo className={cn("h-12 w-auto", logoClassName)} />
      <span className={cn("text-sm font-light tracking-ui-eyebrow", wordmarkClassName)}>Tahuna</span>
    </Link>
  )
}
