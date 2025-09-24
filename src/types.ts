import { z } from "zod";
import type { AuthRequest, OAuthHelpers, ClientInfo } from "@cloudflare/workers-oauth-provider";

// User context passed through OAuth
export type Props = {
  login: string;
  name: string;
  email: string;
  accessToken: string;
};

// Extended environment with OAuth provider
export type ExtendedEnv = Env & { OAUTH_PROVIDER: OAuthHelpers };

// OAuth URL construction parameters
export interface UpstreamAuthorizeParams {
  upstream_url: string;
  client_id: string;
  scope: string;
  redirect_uri: string;
  state?: string;
}

// OAuth token exchange parameters
export interface UpstreamTokenParams {
  code: string | undefined;
  upstream_url: string;
  client_secret: string;
  redirect_uri: string;
  client_id: string;
}

// Approval dialog configuration
export interface ApprovalDialogOptions {
  client: ClientInfo | null;
  server: {
    name: string;
    logo?: string;
    description?: string;
  };
  state: Record<string, any>;
  cookieName?: string;
  cookieSecret?: string | Uint8Array;
  cookieDomain?: string;
  cookiePath?: string;
  cookieMaxAge?: number;
}

// Result of parsing approval form
export interface ParsedApprovalResult {
  state: any;
  headers: Record<string, string>;
}

// MCP tool schemas using Zod
export const ListTablesSchema = {};

export const QueryDatabaseSchema = {
  sql: z
    .string()
    .min(1, "SQL query cannot be empty")
    .describe("SQL query to execute (SELECT queries only)"),
};

export const ExecuteDatabaseSchema = {
  sql: z
    .string()
    .min(1, "SQL command cannot be empty")
    .describe("SQL command to execute (INSERT, UPDATE, DELETE, CREATE, etc.)"),
};

// Deployment tool schemas
export const DeployWorkerSchema = {
  name: z
    .string()
    .min(1, "Worker name cannot be empty")
    .regex(/^[a-zA-Z0-9\-_]+$/, "Worker name can only contain letters, numbers, hyphens, and underscores")
    .describe("Name of the worker to deploy"),
  code: z
    .string()
    .min(1, "Worker code cannot be empty")
    .describe("TypeScript/JavaScript code for the worker"),
  description: z
    .string()
    .optional()
    .describe("Optional description of the worker"),
};

export const ListWorkersSchema = {};

export const GetWorkerStatusSchema = {
  name: z
    .string()
    .min(1, "Worker name cannot be empty")
    .describe("Name of the worker to check status for"),
};

export const DeleteWorkerSchema = {
  name: z
    .string()
    .min(1, "Worker name cannot be empty")
    .describe("Name of the worker to delete"),
  confirm: z
    .boolean()
    .default(false)
    .describe("Confirmation flag - must be true to delete the worker"),
};

// MCP response types
export interface McpTextContent {
  type: "text";
  text: string;
  isError?: boolean;
}

export interface McpResponse {
  content: McpTextContent[];
}

// Standard response creators
export function createSuccessResponse(message: string, data?: any): McpResponse {
  let text = `**Success**\n\n${message}`;
  if (data !== undefined) {
    text += `\n\n**Result:**\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
  }
  return {
    content: [{
      type: "text",
      text,
    }],
  };
}

export function createErrorResponse(message: string, details?: any): McpResponse {
  let text = `**Error**\n\n${message}`;
  if (details !== undefined) {
    text += `\n\n**Details:**\n\`\`\`json\n${JSON.stringify(details, null, 2)}\n\`\`\``;
  }
  return {
    content: [{
      type: "text",
      text,
      isError: true,
    }],
  };
}

// Database operation result type
export interface DatabaseOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  duration?: number;
}

// SQL validation result
export interface SqlValidationResult {
  isValid: boolean;
  error?: string;
}

// Re-export external types that are used throughout
export type { AuthRequest, OAuthHelpers, ClientInfo };