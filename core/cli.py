import core
import argparse
from core.db import create_environment, create_experiment, create_run, get_environment, get_experiment, update_run
from core.provisioner import launch_pod, wait_for_pod, wait_for_completion, terminate_pod, GPUS, IMAGES

def cmd_create_env(args):
    result = create_environment(
        args.name, 
        args.gpu_type, 
        args.gpu_count, 
        args.volume_gb,
        args.framework,
        args.version,
    )
    print(f"Created environment: {result['env_id']}")
    print(f"Upload your training code to: {result['artifacts']}")

def cmd_create_experiment(args):
    result = create_experiment(args.env, args.name)
    print(f"Created experiment: {result['exp_id']}")
    print(f"Upload your input data to: {result['input']}")

def cmd_run(args):
    exp = get_experiment(args.experiment)
    if not exp:
        print(f"Experiment {args.experiment} not found")
        return
    
    env = get_environment(exp["env_id"])
    if not env:
        print(f"Environment {exp['env_id']} not found")
        return
    
    run_info = create_run(exp["env_id"], exp["input"])
    run_id = run_info["run_id"]
    print(f"Run: {run_id}")
    
    # Allow CLI overrides for GPU specs
    gpu_type = args.gpu_type or env["gpu_type"]
    gpu_count = args.gpu_count or env["gpu_count"]
    volume_gb = args.volume_gb or env["volume_gb"]
    
    pod_id = launch_pod(
        env_artifacts=env["artifacts"],
        input_path=exp["input"],
        output_path=run_info["output"],
        logs_path=run_info["logs"],
        gpu_type=gpu_type,
        gpu_count=gpu_count,
        volume_gb=volume_gb,
        framework=env["framework"],
        version=env["version"],
        run_id=run_id,
    )
    update_run(run_id, status="provisioning", pod_id=pod_id)
    
    wait_for_pod(pod_id)
    update_run(run_id, status="running")
    
    try:
        wait_for_completion(pod_id)
        update_run(run_id, status="completed")
    except Exception as e:
        update_run(run_id, status="failed", error=str(e))
    finally:
        terminate_pod(pod_id)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers()
    
    # create-env
    p_env = sub.add_parser("create-env")
    p_env.add_argument("--name", required=True)
    p_env.add_argument("--gpu-type", required=True, choices=GPUS)
    p_env.add_argument("--gpu-count", type=int, required=True)
    p_env.add_argument("--volume-gb", type=int, required=True)
    p_env.add_argument("--framework", required=True, choices=list(IMAGES.keys()))
    p_env.add_argument("--version", required=True)
    p_env.set_defaults(func=cmd_create_env)
    
    # create-experiment
    p_exp = sub.add_parser("create-experiment")
    p_exp.add_argument("--env", required=True, help="Environment ID")
    p_exp.add_argument("--name", required=True, help="Experiment name")
    p_exp.set_defaults(func=cmd_create_experiment)
    
    # run
    p_run = sub.add_parser("run")
    p_run.add_argument("--experiment", required=True, help="Experiment ID")
    p_run.add_argument("--gpu-type", help="Override GPU type")
    p_run.add_argument("--gpu-count", type=int, help="Override GPU count")
    p_run.add_argument("--volume-gb", type=int, help="Override volume size")
    p_run.set_defaults(func=cmd_run)
    
    args = parser.parse_args()
    args.func(args)

