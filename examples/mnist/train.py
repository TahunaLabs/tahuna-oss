#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import pathlib
import sys
from datetime import datetime, timezone

import tahuna.monitor as wandb

try:
    import torch
    from torch import nn
    from torch.utils.data import DataLoader
    from torchvision import datasets, transforms
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


def evaluate(model: nn.Module, loader: DataLoader, device: torch.device) -> tuple[float, float]:
    model.eval()
    loss_fn = nn.CrossEntropyLoss()
    total_loss = 0.0
    correct = 0
    total = 0
    with torch.no_grad():
        for x, y in loader:
            x, y = x.to(device), y.to(device)
            logits = model(x)
            loss = loss_fn(logits, y)
            total_loss += loss.item() * y.size(0)
            correct += (logits.argmax(dim=1) == y).sum().item()
            total += y.size(0)
    return total_loss / total, correct / total


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

    wandb.init(
        project="mnist",
        name="mnist-cnn",
        config={
            "epochs": args.epochs,
            "batch_size": args.batch_size,
            "learning_rate": args.learning_rate,
            "num_workers": args.num_workers,
            "data_dir": str(data_dir),
        },
    )

    require_prepared_mnist(data_dir)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    transform = transforms.Compose(
        [
            transforms.Grayscale(num_output_channels=1),
            transforms.ToTensor(),
            transforms.Normalize((0.1307,), (0.3081,)),
        ]
    )
    train_ds = datasets.ImageFolder(str(data_dir / "train"), transform=transform)
    test_ds = datasets.ImageFolder(str(data_dir / "test"), transform=transform)

    train_loader = DataLoader(
        train_ds, batch_size=args.batch_size, shuffle=True, num_workers=args.num_workers
    )
    test_loader = DataLoader(
        test_ds, batch_size=args.batch_size, shuffle=False, num_workers=args.num_workers
    )

    model = SimpleCNN().to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.learning_rate)
    loss_fn = nn.CrossEntropyLoss()

    print(f"Starting training on device={device} data_dir={data_dir.resolve()}")
    print(f"Writing artifacts to {output_dir.resolve()}")

    metrics: list[dict[str, float | int]] = []
    for epoch in range(1, args.epochs + 1):
        model.train()
        running_loss = 0.0
        seen = 0
        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad()
            logits = model(x)
            loss = loss_fn(logits, y)
            loss.backward()
            optimizer.step()
            batch_size = y.size(0)
            running_loss += loss.item() * batch_size
            seen += batch_size

        train_loss = running_loss / seen
        val_loss, val_acc = evaluate(model, test_loader, device)
        epoch_metrics: dict[str, float | int] = {
            "epoch": epoch,
            "train_loss": round(train_loss, 6),
            "val_loss": round(val_loss, 6),
            "val_acc": round(val_acc, 6),
        }
        metrics.append(epoch_metrics)
        print(
            f"epoch={epoch} train_loss={train_loss:.4f} "
            f"val_loss={val_loss:.4f} val_acc={val_acc:.4f}"
        )
        wandb.log(
            {
                "train_loss": train_loss,
                "val_loss": val_loss,
                "val_acc": val_acc,
            },
            step=epoch,
        )

    torch.save(model.state_dict(), output_dir / "model.pt")
    summary = {
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "device": str(device),
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "learning_rate": args.learning_rate,
        "data_dir": str(data_dir.resolve()),
        "metrics": metrics,
    }
    (output_dir / "metrics.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    wandb.finish()
    print("Training complete.")


if __name__ == "__main__":
    main()
# incremental-test
# incremental-test
# incremental-test
# second-change
