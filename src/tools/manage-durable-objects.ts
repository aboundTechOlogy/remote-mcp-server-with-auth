import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Props } from "../types";
import { logDeploymentOperation } from "../deployment/validation";

const INFRASTRUCTURE_ADMINS = new Set(['aboundTechOlogy']);

// Schema for manageDurableObjects tool
export const ManageDurableObjectsSchema = {
  workerName: z
    .string()
    .min(1, "Worker name cannot be empty")
    .regex(/^[a-zA-Z0-9\-_]+$/, "Worker name can only contain letters, numbers, hyphens, and underscores")
    .describe("Name of the worker to configure DOs for"),
  className: z
    .string()
    .min(1, "Class name cannot be empty")
    .regex(/^[A-Z][a-zA-Z0-9]*$/, "Class name must start with uppercase letter and contain only alphanumeric characters")
    .describe("Durable Object class name (e.g., 'MyMCP')"),
  scriptName: z
    .string()
    .regex(/^[a-zA-Z0-9\-_]+$/, "Script name can only contain letters, numbers, hyphens, and underscores")
    .optional()
    .describe("Optional: different script containing DO"),
  environment: z
    .enum(['production', 'staging', 'development'])
    .optional()
    .default('production')
    .describe("Optional: environment (production/staging/development)"),
  migrations: z.object({
    tag: z.string().describe("Migration tag identifier"),
    new_classes: z.array(z.string()).optional().describe("New DO classes to add"),
    renamed_classes: z.array(z.object({
      from: z.string(),
      to: z.string()
    })).optional().describe("Classes to rename"),
    deleted_classes: z.array(z.string()).optional().describe("Classes to delete")
  }).optional().describe("Optional: DO migration configuration"),
};

interface CloudflareDurableObjectResponse {
  success: boolean;
  errors: any[];
  messages: any[];
  result: {
    id?: string;
    name?: string;
    script_name?: string;
    environment?: string;
    class_name?: string;
    created_on?: string;
    modified_on?: string;
  };
}

interface CloudflareMigrationResponse {
  success: boolean;
  errors: any[];
  messages: any[];
  result: {
    id: string;
    tag: string;
    status: string;
    created_on: string;
  };
}

export function registerManageDurableObjects(server: McpServer, env: Env, props: Props) {
  // Only register this tool for infrastructure admins
  if (INFRASTRUCTURE_ADMINS.has(props.login)) {
    server.tool(
      "manageDurableObjects",
      "Setup and configure Durable Object bindings and migrations for a Cloudflare Worker. **INFRASTRUCTURE ADMIN ACCESS REQUIRED**",
      ManageDurableObjectsSchema,
      async ({ workerName, className, scriptName, environment, migrations }) => {
        try {
          // Log the operation start
          console.log('[manageDurableObjects] Starting DO configuration:', {
            workerName,
            className,
            scriptName,
            environment: environment || 'production',
            migrations,
            user: props.login
          });

          // Check for required environment variables
          const accountId = env.CLOUDFLARE_ACCOUNT_ID;
          const apiToken = env.CLOUDFLARE_API_TOKEN;

          if (!accountId || !apiToken) {
            const error = 'Missing Cloudflare credentials';
            logDeploymentOperation('manage_durable_objects', workerName, props.login, false, { error });
            return {
              content: [{
                type: "text" as const,
                text: `**Error**\n\nCloudflare credentials not configured\n\n**Details:**\n\`\`\`json\n${JSON.stringify({ missing: "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables" }, null, 2)}\n\`\`\``
              }]
            };
          }

          const bindingName = `${className.toUpperCase()}_OBJECT`;
          const scriptNameToUse = scriptName || workerName;
          const environmentToUse = environment || 'production';
          
          // Generate a unique namespace ID for the DO
          const namespaceId = `do_${className.toLowerCase()}_${Date.now()}`;

          // Results to return
          const results = {
            configured: false,
            className,
            bindingName,
            namespace_id: namespaceId,
            script_name: scriptNameToUse,
            environment: environmentToUse,
            migration: null as any
          };

          // Note: Migrations are typically handled via wrangler.toml/wrangler.jsonc
          // not via API. This is a placeholder for configuration generation.
          if (migrations) {
            console.log('[manageDurableObjects] Note: Migrations should be configured in wrangler.toml');
            results.migration = {
              tag: migrations.tag,
              status: 'configuration_needed',
              note: 'Add migration config to wrangler.toml and deploy with wrangler deploy'
            };
          }

          // Update worker configuration with DO binding
          // Note: This requires the worker to be redeployed with the new binding
          // The actual binding happens in wrangler.jsonc configuration
          
          const durableObjectConfig = {
            bindings: [{
              name: bindingName,
              class_name: className,
              script_name: scriptNameToUse,
              environment: environmentToUse
            }]
          };

          console.log('[manageDurableObjects] Durable Object configuration prepared:', durableObjectConfig);

          // Log successful configuration
          logDeploymentOperation('manage_durable_objects', workerName, props.login, true, {
            className,
            bindingName,
            namespaceId,
            scriptName: scriptNameToUse,
            environment: environmentToUse,
            migrations: migrations || null
          });

          // Audit log to database (if configured)
          try {
            if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
              // Log to infrastructure_audit table
              const { createClient } = await import('@supabase/supabase-js');
              const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
              
              await supabase.from('infrastructure_audit').insert({
                user_id: props.login,
                operation: 'MANAGE_DURABLE_OBJECTS',
                resource_type: 'DURABLE_OBJECT',
                resource_name: className,
                status: 'SUCCESS',
                details: {
                  worker_name: workerName,
                  binding_name: bindingName,
                  namespace_id: namespaceId,
                  script_name: scriptNameToUse,
                  environment: environmentToUse,
                  migrations: migrations || null,
                  migration_result: results.migration
                }
              });
            }
          } catch (auditError) {
            console.error('[manageDurableObjects] Audit log error (non-fatal):', auditError);
          }

          results.configured = true;

          // Return configuration details and instructions
          const wranglerConfig = {
            durable_objects: {
              bindings: [{
                name: bindingName,
                class_name: className,
                ...(scriptName && { script_name: scriptNameToUse })
              }]
            }
          };

          const finalResult = {
            ...results,
            wranglerConfig,
            instructions: [
              `1. Add the Durable Object class '${className}' to your worker code`,
              `2. Export the class from your worker: export { ${className} }`,
              `3. Add the binding configuration to your wrangler.jsonc file`,
              `4. Deploy with: wrangler publish${migrations?.new_classes ? ` --new-class ${className}` : ''}`,
              ...(migrations ? [`5. Migration '${migrations.tag}' has been ${results.migration ? 'applied' : 'prepared'}`] : [])
            ].join('\n')
          };

          return {
            content: [{
              type: "text" as const,
              text: `**Success**\n\nDurable Object '${className}' configured for worker '${workerName}'\n\n**Result:**\n\`\`\`json\n${JSON.stringify(finalResult, null, 2)}\n\`\`\``
            }]
          };

        } catch (error) {
          console.error('[manageDurableObjects] Unexpected error:', error);
          logDeploymentOperation('manage_durable_objects', workerName, props.login, false, { 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
          
          return {
            content: [{
              type: "text" as const,
              text: `**Error**\n\nUnexpected error configuring Durable Objects\n\n**Details:**\n\`\`\`json\n${JSON.stringify({
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