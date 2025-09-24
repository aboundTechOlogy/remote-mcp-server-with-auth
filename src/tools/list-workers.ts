import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	Props,
	ListWorkersSchema
} from "../types";
import { logDeploymentOperation } from "../deployment/validation";
import { CloudflareAPI } from "../deployment/cloudflare-api";

const DEPLOYMENT_USERS = new Set(['aboundTechOlogy']);

export function registerListWorkers(server: McpServer, env: Env, props: Props) {
	// Only register this tool for privileged users
	if (DEPLOYMENT_USERS.has(props.login)) {
		server.tool(
			"listWorkers",
			"List all deployed Cloudflare Workers in your account. Shows worker names, creation dates, and basic metadata.",
			ListWorkersSchema,
			async () => {
				try {
					// Check for required environment variables
					const accountId = env.CLOUDFLARE_ACCOUNT_ID;
					const apiToken = env.CLOUDFLARE_API_TOKEN;

					if (!accountId || !apiToken) {
						logDeploymentOperation('list', 'all', props.login, false, { error: 'Missing Cloudflare credentials' });
						return {
							content: [{
								type: "text" as const,
								text: "**Error**\n\nCloudflare credentials not configured. Please set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables."
							}]
						};
					}

					// Initialize Cloudflare API
					const cfApi = new CloudflareAPI(accountId, apiToken);

					// List all workers
					const result = await cfApi.listWorkers();

					if (!result.success) {
						const error = result.errors?.[0]?.message || 'Unknown error listing workers';
						logDeploymentOperation('list', 'all', props.login, false, { error, cfErrors: result.errors });
						return {
							content: [{
								type: "text" as const,
								text: `**Error**\n\nFailed to list workers: ${error}`
							}]
						};
					}

					const workers = result.result || [];
					logDeploymentOperation('list', 'all', props.login, true, { workerCount: workers.length });

					if (workers.length === 0) {
						return {
							content: [
								{
									type: "text" as const,
									text: "**No Workers Found**\n\nNo Cloudflare Workers are currently deployed in your account.\n\nUse the `deployWorker` tool to deploy your first worker."
								}
							]
						};
					}

					// Format worker information
					const workersInfo = workers.map(worker => ({
						name: worker.name,
						id: worker.id,
						created: worker.created_on,
						modified: worker.modified_on,
						environment: worker.environment || 'production',
						usageModel: worker.usage_model || 'bundled'
					}));

					return {
						content: [
							{
								type: "text" as const,
								text: `**Deployed Workers (${workers.length})**\n\n${JSON.stringify(workersInfo, null, 2)}\n\n**Total workers:** ${workers.length}\n\n**Note:** Use \`getWorkerStatus\` to check individual worker health, or \`deleteWorker\` to remove a worker.`
							}
						]
					};

				} catch (error) {
					console.error('listWorkers error:', error);
					logDeploymentOperation('list', 'all', props.login, false, { error: error instanceof Error ? error.message : 'Unknown error' });
					return {
						content: [{
							type: "text" as const,
							text: `**Error**\n\nError listing workers: ${error instanceof Error ? error.message : 'Unknown error'}`
						}]
					};
				}
			}
		);
	}
}