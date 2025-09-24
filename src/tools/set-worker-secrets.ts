import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Props } from "../types";
import { logDeploymentOperation } from "../deployment/validation";
import { CloudflareAPI } from "../deployment/cloudflare-api";

const INFRASTRUCTURE_ADMINS = new Set(['aboundTechOlogy']);

// Schema for setWorkerSecrets tool
export const SetWorkerSecretsSchema = {
  workerName: z
    .string()
    .min(1, "Worker name cannot be empty")
    .regex(/^[a-zA-Z0-9\-_]+$/, "Worker name can only contain letters, numbers, hyphens, and underscores")
    .describe("Name of the worker to set secrets for"),
  secrets: z
    .array(
      z.object({
        name: z
          .string()
          .min(1, "Secret name cannot be empty")
          .regex(/^[A-Z][A-Z0-9_]*$/, "Secret name must be uppercase with underscores")
          .describe("Secret name (e.g., 'GITHUB_CLIENT_ID')"),
        value: z
          .string()
          .min(1, "Secret value cannot be empty")
          .describe("Secret value (encrypted in transit)")
      })
    )
    .min(1, "At least one secret must be provided")
    .describe("Array of secrets to set"),
  environment: z
    .enum(['production', 'staging', 'development'])
    .optional()
    .describe("Optional: environment (production/staging/development)")
};

export function registerSetWorkerSecrets(server: McpServer, env: Env, props: Props) {
  // Only register this tool for infrastructure admins
  if (INFRASTRUCTURE_ADMINS.has(props.login)) {
    server.tool(
      "setWorkerSecrets",
      "Programmatically set production secrets for a Cloudflare Worker. This tool sets multiple secrets in batch for a deployed worker. Secrets are encrypted in transit via HTTPS. **INFRASTRUCTURE ADMIN ACCESS REQUIRED**",
      SetWorkerSecretsSchema,
      async ({ workerName, secrets, environment }) => {
        try {
          // Log the operation start
          console.log('[setWorkerSecrets] Starting secret configuration:', {
            workerName,
            secretCount: secrets.length,
            secretNames: secrets.map(s => s.name),
            environment,
            user: props.login
          });

          // Check for required environment variables
          const accountId = env.CLOUDFLARE_ACCOUNT_ID;
          const apiToken = env.CLOUDFLARE_API_TOKEN;

          if (!accountId || !apiToken) {
            const error = 'Missing Cloudflare credentials';
            logDeploymentOperation('set_worker_secrets', workerName, props.login, false, { error });
            return {
              content: [{
                type: "text" as const,
                text: `**Error**\n\nCloudflare credentials not configured\n\n**Details:**\n\`\`\`json\n${JSON.stringify({
                  missing: "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables"
                }, null, 2)}\n\`\`\``
              }]
            };
          }

          // Initialize Cloudflare API - using the same pattern as deployWorker and deleteWorker
          const cfApi = new CloudflareAPI(accountId, apiToken);

          // Process each secret sequentially using CloudflareAPI
          console.log(`[setWorkerSecrets] Processing ${secrets.length} secrets using CloudflareAPI`);

          // Process ONLY THE FIRST SECRET and return immediately
          // This avoids the hanging issue with multiple sequential API calls
          const firstSecret = secrets[0];
          let firstResult: any;

          try {
            console.log(`[setWorkerSecrets] Setting secret '${firstSecret.name}' for worker '${workerName}'`);
            const result = await cfApi.setWorkerSecret(workerName, firstSecret.name, firstSecret.value);

            if (!result.success) {
              const errorMessage = result.errors?.[0]?.message || `Failed to set secret ${firstSecret.name}`;
              console.error(`[setWorkerSecrets] Error setting secret '${firstSecret.name}':`, result.errors);
              throw new Error(errorMessage);
            }

            console.log(`[setWorkerSecrets] Successfully set secret '${firstSecret.name}'`);
            firstResult = { status: 'fulfilled', value: firstSecret.name };

          } catch (error: any) {
            console.error(`[setWorkerSecrets] Error setting secret '${firstSecret.name}':`, error);
            firstResult = {
              status: 'rejected',
              reason: error,
              secretName: firstSecret.name
            };
          }

          // Build results array with first result and pending for others
          const results = [firstResult];
          for (let i = 1; i < secrets.length; i++) {
            results.push({
              status: 'pending',
              secretName: secrets[i].name,
              note: 'Call setWorkerSecrets again for this secret'
            });
          }

          // Collect successful and failed secrets
          const successfulSecrets: string[] = [];
          const errors: Array<{ secret: string; error: string }> = [];
          const pending: string[] = [];

          results.forEach((result: any, index) => {
            if (result.status === 'fulfilled' && result.value) {
              successfulSecrets.push(result.value);
            } else if (result.status === 'rejected') {
              errors.push({
                secret: result.secretName || secrets[index].name,
                error: result.reason?.message || 'Unknown error'
              });
            } else if (result.status === 'pending') {
              pending.push(result.secretName || secrets[index].name);
            }
          });

          // Determine overall status
          const status = errors.length === 0 ? 'SUCCESS' :
                        successfulSecrets.length === 0 ? 'FAILURE' : 'PARTIAL';

          // Log the operation
          logDeploymentOperation('set_worker_secrets', workerName, props.login, status === 'SUCCESS', {
            successfulSecrets,
            errors: errors.length > 0 ? errors : undefined,
            environment
          });

          // Generate wrangler CLI equivalent commands for reference
          const wranglerCommands = successfulSecrets.map(
            name => `wrangler secret put ${name} --name ${workerName}`
          );

          // Prepare result
          const result = {
            workerName,
            environment: environment || 'production',
            totalSecrets: secrets.length,
            successfulSecrets,
            failedSecrets: errors.length > 0 ? errors : undefined,
            pendingSecrets: pending.length > 0 ? pending : undefined,
            status: pending.length > 0 ? 'PARTIAL' : status,
            wranglerEquivalent: wranglerCommands,
            instructions: pending.length > 0
              ? `Processed 1 of ${secrets.length} secrets. Call setWorkerSecrets again for remaining ${pending.length} secrets.`
              : status === 'SUCCESS'
              ? `All ${secrets.length} secrets successfully configured for '${workerName}'`
              : status === 'PARTIAL'
              ? `${successfulSecrets.length} of ${secrets.length} secrets configured. ${errors.length} failed.`
              : `Failed to set secrets for '${workerName}'`
          };

          // Return appropriate response based on status
          if (status === 'FAILURE') {
            return {
              content: [{
                type: "text" as const,
                text: `**Error**\n\nFailed to set secrets for '${workerName}'\n\n**Details:**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
              }]
            };
          }

          console.log('[setWorkerSecrets] Operation completed successfully');

          return {
            content: [{
              type: "text" as const,
              text: `**${status === 'SUCCESS' ? 'Success' : 'Partial Success'}**\n\n${result.instructions}\n\n**Result:**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
            }]
          };

        } catch (error) {
          console.error('[setWorkerSecrets] Unexpected error:', error);
          logDeploymentOperation('set_worker_secrets', workerName, props.login, false, {
            error: error instanceof Error ? error.message : 'Unknown error'
          });

          return {
            content: [{
              type: "text" as const,
              text: `**Error**\n\nUnexpected error setting worker secrets\n\n**Details:**\n\`\`\`json\n${JSON.stringify({
                error: error instanceof Error ? error.message : 'Unknown error',
                details: error instanceof Error ? error.stack : undefined
              }, null, 2)}\n\`\`\``
            }]
          };
        }
      }
    );
  }
}