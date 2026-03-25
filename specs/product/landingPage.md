# Tahuna Landing Page 

## Hero

**Headline:**
AGI is Not a Monolith. It's a species of models.

**Subheadline:**
The future of artificial intelligence isn't a single oracle that knows everything. We're entering an era of speciation — a vast diversity of specialized intelligences evolving to master specific tasks. Training them shouldn't require a platform team.


## A gentle control plane for post-training.

**Body:**
You keep your training loop. We handle everything around it — GPU provisioning, sync, dependencies, execution, monitoring, artifacts. The heavy machinery stays out of sight. Just progress arriving in small, inevitable waves.

## The Core Loop

`init → align → converge → emerge`

1. **Init**
   `tahuna init .` scans your project. Detects your framework. Identifies your entrypoint and data. Scaffolds anything missing.

2. **Align**
   `tahuna sync` uploads your code and data using incremental, content-addressed sync. Only changed files travel. Manifests are hashed and pinned.

3. **Converge**
   `tahuna train` provisions a GPU, materializes your workspace from pinned manifests, installs dependencies, and runs your training entrypoint. Logs stream back live.

4. **Emerge**
   Your trained model, checkpoints, and artifacts are persisted. Your run history is queryable. Your experiments are reproducible — every run pinned to exact snapshots.

---

## The Problem / Why Tahuna

**Section Headline:**
Post-training is the new frontier. The tools haven't caught up.

**Body:**
Open-weight models are free and roughly equivalent. The only place left to differentiate is *how you train on top of them* — your data, your reward signal, your training recipe. But today you're forced to choose:

| | Path A: DIY | Path B: Managed API | **Path C: Tahuna** |
|---|---|---|---|
| **What you get** | SSH into a GPU. Clone repo. Install CUDA. Pray. | Upload data. Pick from a menu. Get a LoRA back. | Write your code. Type `tahuna train`. Done. |
| **Control** | Full — but you earn every bit of it | Limited — their loop, their constraints | Full — your loop, entirely |
| **Complexity** | High — DevOps is now your job | Low — but so is your ceiling | Low — the machinery is invisible |
| **Reproducibility** | Hope you wrote it down | Not your problem (or your data) | Built in — every run pinned to snapshots |

---

## Why Now

**Section Headline:**
Three things changed.

1. **Post-training became the game.**
   Base models are commoditizing. Llama, Qwen, DeepSeek, Mistral — open weights now match last year's frontier. When the base models are free, differentiation lives in how you train on top of them.

2. **RL replaced SFT.**
   GRPO, online RL, multi-turn agent RL — you can't express "train an agent to navigate a codebase, score it against a test suite, and update the policy with a custom advantage estimator" as a JSONL upload. RL requires owning the loop.

3. **Agent builders became a real job.**
   Tens of thousands of developers building, training, and deploying AI agents. They have the skill to write a training loop but not the patience to manage GPU infrastructure. Tahuna is purpose-built for them.

---

## Who It's For

**Section Headline:**
Built for people who'd rather train models than manage servers.

1. **Researchers implementing custom RL**
   You're inventing the training loop. You don't want to waste time on infra.

2. **Agent builders doing post-training**
   Custom reward functions, RLHF pipelines, multi-turn RL. The fine-tuning APIs don't support your workflow.

3. **Small teams and individuals**
   No platform team. No DevOps. Code to trained model with minimal friction.

4. **Anyone who's lost an afternoon to environment setup**
   You know who you are.

---

## Install / CTA

**Section Headline:**
Start training in four commands.

```bash
curl -fsSL https://tahuna.dev/install | sh
tahuna login
tahuna init .
tahuna train
```

**Closing line:**
That's it. That's the product.

