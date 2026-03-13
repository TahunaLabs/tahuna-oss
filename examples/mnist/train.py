#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import pathlib
import sys
from datetime import datetime, timezone
from typing import Any

try:
    import numpy as np
    import torch
    from torch import nn
    from torch.utils.data import Dataset
    from torchvision import datasets, transforms
    from transformers import Trainer, TrainingArguments
    import wandb  # noqa: F401
except ModuleNotFoundError as exc:
    missing = exc.name or "dependency"
    print(
        "Missing Python dependency: "
        f"{missing}. Install with: python3 -m pip install -r requirements.txt",
        file=sys.stderr,
    )
    raise SystemExit(1) from exc


class SimpleCNN(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(1, 16, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(16, 32, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2),
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(32 * 7 * 7, 128),
            nn.ReLU(),
            nn.Linear(128, 10),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.classifier(self.features(x))


class HFImageFolderDataset(Dataset):
    def __init__(self, dataset: datasets.ImageFolder) -> None:
        self.dataset = dataset

    def __len__(self) -> int:
        return len(self.dataset)

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor | int]:
        pixel_values, label = self.dataset[idx]
        return {"pixel_values": pixel_values, "labels": label}


class HFTrainerModel(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.network = SimpleCNN()
        self.loss_fn = nn.CrossEntropyLoss()

    def forward(
        self,
        pixel_values: torch.Tensor | None = None,
        labels: torch.Tensor | None = None,
    ) -> dict[str, torch.Tensor]:
        if pixel_values is None:
            raise ValueError("pixel_values is required")
        logits = self.network(pixel_values)
        if labels is None:
            return {"logits": logits}
        loss = self.loss_fn(logits, labels)
        return {"loss": loss, "logits": logits}


def require_prepared_mnist(data_root: pathlib.Path) -> None:
    missing: list[str] = []
    for split in ("train", "test"):
        for digit in range(10):
            class_dir = data_root / split / str(digit)
            if not class_dir.exists() or not any(class_dir.iterdir()):
                missing.append(str(class_dir))
    if missing:
        sample = missing[:3]
        sample_text = ", ".join(sample)
        raise SystemExit(
            "MNIST data is missing. Expected pre-synced folders like "
            f"{data_root}/train/<digit> and {data_root}/test/<digit>. "
            f"Examples missing: {sample_text}"
        )


def collect_epoch_metrics(log_history: list[dict[str, Any]]) -> list[dict[str, float | int]]:
    by_epoch: dict[int, dict[str, float | int]] = {}
    for entry in log_history:
        epoch_value = entry.get("epoch")
        if epoch_value is None:
            continue
        epoch = int(round(float(epoch_value)))
        record = by_epoch.setdefault(epoch, {"epoch": epoch})
        if "loss" in entry:
            record["train_loss"] = round(float(entry["loss"]), 6)
        if "eval_loss" in entry:
            record["val_loss"] = round(float(entry["eval_loss"]), 6)
        if "eval_accuracy" in entry:
            record["val_acc"] = round(float(entry["eval_accuracy"]), 6)
    return [by_epoch[epoch] for epoch in sorted(by_epoch)]


def compute_metrics(eval_pred: Any) -> dict[str, float]:
    logits = eval_pred.predictions
    if isinstance(logits, tuple):
        logits = logits[0]
    labels = eval_pred.label_ids
    predictions = np.argmax(logits, axis=-1)
    accuracy = float((predictions == labels).mean())
    return {"accuracy": accuracy}


def to_jsonable(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if hasattr(value, "item"):
        return value.item()
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_jsonable(v) for v in value]
    return str(value)


def main() -> None:
    parser = argparse.ArgumentParser(description="End-to-end MNIST training script")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--num-workers", type=int, default=0)
    parser.add_argument("--data-dir", default="data/mnist")
    parser.add_argument("--output-dir", default="outputs")
    args = parser.parse_args()

    data_dir = pathlib.Path(args.data_dir)
    output_dir = pathlib.Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    require_prepared_mnist(data_dir)

    transform = transforms.Compose(
        [
            transforms.Grayscale(num_output_channels=1),
            transforms.ToTensor(),
            transforms.Normalize((0.1307,), (0.3081,)),
        ]
    )
    train_ds = HFImageFolderDataset(
        datasets.ImageFolder(str(data_dir / "train"), transform=transform)
    )
    test_ds = HFImageFolderDataset(
        datasets.ImageFolder(str(data_dir / "test"), transform=transform)
    )

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = HFTrainerModel().to(device)
    training_args = TrainingArguments(
        output_dir=str(output_dir),
        num_train_epochs=float(args.epochs),
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        dataloader_num_workers=args.num_workers,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        logging_strategy="epoch",
        remove_unused_columns=False,
        report_to="wandb",
    )
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=test_ds,
        compute_metrics=compute_metrics,
    )

    print(f"Starting training on device={device} data_dir={data_dir.resolve()}")
    print(f"Writing artifacts to {output_dir.resolve()}")

    trainer.train()
    final_eval = trainer.evaluate()

    trainer.save_model(str(output_dir / "model"))
    torch.save(model.state_dict(), output_dir / "model.pt")
    metrics = collect_epoch_metrics(trainer.state.log_history)
    summary = {
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "device": str(device),
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "learning_rate": args.learning_rate,
        "data_dir": str(data_dir.resolve()),
        "metrics": metrics,
        "final_eval": to_jsonable(final_eval),
        "trainer_log_history": to_jsonable(trainer.state.log_history),
    }
    (output_dir / "metrics.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print("Training complete.")


if __name__ == "__main__":
    main()
