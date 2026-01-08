import core
import argparse
from core.db import create_environment, create_run, get_environment, update_run
from core.provisioner import launch_pod, wait_for_pod, stream_logs, terminate_pod

def cmd_create_env(args):
    env_id = create_environment(args.name, args.artifacts, args.gpu_type, args.gpu_count, args.volume_gb)
    print(env_id)

def cmd_run(args):
    env = get_environment(args.env)
    if not env:
        print(f"Environment {args.env} not found")
        return
    
    run_info = create_run(args.env, args.input)
    run_id = run_info["run_id"]
    print(f"Run: {run_id}")
    
    pod_id = launch_pod(
        env_artifacts=env["artifacts"],
        input_path=run_info["input"],
        output_path=run_info["output"],
        gpu_type=env["gpu_type"],
        gpu_count=env["gpu_count"],
        volume_gb=env["volume_gb"],
    )
    update_run(run_id, status="provisioning", pod_id=pod_id)
    
    wait_for_pod(pod_id)
    update_run(run_id, status="running")
    
    try:
        stream_logs(pod_id)
        update_run(run_id, status="completed")
    except Exception as e:
        update_run(run_id, status="failed", error=str(e))
    finally:
        terminate_pod(pod_id)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers()
    
    p_env = sub.add_parser("create-env")
    p_env.add_argument("--name", required=True)
    p_env.add_argument("--artifacts", required=True)
    p_env.add_argument("--gpu-type", required=True)
    p_env.add_argument("--gpu-count", type=int, required=True)
    p_env.add_argument("--volume-gb", type=int, required=True)
    p_env.set_defaults(func=cmd_create_env)
    
    p_run = sub.add_parser("run")
    p_run.add_argument("--env", required=True)
    p_run.add_argument("--input", required=True)
    p_run.set_defaults(func=cmd_run)
    
    args = parser.parse_args()
    args.func(args)
