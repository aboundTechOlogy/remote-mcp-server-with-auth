import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	Props,
	QueryDatabaseSchema
} from "../types";
import { validateSqlQuery, isWriteOperation } from "../database/security";
import { createClient } from '@supabase/supabase-js';

export function registerQueryDatabase(server: McpServer, env: Env, props: Props) {
	server.tool(
		"queryDatabase",
		"Execute a read-only SQL query against the PostgreSQL database. This tool only allows SELECT statements and other read operations. All authenticated users can use this tool.",
		QueryDatabaseSchema,
		async ({ sql }) => {
			try {
				// Validate the SQL query
				const validation = validateSqlQuery(sql);
				if (!validation.isValid) {
					return {
						content: [{
							type: "text" as const,
							text: `**Error**\n\nInvalid SQL query: ${validation.error}`
						}]
					};
				}

				// Check if it's a write operation
				if (isWriteOperation(sql)) {
					return {
						content: [{
							type: "text" as const,
							text: "**Error**\n\nWrite operations are not allowed with this tool. Use the `executeDatabase` tool if you have write permissions (requires special GitHub username access)."
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

				// Execute the SQL query using Supabase RPC
				console.log('Executing SQL query via Supabase RPC:', sql);
				const { data: results, error } = await supabase.rpc('execute_sql', { query: sql });

				if (error) {
					console.error('Supabase RPC error:', error);
					throw error;
				}

				return {
					content: [
						{
							type: "text" as const,
							text: `**Query Results**\n\`\`\`sql\n${sql}\n\`\`\`\n\n**Results:**\n\`\`\`json\n${JSON.stringify(results, null, 2)}\n\`\`\`\n\n**Rows returned:** ${Array.isArray(results) ? results.length : 1}`
						}
					]
				};
			} catch (error) {
				console.error('queryDatabase error details:', error);
				console.error('Error type:', typeof error);
				if (error instanceof Error) {
					console.error('Error message:', error.message);
					console.error('Error stack:', error.stack);
				}
				const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
				return {
					content: [{
						type: "text" as const,
						text: `**Error**\n\nDatabase query error: ${errorMessage}`
					}]
				};
			}
		}
	);
}