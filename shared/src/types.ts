export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    toolCalls?: ToolCall[];
    thinking?: string;
  }
  
  export interface ToolCall {
    id: string;
    type: 'shell' | 'file' | 'code';
    input: any;
    output?: any;
    status: 'pending' | 'running' | 'completed' | 'error';
    error?: string;
  }
  
  export interface ShellCommand {
    command: string;
    workingDirectory?: string;
  }
  
  export interface FileOperation {
    type: 'read' | 'write' | 'create' | 'delete' | 'list';
    path: string;
    content?: string;
    recursive?: boolean;
  }
  
  export interface CodeExecution {
    language: 'python' | 'javascript' | 'bash';
    code: string;
    timeout?: number;
  }
  
  export interface StreamResponse {
    type: 'thinking' | 'tool_call' | 'message' | 'error';
    data: any;
  }
  
  export interface E2BSession {
    sessionId: string;
    status: 'creating' | 'ready' | 'closed';
  }