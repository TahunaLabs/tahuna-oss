export const CDN_CONFIG = {
  baseUrl: "https://pub-5f7c225fd68446a9b652150d7c7e52e9.r2.dev",
  artefactsPath: "/assets/artefacts",
  faviconPath: "/assets/favicon",
} as const

export function artefactAsset(filename: string) {
  return `${CDN_CONFIG.baseUrl}${CDN_CONFIG.artefactsPath}/${filename}`
}

export function faviconAsset(filename: string) {
  return `${CDN_CONFIG.baseUrl}${CDN_CONFIG.faviconPath}/${filename}`
}
