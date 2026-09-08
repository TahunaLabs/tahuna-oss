# Landing Page

Last reviewed: 2026-09-08

## Current Behavior

The public home page is rendered by `PublicHome` and is the first screen at `/`.
It presents the compute-orchestration workflow available today and labels future
training, inference, and observability primitives as roadmap work.

Sections, in order:

- top navigation
- hero with animated product screenshot slideshow
- compute-orchestration workflow
- frameworks bar
- install and terminal section
- infrastructure benefits
- ownership model
- roadmap and open-source contribution paths
- FAQ
- final CTA
- footer

## Hero

Current headline:

> Run your Python project on remote GPUs.

Eyebrow: "Open-source control and compute plane"

Supporting copy describes the complete current run lifecycle: code and data
sync, GPU provisioning, environment reconstruction, workload execution, live
logs and metrics, artifact persistence, and compute cleanup.

The hero includes a rotating product screenshot (`HeroProduct`) cycling through
Overview, Runs, Run, and Environments screens. Slides rotate every 4.5 seconds.

Primary actions:

- `Run a job` links to `/login`.
- `Self-host Tahuna` links to the repository quickstart.

## How It Works

Four stages presented in a two-column grid:

- sync a project as content-addressed code and data snapshots
- provision a remote GPU and reconstruct the environment
- execute the configured Python entrypoint with live logs and metrics
- persist output artifacts and terminate the compute

## Frameworks Bar

The centered grid lists supported frameworks: PyTorch, HuggingFace, Unsloth,
TRL, and Verifiers. PyTorch and HuggingFace use inline SVG icon components; the
rest use CDN image assets.

## Install Section

The install section shows stable and nightly install commands:

- `curl -fsSL https://tahuna.app/install.sh | bash`
- `curl -fsSL https://tahuna.app/install.sh | bash -s -- --channel nightly`

It also presents the basic CLI loop:

- `tahuna init .`
- `tahuna sync`
- `tahuna train`

## Infrastructure Benefits

Three cards explain the practical benefits available today:

- no manual SSH or SCP workflow
- reproducible run environments and inputs
- automatic termination of ephemeral GPU compute

## Ownership Model

The page separates the user's project from Tahuna's infrastructure work.

The user owns the Python entrypoint, dependencies, data, models, training logic,
and output files. Tahuna handles synchronization, environment reconstruction,
GPU provisioning, execution, logs and metrics, artifacts, and cleanup.

## Roadmap and Open Source

The roadmap names three product foundations without presenting unfinished work
as available:

1. Compute orchestration — available now.
2. Higher-level training and inference workflows — coming next.
3. Observability — coming next.

The adjacent open-source column invites contributions for compute providers,
storage backends, runtime images, and framework adapters. Its actions link to
the quickstart and the public GitHub repository.

## FAQ Section

Seven Q&A items cover the current product boundary, Python entrypoints,
framework support, logs and metrics, provider adapters, and self-hosting. The
items are rendered as `<details>` accordion elements.

## CTA Section

The final CTA invites the visitor to run a first GPU job and links to the
quickstart and source repository. It does not use enterprise sales language.

## Invariants

- The landing page is product UI, not a planning document.
- Copy must distinguish current behavior from roadmap work.
- Copy must describe the actual CLI and runtime surfaces.
- Layout, animation, and dashboard mock-up structure remain independent of the
  product-positioning copy.
