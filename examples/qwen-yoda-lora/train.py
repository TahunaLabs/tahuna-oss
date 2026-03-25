#!/usr/bin/env python3
import json
from pathlib import Path
from typing import Any

import torch
from datasets import Dataset, load_dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import SFTConfig, SFTTrainer
import yaml

CONFIG_PATH = Path("config.yaml")
PROMPT_TEMPLATE = """Rewrite the following sentence so it sounds like Yoda.
Keep the meaning intact.

Sentence: {sentence}

Yoda:"""


def load_config() -> tuple[dict[str, Any], dict[str, Any]]:
    config = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}
    return config, config.get("train", {})


def build_prompt(sentence: str) -> str:
    return PROMPT_TEMPLATE.format(sentence=sentence.strip())


def build_dataset(dataset_name: str, seed: int, max_samples: int, eval_samples: int) -> tuple[Dataset, Dataset]:
    raw_dataset = load_dataset(dataset_name, split="train")
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

    dataset = Dataset.from_list(rows).shuffle(seed=seed)
    if max_samples > 0:
        dataset = dataset.select(range(min(max_samples, len(dataset))))

    if len(dataset) < 2:
        raise ValueError("Need at least 2 samples after preprocessing.")

    bounded_eval_samples = min(max(1, eval_samples), len(dataset) - 1)
    splits = dataset.train_test_split(test_size=bounded_eval_samples, seed=seed)
    return splits["train"], splits["test"]


def select_torch_dtype() -> tuple[torch.dtype, bool, bool]:
    if not torch.cuda.is_available():
        return torch.float32, False, False
    if torch.cuda.is_bf16_supported():
        return torch.bfloat16, True, False
    return torch.float16, False, True


def normalize_report_to(value: Any) -> str | list[str]:
    if value is None:
        return "none"
    if isinstance(value, str):
        normalized = value.strip().lower()
        if not normalized or normalized == "none":
            return "none"
        return [normalized]
    if isinstance(value, list):
        normalized = [str(item).strip() for item in value if str(item).strip()]
        return normalized or "none"
    return "none"


def write_json(path: Path, payload: dict[str, Any] | list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def generate_samples(
    model: Any,
    tokenizer: Any,
    eval_dataset: Dataset,
    sample_predictions: int,
    sample_max_new_tokens: int,
) -> list[dict[str, str]]:
    samples: list[dict[str, str]] = []
    prediction_count = min(sample_predictions, len(eval_dataset))
    if prediction_count <= 0:
        return samples

    device = next(model.parameters()).device
    model.eval()
    for index in range(prediction_count):
        prompt = str(eval_dataset[index]["prompt"])
        reference = str(eval_dataset[index]["target_sentence"])
        encoded = tokenizer(prompt, return_tensors="pt").to(device)
        with torch.inference_mode():
            generated = model.generate(
                **encoded,
                max_new_tokens=sample_max_new_tokens,
                do_sample=False,
                pad_token_id=tokenizer.eos_token_id,
            )
        new_tokens = generated[0, encoded["input_ids"].shape[1] :]
        prediction = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()
        samples.append(
            {
                "prompt": prompt,
                "reference": reference,
                "prediction": prediction,
            }
        )
    return samples


def main() -> None:
    config, train_config = load_config()
    model_name = str(train_config.get("model_name", "Qwen/Qwen3-0.6B"))
    dataset_name = str(train_config.get("dataset_name", "dvgodoy/yoda_sentences"))
    output_dir = Path(str(train_config.get("output_dir", "outputs")))
    checkpoints_dir = output_dir / "checkpoints"
    adapter_dir = output_dir / "adapter"
    epochs = float(train_config.get("epochs", 3))
    batch_size = int(train_config.get("batch_size", 4))
    eval_batch_size = int(train_config.get("eval_batch_size", batch_size))
    gradient_accumulation_steps = int(train_config.get("gradient_accumulation_steps", 4))
    learning_rate = float(train_config.get("learning_rate", 1e-4))
    max_seq_length = int(train_config.get("max_seq_length", 128))
    eval_samples = int(train_config.get("eval_samples", 128))
    max_samples = int(train_config.get("max_samples", 0))
    logging_steps = max(1, int(train_config.get("logging_steps", 10)))
    seed = int(train_config.get("seed", 42))
    gradient_checkpointing = bool(train_config.get("gradient_checkpointing", True))
    report_to = normalize_report_to(train_config.get("report_to", "none"))
    sample_predictions = int(train_config.get("sample_predictions", 8))
    sample_max_new_tokens = int(train_config.get("sample_max_new_tokens", 64))
    lora_config = train_config.get("lora", {})

    output_dir.mkdir(parents=True, exist_ok=True)

    train_dataset, eval_dataset = build_dataset(
        dataset_name=dataset_name,
        seed=seed,
        max_samples=max_samples,
        eval_samples=eval_samples,
    )

    torch_dtype, use_bf16, use_fp16 = select_torch_dtype()
    tokenizer = AutoTokenizer.from_pretrained(model_name, use_fast=True, padding_side="right")
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(model_name, torch_dtype=torch_dtype)
    model.config.use_cache = False

    peft_config = LoraConfig(
        task_type="CAUSAL_LM",
        r=int(lora_config.get("r", 16)),
        lora_alpha=int(lora_config.get("alpha", 32)),
        lora_dropout=float(lora_config.get("dropout", 0.05)),
        bias="none",
        target_modules=list(
            lora_config.get(
                "target_modules",
                ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
            )
        ),
    )

    training_args = SFTConfig(
        output_dir=str(checkpoints_dir),
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=eval_batch_size,
        gradient_accumulation_steps=gradient_accumulation_steps,
        learning_rate=learning_rate,
        logging_steps=logging_steps,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=1,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        greater_is_better=False,
        max_length=max_seq_length,
        completion_only_loss=True,
        gradient_checkpointing=gradient_checkpointing,
        lr_scheduler_type="cosine",
        warmup_ratio=0.03,
        report_to=report_to,
        bf16=use_bf16,
        fp16=use_fp16,
        seed=seed,
    )

    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        processing_class=tokenizer,
        peft_config=peft_config,
    )

    print(f"model_name={model_name}")
    print(f"dataset_name={dataset_name}")
    print(f"train_samples={len(train_dataset)} eval_samples={len(eval_dataset)}")
    print(f"output_dir={output_dir.resolve()}")

    train_result = trainer.train()
    eval_metrics = trainer.evaluate()

    trainer.save_model(str(adapter_dir))
    tokenizer.save_pretrained(str(adapter_dir))

    sample_outputs = generate_samples(
        model=trainer.model,
        tokenizer=tokenizer,
        eval_dataset=eval_dataset,
        sample_predictions=sample_predictions,
        sample_max_new_tokens=sample_max_new_tokens,
    )

    write_json(
        output_dir / "metrics.json",
        {
            "model_name": model_name,
            "dataset_name": dataset_name,
            "train_samples": len(train_dataset),
            "eval_samples": len(eval_dataset),
            "torch_dtype": str(torch_dtype),
            "train_metrics": train_result.metrics,
            "eval_metrics": eval_metrics,
            "config": config,
        },
    )
    write_json(output_dir / "sample_predictions.json", sample_outputs)

    print(f"Writing artifacts to {output_dir.resolve()}")
    print(eval_metrics)


if __name__ == "__main__":
    main()
