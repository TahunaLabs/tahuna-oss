"""SFT preset - fine-tune LLM with trl"""
import os
import torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import SFTTrainer, SFTConfig

def train(
    data_path: str,
    base_model: str,
    epochs: int = 3,
    lr: float = 2e-5,
    batch_size: int = 4,
    grad_accum: int = 4,
) -> str:
    """Run SFT training. Returns output path."""
    
    output_path = "/output/model"
    
    # Load data
    dataset = load_dataset("json", data_files=data_path)["train"]
    print(f"Loaded {len(dataset)} examples")
    
    # Load model
    model = AutoModelForCausalLM.from_pretrained(
        base_model,
        torch_dtype=torch.bfloat16,
        device_map="auto",
    )
    tokenizer = AutoTokenizer.from_pretrained(base_model)
    tokenizer.pad_token = tokenizer.eos_token
    
    # Format
    def format_fn(ex):
        return f"### Instruction:\n{ex['prompt']}\n\n### Response:\n{ex['completion']}"
    
    # Train
    trainer = SFTTrainer(
        model=model,
        train_dataset=dataset,
        formatting_func=format_fn,
        args=SFTConfig(
            output_dir=output_path,
            num_train_epochs=epochs,
            per_device_train_batch_size=batch_size,
            gradient_accumulation_steps=grad_accum,
            learning_rate=lr,
            logging_steps=1,
            save_strategy="epoch",
            bf16=True,
            fsdp="full_shard auto_wrap",  # Multi-GPU
            fsdp_config={"fsdp_offload_params": False},
        ),
    )
    
    trainer.train()
    trainer.save_model(output_path)
    
    return output_path
