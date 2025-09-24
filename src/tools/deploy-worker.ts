import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	Props,
	DeployWorkerSchema
} from "../types";
import { validateWorkerCode, logDeploymentOperation } from "../deployment/validation";
import { CloudflareAPI } from "../deployment/cloudflare-api";

const DEPLOYMENT_USERS = new Set(['aboundTechOlogy']);

export function registerDeployWorker(server: McpServer, env: Env, props: Props) {
	// Only register this tool for privileged users
	if (DEPLOYMENT_USERS.has(props.login)) {
		server.tool(
			"deployWorker",
			"Deploy TypeScript/JavaScript code to Cloudflare Workers. This tool validates code for security issues and deploys to Cloudflare. **USE WITH CAUTION** - this creates live worker services.",
			DeployWorkerSchema,
			async ({ name, code, description }) => {
				try {
					// Validate the worker code for security issues
					const validation = validateWorkerCode(code);
					if (!validation.isValid) {
						logDeploymentOperation('deploy', name, props.login, false, { error: validation.error });
						return {
							content: [{
								type: "text" as const,
								text: `**Error**\n\nCode validation failed: ${validation.error}`
							}]
						};
					}

					// Check for required environment variables
					const accountId = env.CLOUDFLARE_ACCOUNT_ID;
					const apiToken = env.CLOUDFLARE_API_TOKEN;

					if (!accountId || !apiToken) {
						logDeploymentOperation('deploy', name, props.login, false, { error: 'Missing Cloudflare credentials' });
						return {
							content: [{
								type: "text" as const,
								text: "**Error**\n\nCloudflare credentials not configured. Please set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables."
							}]
						};
					}

					// Initialize Cloudflare API
					const cfApi = new CloudflareAPI(accountId, apiToken);

					// Deploy the worker
					const result = await cfApi.deployWorker(name, code);

					if (!result.success) {
						const error = result.errors?.[0]?.message || 'Unknown deployment error';
						logDeploymentOperation('deploy', name, props.login, false, { error, cfErrors: result.errors });
						return {
							content: [{
								type: "text" as const,
								text: `**Error**\n\nDeployment failed: ${error}`
							}]
						};
					}

					logDeploymentOperation('deploy', name, props.login, true, {
						description,
						codeLength: code.length,
						workerId: result.result?.id
					});

					const deployResult = {
						workerName: name,
						workerId: result.result?.id,
						createdOn: result.result?.created_on,
						modifiedOn: result.result?.modified_on,
						description,
						deployedBy: `${props.login} (${props.name})`,
						codeSize: `${Math.round(code.length / 1024)}KB`
					};

					return {
						content: [{
							type: "text" as const,
							text: `**Success**\n\nWorker '${name}' deployed successfully\n\n**Result:**\n\`\`\`json\n${JSON.stringify(deployResult, null, 2)}\n\`\`\``
						}]
					};

				} catch (error) {
					console.error('deployWorker error:', error);
					logDeploymentOperation('deploy', name, props.login, false, { error: error instanceof Error ? error.message : 'Unknown error' });
					return {
						content: [{
							type: "text" as const,
							text: `**Error**\n\nDeployment error: ${error instanceof Error ? error.message : 'Unknown error'}`
						}]
					};
				}
			}
		);
	}
}