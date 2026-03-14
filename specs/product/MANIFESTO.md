# Tahuna Manifesto

**The RL Training Substrate**
*Where AI agents practice, adapt, and improve through experience — no research lab required.*

---

## What Tahuna Is

Tahuna is a training orchestration platform that eliminates the distance between writing a training script and running it on a GPU. You write Python. You type `tahuna train`. Your code runs on an H100 in minutes, with your data materialized, your dependencies installed, your metrics captured, and your artifacts persisted — all without you ever SSH-ing into a machine, writing a Dockerfile, or configuring a Kubernetes cluster.

Tahuna is not a fine-tuning API. It is not a GPU cloud. It is the **control plane** that sits between your local development environment and the cloud GPU — handling everything that isn't your training code.

---

## The Problem We Solve

The state of ML training infrastructure in 2026 is bifurcated:

**Path A: Do it yourself.** Rent GPUs from RunPod, Lambda, or CoreWeave. SSH in. Clone your repo. Install CUDA drivers. Set up your Python environment. Upload your data. Run your script. Pray nothing crashes. Copy your artifacts back. Repeat for every experiment. This works — but it's slow, error-prone, and unreproducible. You spend more time on DevOps than on research.

**Path B: Use a managed platform.** SageMaker, Together AI, Fireworks, OpenPipe. Upload your data to their format. Use their API. Accept their constraints on models, hyperparameters, training algorithms. Get back a model. This works — but you're renting someone else's training loop. You can't implement a custom reward function. You can't try a novel RL algorithm. You can't debug why loss is spiking at step 4000.

**Tahuna is Path C.** You keep your training code. You keep your framework. You keep full algorithmic control. Tahuna handles everything *around* the training loop: provisioning, sync, dependency management, execution, monitoring, artifact persistence. The machinery stays out of sight. You focus on the work that matters.

---

## How It Works

### The Core Loop

```
init  >  align  >  converge  >  emerge
```

1. **Init.** `tahuna init .` scans your project. Detects your framework from `pyproject.toml`. Identifies your entrypoint, data directory, config file. Scaffolds anything missing. Creates an environment linked to your project.

2. **Align.** `tahuna sync` uploads your code and data using incremental, content-addressed sync. Only changed files are uploaded. Manifests are hashed and pinned. Every run reconstructs its workspace from an immutable snapshot — not from whatever happened to be on the machine.

3. **Converge.** `tahuna train` provisions a GPU pod, materializes your code and data from the pinned manifests, installs your dependencies via `uv`, and executes your training entrypoint. Logs stream back to your terminal. Metrics are captured. When training completes, output artifacts are uploaded to durable storage.

4. **Emerge.** Your trained model, checkpoints, and artifacts are persisted and accessible. Your run history is queryable. Your experiments are reproducible because every run is pinned to exact code and data snapshots.

### Architecture

Three components, cleanly separated:

| Component | Language | Role |
|-----------|----------|------|
| **CLI** | Go | Local workflow: login, init, sync, train, run management |
| **Backend** | TypeScript (Convex) | State management, API, auth, run lifecycle, monitoring |
| **Runtime** | Go (Warden) | In-pod bootstrap: materialize, install, execute, report |

**Storage:** Cloudflare R2 (content-addressed blobs, manifests, artifacts)
**Compute:** RunPod (GPU pod provisioning, multi-GPU support)
**Auth:** Better Auth (email OTP, API keys)
**Monitoring:** W&B-compatible API (metrics ingestion without requiring a W&B account)

---

## Why Now

Three things changed in the last 18 months that made a product like Tahuna necessary and viable. None of them existed in 2024.

### 1. Post-training became the actual game

2025 revealed that scaling laws aren't just about pre-training compute. There are three multiplicative axes: base model scale, post-training quality, and inference-time compute. The base model layer is commoditizing fast. Llama 4, Qwen 3, DeepSeek-V3, Mistral Large — open-weight models now match or exceed last year's proprietary frontier. When the base models are free and roughly equivalent, the only place left to differentiate is how you train on top of them. Post-training isn't a nice-to-have anymore. It's the product.

But the existing tools were built for a world where post-training meant "supervised fine-tuning with a JSONL file." That world is gone.

### 2. RL replaced SFT as the default post-training method

The shift started with RLHF, accelerated with DPO, and exploded with GRPO, online RL, and multi-turn agent RL. OpenPipe pivoted their entire company from SFT to RL. Tinker launched specifically to serve RL workflows. Prime Intellect's entire research agenda is decentralized RL.

Here's the problem: **RL requires full control over the training loop.** A reward function is code you write. An environment is code you write. The interaction between policy updates, sampling, and reward shaping is bespoke to your task. You can't express "train an agent to navigate a codebase, score it against a test suite, and update the policy with a custom advantage estimator" as a JSONL upload to a fine-tuning API.

Every team doing serious RL work today is either (a) managing their own GPU infrastructure, or (b) using Tinker's specific primitives. There's no option for "I wrote my own training loop in PyTorch, just run it." That's the gap Tahuna fills.

### 3. The "agent builder" became a real job title

There are now tens of thousands of developers whose primary work is building, training, and deploying AI agents. These are not ML researchers with PhDs and access to internal clusters. They're software engineers who know Python, understand transformers well enough to fine-tune them, and need to iterate fast on training recipes. They have the skill to write a training loop but not the patience (or budget) to manage GPU infrastructure.

This audience didn't exist 18 months ago. The fine-tuning APIs don't serve them well because agent training requires custom reward functions and multi-turn RL. The GPU clouds don't serve them well because they require too much ops work. Tahuna is purpose-built for them.

---

## What Makes Tahuna Different

### vs. Fine-Tuning APIs (Together AI, Fireworks, OpenPipe, Replicate)

These platforms offer **fine-tuning as a function call**: upload data, pick a model, get a LoRA adapter back. The training loop is a black box. You choose from a menu of supported algorithms (SFT, DPO, maybe GRPO). You accept their hyperparameter defaults or tune within their allowed ranges.

**Tahuna gives you the full training loop.** You write your own `train.py`. You implement whatever algorithm you want — PPO, GRPO, DPO, a custom reward model, a novel RL method that doesn't have a name yet. Tahuna doesn't know or care what's inside your training script. It provisions the GPU, materializes your workspace, runs your code, and captures the results. If you can write it in Python, you can run it on Tahuna.

This matters because **post-training is where differentiation happens.** The base models are commoditizing. The frontier is in how you train on top of them — your data, your reward signal, your training recipe. A platform that constrains your training loop constrains your competitive advantage.

**Key difference:** They abstract away the training loop. We abstract away everything *except* the training loop.

### vs. GPU Clouds / Serverless Compute (Modal, RunPod direct, Lambda)

These give you **a machine and a bill.** You get SSH access or a container runtime. Everything else is your problem: environment setup, data transfer, dependency management, experiment tracking, artifact persistence, reproducibility.

**Tahuna handles the entire lifecycle.** From `tahuna train` to artifacts in storage, every step is automated and reproducible. You don't write Dockerfiles. You don't manage SSH keys. You don't `scp` data around. You don't lose track of which experiment produced which checkpoint.

**Key difference:** They give you compute. We give you a training workflow.

### vs. SageMaker

SageMaker is a **full ML platform** — training, inference, feature stores, pipelines, labeling, monitoring. It's powerful and comprehensive, but it's also complex, deeply coupled to AWS, and expensive (20-30% markup over raw EC2). Setting up a SageMaker training job requires understanding IAM roles, S3 paths, estimator configurations, instance types, and the SageMaker SDK's abstractions.

**Tahuna is deliberately minimal.** Three commands to go from code to trained model. No YAML pipelines. No IAM roles. No vendor lock-in to a cloud ecosystem. If SageMaker is an aircraft carrier, Tahuna is a speedboat.

**Key difference:** SageMaker optimizes for enterprise ML operations at scale. Tahuna optimizes for time-to-first-training-run and iteration speed.

### vs. Tinker (Thinking Machines)

Tinker is the closest analog. Like Tahuna, it gives you programmatic control over the training loop rather than hiding it behind an API. Tinker exposes low-level primitives (`forward_backward`, `optim_step`, `sample`) and handles distributed GPU scheduling.

But Tinker is **LoRA-only by design philosophy** (their research position is that LoRA matches full fine-tuning for post-training). It operates on Thinking Machines' internal GPU clusters. It exposes a Python SDK with specific primitives you must use.

**Tahuna is framework-agnostic and algorithm-agnostic.** You bring your own training script, your own framework, your own training loop. Full fine-tuning or LoRA — your choice. Any algorithm — your choice. Tahuna doesn't impose a programming model on your training code. You write standard PyTorch (or TensorFlow, or JAX). Tahuna runs it.

**Key difference:** Tinker gives you better primitives for the training loop. Tahuna stays out of the training loop entirely — it handles everything around it.

### vs. Prime Intellect

Prime Intellect is building a **decentralized compute exchange** — aggregating GPUs from 12+ providers, enabling distributed training across geographically fragmented infrastructure. Their focus is on massive-scale training (512+ GPUs, 100B+ parameter models) and decentralized RL.

**Tahuna targets a different scale and a different user.** We serve the researcher or small team training a 7B-70B model on 1-8 GPUs. We optimize for iteration speed and developer experience, not for training frontier-scale models across continents.

**Key difference:** Prime Intellect solves the distributed compute problem at massive scale. Tahuna solves the developer experience problem at practical scale.

### vs. Hugging Face AutoTrain

AutoTrain is **no-code/low-code fine-tuning** — pick a model, upload data, click a button. It's backed by the largest model ecosystem in the world. But it's designed for practitioners who want AutoML-style simplicity, not researchers who need algorithmic control.

**Key difference:** AutoTrain automates the training loop for you. Tahuna automates everything *around* the training loop you write.

---

## The Tahuna Position in the Market

The post-training landscape has stratified into three tiers:

| Tier | Examples | Control | Complexity |
|------|----------|---------|------------|
| **Managed APIs** | Together, Fireworks, OpenPipe, Replicate, AutoTrain | Low (pick algorithm + hyperparams) | Low |
| **Primitive APIs** | Tinker | Medium (use their primitives) | Medium |
| **Raw Compute** | Modal, RunPod, Lambda, SageMaker | Full (write everything) | High |

**Tahuna occupies a new position: full control, low complexity.** You write your own training code (full control), but Tahuna handles provisioning, sync, execution, monitoring, and artifacts (low complexity). This is the position that doesn't exist today — and it's the position that the growing wave of RL researchers, agent builders, and post-training specialists actually need.

---

## Who Tahuna Is For

1. **Researchers implementing custom RL algorithms.** You need full control over the training loop because you're inventing the training loop. You don't want to waste time on infra.

2. **Agent builders doing post-training.** You're fine-tuning open models with custom reward functions, RLHF pipelines, or multi-turn RL. The fine-tuning APIs don't support your workflow. The GPU clouds require too much setup.

3. **Small teams and individuals.** You don't have a platform team. You don't have DevOps. You need to go from code to trained model with minimal friction.

4. **Anyone who's ever lost an afternoon to environment setup.** You know who you are.

---

## Design Philosophy

**A gentler control plane.**

Not another infrastructure hell. Not a wall of knobs. More like a quiet field where models learn to move with you. You point, it listens. You shift, it follows.

Push code, the training follows. The heavy machinery stays out of sight — no headaches, no config spirals. Just progress arriving in small, inevitable waves. Fast starts. Calm loops. A little room for whims.

### Principles

1. **Your code, your loop.** Tahuna never touches your training code. We don't wrap it, instrument it, or constrain it. If it runs locally, it runs on Tahuna.

2. **Reproducibility by default.** Every run is pinned to immutable code and data snapshots via content-addressed manifests. You can reconstruct any experiment exactly.

3. **Incremental, not brute-force.** Sync uploads only changed files. Manifests are diffed. Blobs are deduplicated. The system gets faster as you iterate.

4. **CLI-first, dashboard-second.** Researchers live in the terminal. The CLI is the primary interface. The dashboard exists for monitoring and management, not as a gate.

5. **No vendor lock-in.** Your training code is standard Python. Your data is standard files. Your artifacts are downloadable. Walk away whenever you want.

6. **Pay-as-you-go, no markup for individuals.** Transparent pricing. No surprise bills. No artificial premium for access.

---

## The Technical Edge

### Content-Addressed Incremental Sync

Most platforms require you to upload a tarball or zip of your code and data before every run. Tahuna uses git-style content-addressed sync: every file is hashed (SHA256), manifests track the full workspace state, and only changed blobs are uploaded. Repeated experiments with minor code changes sync in seconds, not minutes.

### Manifest-Pinned Reproducibility

Every run records the exact code manifest hash and data manifest hash it was created with. The pod reconstructs its workspace exclusively from these pinned manifests. Even if you sync new code later, previous runs remain exactly reproducible.

### Pod-Side Workspace Materialization

The in-pod runtime (Warden) is a purpose-built Go binary that handles the entire pod lifecycle: fetch bootstrap plan, download and verify blobs from R2, install dependencies via `uv`, execute the training entrypoint, stream logs and metrics back to the backend, and upload output artifacts. No shell scripts. No fragile boot sequences. One binary, one job.

### W&B-Compatible Monitoring Without W&B

Tahuna implements a W&B-compatible API surface. Your training code can use `import wandb; wandb.init(); wandb.log()` — metrics are captured by Tahuna's backend, not sent to a third-party service. No W&B account required. No additional cost.

---

## Where This Goes

The initial product is the training orchestration layer: sync, provision, run, capture. But the content-addressed architecture and run history create compounding value over time.

**Near-term (v1):**
- Run comparison and experiment tracking built on manifest-pinned history
- Artifact browsing and download from CLI and dashboard
- Cross-account snapshot sharing for collaboration (export/import via manifest hashes)

**Medium-term:**
- Multi-node distributed training orchestration (same DX, multiple pods)
- Spot instance support with automatic checkpointing and resume
- Training recipe templates — curated starting points for common RL workflows (GRPO, PPO, DPO) that users can fork and modify
- Cost optimization layer across GPU providers (RunPod today, others tomorrow)

**Long-term:**
- Tahuna becomes the place where people publish and reproduce training recipes, not just run them. A training run becomes a shareable, reproducible artifact — pinned code, pinned data, pinned config, verifiable results. If arXiv is where you publish the paper, Tahuna is where you publish the training run.

This isn't a feature roadmap. It's what naturally falls out of building the right primitive: an orchestration layer that pins every run to immutable snapshots and stays out of the training code.

---

## Summary

Tahuna exists because the ML training workflow is broken in a specific way: **getting full algorithmic control requires accepting full infrastructure burden.** Every existing solution forces you to choose — either hand over your training loop to a managed API, or manage everything yourself on raw compute.

Tahuna eliminates this tradeoff. You keep the training loop. We handle everything else.

```bash
curl -fsSL https://tahuna.dev/install | sh
tahuna login
tahuna init .
tahuna train
```

That's it. That's the product.
