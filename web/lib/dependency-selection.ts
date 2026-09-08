function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  return value.trim();
}

export function resolveConfiguredDependencyGroup(args: {
  dependencyGroup?: string;
}): string | null {
  return normalizeString(args.dependencyGroup);
}
