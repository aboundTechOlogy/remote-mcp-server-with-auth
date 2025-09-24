import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Props } from "../types";

export function registerWhoami(server: McpServer, env: Env, props: Props) {
	server.tool(
		"whoami",
		"Debug tool to show the current authenticated user's information from OAuth.",
		{},
		async () => {
			return {
				content: [
					{
						type: "text" as const,
						text: `**Current User Information**\n\n**Login:** ${props.login}\n**Name:** ${props.name}\n**Email:** ${props.email}\n\n**OAuth Access Token:** ${props.accessToken ? 'Present' : 'Missing'}\n\n**Debug Info:** This shows the user context passed through OAuth authentication.`
					}
				]
			};
		}
	);
}