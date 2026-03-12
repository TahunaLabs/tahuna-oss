import { redirect } from "next/navigation"

type SearchParams = Record<string, string | string[] | undefined>

export default async function AuthAliasPage({
  searchParams,
}: {
  searchParams: SearchParams | Promise<SearchParams>
}) {
  const resolvedSearchParams = await Promise.resolve(searchParams)
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry != null) {
          params.append(key, entry)
        }
      }
      continue
    }
    if (value != null) {
      params.set(key, value)
    }
  }
  const query = params.toString()
  redirect(query ? `/login?${query}` : "/login")
}
