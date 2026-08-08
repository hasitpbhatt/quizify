export interface AgentCitation {
    title: string;
    url?: string;
    description?: string;
}
export interface AgentImage {
    fileId: string;
    fileName?: string;
    fileType?: string;
    mime: string;
    base64: string;
}
export interface AgentToolResult {
    name: string;
    code?: string;
    codeOutput?: string;
    result?: unknown;
}
export interface AgentNormalized {
    conversationId: string;
    text: string;
    citations: AgentCitation[];
    toolResults: AgentToolResult[];
    images: AgentImage[];
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        connectorTokens?: number;
    };
}
export interface AgentRequestBody {
    conversationId?: string;
    model?: string;
    instructions?: string;
    tools?: Array<{
        type: string;
        tool_configuration?: unknown;
    }>;
    inputs: Array<{
        role: string;
        content: unknown;
    }>;
    completionArgs?: Record<string, unknown>;
    downloadImages?: boolean;
}
export declare function handleAgentsRequest(jsonBody: AgentRequestBody, apiKey: string): Promise<Response>;
