# AWS EC2 compute

The AWS adapter launches one On-Demand NVIDIA GPU instance per compute session.
It runs the same Warden container as the RunPod adapter. Multi-GPU instances are
supported; multi-node training, Spot, and HyperPod are not part of this adapter.

## Account and network

Choose one AWS region and ensure its On-Demand GPU vCPU quota is large enough
for the chosen instance type. G-family and P-family quotas are separate. An
approved quota does not guarantee that the instance type has available capacity.

Provide a subnet and security groups in the same VPC. Training requires outbound
HTTPS access to Tahuna's public callback origin, the image registry, object
storage, and dependency repositories. It needs no inbound rules or SSH key.

- In a public subnet with an internet gateway, set `TAHUNA_AWS_PUBLIC_IP=true`.
- In a private subnet, keep it `false` and provide outbound connectivity, such
  as a NAT gateway. The adapter does not create gateways or security-group rules.
- Serving uses the instance's private IP. The Tahuna web app must have private
  routing to the instance, and the security group must admit the serving port
  from that app only. A laptop callback tunnel alone does not provide this route.
  Do not expose the serving port to the internet to work around missing routing.

Choose an x86_64 AWS Deep Learning GPU AMI that supports the selected NVIDIA
hardware and the CUDA version in your Tahuna image. It must contain a working
NVIDIA driver, `nvidia-ctk`, Docker, systemd, and coreutils. Use an AMI with one
EBS root disk. The adapter validates the architecture, GPU type, image state,
and disk minimum before launching; software compatibility still requires a live
run. Runtime container images must be pullable without registry authentication.

## Backend configuration

Set these values in `docker/.env.application`, then run `make self-host-up`:

| Variable | Value |
| --- | --- |
| `TAHUNA_COMPUTE_PROVIDER` | `aws` |
| `AWS_REGION` | The region containing the subnet and AMI |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Dedicated provisioning credentials |
| `AWS_SESSION_TOKEN` | Required with temporary credentials; empty with IAM access keys |
| `TAHUNA_AWS_DEPLOYMENT_ID` | A stable unique deployment name, such as `tahuna-dev` |
| `TAHUNA_AWS_AMI_ID` | GPU AMI ID |
| `TAHUNA_AWS_SUBNET_ID` | Subnet ID |
| `TAHUNA_AWS_SECURITY_GROUP_IDS` | Comma-separated security-group IDs |
| `TAHUNA_AWS_INSTANCE_PRICES` | JSON object mapping allowed EC2 instance types to whole-instance USD/hour prices |
| `TAHUNA_AWS_VOLUME_GB_MONTHLY_PRICE` | Regional gp3 baseline storage price in USD/GiB-month |
| `TAHUNA_AWS_PUBLIC_IP` | `true` or `false`, as described above |

Look up current prices for the chosen region. The instance price map both limits
which instance types Tahuna can launch and supplies its internal billing rates.
Use numeric JSON values, without currency symbols. Prices are configured rather
than silently borrowed from RunPod or guessed from another region. The catalog
shows the instance price divided by its GPU count, including Tahuna's configured
markup. Billing charges the whole instance plus its disk. Network transfer,
public IPv4, NAT, and other AWS charges are not included in that estimate.

The CLI profile on your laptop authenticates setup commands; Convex does not
read `~/.aws` or automatically renew `aws login` sessions. Supply credentials to
the backend separately. Temporary credentials must be refreshed before expiry,
including while an instance is running, so termination requests can succeed.
Use a dedicated, restricted identity and a credential-rotation process for an
unattended deployment. Never configure the backend with root credentials.

Start from [aws-iam-policy.json](aws-iam-policy.json), replacing `REGION`,
`ACCOUNT_ID`, `AMI_ID`, `SUBNET_ID`, `SECURITY_GROUP_ID`, `INSTANCE_TYPE`, and
`DEPLOYMENT_ID`. Include each configured security group and allowed instance
type in the policy. This policy is for the
provisioner; setup operations such as creating a security group or requesting
quota need separate administrative permissions. Customer-managed KMS keys also
need their own grants. Workers receive no IAM role or provisioning credentials,
so this setup needs no `iam:PassRole` permission.

The adapter checks both `ManagedBy=tahuna` and `TahunaDeployment` tags before
looking up endpoints or terminating instances. Keep the deployment ID and region
stable while resources exist. Drain all runs, serves, and warm sessions before
changing the deployment's compute provider, credentials' account, or AWS region.

## Launch and cleanup

Use `tahuna gpus list` to see configured instance types. Set `gpu_type` to the
instance type itself, such as `g5.xlarge`, and `gpu_count` to its exact number of
GPUs. For example, an eight-GPU instance requires `gpu_count = 8`; choosing fewer
does not make the instance smaller or cheaper. The training entrypoint remains
responsible for using all GPUs, for example through `torchrun`.

`volume_gb` is the total encrypted gp3 root-disk size, shared by the OS, container
images, and `/workspace`. It must meet the selected AMI's disk minimum and leave
space for the container and training data. The disk and primary network interface
are deleted when the instance terminates. No persistent EBS volume is created.
The training environment supports single-line variable values; oversized
bootstrap data fails before launch because EC2 user data is limited to 16 KiB.
User data includes the scoped Tahuna runtime token and training environment,
so restrict access to instance user data as you would other deployment secrets.

Warden uses Tahuna's existing callbacks to upload outputs and report completion.
Compute sessions retain the existing warm/idle behavior. On normal shutdown or
bootstrap failure, the host shuts down and EC2 terminates it. Explicit teardown
also calls `TerminateInstances` and waits for the terminated state; Tahuna's
existing retry flow handles a slow termination. A lost response to a launch is
protected against duplicate creation by a stable EC2 client token.

After a live run, verify its artifacts in Tahuna and confirm in EC2 that its
instance is terminated and its attached disk is gone. If backend credentials
expire or callbacks become unavailable, inspect deployment-tagged instances and
clean up any that remain. Do not infer resource cleanup solely from run status.

## References

- [EC2 GPU instance specifications](https://docs.aws.amazon.com/ec2/latest/instancetypes/ac.html)
- [Deep Learning AMIs](https://docs.aws.amazon.com/dlami/latest/devguide/what-is-dlami.html)
- [EC2 quotas](https://docs.aws.amazon.com/ec2/latest/instancetypes/ec2-instance-quotas.html)
- [EC2 user data](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html)
- [EC2 termination and disks](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/preserving-volumes-on-termination.html)
