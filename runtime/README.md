# Tahuna Runtime

Runtime subtree for pod execution and runtime image publishing.

## Warden (`runtime/warden`)

- In-pod binary invoked at container startup.
- Handles workspace/data materialization, dependency install, training execution, logs/metrics, and artifact upload.

## Images (`runtime/images`)

- `Dockerfile`: embeds `warden` into runtime images.
- Also ships the Tahuna monitor SDK at `/opt/tahuna-monitor` (`import tahuna.monitor as wandb`).
- Canonical image matrix lives at `web/convex/runtime-images.json`.
- CI workflow `.github/workflows/build-templates.yml` builds/pushes image tags from that matrix.

## Validation

From repo root:

```bash
make validate-warden
```
