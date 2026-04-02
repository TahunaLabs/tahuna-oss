export function serveInferencePath(serveId: string) {
  return `/api/serves/${encodeURIComponent(serveId)}/inference`
}

export function serveInferenceUpstreamBaseUrl(podId: string, port: number) {
  const normalizedPodId = podId.trim()
  const normalizedPort = Number.isFinite(port) ? Math.trunc(port) : 0
  if (!normalizedPodId) {
    throw new Error("serve is missing a live inference runtime")
  }
  if (normalizedPort <= 0) {
    throw new Error("serve is missing its inference port")
  }
  return `https://${normalizedPodId}-${normalizedPort}.proxy.runpod.net`
}
