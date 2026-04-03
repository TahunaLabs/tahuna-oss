function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  return value.trim();
}

export function resolveConfiguredDependencyGroup(args: {
  dependencyGroup?: string;
  dependencyMode?: string;
}): string | null {
  const dependencyGroup = normalizeString(args.dependencyGroup);
  const dependencyMode = normalizeString(args.dependencyMode)?.toLowerCase();

  switch (dependencyMode) {
    case "project":
      return "";
    case "group":
      return dependencyGroup;
    default:
      return dependencyGroup;
  }
}
