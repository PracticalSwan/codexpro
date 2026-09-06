import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

export interface McpRuntimeCapabilities {
  sdkLine: "v1" | "v2";
  protocolEra: "2025" | "2026";
  supportsInputRequired: boolean;
  supportsTaskExtension: boolean;
}

export type McpToolHandler = (args: unknown) => Promise<unknown> | unknown;

export function mcpRuntimeCapabilities(): McpRuntimeCapabilities {
  return {
    sdkLine: "v1",
    protocolEra: "2025",
    supportsInputRequired: false,
    supportsTaskExtension: false
  };
}

export function registerToolCompat(
  server: unknown,
  name: string,
  options: Record<string, unknown>,
  handler: McpToolHandler
): void {
  const securitySchemes = [{ type: "noauth" }];
  const fullOptions: Record<string, unknown> = {
    securitySchemes,
    ...options,
    _meta: {
      securitySchemes,
      ...(options._meta as Record<string, unknown> | undefined)
    }
  };

  const sdkServer = server as {
    registerTool?: (toolName: string, toolOptions: Record<string, unknown>, toolHandler: McpToolHandler) => void;
    tool?: (toolName: string, description: string, inputSchema: unknown, toolHandler: McpToolHandler) => void;
  };

  if (typeof sdkServer.registerTool === "function") {
    sdkServer.registerTool(name, fullOptions, handler);
    return;
  }
  if (typeof sdkServer.tool === "function") {
    sdkServer.tool(name, String(fullOptions.description ?? name), fullOptions.inputSchema ?? {}, handler);
    return;
  }
  throw new Error("Unsupported MCP SDK: McpServer has neither registerTool nor tool.");
}

export function createStdioTransportCompat(): StdioServerTransport {
  return new StdioServerTransport();
}

export function createHttpTransportCompat(
  options: Record<string, unknown>
): StreamableHTTPServerTransport {
  return new StreamableHTTPServerTransport(options as any);
}

export function isInitializeRequestCompat(value: unknown): boolean {
  return isInitializeRequest(value);
}
