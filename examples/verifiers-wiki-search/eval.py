from __future__ import annotations

import asyncio
import os
import sys


def print_rollout(output: dict) -> None:
    from rich.console import Console
    from rich.rule import Rule
    from rich.text import Text

    from verifiers.utils.message_utils import format_messages

    console = Console()
    console.print(
        Rule(
            f"example={output['example_id']} reward={output['reward']:.2f} "
            f"completed={output['is_completed']} truncated={output['is_truncated']}"
        )
    )
    console.print(Text(f"reward: {output['reward']:.2f}", style="bold green"))
    judge_response = output.get("judge_response")
    if isinstance(judge_response, dict) and judge_response:
        console.print(Text("rubric:", style="bold"))
        for value in judge_response.values():
            console.print(Text(str(value).strip(), style="cyan"))

    if output.get("prompt"):
        console.print("[bold]Prompt[/bold]")
        console.print(format_messages(output["prompt"]))

    for i, step in enumerate(output.get("trajectory") or [], start=1):
        console.print(Rule(f"trajectory step {i}"))
        if step.get("completion"):
            console.print(format_messages(step["completion"]))

    if output.get("completion"):
        console.print(Rule("final completion"))
        console.print(format_messages(output["completion"]))

    if output.get("error"):
        console.print(Rule("error"))
        console.print(str(output["error"]))


async def main() -> int:
    from verifiers.types import ClientConfig

    from wiki_search import load_environment

    if not os.environ.get("GEMINI_API_KEY"):
        print("missing required env var GEMINI_API_KEY for smoke eval", file=sys.stderr)
        return 2

    vf_env = load_environment()
    client = ClientConfig(
        client_type="openai_chat_completions",
        api_key_var="GEMINI_API_KEY",
        api_base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
    )
    results = await vf_env.evaluate(
        client=client,
        model="gemini-2.5-flash",
        num_examples=2,
        rollouts_per_example=1,
        state_columns=["judge_response"],
    )
    print(f"smoke eval completed with {len(results['outputs'])} rollout(s)")
    if results["outputs"]:
        print_rollout(results["outputs"][0])
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
