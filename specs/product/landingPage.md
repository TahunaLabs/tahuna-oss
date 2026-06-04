# Landing Page

Last reviewed: 2026-06-04

## Current Behavior

The public home page is rendered by `PublicHome` and is the first screen at `/`.

Sections, in order:

- top navigation
- hero (with animated product screenshot slideshow)
- capabilities
- why it matters (with Founders Inc badge)
- install / terminal section
- core loop layers
- frameworks bar
- FAQ
- final CTA
- footer

## Hero

Current headline:

> Own the intelligence loop behind your AI systems.

Eyebrow: "Infrastructure for adaptive AI systems"

Supporting copy: "Move from one-off model work to a controlled improvement loop: train, serve, hillclimb, and observe."

The hero includes a rotating product screenshot (`HeroProduct`) cycling through four slides: Metrics, Overview, Run, and Environments screens. Slides rotate every 4.5 s.

Primary actions:

- `Start building` links to `/login`
- `Talk to an engineer` links to Cal.com

## Capabilities Section

Four product pillars presented in a two-column grid:

- Tahuna Compute: run training jobs and sandboxed experiments on managed GPUs.
- Tahuna Hillclimb: autonomous research for recursive model improvement.
- Tahuna Serve: promote model snapshots into production inference endpoints.
- Tahuna Observability: track agent signals, metrics, and artifacts.

## Why It Matters Section

Three reasons ("Capture the real signal", "Shape model behavior", "Compounding intelligence") framing the product as a continuous improvement loop rather than one-off model work. The Founders Inc badge is placed in this section.

## Install Section

The install section shows stable and nightly install commands:

- `curl -fsSL https://tahuna.app/install.sh | bash`
- `curl -fsSL https://tahuna.app/install.sh | bash -s -- --channel nightly`

It also presents the basic CLI loop:

- `tahuna init .`
- `tahuna sync`
- `tahuna train`

## Core Loop Layers

The landing page describes four product layers:

- Tahuna init
- Align / `tahuna sync`
- Train / `tahuna train`
- Serve / `tahuna serve`

## Frameworks Bar

Centered grid layout listing supported frameworks: PyTorch, HuggingFace, Unsloth, TRL, Verifiers. PyTorch and HuggingFace use inline SVG icon components (`PyTorchIcon`, `HuggingFaceIcon`); the rest use CDN image assets.

## FAQ Section

Seven Q&A items covering product basics, framework support, metrics, pricing, and GPU catalog. Rendered as `<details>` accordion elements.

## CTA Section

Final full-width CTA: "Turn product usage into your next model improvement." — repeats the "Start building" / "Talk to an engineer" button pair.

## Invariants

- The landing page is product UI, not a planning document.
- Copy should describe the actual CLI and runtime surfaces.
