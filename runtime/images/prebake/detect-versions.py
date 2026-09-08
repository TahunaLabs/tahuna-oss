import importlib.metadata as metadata
import json
import os

packages = [
    pkg.strip()
    for pkg in os.environ.get("TAHUNA_PREBAKED_PROTECTED_PACKAGES", "").split(",")
    if pkg.strip()
]
versions = {}
for pkg in packages:
    try:
        versions[pkg.lower()] = metadata.version(pkg)
    except metadata.PackageNotFoundError:
        continue

target = os.environ.get(
    "TAHUNA_PREBAKED_PROTECTED_VERSIONS_FILE",
    "/opt/tahuna/protected-package-versions.json",
)
with open(target, "w", encoding="utf-8") as handle:
    json.dump(versions, handle, sort_keys=True)
