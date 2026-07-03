export const CDN_CONFIG = {
  // TODO: read baseUrl from an env var, like web/config.ts's CDN_CONFIG.baseUrl
  baseUrl: "https://pub-558336c62f024020ac75182f00ba41b2.r2.dev",
  artefactsPath: "/assets/artefacts",
  faviconPath: "/assets/favicon",
} as const

export function artefactAsset(filename: string) {
  return `${CDN_CONFIG.baseUrl}${CDN_CONFIG.artefactsPath}/${filename}`
}

export function faviconAsset(filename: string) {
  return `${CDN_CONFIG.baseUrl}${CDN_CONFIG.faviconPath}/${filename}`
}
