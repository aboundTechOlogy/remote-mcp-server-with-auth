import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	Props,
	ListTablesSchema,
	QueryDatabaseSchema,
	ExecuteDatabaseSchema,
	createSuccessResponse
} from "../types";
import { validateSqlQuery, isWriteOperation } from "../database/security";
import { createClient } from '@supabase/supabase-js';

const ALLOWED_USERNAMES = new Set<string>([
    'coleam00',
    'aboundTechOlogy'
]);

export function registerDatabaseTools(server: McpServer, env: Env, props: Props) {
	// Tool 1: List Tables - Available to all authenticated users
	server.tool(
		"listTables",
		"Get a list of all tables in the database along with their column information. Use this first to understand the database structure before querying.",
		ListTablesSchema,
		async () => {
			try {
				// Validate environment variables
				const supabaseUrl = env.SUPABASE_URL;
				const supabaseKey = env.SUPABASE_ANON_KEY;

				console.log('[listTables] Supabase URL exists:', !!supabaseUrl);
				console.log('[listTables] Supabase Key exists:', !!supabaseKey);

				if (!supabaseUrl || !supabaseKey) {
					const missing = [];
					if (!supabaseUrl) missing.push('SUPABASE_URL');
					if (!supabaseKey) missing.push('SUPABASE_ANON_KEY');
					console.error('[listTables] Missing environment variables:', missing.join(', '));
					return {
						content: [{
							type: "text" as const,
							text: `**Error**\n\nSupabase configuration missing. Please set the following environment variables: ${missing.join(', ')}`
						}]
					};
				}

				const supabase = createClient(supabaseUrl, supabaseKey);

				// Use Supabase RPC to get table information from information_schema
				console.log('[listTables] Calling Supabase RPC: get_table_columns');
				const { data: columns, error } = await supabase.rpc('get_table_columns');

				if (error) {
					console.error('[listTables] Supabase RPC error:', error);
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
				console.error('[listTables] Error details:', error);
				console.error('[listTables] Error type:', typeof error);
				if (error instanceof Error) {
					console.error('[listTables] Error message:', error.message);
					console.error('[listTables] Error stack:', error.stack);
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

	// Tool 2: Query Database - Available to all authenticated users (read-only)
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

				console.log('[queryDatabase] Supabase URL exists:', !!supabaseUrl);
				console.log('[queryDatabase] Supabase Key exists:', !!supabaseKey);

				if (!supabaseUrl || !supabaseKey) {
					const missing = [];
					if (!supabaseUrl) missing.push('SUPABASE_URL');
					if (!supabaseKey) missing.push('SUPABASE_ANON_KEY');
					console.error('[queryDatabase] Missing environment variables:', missing.join(', '));
					return {
						content: [{
							type: "text" as const,
							text: `**Error**\n\nSupabase configuration missing. Please set the following environment variables: ${missing.join(', ')}`
						}]
					};
				}

				const supabase = createClient(supabaseUrl, supabaseKey);

				// Execute the SQL query using Supabase RPC
				console.log('[queryDatabase] Executing SQL query via Supabase RPC:', sql);
				const { data: results, error } = await supabase.rpc('execute_sql', { query: sql });

				if (error) {
					console.error('[queryDatabase] Supabase RPC error:', error);
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
				console.error('[queryDatabase] Error details:', error);
				console.error('[queryDatabase] Error type:', typeof error);
				if (error instanceof Error) {
					console.error('[queryDatabase] Error message:', error.message);
					console.error('[queryDatabase] Error stack:', error.stack);
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

	// Tool 3: Execute Database - Only available to privileged users (write operations)
	if (ALLOWED_USERNAMES.has(props.login)) {
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

					console.log('[executeDatabase] Supabase URL exists:', !!supabaseUrl);
					console.log('[executeDatabase] Supabase Key exists:', !!supabaseKey);

					if (!supabaseUrl || !supabaseKey) {
						const missing = [];
						if (!supabaseUrl) missing.push('SUPABASE_URL');
						if (!supabaseKey) missing.push('SUPABASE_ANON_KEY');
						console.error('[executeDatabase] Missing environment variables:', missing.join(', '));
						return {
							content: [{
								type: "text" as const,
								text: `**Error**\n\nSupabase configuration missing. Please set the following environment variables: ${missing.join(', ')}`
							}]
						};
					}

					const supabase = createClient(supabaseUrl, supabaseKey);

					// Execute the SQL statement using Supabase RPC
					console.log('[executeDatabase] Executing SQL statement via Supabase RPC:', sql);
					const { data: results, error } = await supabase.rpc('execute_sql', { query: sql });

					if (error) {
						console.error('[executeDatabase] Supabase RPC error:', error);
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
					console.error('[executeDatabase] Error details:', error);
					console.error('[executeDatabase] Error type:', typeof error);
					if (error instanceof Error) {
						console.error('[executeDatabase] Error message:', error.message);
						console.error('[executeDatabase] Error stack:', error.stack);
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
