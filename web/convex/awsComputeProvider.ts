import {
  DescribeImagesCommand,
  DescribeInstancesCommand,
  DescribeInstanceTypesCommand,
  RunInstancesCommand,
  TerminateInstancesCommand,
  waitUntilInstanceTerminated,
  type EC2Client,
  type Instance,
  type _InstanceType,
  type InstanceTypeInfo,
} from "@aws-sdk/client-ec2";
import { ConvexError } from "convex/values";
import { resolveAwsInstancePrice, resolveAwsInstancePrices } from "@/lib/compute-provider-config";
import { AWS_COMPUTE_CONFIG } from "@convex/appConfig";
import { createAwsComputeClient } from "@convex/awsComputeClient";
import { resolveAwsComputeConfig, resolveAwsDeploymentId } from "@convex/awsComputeConfig";
import { buildAwsRuntimeUserData } from "@convex/awsRuntimeBootstrap";
import { sha256Hex } from "@convex/crypto";
import type { ComputeEndpointArgs, ComputeProvider } from "@convex/core/compute";

async function withAwsClient<T>(operation: string, run: (client: EC2Client) => Promise<T>): Promise<T> {
  const client = createAwsComputeClient();
  try {
    return await run(client);
  } catch (error) {
    if (error instanceof ConvexError) throw error;
    if (error instanceof Error && error.name === "InsufficientInstanceCapacity") {
      throw new ConvexError({ detail: "no GPU capacity currently available" });
    }
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : "request failed";
    throw new ConvexError({ detail: `AWS compute ${operation} failed: ${detail}` });
  } finally {
    client.destroy();
  }
}

function gpuSpec(info: InstanceTypeInfo) {
  const gpus = info.GpuInfo?.Gpus ?? [];
  const gpuCount = gpus.reduce((count, gpu) => count + (gpu.Count ?? 0), 0);
  if (!gpuCount || gpus.some((gpu) => gpu.Manufacturer !== "NVIDIA") ||
    !info.ProcessorInfo?.SupportedArchitectures?.includes("x86_64")) {
    throw new ConvexError({ detail: `AWS instance ${info.InstanceType} must have NVIDIA GPUs and support x86_64` });
  }
  return {
    gpuCount,
    memoryInGb: (info.GpuInfo?.TotalGpuMemoryInMiB ?? 0) / gpuCount / 1024,
  };
}

async function describeInstanceTypes(client: EC2Client, types: string[]) {
  const instances: InstanceTypeInfo[] = [];
  let nextToken: string | undefined;
  do {
    const response = await client.send(new DescribeInstanceTypesCommand({
      InstanceTypes: types as _InstanceType[],
      NextToken: nextToken,
    }));
    instances.push(...(response.InstanceTypes ?? []));
    nextToken = response.NextToken;
  } while (nextToken);
  if (types.some((type) => !instances.some((instance) => instance.InstanceType === type))) {
    throw new ConvexError({ detail: "AWS did not return all configured instance types" });
  }
  return instances;
}

async function getInstance(client: EC2Client, instanceId: string) {
  if (!/^i-[a-f0-9]+$/.test(instanceId)) {
    throw new ConvexError({ detail: "invalid AWS instance ID" });
  }
  let instance: Instance | undefined;
  try {
    const response = await client.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }));
    instance = response.Reservations?.flatMap((reservation) => reservation.Instances ?? [])[0];
  } catch (error) {
    if (error instanceof Error && error.name === "InvalidInstanceID.NotFound") return null;
    throw error;
  }
  if (!instance) return null;
  const deploymentId = resolveAwsDeploymentId();
  if (!instance.Tags?.some((tag) => tag.Key === "ManagedBy" && tag.Value === AWS_COMPUTE_CONFIG.managedByTag) ||
    !instance.Tags.some((tag) => tag.Key === "TahunaDeployment" && tag.Value === deploymentId)) {
    throw new ConvexError({ detail: "AWS instance does not belong to this Tahuna deployment" });
  }
  return instance;
}

function toComputeMachine(instance: Instance) {
  if (!instance.InstanceId) throw new ConvexError({ detail: "AWS response is missing the instance ID" });
  return {
    providerMachineId: instance.InstanceId,
    providerCreationTime: instance.LaunchTime?.getTime(),
    status: instance.State?.Name,
    providerMetadata: {
      instance_type: instance.InstanceType ?? "",
      availability_zone: instance.Placement?.AvailabilityZone ?? "",
    },
  };
}

async function resolveEndpoint(args: ComputeEndpointArgs) {
  if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535) {
    throw new ConvexError({ detail: "AWS runtime endpoint requires a valid port" });
  }
  return withAwsClient("endpoint lookup", async (client) => {
    const instance = await getInstance(client, args.providerMachineId);
    if (instance?.State?.Name !== "running" || !instance.PrivateIpAddress) {
      throw new ConvexError({ detail: "AWS runtime is not running or has no private address" });
    }
    // Serving requires private network connectivity from the Tahuna backend.
    // Public IPs are used only for outbound access, never as unauthenticated ingress.
    return `http://${instance.PrivateIpAddress}:${args.port}`;
  });
}

export function createAwsComputeProvider(options: {
  resolveGpuPricePerHour: (instanceType: string, gpuCount: number) => number;
}): ComputeProvider {
  return {
    async listOffers() {
      const prices = resolveAwsInstancePrices();
      return withAwsClient("catalog lookup", async (client) => {
        const types = await describeInstanceTypes(client, Object.keys(prices));
        return types.map((info) => {
          const spec = gpuSpec(info);
          const id = info.InstanceType!;
          return {
            id,
            displayName: id,
            memoryInGb: spec.memoryInGb,
            maxGpuCount: spec.gpuCount,
            // Tahuna's catalog prices are per GPU, while EC2 bills whole instances.
            pricePerHour: options.resolveGpuPricePerHour(id, spec.gpuCount),
          };
        }).sort((a, b) => a.id.localeCompare(b.id));
      });
    },

    async createMachine(_ctx, args) {
      const config = resolveAwsComputeConfig();
      const deploymentId = resolveAwsDeploymentId();
      const instanceType = args.gpuType.trim();
      resolveAwsInstancePrice(instanceType);
      if (!args.name.trim() || !Number.isInteger(args.volumeGb) || args.volumeGb <= 0) {
        throw new ConvexError({ detail: "AWS compute requires a machine name and a positive integer disk size" });
      }
      const userData = buildAwsRuntimeUserData(args);
      const clientToken = await sha256Hex(`${deploymentId}:${args.name}`);
      return withAwsClient("machine creation", async (client) => {
        const [types, images] = await Promise.all([
          describeInstanceTypes(client, [instanceType]),
          client.send(new DescribeImagesCommand({ ImageIds: [config.imageId] })),
        ]);
        const { gpuCount } = gpuSpec(types[0]);
        if (args.gpuCount !== gpuCount) {
          throw new ConvexError({ detail: `${instanceType} has exactly ${gpuCount} GPUs; set gpu_count to ${gpuCount}` });
        }
        const image = images.Images?.[0];
        const ebsDevices = image?.BlockDeviceMappings?.filter((device) => device.Ebs) ?? [];
        const root = ebsDevices.find((device) => device.DeviceName === image?.RootDeviceName);
        if (image?.State !== "available" || image.Architecture !== "x86_64" || !root?.Ebs || ebsDevices.length !== 1) {
          throw new ConvexError({ detail: "AWS compute requires an available x86_64 GPU AMI with one EBS root disk" });
        }
        if (args.volumeGb < (root.Ebs.VolumeSize ?? 0)) {
          throw new ConvexError({ detail: `AWS AMI requires volume_gb of at least ${root.Ebs.VolumeSize}` });
        }
        const tags = [
          { Key: "Name", Value: args.name },
          { Key: "ManagedBy", Value: AWS_COMPUTE_CONFIG.managedByTag },
          { Key: "TahunaDeployment", Value: deploymentId },
        ];
        const response = await client.send(new RunInstancesCommand({
          ClientToken: clientToken,
          ImageId: config.imageId,
          InstanceType: instanceType as _InstanceType,
          MinCount: 1,
          MaxCount: 1,
          UserData: userData,
          NetworkInterfaces: [{
            DeviceIndex: 0,
            SubnetId: config.subnetId,
            Groups: config.securityGroupIds,
            AssociatePublicIpAddress: config.publicIp,
            DeleteOnTermination: true,
          }],
          BlockDeviceMappings: [{
            DeviceName: image.RootDeviceName,
            Ebs: { VolumeSize: args.volumeGb, VolumeType: "gp3", Encrypted: true, DeleteOnTermination: true },
          }],
          // Warden exiting or bootstrap failing shuts down the host; EC2 deletes it.
          InstanceInitiatedShutdownBehavior: "terminate",
          MetadataOptions: { HttpTokens: "required", HttpPutResponseHopLimit: 1 },
          TagSpecifications: [
            { ResourceType: "instance", Tags: tags },
            { ResourceType: "volume", Tags: tags },
            { ResourceType: "network-interface", Tags: tags },
          ],
        }));
        const instance = response.Instances?.[0];
        if (!instance?.InstanceId) throw new ConvexError({ detail: "AWS machine creation returned no instance ID" });
        return toComputeMachine(instance);
      });
    },

    async getMachine(_ctx, args) {
      return withAwsClient("machine lookup", async (client) => {
        const instance = await getInstance(client, args.providerMachineId);
        return instance ? toComputeMachine(instance) : null;
      });
    },

    async terminateMachine(_ctx, args) {
      if (!args.providerMachineId) return;
      return withAwsClient("machine termination", async (client) => {
        const instance = await getInstance(client, args.providerMachineId);
        if (!instance || instance.State?.Name === "terminated") return;
        const request = { InstanceIds: [args.providerMachineId] };
        await client.send(new TerminateInstancesCommand(request));
        await waitUntilInstanceTerminated({
          client,
          maxWaitTime: AWS_COMPUTE_CONFIG.terminationWaitSeconds,
          minDelay: 3,
          maxDelay: 5,
        }, request);
      });
    },

    resolveRuntimeEndpoint: resolveEndpoint,
    resolveIngressEndpoint: resolveEndpoint,
  };
}
