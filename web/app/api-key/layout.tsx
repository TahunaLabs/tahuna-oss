import { isAuthenticated } from "@/lib/auth-server";
import { redirect } from "next/navigation";

export default async function ApiKeyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAuth = await isAuthenticated();
  if (!isAuth) {
    redirect("/auth");
  }

  return children;
}
