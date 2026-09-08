import asyncio
import os
from typing import cast

import chromadb
from chromadb.api.types import Embeddable, EmbeddingFunction
from chromadb.utils import embedding_functions
from datasets import load_dataset
from openai import AsyncOpenAI

import verifiers as vf
from verifiers.rubrics.judge_rubric import JudgeRubric

CHROMA_DB_DIR = os.environ.get(
    "WIKI_SEARCH_CHROMA_DB_DIR",
    ".chroma",
)
_chroma_semaphore: asyncio.Semaphore | None = None


def _get_chroma_semaphore() -> asyncio.Semaphore:
    global _chroma_semaphore
    if _chroma_semaphore is None:
        _chroma_semaphore = asyncio.Semaphore(100)
    return _chroma_semaphore


def load_environment(
    max_turns: int = 10,
    judge_model: str = "gemini-3-flash-preview",
    judge_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai/",
    judge_api_key_var: str = "GEMINI_API_KEY",
    embed_model: str = "gemini-embedding-2-preview",
    embed_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai/",
    embed_api_key_var: str = "GEMINI_API_KEY",
    corpus_dataset: str = "willcb/rare-wiki-pages",
    corpus_split: str = "train",
    chroma_db_dir: str = CHROMA_DB_DIR,
) -> vf.Environment:
    corpus = load_dataset(corpus_dataset, split=corpus_split)
    page_id_to_title: dict[str, str] = {}
    page_id_to_content: dict[str, str] = {}
    for row in corpus:
        row = cast(dict, row)
        pid = row["id"]
        title = row["title"]
        content = row["content"]
        page_id_to_title[pid] = title
        page_id_to_content[pid] = content

    _chroma_state: dict[str, object | None] = {"collection": None}

    def _get_collection():
        if _chroma_state["collection"] is None:
            os.makedirs(chroma_db_dir, exist_ok=True)
            openai_ef = embedding_functions.OpenAIEmbeddingFunction(
                model_name=embed_model,
                api_base=embed_base_url,
                api_key=os.getenv(embed_api_key_var, "EMPTY"),
            )
            client = chromadb.PersistentClient(path=chroma_db_dir)
            _chroma_state["collection"] = client.get_or_create_collection(
                name="wiki_titles",
                embedding_function=cast(EmbeddingFunction[Embeddable], openai_ef),
            )
            _init_chroma(_chroma_state["collection"])
        return _chroma_state["collection"]

    def _init_chroma(collection) -> None:
        all_ids = list(page_id_to_title.keys())
        existing: set[str] = set()
        for i in range(0, len(all_ids), 500):
            batch = all_ids[i : i + 500]
            got = collection.get(ids=batch)
            existing.update(got.get("ids", []))
        missing = [pid for pid in all_ids if pid not in existing]
        if missing:
            documents = []
            metadatas = []
            for pid in missing:
                title = str(page_id_to_title[pid]).strip()
                if not title:
                    raise ValueError(f"Empty title for page_id {pid}")
                documents.append(title)
                metadatas.append({"title": title})
            batch_size = 100
            for i in range(0, len(missing), batch_size):
                collection.upsert(
                    ids=missing[i : i + batch_size],
                    documents=documents[i : i + batch_size],
                    metadatas=metadatas[i : i + batch_size],
                )

    def normalize_id(text: str) -> str:
        return text.strip().lower().replace(" ", "_")

    async def search_pages(query: str) -> list[dict]:
        collection = _get_collection()
        async with _get_chroma_semaphore():
            results = await asyncio.to_thread(
                collection.query,
                query_texts=[query],
                n_results=10,
            )
        if not results:
            raise ValueError(f"No results found for query: {query}")
        if not results["metadatas"]:
            raise ValueError(f"No results metadata found for query: {query}")

        output = []
        for i in range(len(results["ids"][0])):
            output.append(
                {
                    "page_id": results["ids"][0][i],
                    "title": results["metadatas"][0][i]["title"],
                }
            )
        return output

    async def view_sections(page_id: str) -> list[dict]:
        content = page_id_to_content[page_id]
        sections = []
        lines = content.split("\n")
        for i, line in enumerate(lines):
            if line.startswith("#"):
                section_name = line.lstrip("#").strip()
                section_id = f"{page_id}:{normalize_id(section_name)}"
                sections.append(
                    {
                        "section_id": section_id,
                        "section_name": section_name,
                        "start_line": i,
                    }
                )

        if not sections:
            sections.append(
                {
                    "section_id": f"{page_id}:full",
                    "section_name": "Full Page",
                    "start_line": 0,
                }
            )

        return [
            {"section_id": s["section_id"], "section_name": s["section_name"]}
            for s in sections
        ]

    async def read_section(section_id: str) -> str:
        if ":" not in section_id:
            raise ValueError(
                "Invalid section_id format. Expected: page_id:section_name"
            )
        page_id, section_name_id = section_id.split(":", 1)

        content = page_id_to_content[page_id]
        lines = content.split("\n")

        if section_name_id == "full":
            return content

        section_start = None
        section_end = None

        for i, line in enumerate(lines):
            if line.startswith("#"):
                current_section = normalize_id(line.lstrip("#").strip())
                if current_section == section_name_id and section_start is None:
                    section_start = i
                elif section_start is not None and section_end is None:
                    section_end = i
                    break

        if section_start is None:
            raise ValueError(f"Section not found: {section_id}")
        if section_end is None:
            section_end = len(lines)
        return "\n".join(lines[section_start:section_end])

    parser = vf.Parser()
    dataset = load_dataset("willcb/wiki-trivia-questions-v4", split="train")
    judge_prompt = """Given a ground truth answer \
and a response, determine if the response is both correct and coherent.

Question:
```
{question}
```

Ground truth answer:
```
{answer}
```

Response:
```
{response}
```

Respond either "yes" or "no" only.

If a response contains incoherent text, respond with "no" even if the correct answer is also present.
"""
    judge_client = AsyncOpenAI(
        base_url=judge_base_url,
        api_key=os.environ[judge_api_key_var],
    )
    judge_rubric = JudgeRubric(
        judge_client=judge_client,
        judge_model=judge_model,
        parser=parser,
        judge_prompt=judge_prompt,
    )

    async def judge_reward_func(judge, prompt, completion, answer, state) -> float:
        if not completion:
            return 0.0

        cleaned_completion = []
        for message in completion:
            content = message.get("content")
            text = content.split("</think>")[-1] if isinstance(content, str) else ""
            cleaned_completion.append({message["role"]: text})
        judge_response = await judge(prompt, cleaned_completion, answer, state)
        return 1.0 if "yes" in judge_response.lower() else 0.0

    system_prompt = "Use the provided Wikipedia search tools to help answer questions."
    judge_rubric.add_reward_func(judge_reward_func, weight=1.0)

    return vf.ToolEnv(
        dataset=dataset,
        system_prompt=system_prompt,
        parser=parser,
        rubric=judge_rubric,
        tools=[search_pages, view_sections, read_section],
        max_turns=max_turns,
    )
