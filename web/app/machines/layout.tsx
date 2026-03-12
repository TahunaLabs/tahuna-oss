import { isAuthenticated } from "@/lib/auth-server"
import { redirect } from "next/navigation"

export default async function MachinesLayout({
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
