export function serveInferencePath(serveId: string) {
  return `/api/serves/${encodeURIComponent(serveId)}/inference`
}
