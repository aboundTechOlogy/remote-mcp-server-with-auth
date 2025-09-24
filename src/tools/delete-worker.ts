import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	Props,
	DeleteWorkerSchema
} from "../types";
import { logDeploymentOperation } from "../deployment/validation";
import { CloudflareAPI } from "../deployment/cloudflare-api";

const DEPLOYMENT_USERS = new Set(['aboundTechOlogy']);

export function registerDeleteWorker(server: McpServer, env: Env, props: Props) {
	// Only register this tool for privileged users
	if (DEPLOYMENT_USERS.has(props.login)) {
		server.tool(
			"deleteWorker",
			"Delete a deployed Cloudflare Worker. **DESTRUCTIVE OPERATION** - this permanently removes the worker and cannot be undone. Requires explicit confirmation.",
			DeleteWorkerSchema,
			async ({ name, confirm }) => {
				try {
					// Require explicit confirmation
					if (!confirm) {
						return {
							content: [{
								type: "text" as const,
								text: `**Error**\n\nDeletion requires explicit confirmation. Set 'confirm: true' to delete worker '${name}'. **WARNING: This action cannot be undone.**`
							}]
						};
					}

					// Check for required environment variables
					const accountId = env.CLOUDFLARE_ACCOUNT_ID;
					const apiToken = env.CLOUDFLARE_API_TOKEN;

					if (!accountId || !apiToken) {
						logDeploymentOperation('delete', name, props.login, false, { error: 'Missing Cloudflare credentials' });
						return {
							content: [{
								type: "text" as const,
								text: "**Error**\n\nCloudflare credentials not configured. Please set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables."
							}]
						};
					}

					// Initialize Cloudflare API
					const cfApi = new CloudflareAPI(accountId, apiToken);

					// First, check if the worker exists
					const checkResult = await cfApi.getWorker(name);
					if (!checkResult.success) {
						logDeploymentOperation('delete', name, props.login, false, { error: 'Worker not found' });
						return {
							content: [{
								type: "text" as const,
								text: `**Error**\n\nWorker '${name}' not found. Use 'listWorkers' to see available workers.`
							}]
						};
					}

					const worker = checkResult.result;

					// Delete the worker
					const deleteResult = await cfApi.deleteWorker(name);

					if (!deleteResult.success) {
						const error = deleteResult.errors?.[0]?.message || 'Unknown deletion error';
						logDeploymentOperation('delete', name, props.login, false, { error, cfErrors: deleteResult.errors });
						return {
							content: [{
								type: "text" as const,
								text: `**Error**\n\nFailed to delete worker: ${error}`
							}]
						};
					}

					logDeploymentOperation('delete', name, props.login, true, {
						workerId: worker.id,
						workerCreated: worker.created_on,
						workerModified: worker.modified_on
					});

					const result = {
						deletedWorker: {
							name: worker.name,
							id: worker.id,
							wasCreated: worker.created_on,
							lastModified: worker.modified_on
						},
						deletedBy: `${props.login} (${props.name})`,
						deletedAt: new Date().toISOString(),
						warning: "This action cannot be undone"
					};

					return {
						content: [{
							type: "text" as const,
							text: `**Success**\n\nWorker '${name}' has been permanently deleted\n\n**Result:**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
						}]
					};

				} catch (error) {
					console.error('deleteWorker error:', error);
					logDeploymentOperation('delete', name, props.login, false, { error: error instanceof Error ? error.message : 'Unknown error' });
					return {
						content: [{
							type: "text" as const,
							text: `**Error**\n\nError deleting worker: ${error instanceof Error ? error.message : 'Unknown error'}`
						}]
					};
				}
			}
		);
	}
}