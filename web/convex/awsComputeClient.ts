import { EC2Client } from "@aws-sdk/client-ec2";
import { FetchHttpHandler } from "@smithy/fetch-http-handler";
import { AWS_COMPUTE_CONFIG } from "@convex/appConfig";
import { resolveAwsClientConfig } from "@convex/awsComputeConfig";

// Explicit credentials and Fetch keep this client compatible with Convex's
// default runtime, where the Node credential chain and local profiles don't exist.
export function createAwsComputeClient() {
  return new EC2Client({
    ...resolveAwsClientConfig(),
    maxAttempts: AWS_COMPUTE_CONFIG.maxAttempts,
    requestHandler: new FetchHttpHandler({ requestTimeout: AWS_COMPUTE_CONFIG.requestTimeoutMs }),
  });
}
