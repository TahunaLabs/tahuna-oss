---
name: tahuna-setup-hardware
description: User-facing Tahuna setup and hardware selection workflow. Use when an agent is helping a Tahuna user install or log into the CLI, run tahuna init, inspect a Python ML project, choose GPU type/count/volume, configure data/output paths, or recover from no-capacity GPU selection during setup.
---

# Tahuna Setup Hardware

## Goal

Help a user get a local Python ML project ready for Tahuna and choose compute that is likely to fit the job without overspending. Assume the agent is working in the user's project directory, not inside the Tahuna repository.

Before launching paid compute, show the selected GPU, GPU count, volume size, and command to be run, then ask the user to confirm.

## Inspect The Project

Start from the project root:

```bash
pwd
ls
find . -maxdepth 2 -name 'pyproject.toml' -o -name 'uv.lock' -o -name 'tahuna.toml' -o -name 'train.py' -o -name 'inference.py'
```

Look for:

- `pyproject.toml` and `uv.lock`
- a training entrypoint such as `train.py`
- an optional serving entrypoint such as `inference.py`
- a data directory
- an output/model directory
- large local artifacts that should not be synced as code

Do not rewrite the user's training code unless they explicitly ask. If required files are missing, explain the gap and propose the smallest project change needed.

## Install And Log In

If `tahuna` is not installed, suggest the official installer:

```bash
curl -fsSL https://tahuna.app/install.sh | bash
```

Then authenticate:

```bash
tahuna login
```

If the user is working against a local development Tahuna instance, use `tahuna-dev` only when they already have it installed and explicitly want local dev behavior.

## Initialize

Run setup from the project root:

```bash
tahuna init .
```

During prompts, keep choices aligned with the project:

- choose the detected training file if it is correct
- choose the actual data directory, not the whole repository
- choose the output directory where training writes model artifacts
- choose dependency groups from `pyproject.toml` when present
- leave dependency group empty when the project should use base dependencies

After init, verify:

```bash
test -f tahuna.toml && sed -n '1,220p' tahuna.toml
test -f .tahuna/environment_id && cat .tahuna/environment_id
```

Treat `tahuna.toml` as the source of truth. Treat `.tahuna/` as local state.

## Choose Compute

Use the GPU catalog shown by Tahuna prompts or API output as the live source of truth. Do not hardcode catalog availability or pricing.

Pick the smallest GPU class that has enough memory:

- small experiments, CPU-light preprocessing, or smoke tests: choose a cheaper low/mid VRAM GPU from the available catalog
- image models, embeddings, or medium fine-tunes: choose a mid/high VRAM GPU
- LLM fine-tuning, large checkpoints, high context, or multiple workers: choose a high VRAM GPU such as A100/H100 class when available

Prefer one GPU first unless the training code explicitly supports distributed or tensor-parallel execution. Increasing `gpu_count` without code support usually wastes money.

Choose volume size with headroom:

```text
volume_gb >= dataset + base model/cache + dependencies + outputs + 30% headroom
```

Hugging Face model caches and generated artifacts can be larger than the repository itself. If uncertain, choose a larger volume before choosing a larger GPU.

## Capacity Fallback

If Tahuna reports no capacity:

1. Keep the same memory requirement.
2. Select another available GPU with similar or larger VRAM.
3. Avoid retrying the exact GPU type that just failed.
4. If the terminal is non-interactive, stop and ask the user which fallback GPU to use.

For a one-off run, GPU overrides can be applied later during training:

```bash
tahuna train --gpu-type "<gpu name>" --gpu-count 1 --volume-gb 80
```

For the default environment config, use Tahuna's environment update flow when available:

```bash
tahuna env update
```

## Finish

End setup with a short handoff:

- project root
- selected training command
- selected data/output directories
- selected GPU/count/volume
- whether `tahuna.toml` and `.tahuna/environment_id` exist
- next command, usually `tahuna sync` or `tahuna train`
