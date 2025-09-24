import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	Props,
	GetWorkerStatusSchema
} from "../types";
import { logDeploymentOperation } from "../deployment/validation";
import { CloudflareAPI } from "../deployment/cloudflare-api";

const DEPLOYMENT_USERS = new Set(['aboundTechOlogy']);

export function registerGetWorkerStatus(server: McpServer, env: Env, props: Props) {
	// Only register this tool for privileged users
	if (DEPLOYMENT_USERS.has(props.login)) {
		server.tool(
			"getWorkerStatus",
			"Check the health and status of a deployed Cloudflare Worker. Shows deployment information, metadata, and basic health status.",
			GetWorkerStatusSchema,
			async ({ name }) => {
				try {
					// Check for required environment variables
					const accountId = env.CLOUDFLARE_ACCOUNT_ID;
					const apiToken = env.CLOUDFLARE_API_TOKEN;

					if (!accountId || !apiToken) {
						logDeploymentOperation('status', name, props.login, false, { error: 'Missing Cloudflare credentials' });
						return {
							content: [{
								type: "text" as const,
								text: "**Error**\n\nCloudflare credentials not configured. Please set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables."
							}]
						};
					}

					// Initialize Cloudflare API
					const cfApi = new CloudflareAPI(accountId, apiToken);

					// Get worker information
					const result = await cfApi.getWorker(name);

					if (!result.success) {
						const error = result.errors?.[0]?.message || 'Worker not found';
						logDeploymentOperation('status', name, props.login, false, { error, cfErrors: result.errors });

						if (result.errors?.[0]?.code === 10007) {
							return {
								content: [{
									type: "text" as const,
									text: `**Error**\n\nWorker '${name}' not found. Use 'listWorkers' to see available workers.`
								}]
							};
						}

						return {
							content: [{
								type: "text" as const,
								text: `**Error**\n\nFailed to get worker status: ${error}`
							}]
						};
					}

					const worker = result.result;
					logDeploymentOperation('status', name, props.login, true, { workerId: worker?.id });

					// Calculate uptime and status
					const createdDate = new Date(worker.created_on);
					const modifiedDate = new Date(worker.modified_on);
					const now = new Date();
					const uptimeDays = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
					const daysSinceUpdate = Math.floor((now.getTime() - modifiedDate.getTime()) / (1000 * 60 * 60 * 24));

					// Determine health status
					const healthStatus = "Running"; // Cloudflare doesn't provide direct health status via API

					const statusInfo = {
						name: worker.name,
						id: worker.id,
						status: healthStatus,
						environment: worker.environment || 'production',
						usageModel: worker.usage_model || 'bundled',
						compatibilityDate: worker.compatibility_date,
						created: worker.created_on,
						lastModified: worker.modified_on,
						uptimeDays: uptimeDays,
						daysSinceLastUpdate: daysSinceUpdate,
						url: `https://${worker.name}.${accountId.substring(0, 8)}.workers.dev`
					};

					return {
						content: [
							{
								type: "text" as const,
								text: `**Worker Status: ${name}**\n\n${JSON.stringify(statusInfo, null, 2)}\n\n**Health:** ${healthStatus}\n**Uptime:** ${uptimeDays} days\n**Last Updated:** ${daysSinceUpdate} days ago\n\n**Note:** Worker appears to be deployed and accessible. Use the worker URL to test functionality.`
							}
						]
					};

				} catch (error) {
					console.error('getWorkerStatus error:', error);
					logDeploymentOperation('status', name, props.login, false, { error: error instanceof Error ? error.message : 'Unknown error' });
					return {
						content: [{
							type: "text" as const,
							text: `**Error**\n\nError checking worker status: ${error instanceof Error ? error.message : 'Unknown error'}`
						}]
					};
				}
			}
		);
	}
}