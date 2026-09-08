import { cloudDashboardMetadata } from "@/components/cloud/dashboard/metadata"
import { isAuthenticated } from "@/lib/auth-server"
import { redirect } from "next/navigation"

export const metadata = cloudDashboardMetadata

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
