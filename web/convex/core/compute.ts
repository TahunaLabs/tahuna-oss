export type ComputeProviderContext = unknown;

export type ComputeOffer = {
  id: string;
  displayName: string;
  memoryInGb: number;
  maxGpuCount: number;
  pricePerHour?: number;
};

export type CreateMachineArgs = {
  name: string;
  imageName: string;
  gpuType: string;
  gpuCount: number;
  volumeGb: number;
  env: Record<string, string>;
  ports?: string[];
};

export type CreateMachineResult = {
  providerMachineId: string;
  providerMetadata?: unknown;
  _providerCreationTime?: number;
};

export type GetMachineArgs = {
  providerMachineId: string;
};

export type ComputeMachine = {
  providerMachineId: string;
  status?: string;
  providerMetadata?: unknown;
  _providerCreationTime?: number;
};

export type TerminateMachineArgs = {
  providerMachineId: string;
};

export type ComputeEndpointArgs = {
  providerMachineId: string;
  port: number;
};

export type ComputeProvider = {
  listOffers(
    ctx: ComputeProviderContext,
    args: { userId?: string },
  ): Promise<ComputeOffer[]>;
  createMachine(ctx: ComputeProviderContext, args: CreateMachineArgs): Promise<CreateMachineResult>;
  getMachine(ctx: ComputeProviderContext, args: GetMachineArgs): Promise<ComputeMachine | null>;
  terminateMachine(ctx: ComputeProviderContext, args: TerminateMachineArgs): Promise<void>;
  resolveRuntimeEndpoint(args: ComputeEndpointArgs): string;
  resolveIngressEndpoint(args: ComputeEndpointArgs): string;
};
