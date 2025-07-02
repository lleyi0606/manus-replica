import OpenAI from 'openai';
import { ChatMessage, ToolCall, StreamResponse, ShellCommand, FileOperation, CodeExecution } from '@manus-replica/shared';
import { E2BService } from './E2BService.js';
import { v4 as uuidv4 } from 'uuid';
import { AGENT_SYSTEM_PROMPT, NEXT_STEP_PROMPT } from '../prompt/agent.js';

export class AgentService {
  private openai: OpenAI;
  private e2bService: E2BService;
  private conversationHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  private seenToolCallIds = new Set<string>();
  private shouldStop = false;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.e2bService = new E2BService();
  }

  async processMessage(
    message: string, 
    streamCallback: (response: StreamResponse) => void
  ): Promise<void> {
    try {
      // Create a session if not exists
      const session = await this.e2bService.getOrCreateSession();
      
      // Add user message to conversation history
      this.conversationHistory.push({
        role: "user",
        content: message
      });

      // Start the thought cycle
      await this.runThoughtCycle(streamCallback);

    } catch (error) {
      console.error('Agent processing error:', error);
      streamCallback({
        type: 'error',
        data: { message: 'Failed to process message' }
      });
    }
  }

  async resetConversation(): Promise<void> {
    // Clear conversation history
    this.conversationHistory = [];
    this.seenToolCallIds.clear();
    
    await this.e2bService.closeSession();
    await this.e2bService.createSession();
    
    console.log('[AgentService] Conversation reset - cleared history and recreated session');
  }

  private async runThoughtCycle(
    streamCallback: (response: StreamResponse) => void,
    maxIterations: number = 10
  ): Promise<void> {
    let iteration = 0;
    let shouldTerminate = false;
    let isToolCall = false;
    this.shouldStop = false;

    while (!shouldTerminate && iteration < maxIterations && !this.shouldStop) {
      iteration++;
      
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: `${AGENT_SYSTEM_PROMPT}\n\n${NEXT_STEP_PROMPT}`
        },
        ...this.conversationHistory
      ];

      const tools = this.getAvailableTools();

      const stream = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        tools,
        tool_choice: "auto",
        stream: true
      });

      let currentMessage = '';
      let toolCalls: any[] = [];
      let hasContent = false;

      // Process the stream
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        
        if (delta?.content) {
          currentMessage += delta.content;
          hasContent = true;
          streamCallback({
            type: 'thinking',
            data: { content: delta.content }
          });
        }

        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            if (!toolCalls[toolCall.index]) {
              toolCalls[toolCall.index] = {
                id: toolCall.id,
                type: 'function',
                function: { name: toolCall.function?.name || '', arguments: '' }
              };
            }
            
            if (toolCall.function?.arguments) {
              toolCalls[toolCall.index].function.arguments += toolCall.function.arguments;
            }
          }
        }
      }

      // Add assistant message to conversation history
      if (hasContent || toolCalls.length > 0) {
        const assistantMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
          role: "assistant",
          content: currentMessage || null
        };

        if (toolCalls.length > 0) {
          assistantMessage.tool_calls = toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments
            }
          }));
        }

        this.conversationHistory.push(assistantMessage);
      }

      // Execute tool calls if any
      if (toolCalls.length > 0) {
        const toolResults: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

        for (const toolCall of toolCalls) {
          const result = await this.executeToolCall(toolCall, streamCallback);
          isToolCall = true;
          
          // Add tool result to conversation history (always, even for terminate)
          toolResults.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          });

          // Check if terminate was called
          if (toolCall.function.name === 'terminate') {
            shouldTerminate = true;
            // Send final message if provided
            if (hasContent) {
              streamCallback({
                type: 'message',
                data: { content: currentMessage }
              });
            }
            break;
          }
        }

        // Add all tool results to conversation history
        this.conversationHistory.push(...toolResults);
      } else {
        // No tool calls, just a message - this might be the end
        if (hasContent) {
          streamCallback({
            type: 'message',
            data: { content: currentMessage }
          });
        }
        // If no tool calls and no meaningful content, terminate
        if (!isToolCall) {
          shouldTerminate = true;
        }
      }
    }

    if (this.shouldStop) {
      streamCallback({
        type: 'message',
        data: { content: '🛑 Thought cycle stopped by user.' }
      });
    } else if (iteration >= maxIterations) {
      streamCallback({
        type: 'message',
        data: { content: "I've reached the maximum number of iterations. The task may need to be broken down further or requires manual intervention." }
      });
    }
  }

  private getAvailableTools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return [
      {
        type: "function",
        function: {
          name: "shell_command",
          description: "Execute a shell command in the virtual machine",
          parameters: {
            type: "object",
            properties: {
              command: { type: "string", description: "The shell command to execute" },
              workingDirectory: { type: "string", description: "Working directory (optional)" }
            },
            required: ["command"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "file_operation",
          description: "Perform file operations. " +
            "When creating a directory, the path must end with a '/'. " +
            "When creating a file in a directory that may not exist, first check if the directory exists. " +
            "If not, create the directory (with a trailing '/'), then create the file.",
          parameters: {
            type: "object",
            properties: {
              type: { 
                type: "string", 
                enum: ["read", "write", "create", "delete", "list"],
                description: "Type of file operation. Use 'create' for directories."
              },
              path: { type: "string", description: "File or directory path. Directory paths must end with '/' when creating." },
              content: { type: "string", description: "Content for write operations" },
              recursive: { type: "boolean", description: "Recursive for directory operations" }
            },
            required: ["type", "path"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "code_execution",
          description: "Execute code in various programming languages",
          parameters: {
            type: "object",
            properties: {
              language: { 
                type: "string", 
                enum: ["python", "javascript", "bash"],
                description: "Programming language"
              },
              code: { type: "string", description: "Code to execute" },
              timeout: { type: "number", description: "Timeout in seconds (optional)" }
            },
            required: ["language", "code"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "terminate",
          description: "Terminate the conversation when the task is complete or when you want to end the interaction",
          parameters: {
            type: "object",
            properties: {
              reason: { 
                type: "string", 
                description: "Reason for termination (e.g., 'task completed', 'user request fulfilled')" 
              },
              summary: { 
                type: "string", 
                description: "Brief summary of what was accomplished" 
              }
            },
            required: ["reason"]
          }
        }
      }
    ];
  }

  private async executeToolCall(
    toolCall: any,
    streamCallback: (response: StreamResponse) => void
  ): Promise<any> {
    const toolCallId = uuidv4();
    
    // Debug: Check for duplicate toolCall ids
    if (this.seenToolCallIds.has(toolCall.id)) {
      console.warn(`[AgentService] Duplicate toolCall id detected: ${toolCall.id}`);
    } else {
      console.debug(`[AgentService] Processing toolCall id: ${toolCall.id}`);
      this.seenToolCallIds.add(toolCall.id);
    }

    try {
      const args = JSON.parse(toolCall.function.arguments);
      
      streamCallback({
        type: 'tool_call',
        data: {
          id: toolCallId,
          type: toolCall.function.name,
          status: 'running',
          input: args
        }
      });

      let result: any;

      switch (toolCall.function.name) {
        case 'shell_command':
          result = await this.e2bService.executeShellCommand(args as ShellCommand);
          break;
        case 'file_operation':
          result = await this.e2bService.performFileOperation(args as FileOperation);
          break;
        case 'code_execution':
          result = await this.e2bService.executeCode(args as CodeExecution);
          break;
        case 'terminate':
          result = { 
            terminated: true, 
            reason: args.reason,
            summary: args.summary || 'Task completed'
          };
          break;
        default:
          throw new Error(`Unknown tool: ${toolCall.function.name}`);
      }

      streamCallback({
        type: 'tool_call',
        data: {
          id: toolCallId,
          type: toolCall.function.name,
          status: 'completed',
          input: args,
          output: result
        }
      });

      return result;

    } catch (error: any) {
      console.error('Tool execution error:', error);
      
      // Check if it's a timeout error
      const isTimeout = error.message && error.message.includes('timed out');
      const errorMessage = isTimeout 
        ? 'Operation timed out. The virtual machine session has been recreated and the operation will be retried.'
        : error instanceof Error ? error.message : 'Unknown error';
      
      const errorResult = {
        error: errorMessage,
        isTimeout
      };
      
      streamCallback({
        type: 'tool_call',
        data: {
          id: toolCallId,
          type: toolCall.function.name,
          status: 'error',
          input: JSON.parse(toolCall.function.arguments),
          error: errorResult.error
        }
      });

      return errorResult;
    }
  }

  async sanitizeConversationHistory(): Promise<void> {
    // Remove assistant messages with tool_calls that don't have matching tool messages
    const toolCallIds = new Set<string>();
    const toolMessages = new Set<string>();

    // Collect all tool_call_ids from assistant messages
    for (const msg of this.conversationHistory) {
      if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          toolCallIds.add(tc.id);
        }
      }
      if (msg.role === 'tool' && msg.tool_call_id) {
        toolMessages.add(msg.tool_call_id);
      }
    }

    // Remove assistant messages with tool_calls that don't have matching tool messages
    this.conversationHistory = this.conversationHistory.filter(msg => {
      if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
        return msg.tool_calls.every(tc => toolMessages.has(tc.id));
      }
      if (msg.role === 'tool' && msg.tool_call_id) {
        return toolCallIds.has(msg.tool_call_id);
      }
      return true;
    });

    console.log('[AgentService] Conversation history sanitized');
  }

  async stopThoughtCycle() {
    this.shouldStop = true;
  }
}