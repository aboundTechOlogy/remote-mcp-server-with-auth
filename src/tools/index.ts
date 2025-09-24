import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Props } from "../types";
import { registerListTables } from "./list-tables";
import { registerQueryDatabase } from "./query-database";
import { registerExecuteDatabase } from "./execute-database";
import { registerDeployWorker } from "./deploy-worker";
import { registerListWorkers } from "./list-workers";
import { registerGetWorkerStatus } from "./get-worker-status";
import { registerDeleteWorker } from "./delete-worker";
import { registerWhoami } from "./whoami";
import { registerCreateKVNamespace } from "./create-kv-namespace";
import { registerManageDurableObjects } from "./manage-durable-objects";
import { registerSetWorkerSecrets } from "./set-worker-secrets";
import { registerDeployMCPServer } from "./deploy-mcp-server";

/**
 * Register all MCP tools based on user permissions
 */
export function registerAllTools(server: McpServer, env: Env, props: Props) {
	// Register debug tools (available to all users)
	registerWhoami(server, env, props);

	// Register individual database tools
	registerListTables(server, env, props);
	registerQueryDatabase(server, env, props);
	registerExecuteDatabase(server, env, props);

	// Register deployment tools
	registerDeployWorker(server, env, props);
	registerListWorkers(server, env, props);
	registerGetWorkerStatus(server, env, props);
	registerDeleteWorker(server, env, props);

	// Register infrastructure management tools (Phase 3)
	registerCreateKVNamespace(server, env, props);
	registerManageDurableObjects(server, env, props);
	registerSetWorkerSecrets(server, env, props);
	registerDeployMCPServer(server, env, props);
}