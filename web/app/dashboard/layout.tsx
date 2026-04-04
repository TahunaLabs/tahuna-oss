import type { Metadata } from "next"
import { isAuthenticated } from "@/lib/auth-server"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Dashboard | Tahuna",
  description: "Manage your AI training runs, environments, GPU providers, and billing from the Tahuna dashboard.",
  alternates: { canonical: "/dashboard" },
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const isAuth = await isAuthenticated()
  if (!isAuth) {
    redirect("/login")
  }

  return children
}
