import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/** Generate a prefixed ID like `chatcmpl-abc123...` */
export const newId = (prefix: string): string =>
  `${prefix}-${uuidv4().replace(/-/g, '')}`;

// ---------------------------------------------------------------------------
// Content extraction
// ---------------------------------------------------------------------------

export interface QoderContentPart {
  type?: string;
  text?: string;
  value?: string;
}

export interface QoderMessage {
  content?: string | QoderContentPart[];
  stop_reason?: string;
  status?: string;
  type?: string;
}

/**
 * Extract plain text from a qodercli message object.
 * Handles both array-of-parts and plain string content gracefully.
 */
export const extractTextContent = (message?: QoderMessage | null): string => {
  if (!message) return '';
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (!part) return '';
        if (typeof part === 'string') return part;
        if (typeof part.text === 'string') return part.text;
        if (typeof part.value === 'string') return part.value;
        return '';
      })
      .join('');
  }
  if (typeof message.content === 'string') return message.content;
  return '';
};

// ---------------------------------------------------------------------------
// Message → prompt conversion
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | Array<{ type: string; text?: string }>;
}

/**
 * Convert an OpenAI messages array into a single prompt string for qodercli.
 */
export const messagesToPrompt = (messages?: ChatMessage[]): string => {
  if (!messages || messages.length === 0) return 'Hello';

  const systemMsg = messages.find((m) => m.role === 'system');
  const conversation = messages.filter((m) => m.role !== 'system');
  const recent = conversation.slice(-10);

  const extractContent = (msg: ChatMessage): string => {
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter((p) => p.type === 'text')
        .map((p) => p.text || '')
        .join('');
    }
    return msg.content || '';
  };

  const parts: string[] = [];

  if (systemMsg) {
    const sysContent = extractContent(systemMsg);
    if (sysContent.trim()) parts.push(`System: ${sysContent.trim()}`);
  }

  for (const msg of recent) {
    const content = extractContent(msg).trim();
    if (!content) continue;
    if (msg.role === 'user') parts.push(`User: ${content}`);
    else if (msg.role === 'assistant') parts.push(`Assistant: ${content}`);
  }

  return parts.join('\n\n') || 'Hello';
};

// ---------------------------------------------------------------------------
// Response builders — chat completions
// ---------------------------------------------------------------------------

export const buildStreamChunk = (
  content: string,
  model: string,
  id: string,
) => ({
  id,
  object: 'chat.completion.chunk',
  created: Math.floor(Date.now() / 1000),
  model,
  choices: [
    { index: 0, delta: { role: 'assistant', content }, finish_reason: null },
  ],
});

export const buildDoneChunk = (
  model: string,
  id: string,
  finishReason = 'stop',
) => ({
  id,
  object: 'chat.completion.chunk',
  created: Math.floor(Date.now() / 1000),
  model,
  choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
});

export const buildFullChatResponse = (
  content: string,
  model: string,
  finishReason: string,
  id: string,
) => ({
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

// ---------------------------------------------------------------------------
// Tool calls
// ---------------------------------------------------------------------------

export interface ToolCallFunction {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: ToolCallFunction;
}

interface QoderFunctionContent {
  type: 'function';
  id: string;
  name: string;
  input: string;
}

/**
 * Extracts tool calls from qodercli message content
 */
export const extractToolCalls = (
  content?: unknown[] | null,
): ToolCall[] | null => {
  if (!Array.isArray(content)) return null;

  const toolCalls: ToolCall[] = [];
  for (const item of content) {
    const fc = item as QoderFunctionContent;
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

/**
 * Build streaming chunk with tool calls
 */
export const buildToolCallStreamChunk = (
  data: { message?: QoderMessage & { status?: string } },
  model: string,
  id: string,
) => {
  const toolCalls = extractToolCalls(data.message?.content as unknown[]);

  return {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: toolCalls ? { tool_calls: toolCalls } : {},
        finish_reason:
          data.message?.status === 'tool_calling' ? null : 'tool_calls',
      },
    ],
  };
};

/**
 * Build full chat response with tool calls
 */
export const buildFullChatResponseWithTools = (
  toolCalls: ToolCall[],
  content: string | null,
  model: string,
  finishReason: string,
  id: string,
) => ({
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

// ---------------------------------------------------------------------------
// Response builders — legacy text completions
// ---------------------------------------------------------------------------

export const buildCompletionStreamChunk = (
  text: string,
  model: string,
  id: string,
) => ({
  id,
  object: 'text_completion_chunk',
  created: Math.floor(Date.now() / 1000),
  model,
  choices: [{ index: 0, text, finish_reason: null }],
});

export const buildFullCompletionResponse = (
  text: string,
  model: string,
  finishReason: string,
  id: string,
) => ({
  id,
  object: 'text_completion',
  created: Math.floor(Date.now() / 1000),
  model,
  choices: [
    { index: 0, text, finish_reason: finishReason || 'stop' },
  ],
  usage: { prompt_tokens: null, completion_tokens: null, total_tokens: null },
});
