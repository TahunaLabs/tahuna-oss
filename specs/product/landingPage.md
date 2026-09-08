# Landing Page

Last reviewed: 2026-09-08

## Current Behavior

The public home page is rendered by `PublicHome` and is the first screen at `/`.
It presents the compute-orchestration workflow available today through a short,
single-purpose path from product explanation to quickstart.

Sections, in order:

- top navigation
- hero with animated product screenshot slideshow
- install and terminal section
- footer

## Hero

Current headline:

> Run your ML workloads on remote GPUs.

Eyebrow: "Open-source compute infrastructure"

Supporting copy describes the complete current run lifecycle: code and data
sync, GPU provisioning, environment reconstruction, workload execution, live
logs and metrics, artifact persistence, and compute cleanup.

The hero includes a rotating product screenshot (`HeroProduct`) cycling through
Overview, Runs, Run, and Environments screens. Slides rotate every 4.5 seconds.

Primary actions:

- `Run your first SFT/RL workload` links to `/login`.
- `Quickstart` links to the setup guide.

## Install Section

The install section shows stable and nightly install commands:

- `curl -fsSL https://tahuna.app/install.sh | bash`
- `curl -fsSL https://tahuna.app/install.sh | bash -s -- --channel nightly`

It presents the minimal CLI loop:

- `tahuna init .`
- `tahuna train`

The section links to the Docker self-hosting instructions. It states that RunPod
and R2 are configured once and that Tahuna runs the project's existing Python
entrypoint without requiring an SDK or code rewrite.

## Invariants

- The landing page is product UI, not a planning document.
- Copy must describe the actual CLI and runtime surfaces.
- Each section must introduce new information rather than repeat the same
  infrastructure benefits.
- Layout, animation, and dashboard mock-up structure remain independent of the
  product-positioning copy.
