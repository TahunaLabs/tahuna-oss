#!/usr/bin/env python3
from __future__ import annotations

import argparse
import pathlib
import time


def main() -> None:
    parser = argparse.ArgumentParser(description="Minimal Tahuna training script")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--data-dir", default="data")
    parser.add_argument("--output-dir", default="outputs")
    args = parser.parse_args()

    data_dir = pathlib.Path(args.data_dir)
    output_dir = pathlib.Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Starting training with data_dir={data_dir.resolve()}")
    print(f"Writing artifacts to {output_dir.resolve()}")

    for epoch in range(1, args.epochs + 1):
        loss = 1.0 / epoch
        print(f"epoch={epoch} loss={loss:.4f}")
        time.sleep(0.2)

    (output_dir / "metrics.txt").write_text("final_loss=0.3333\n", encoding="utf-8")
    print("Training complete.")


if __name__ == "__main__":
    main()
# incremental-test
# incremental-test
# incremental-test
# second-change
