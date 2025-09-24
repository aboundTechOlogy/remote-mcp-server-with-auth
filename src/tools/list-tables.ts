import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	Props,
	ListTablesSchema
} from "../types";
import { createClient } from '@supabase/supabase-js';

export function registerListTables(server: McpServer, env: Env, props: Props) {
	server.tool(
		"listTables",
		"Get a list of all tables in the database along with their column information. Use this first to understand the database structure before querying.",
		ListTablesSchema,
		async () => {
			try {
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

				// Use Supabase RPC to get table information from information_schema
				console.log('Calling Supabase RPC: get_table_columns');
				const { data: columns, error } = await supabase.rpc('get_table_columns');

				if (error) {
					console.error('Supabase RPC error:', error);
					throw error;
				}

				if (!columns || !Array.isArray(columns)) {
					return {
						content: [{
							type: "text" as const,
							text: "**Error**\n\nNo table information available or unexpected response format."
						}]
					};
				}

				// Group columns by table
				const tableMap = new Map();
				for (const col of columns) {
					if (!tableMap.has(col.table_name)) {
						tableMap.set(col.table_name, {
							name: col.table_name,
							schema: 'public',
							columns: []
						});
					}
					tableMap.get(col.table_name).columns.push({
						name: col.column_name,
						type: col.data_type,
						nullable: col.is_nullable === 'YES',
						default: col.column_default
					});
				}

				const tableInfo = Array.from(tableMap.values());

				return {
					content: [
						{
							type: "text" as const,
							text: `**Database Tables and Schema**\n\n${JSON.stringify(tableInfo, null, 2)}\n\n**Total tables found:** ${tableInfo.length}\n\n**Note:** Use the \`queryDatabase\` tool to run SELECT queries, or \`executeDatabase\` tool for write operations (if you have write access).`
						}
					]
				};
			} catch (error) {
				console.error('listTables error details:', error);
				console.error('Error type:', typeof error);
				if (error instanceof Error) {
					console.error('Error message:', error.message);
					console.error('Error stack:', error.stack);
				}
				const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
				return {
					content: [{
						type: "text" as const,
						text: `**Error**\n\nError retrieving database schema: ${errorMessage}`
					}]
				};
			}
		}
	);
}