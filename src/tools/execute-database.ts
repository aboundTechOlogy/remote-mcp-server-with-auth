import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	Props,
	ExecuteDatabaseSchema
} from "../types";
import { validateSqlQuery, isWriteOperation } from "../database/security";
import { createClient } from '@supabase/supabase-js';

const DATABASE_WRITE_USERS = new Set(['aboundTechOlogy']);

export function registerExecuteDatabase(server: McpServer, env: Env, props: Props) {
	// Only register this tool for privileged users
	if (DATABASE_WRITE_USERS.has(props.login)) {
		server.tool(
			"executeDatabase",
			"Execute any SQL statement against the PostgreSQL database, including INSERT, UPDATE, DELETE, and DDL operations. This tool is restricted to specific GitHub users and can perform write transactions. **USE WITH CAUTION** - this can modify or delete data.",
			ExecuteDatabaseSchema,
			async ({ sql }) => {
				try {
					// Validate the SQL query
					const validation = validateSqlQuery(sql);
					if (!validation.isValid) {
						return {
							content: [{
								type: "text" as const,
								text: `**Error**\n\nInvalid SQL statement: ${validation.error}`
							}]
						};
					}

					// Validate environment variables
					const supabaseUrl = env.SUPABASE_URL;
					const supabaseKey = env.SUPABASE_ANON_KEY;

					console.log('Supabase URL exists:', !!supabaseUrl);
					console.log('Supabase Key exists:', !!supabaseKey);

					if (!supabaseUrl || !supabaseKey) {
						const missing = [];
						if (!supabaseUrl) missing.push('SUPABASE_URL');
						if (!supabaseKey) missing.push('SUPABASE_ANON_KEY');
						console.error('Missing environment variables:', missing.join(', '));
						return {
							content: [{
								type: "text" as const,
								text: `**Error**\n\nSupabase configuration missing. Please set the following environment variables: ${missing.join(', ')}`
							}]
						};
					}

					const supabase = createClient(supabaseUrl, supabaseKey);

					// Execute the SQL statement using Supabase RPC
					console.log('Executing SQL statement via Supabase RPC:', sql);
					const { data: results, error } = await supabase.rpc('execute_sql', { query: sql });

					if (error) {
						console.error('Supabase RPC error:', error);
						throw error;
					}

					const isWrite = isWriteOperation(sql);
					const operationType = isWrite ? "Write Operation" : "Read Operation";

					// Log the operation for audit purposes
					console.log(`Database ${operationType.toLowerCase()} executed by ${props.login} (${props.name}): ${sql}`);

					return {
						content: [
							{
								type: "text" as const,
								text: `**${operationType} Executed Successfully**\n\`\`\`sql\n${sql}\n\`\`\`\n\n**Results:**\n\`\`\`json\n${JSON.stringify(results, null, 2)}\n\`\`\`\n\n${isWrite ? '**⚠️ Database was modified**' : `**Rows returned:** ${Array.isArray(results) ? results.length : 1}`}\n\n**Executed by:** ${props.login} (${props.name})`
							}
						]
					};
				} catch (error) {
					console.error('executeDatabase error details:', error);
					console.error('Error type:', typeof error);
					if (error instanceof Error) {
						console.error('Error message:', error.message);
						console.error('Error stack:', error.stack);
					}
					const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
					return {
						content: [{
							type: "text" as const,
							text: `**Error**\n\nDatabase execution error: ${errorMessage}`
						}]
					};
				}
			}
		);
	}
}