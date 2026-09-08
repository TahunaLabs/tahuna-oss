export const DEFAULT_TRAIN_ENTRYPOINT = "train.py";

export function buildDefaultRunCommand(entrypoint: string) {
  const trimmed = entrypoint.trim();
  const resolvedEntrypoint = trimmed || DEFAULT_TRAIN_ENTRYPOINT;
  return ["uv", "run", "--active", "--no-sync", "python", "-u", resolvedEntrypoint];
}
