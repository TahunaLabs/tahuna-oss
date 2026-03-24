#!/usr/bin/env python3
import json
from pathlib import Path

import torch
import torch.nn.functional as F
from torch import nn
from torch.utils.data import Dataset, Subset
from torchvision import datasets, transforms
from transformers import Trainer, TrainingArguments
import yaml

CONFIG_PATH = Path("config.yaml")


class ImageFolderDataset(Dataset):
    def __init__(self, root: Path) -> None:
        transform = transforms.Compose(
            [
                transforms.Grayscale(num_output_channels=1),
                transforms.ToTensor(),
                transforms.Normalize((0.1307,), (0.3081,)),
            ]
        )
        self.dataset = datasets.ImageFolder(str(root), transform=transform)

    def __len__(self) -> int:
        return len(self.dataset)

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor | int]:
        pixel_values, label = self.dataset[idx]
        return {"pixel_values": pixel_values, "labels": label}


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

    def forward(
        self,
        pixel_values: torch.Tensor | None = None,
        labels: torch.Tensor | None = None,
    ) -> dict[str, torch.Tensor]:
        logits = self.classifier(self.features(pixel_values))
        if labels is None:
            return {"logits": logits}
        return {"loss": F.cross_entropy(logits, labels), "logits": logits}


def maybe_subset(dataset: Dataset, limit: int | None) -> Dataset:
    if limit is None or limit <= 0:
        return dataset
    bounded_limit = min(limit, len(dataset))
    return Subset(dataset, list(range(bounded_limit)))


def main() -> None:
    config = yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}
    train_config = config.get("train", {})
    data_dir = Path(str(train_config.get("data_dir", "data/mnist")))
    output_dir = Path(str(train_config.get("output_dir", "outputs")))
    epochs = float(train_config.get("epochs", 1))
    batch_size = int(train_config.get("batch_size", 64))
    learning_rate = float(train_config.get("learning_rate", 1e-3))
    train_subset_size = int(train_config.get("train_subset_size", 0))
    eval_subset_size = int(train_config.get("eval_subset_size", 0))
    logging_steps = max(1, int(train_config.get("logging_steps", 1)))

    output_dir.mkdir(parents=True, exist_ok=True)

    train_dataset = ImageFolderDataset(data_dir / "train")
    test_dataset = ImageFolderDataset(data_dir / "test")
    train_dataset = maybe_subset(train_dataset, train_subset_size)
    test_dataset = maybe_subset(test_dataset, eval_subset_size)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = SimpleCNN().to(device)

    training_args = TrainingArguments(
        output_dir=str(output_dir),
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=batch_size,
        learning_rate=learning_rate,
        remove_unused_columns=False,
        eval_strategy="epoch",
        save_strategy="no",
        logging_strategy="steps",
        logging_steps=logging_steps,
        report_to="wandb",
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=test_dataset,
    )

    print(f"device={device}")
    print(f"train_samples={len(train_dataset)} eval_samples={len(test_dataset)} logging_steps={logging_steps}")
    train_result = trainer.train()
    eval_metrics = trainer.evaluate()

    print(f"Writing artifacts to {output_dir.resolve()}")
    torch.save(model.state_dict(), output_dir / "model.pt")
    (output_dir / "metrics.json").write_text(
        json.dumps(
            {
                "device": str(device),
                "epochs": epochs,
                "batch_size": batch_size,
                "learning_rate": learning_rate,
                "train_metrics": train_result.metrics,
                "eval_metrics": eval_metrics,
            },
            indent=2,
            sort_keys=True,
        ),
        encoding="utf-8",
    )
    print(eval_metrics)


if __name__ == "__main__":
    main()
