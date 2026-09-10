"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFullCompletionResponse = exports.buildCompletionStreamChunk = exports.buildFullChatResponseWithTools = exports.buildToolCallStreamChunk = exports.extractToolCalls = exports.buildFullChatResponse = exports.buildDoneChunk = exports.buildStreamChunk = exports.messagesToPrompt = exports.extractTextContent = exports.newId = void 0;
const uuid_1 = require("uuid");
// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------
/** Generate a prefixed ID like `chatcmpl-abc123...` */
const newId = (prefix) => `${prefix}-${(0, uuid_1.v4)().replace(/-/g, '')}`;
exports.newId = newId;
/**
 * Extract plain text from a qodercli message object.
 * Handles both array-of-parts and plain string content gracefully.
 */
const extractTextContent = (message) => {
    if (!message)
        return '';
    if (Array.isArray(message.content)) {
        return message.content
            .map((part) => {
            if (!part)
                return '';
            if (typeof part === 'string')
                return part;
            if (typeof part.text === 'string')
                return part.text;
            if (typeof part.value === 'string')
                return part.value;
            return '';
        })
            .join('');
    }
    if (typeof message.content === 'string')
        return message.content;
    return '';
};
exports.extractTextContent = extractTextContent;
/**
 * Convert an OpenAI messages array into a single prompt string for qodercli.
 */
const messagesToPrompt = (messages) => {
    if (!messages || messages.length === 0)
        return 'Hello';
    const systemMsg = messages.find((m) => m.role === 'system');
    const conversation = messages.filter((m) => m.role !== 'system');
    const recent = conversation.slice(-10);
    const extractContent = (msg) => {
        if (Array.isArray(msg.content)) {
            return msg.content
                .filter((p) => p.type === 'text')
                .map((p) => p.text || '')
                .join('');
        }
        return msg.content || '';
    };
    const parts = [];
    if (systemMsg) {
        const sysContent = extractContent(systemMsg);
        if (sysContent.trim())
            parts.push(`System: ${sysContent.trim()}`);
    }
    for (const msg of recent) {
        const content = extractContent(msg).trim();
        if (!content)
            continue;
        if (msg.role === 'user')
            parts.push(`User: ${content}`);
        else if (msg.role === 'assistant')
            parts.push(`Assistant: ${content}`);
    }
    return parts.join('\n\n') || 'Hello';
};
exports.messagesToPrompt = messagesToPrompt;
// ---------------------------------------------------------------------------
// Response builders — chat completions
// ---------------------------------------------------------------------------
const buildStreamChunk = (content, model, id) => ({
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
        { index: 0, delta: { role: 'assistant', content }, finish_reason: null },
    ],
});
exports.buildStreamChunk = buildStreamChunk;
const buildDoneChunk = (model, id, finishReason = 'stop') => ({
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
});
exports.buildDoneChunk = buildDoneChunk;
const buildFullChatResponse = (content, model, finishReason, id) => ({
    id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
        {
            index: 0,
            message: { role: 'assistant', content },
            finish_reason: finishReason || 'stop',
        },
    ],
    usage: { prompt_tokens: null, completion_tokens: null, total_tokens: null },
});
exports.buildFullChatResponse = buildFullChatResponse;
/**
 * Extracts tool calls from qodercli message content
 */
const extractToolCalls = (content) => {
    if (!Array.isArray(content))
        return null;
    const toolCalls = [];
    for (const item of content) {
        const fc = item;
        if (fc.type === 'function' && fc.id && fc.name && fc.input) {
            toolCalls.push({
                id: fc.id,
                type: 'function',
                function: {
                    name: fc.name,
                    arguments: fc.input,
                },
            });
        }
    }
    return toolCalls.length > 0 ? toolCalls : null;
};
exports.extractToolCalls = extractToolCalls;
/**
 * Build streaming chunk with tool calls
 */
const buildToolCallStreamChunk = (data, model, id) => {
    const toolCalls = (0, exports.extractToolCalls)(data.message?.content);
    return {
        id,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
            {
                index: 0,
                delta: toolCalls ? { tool_calls: toolCalls } : {},
                finish_reason: data.message?.status === 'tool_calling' ? null : 'tool_calls',
            },
        ],
    };
};
exports.buildToolCallStreamChunk = buildToolCallStreamChunk;
/**
 * Build full chat response with tool calls
 */
const buildFullChatResponseWithTools = (toolCalls, content, model, finishReason, id) => ({
    id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
        {
            index: 0,
            message: {
                role: 'assistant',
                content: content || null,
                tool_calls: toolCalls,
            },
            finish_reason: finishReason || (toolCalls ? 'tool_calls' : 'stop'),
        },
    ],
    usage: { prompt_tokens: null, completion_tokens: null, total_tokens: null },
});
exports.buildFullChatResponseWithTools = buildFullChatResponseWithTools;
// ---------------------------------------------------------------------------
// Response builders — legacy text completions
// ---------------------------------------------------------------------------
const buildCompletionStreamChunk = (text, model, id) => ({
    id,
    object: 'text_completion_chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, text, finish_reason: null }],
});
exports.buildCompletionStreamChunk = buildCompletionStreamChunk;
const buildFullCompletionResponse = (text, model, finishReason, id) => ({
    id,
    object: 'text_completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
        { index: 0, text, finish_reason: finishReason || 'stop' },
    ],
    usage: { prompt_tokens: null, completion_tokens: null, total_tokens: null },
});
exports.buildFullCompletionResponse = buildFullCompletionResponse;
