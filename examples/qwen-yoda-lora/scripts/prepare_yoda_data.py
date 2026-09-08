#!/usr/bin/env python3
# /// script
# dependencies = [
#   "datasets",
# ]
# ///
from __future__ import annotations

import argparse
import json
from pathlib import Path

from datasets import Dataset, load_dataset

PROMPT_TEMPLATE = """Rewrite the following sentence so it sounds like Yoda.
Keep the meaning intact.

Sentence: {sentence}

Yoda:"""


def build_prompt(sentence: str) -> str:
    return PROMPT_TEMPLATE.format(sentence=sentence.strip())


def write_jsonl(path: Path, dataset: Dataset) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in dataset:
            handle.write(json.dumps(record, ensure_ascii=True) + "\n")


def is_prepared(data_dir: Path) -> bool:
    train_path = data_dir / "train.jsonl"
    eval_path = data_dir / "eval.jsonl"
    return (
        train_path.exists()
        and eval_path.exists()
        and train_path.stat().st_size > 0
        and eval_path.stat().st_size > 0
    )


def build_rows(raw_dataset: Dataset) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for record in raw_dataset:
        sentence = str(record["sentence"]).strip()
        seen_targets: set[str] = set()
        for key in ("translation", "translation_extra"):
            target = str(record.get(key, "")).strip()
            if not target or target in seen_targets:
                continue
            seen_targets.add(target)
            rows.append(
                {
                    "prompt": build_prompt(sentence),
                    "completion": f" {target}",
                    "source_sentence": sentence,
                    "target_sentence": target,
                }
            )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare local Yoda rewrite data for Tahuna LoRA SFT")
    parser.add_argument("--dataset-name", default="dvgodoy/yoda_sentences")
    parser.add_argument("--data-dir", default="data/yoda")
    parser.add_argument("--eval-samples", type=int, default=128)
    parser.add_argument("--max-samples", type=int, default=0)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    if is_prepared(data_dir):
        print(f"Yoda dataset already prepared in {data_dir.resolve()}")
        return

    raw_dataset = load_dataset(args.dataset_name, split="train")
    rows = build_rows(raw_dataset)
    dataset = Dataset.from_list(rows).shuffle(seed=args.seed)

    if args.max_samples > 0:
        dataset = dataset.select(range(min(args.max_samples, len(dataset))))

    if len(dataset) < 2:
        raise ValueError("Need at least 2 samples after preprocessing.")

    bounded_eval_samples = min(max(1, args.eval_samples), len(dataset) - 1)
    splits = dataset.train_test_split(test_size=bounded_eval_samples, seed=args.seed)

    write_jsonl(data_dir / "train.jsonl", splits["train"])
    write_jsonl(data_dir / "eval.jsonl", splits["test"])
    print(
        f"Prepared Yoda dataset in {data_dir.resolve()} "
        f"(train={len(splits['train'])}, eval={len(splits['test'])})"
    )


if __name__ == "__main__":
    main()
