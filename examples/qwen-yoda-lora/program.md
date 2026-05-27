# Qwen Yoda LoRA Autoresearch Program

Improve the final evaluation loss for the Qwen Yoda LoRA fine-tuning example.

## Objective

Minimize `final:eval_loss`.

The baseline and each trial should complete training and print a stable
`eval_loss=<number>` metric line. Accept a trial only when the final eval loss
improves by at least the configured `--min-improvement`.

## Editable Scope

Only edit `train.py` for this local test. Keep candidate patches small and
focused so rejected or inconclusive trials can be restored safely.

## Candidate Ideas

- Tune LoRA rank, alpha, or dropout.
- Adjust learning rate, warmup, or scheduler settings.
- Try smaller changes to batch size, gradient accumulation, max sequence length,
  or epoch count.
- Improve sampling or evaluation logging only if it does not hide the final
  `eval_loss=<number>` output.

## Constraints

- Do not change the Tahuna project configuration for this test.
- Do not add untracked files as part of a candidate patch.
- Preserve the final `eval_loss=<number>` print.
