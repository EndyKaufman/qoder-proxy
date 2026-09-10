"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toOpenAIToolCalls = exports.parseToolCallFromText = exports.buildPromptWithTools = exports.buildToolSystemPrompt = void 0;
/**
 * Build a system instruction block describing available tools.
 */
const buildToolSystemPrompt = (tools) => {
    if (!tools || tools.length === 0)
        return '';
    const defs = tools
        .filter((t) => t.type === 'function' && t.function)
        .map((t) => {
        const fn = t.function;
        const params = fn.parameters
            ? JSON.stringify(fn.parameters, null, 2)
            : '{}';
        return `Function: ${fn.name}\nDescription: ${fn.description || 'No description'}\nParameters (JSON Schema): ${params}`;
    })
        .join('\n\n');
    return `You have access to the following functions. When you need to call a function, you MUST respond with ONLY a valid JSON object in this exact format and nothing else:

{"tool_call":{"name":"<function_name>","arguments":<arguments_object>}}

Do NOT include any explanation or text before or after the JSON when calling a tool. Only output the raw JSON object.

If you do not need to call a function, respond normally with plain text.

Available functions:
${defs}`;
};
exports.buildToolSystemPrompt = buildToolSystemPrompt;
/**
 * Inject tool instructions into a messages array by prepending/merging
 * a system message, then convert to prompt string.
 */
const buildPromptWithTools = (messages, tools, messagesToPromptFn) => {
    if (!tools || tools.length === 0) {
        return messagesToPromptFn(messages);
    }
    const toolSystem = (0, exports.buildToolSystemPrompt)(tools);
    const existingSystem = messages.find((m) => m.role === 'system');
    const systemContent = existingSystem
        ? Array.isArray(existingSystem.content)
            ? existingSystem.content
                .filter((p) => p.type === 'text')
                .map((p) => p.text || '')
                .join('')
            : existingSystem.content || ''
        : '';
    const conversation = messages.filter((m) => m.role !== 'system');
    const recent = conversation.slice(-10);
    const extractContent = (msg) => {
        if (Array.isArray(msg.content)) {
            return msg.content
                .filter((p) => p.type === 'text')
                .map((p) => p.text || '')
                .join('');
        }
        if (typeof msg.content === 'string')
            return msg.content;
        return '';
    };
    const parts = [toolSystem];
    if (systemContent.trim())
        parts.push(`System context: ${systemContent.trim()}`);
    for (const msg of recent) {
        const content = extractContent(msg).trim();
        if (!content)
            continue;
        if (msg.role === 'user')
            parts.push(`User: ${content}`);
        else if (msg.role === 'assistant')
            parts.push(`Assistant: ${content}`);
        else if (msg.role === 'tool')
            parts.push(`Tool result: ${content}`);
    }
    return parts.join('\n\n');
};
exports.buildPromptWithTools = buildPromptWithTools;
// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------
const TOOL_CALL_PATTERNS = [
    /^\s*(\{"tool_call"\s*:[\s\S]*\})\s*$/m,
    /```(?:json)?\s*(\{"tool_call"\s*:[\s\S]*?\})\s*```/m,
];
/**
 * Try to extract a tool_call JSON object from model text output.
 */
const parseToolCallFromText = (text) => {
    if (!text || !text.includes('"tool_call"'))
        return null;
    for (const pattern of TOOL_CALL_PATTERNS) {
        const match = text.match(pattern);
        if (!match)
            continue;
        try {
            const parsed = JSON.parse(match[1]);
            if (parsed.tool_call && parsed.tool_call.name) {
                return {
                    name: parsed.tool_call.name,
                    arguments: parsed.tool_call.arguments ?? {},
                };
            }
        }
        catch {
            // Try next pattern
        }
    }
    // Fallback: scan for any JSON blob containing tool_call
    const start = text.indexOf('{"tool_call"');
    if (start === -1)
        return null;
    let depth = 0;
    let end = -1;
    for (let i = start; i < text.length; i++) {
        if (text[i] === '{')
            depth++;
        else if (text[i] === '}') {
            depth--;
            if (depth === 0) {
                end = i + 1;
                break;
            }
        }
    }
    if (end === -1)
        return null;
    try {
        const parsed = JSON.parse(text.slice(start, end));
        if (parsed.tool_call && parsed.tool_call.name) {
            return {
                name: parsed.tool_call.name,
                arguments: parsed.tool_call.arguments ?? {},
            };
        }
    }
    catch {
        return null;
    }
    return null;
};
exports.parseToolCallFromText = parseToolCallFromText;
/**
 * Convert a parsed tool call into OpenAI-format tool_calls array.
 */
const toOpenAIToolCalls = (toolCall, callId) => [
    {
        id: callId,
        type: 'function',
        function: {
            name: toolCall.name,
            arguments: typeof toolCall.arguments === 'string'
                ? toolCall.arguments
                : JSON.stringify(toolCall.arguments),
        },
    },
];
exports.toOpenAIToolCalls = toOpenAIToolCalls;
