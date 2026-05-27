# Qwen Yoda LoRA Autoresearch Program

Improve final SFT evaluation loss for the Qwen Yoda LoRA fine-tuning example.

## Objective

Minimize `final:eval_loss`.

## Editable Scope

Only edit `train.py`.

## Candidate Ideas

- Tune LoRA rank, alpha, and dropout.
- Tune learning rate, warmup, scheduler, batch size, gradient accumulation, max sequence length, or epoch count.
- Keep one coherent tracked-file candidate patch per trial.

## Constraints

- Run exactly 5 candidate trials unless Tahuna reports `budget_exhausted`.
- Preserve the final `eval_loss=<number>` metric print.
- Do not edit files outside `train.py`.
- Do not add untracked files.
- Use `tahuna research graph <session-id>` after trials when useful.