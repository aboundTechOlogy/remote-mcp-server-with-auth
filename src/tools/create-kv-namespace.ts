import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Props } from "../types";
import { logDeploymentOperation } from "../deployment/validation";

const INFRASTRUCTURE_ADMINS = new Set(['aboundTechOlogy']);

// Schema for createKVNamespace tool
export const CreateKVNamespaceSchema = {
  name: z
    .string()
    .min(1, "KV namespace name cannot be empty")
    .regex(/^[A-Z][A-Z0-9_]*$/, "KV namespace name must start with uppercase letter and contain only uppercase letters, numbers, and underscores")
    .describe("KV namespace binding name (e.g., 'OAUTH_KV', 'CACHE_KV')"),
  title: z
    .string()
    .min(1, "Title cannot be empty")
    .describe("Human-readable title for the namespace"),
  workerName: z
    .string()
    .regex(/^[a-zA-Z0-9\-_]+$/, "Worker name can only contain letters, numbers, hyphens, and underscores")
    .optional()
    .describe("Optional: Worker to bind this namespace to"),
};

interface CloudflareKVNamespaceResponse {
  success: boolean;
  errors: any[];
  messages: any[];
  result: {
    id: string;
    title: string;
    supports_url_encoding: boolean;
  };
}

export function registerCreateKVNamespace(server: McpServer, env: Env, props: Props) {
  // Only register this tool for infrastructure admins
  if (INFRASTRUCTURE_ADMINS.has(props.login)) {
    server.tool(
      "createKVNamespace",
      "Create a new Cloudflare KV namespace. This tool creates KV namespaces programmatically via the Cloudflare API and returns the namespace ID for binding configuration. **INFRASTRUCTURE ADMIN ACCESS REQUIRED**",
      CreateKVNamespaceSchema,
      async ({ name, title, workerName }) => {
        try {
          // Log the operation start
          console.log('[createKVNamespace] Starting KV namespace creation:', {
            name,
            title,
            workerName,
            user: props.login
          });

          // Check for required environment variables
          const accountId = env.CLOUDFLARE_ACCOUNT_ID;
          const apiToken = env.CLOUDFLARE_API_TOKEN;

          if (!accountId || !apiToken) {
            const error = 'Missing Cloudflare credentials';
            logDeploymentOperation('create_kv_namespace', name, props.login, false, { error });
            return {
              content: [{
                type: "text" as const,
                text: `**Error**\n\nCloudflare credentials not configured\n\n**Details:**\n\`\`\`json\n${JSON.stringify({ missing: "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables" }, null, 2)}\n\`\`\``
              }]
            };
          }

          // Create KV namespace via Cloudflare API v4
          const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces`;
          
          console.log('[createKVNamespace] Calling Cloudflare API:', url);
          
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title })
          });

          const data = await response.json() as CloudflareKVNamespaceResponse;

          if (!data.success) {
            const error = data.errors?.[0]?.message || 'Unknown error creating KV namespace';
            console.error('[createKVNamespace] Cloudflare API error:', data.errors);
            logDeploymentOperation('create_kv_namespace', name, props.login, false, { 
              error,
              cfErrors: data.errors 
            });
            return {
              content: [{
                type: "text" as const,
                text: `**Error**\n\nFailed to create KV namespace: ${error}\n\n**Details:**\n\`\`\`json\n${JSON.stringify(data.errors, null, 2)}\n\`\`\``
              }]
            };
          }

          // Log successful creation
          logDeploymentOperation('create_kv_namespace', name, props.login, true, {
            namespaceId: data.result.id,
            title: data.result.title,
            workerName
          });

          // If workerName is provided, we would update the worker's wrangler config
          // This would require additional implementation to modify the worker's configuration
          if (workerName) {
            console.log('[createKVNamespace] Note: Automatic worker binding not yet implemented for:', workerName);
            // TODO: Implement worker configuration update via Cloudflare API
            // This would involve fetching the worker's current script and bindings,
            // then redeploying with the new KV namespace binding
          }

          // Audit log to database (if configured)
          try {
            if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
              // Log to infrastructure_audit table
              const { createClient } = await import('@supabase/supabase-js');
              const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
              
              await supabase.from('infrastructure_audit').insert({
                user_id: props.login,
                operation: 'CREATE_KV_NAMESPACE',
                resource_type: 'KV_NAMESPACE',
                resource_name: name,
                status: 'SUCCESS',
                details: {
                  namespace_id: data.result.id,
                  title: data.result.title,
                  worker_name: workerName || null
                }
              });
            }
          } catch (auditError) {
            console.error('[createKVNamespace] Audit log error (non-fatal):', auditError);
          }

          // Return namespace details and binding configuration
          const result = {
            id: data.result.id,
            name,
            title: data.result.title,
            created: true,
            bindingConfig: {
              binding: name,
              id: data.result.id,
              comment: `Add this to your wrangler.jsonc kv_namespaces array`
            },
            wranglerConfig: {
              kv_namespaces: [{
                binding: name,
                id: data.result.id
              }]
            },
            instructions: workerName 
              ? `KV namespace created successfully. To bind it to worker '${workerName}', add the binding config to wrangler.jsonc`
              : "KV namespace created successfully. Add the binding config to your wrangler.jsonc file."
          };

          return {
            content: [{
              type: "text" as const,
              text: `**Success**\n\nKV namespace '${name}' created successfully\n\n**Result:**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
            }]
          };

        } catch (error) {
          console.error('[createKVNamespace] Unexpected error:', error);
          logDeploymentOperation('create_kv_namespace', name, props.login, false, { 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
          
          return {
            content: [{
              type: "text" as const,
              text: `**Error**\n\nUnexpected error creating KV namespace\n\n**Details:**\n\`\`\`json\n${JSON.stringify({
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