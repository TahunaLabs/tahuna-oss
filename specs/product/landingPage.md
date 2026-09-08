# Landing Page

Last reviewed: 2026-09-08

## Current Behavior

The public home page is rendered by `PublicHome` and is the first screen at `/`.
It presents the compute-orchestration workflow available today through a short,
single-purpose path from product explanation to quickstart.

Sections, in order:

- top navigation
- hero with animated product screenshot slideshow
- compute-orchestration workflow
- install and terminal section
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

## Install Section

The install section shows stable and nightly install commands:

- `curl -fsSL https://tahuna.app/install.sh | bash`
- `curl -fsSL https://tahuna.app/install.sh | bash -s -- --channel nightly`

It also presents the basic CLI loop:

- `tahuna init .`
- `tahuna sync`
- `tahuna train`

## CTA Section

The final CTA invites the visitor to run a first GPU job and links to the
quickstart and source repository. It does not use enterprise sales language.

## Invariants

- The landing page is product UI, not a planning document.
- Copy must describe the actual CLI and runtime surfaces.
- Each section must introduce new information rather than repeat the same
  infrastructure benefits.
- Layout, animation, and dashboard mock-up structure remain independent of the
  product-positioning copy.
