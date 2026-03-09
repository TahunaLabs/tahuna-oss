#!/usr/bin/env python3
from __future__ import annotations

import argparse
import pathlib

from torchvision import datasets


def is_prepared(split_dir: pathlib.Path) -> bool:
    if not split_dir.exists():
        return False
    for digit in range(10):
        class_dir = split_dir / str(digit)
        if not class_dir.exists() or not any(class_dir.iterdir()):
            return False
    return True


def write_split(name: str, dataset: datasets.MNIST, root: pathlib.Path) -> None:
    split_dir = root / name
    split_dir.mkdir(parents=True, exist_ok=True)
    for idx, (img, label) in enumerate(dataset):
        class_dir = split_dir / str(label)
        class_dir.mkdir(parents=True, exist_ok=True)
        img.save(class_dir / f"{idx:05d}.png")
        if idx > 0 and idx % 10000 == 0:
            print(f"{name}: processed {idx} images...")
    print(f"{name}: wrote {len(dataset)} images to {split_dir.resolve()}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare MNIST folders for Tahuna data sync")
    parser.add_argument("--data-dir", default="data/mnist")
    args = parser.parse_args()

    data_dir = pathlib.Path(args.data_dir)
    train_dir = data_dir / "train"
    test_dir = data_dir / "test"

    if is_prepared(train_dir) and is_prepared(test_dir):
        print(f"MNIST already prepared in {data_dir.resolve()}")
        return

    raw_dir = data_dir / "raw"
    train_ds = datasets.MNIST(root=str(raw_dir), train=True, download=True)
    test_ds = datasets.MNIST(root=str(raw_dir), train=False, download=True)

    write_split("train", train_ds, data_dir)
    write_split("test", test_ds, data_dir)
    print("MNIST folder dataset ready for sync.")


if __name__ == "__main__":
    main()
