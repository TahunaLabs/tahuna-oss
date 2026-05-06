# Landing Page

Last reviewed: 2026-05-07

## Current Behavior

The public home page is rendered by `PublicHome` and is the first screen at `/`.

Sections, in order:

- top navigation
- Founders Inc badge
- hero
- frameworks bar
- install / terminal loop section
- core loop layers
- footer

## Hero

Current headline:

> The future is not a single intelligent blob. It's billions of species of models.

Supporting copy positions Tahuna as post-training infrastructure for specialized AI systems.

Primary actions:

- `Get started` links to `/login`
- `Talk to an engineer` links to Cal.com

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

## Invariants

- The landing page is product UI, not a planning document.
- Copy should describe the actual CLI and runtime surfaces.
