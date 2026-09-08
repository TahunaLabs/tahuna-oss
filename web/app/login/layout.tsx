import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Sign in | Tahuna",
  description: "Sign in to Tahuna to manage your AI training runs, environments, and GPU infrastructure.",
  alternates: { canonical: "/login" },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
