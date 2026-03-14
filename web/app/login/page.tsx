import { LoginPageContent } from "@/components/login-page"
import { isAuthenticated } from "@/lib/auth-server"
import { redirect } from "next/navigation"

export default async function LoginPage() {
  if (await isAuthenticated()) {
    redirect("/dashboard")
  }

  return <LoginPageContent />
}
