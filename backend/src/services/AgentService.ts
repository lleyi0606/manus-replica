import OpenAI from 'openai';
import { ChatMessage, ToolCall, StreamResponse, ShellCommand, FileOperation, CodeExecution } from '@manus-replica/shared';
import { E2BService } from './E2BService.js';
import { v4 as uuidv4 } from 'uuid';

export class AgentService {
  private openai: OpenAI;
  private e2bService: E2BService;

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
      
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: `
          ## PERSISTENCE
          You are an agent that can help users by executing commands in a virtual machine - please keep going until the user's query is completely
          resolved, before ending your turn and yielding back to the user. Only
          terminate your turn when you are sure that the problem is solved.

          ## TOOL CALLING
          If you are not sure about file content or codebase structure pertaining to
          the user's request, use your tools to read files and gather the relevant
          information: do NOT guess or make up an answer.

          ## PLANNING
          You MUST plan extensively before each function call, and reflect
          extensively on the outcomes of the previous function calls. DO NOT do this
          entire process by making function calls only, as this can impair your
          ability to solve the problem and think insightfully.`
        },
        {
          role: "user",
          content: message
        }
      ];

      const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
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
            description: "Perform file operations",
            parameters: {
              type: "object",
              properties: {
                type: { 
                  type: "string", 
                  enum: ["read", "write", "create", "delete", "list"],
                  description: "Type of file operation"
                },
                path: { type: "string", description: "File or directory path" },
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
        }
      ];

      const stream = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        tools,
        tool_choice: "auto",
        stream: true
      });

      let currentMessage = '';
      let toolCalls: any[] = [];

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        
        if (delta?.content) {
          currentMessage += delta.content;
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

        if (chunk.choices[0]?.finish_reason === 'tool_calls') {
          // Execute tool calls
          for (const toolCall of toolCalls) {
            await this.executeToolCall(toolCall, streamCallback);
          }
        }
      }

      if (currentMessage && !toolCalls.length) {
        streamCallback({
          type: 'message',
          data: { content: currentMessage }
        });
      }

    } catch (error) {
      console.error('Agent processing error:', error);
      streamCallback({
        type: 'error',
        data: { message: 'Failed to process message' }
      });
    }
  }

  private async executeToolCall(
    toolCall: any,
    streamCallback: (response: StreamResponse) => void
  ): Promise<void> {
    const toolCallId = uuidv4();
    
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

    } catch (error) {
      console.error('Tool execution error:', error);
      streamCallback({
        type: 'tool_call',
        data: {
          id: toolCallId,
          type: toolCall.function.name,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }
}