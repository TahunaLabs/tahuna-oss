#!/usr/bin/env python3
import json
from pathlib import Path
from typing import Any

import torch
from datasets import Dataset, load_dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import SFTConfig, SFTTrainer
import wandb

PROJECT_NAME = "qwen-yoda-lora"
MODEL_NAME = "Qwen/Qwen3-0.6B"
DATA_DIR = Path("data/yoda")
OUTPUT_DIR = Path("outputs")
EPOCHS = 2
BATCH_SIZE = 8
LEARNING_RATE = 1e-4
DEFAULT_GRADIENT_ACCUMULATION_STEPS = 4
DEFAULT_MAX_SEQ_LENGTH = 128
DEFAULT_LOGGING_STEPS = 10
DEFAULT_SEED = 42
DEFAULT_SAMPLE_PREDICTIONS = 8
DEFAULT_SAMPLE_MAX_NEW_TOKENS = 64
DEFAULT_WANDB_PROJECT = "tahuna-qwen-yoda-lora"
DEFAULT_LORA_R = 16
DEFAULT_LORA_ALPHA = 32
DEFAULT_LORA_DROPOUT = 0.05
DEFAULT_LORA_TARGET_MODULES = [
    "q_proj",
    "k_proj",
    "v_proj",
    "o_proj",
    "gate_proj",
    "up_proj",
    "down_proj",
]


def select_torch_dtype() -> tuple[torch.dtype, bool, bool]:
    if not torch.cuda.is_available():
        return torch.float32, False, False
    if torch.cuda.is_bf16_supported():
        return torch.bfloat16, True, False
    return torch.float16, False, True


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


def load_prepared_dataset(split_path: Path) -> Dataset:
    if not split_path.exists():
        raise FileNotFoundError(
            f"Prepared dataset not found at {split_path}. Run scripts/prepare_yoda_data.py first."
        )
    dataset = load_dataset("json", data_files=str(split_path), split="train")
    if len(dataset) == 0:
        raise ValueError(f"Prepared dataset at {split_path} is empty.")
    return dataset


def main() -> None:
    project_name = PROJECT_NAME
    model_name = MODEL_NAME
    data_dir = DATA_DIR
    output_dir = OUTPUT_DIR
    checkpoints_dir = output_dir / "checkpoints"
    adapter_dir = output_dir / "adapter"
    epochs = EPOCHS
    batch_size = BATCH_SIZE
    learning_rate = LEARNING_RATE
    eval_batch_size = batch_size
    gradient_accumulation_steps = DEFAULT_GRADIENT_ACCUMULATION_STEPS
    max_seq_length = DEFAULT_MAX_SEQ_LENGTH
    logging_steps = DEFAULT_LOGGING_STEPS
    seed = DEFAULT_SEED
    gradient_checkpointing = True
    sample_predictions = DEFAULT_SAMPLE_PREDICTIONS
    sample_max_new_tokens = DEFAULT_SAMPLE_MAX_NEW_TOKENS

    output_dir.mkdir(parents=True, exist_ok=True)

    train_dataset = load_prepared_dataset(data_dir / "train.jsonl")
    eval_dataset = load_prepared_dataset(data_dir / "eval.jsonl")

    torch_dtype, use_bf16, use_fp16 = select_torch_dtype()
    tokenizer = AutoTokenizer.from_pretrained(model_name, use_fast=True, padding_side="right")
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(model_name, torch_dtype=torch_dtype)
    model.config.use_cache = False

    peft_config = LoraConfig(
        task_type="CAUSAL_LM",
        r=DEFAULT_LORA_R,
        lora_alpha=DEFAULT_LORA_ALPHA,
        lora_dropout=DEFAULT_LORA_DROPOUT,
        bias="none",
        target_modules=DEFAULT_LORA_TARGET_MODULES,
    )

    wandb.init(
        project=DEFAULT_WANDB_PROJECT,
        name=project_name,
        config={
            "project": project_name,
            "model_name": model_name,
            "data_dir": str(data_dir),
            "epochs": epochs,
            "batch_size": batch_size,
            "learning_rate": learning_rate,
            "gradient_accumulation_steps": gradient_accumulation_steps,
            "max_seq_length": max_seq_length,
            "lora_r": DEFAULT_LORA_R,
            "lora_alpha": DEFAULT_LORA_ALPHA,
            "lora_dropout": DEFAULT_LORA_DROPOUT,
        },
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
        report_to="wandb",
        run_name=project_name,
        bf16=use_bf16,
        fp16=use_fp16,
        seed=seed,
    )
    try:
        trainer = SFTTrainer(
            model=model,
            args=training_args,
            train_dataset=train_dataset,
            eval_dataset=eval_dataset,
            processing_class=tokenizer,
            peft_config=peft_config,
        )

        print(f"model_name={model_name}")
        print(f"data_dir={data_dir.resolve()}")
        print(f"train_samples={len(train_dataset)} eval_samples={len(eval_dataset)}")
        print(
            "train_profile="
            f"batch_size:{batch_size} grad_accum:{gradient_accumulation_steps} "
            f"max_length:{max_seq_length} packing:False "
            f"gradient_checkpointing:{gradient_checkpointing}"
        )
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
                "data_dir": str(data_dir),
                "train_samples": len(train_dataset),
                "eval_samples": len(eval_dataset),
                "torch_dtype": str(torch_dtype),
                "train_metrics": train_result.metrics,
                "eval_metrics": eval_metrics,
            },
        )
        write_json(output_dir / "sample_predictions.json", sample_outputs)

        print(f"Writing artifacts to {output_dir.resolve()}")
        print(eval_metrics)
    finally:
        wandb.finish()


if __name__ == "__main__":
    main()
