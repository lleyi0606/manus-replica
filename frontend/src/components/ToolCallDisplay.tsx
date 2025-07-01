import React, { useState } from 'react';
import { Terminal, File, Code, CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp, FileText, FolderPlus, Trash2, List, Edit3 } from 'lucide-react';
import { ToolCall } from '@manus-replica/shared';

interface ToolCallDisplayProps {
  toolCall: ToolCall;
}

function getToolCallSummary(toolCall: ToolCall): string {
  if (toolCall.type === "file") {
    switch (toolCall.input?.type) {
      case 'write':
        return `Wrote to file \`${toolCall.input.path}\``;
      case 'read':
        return `Read file \`${toolCall.input.path}\``;
      case 'delete':
        return `Deleted file \`${toolCall.input.path}\``;
      case 'list':
        return `Listed files in \`${toolCall.input.path}\``;
      case 'create':
        return toolCall.input.path.endsWith('/')
          ? `Created directory \`${toolCall.input.path}\``
          : `Created file \`${toolCall.input.path}\``;
      default:
        return `File operation: ${toolCall.input?.type}`;
    }
  }
  if (toolCall.type === 'shell') {
    return toolCall.input?.command
      ? `$ ${toolCall.input.command}`
      : 'Shell command';
  }
  if (toolCall.type === 'code') {
    return `Executed ${toolCall.input?.language} code`;
  }
  return toolCall.type;
}

function getIcon(toolCall: ToolCall) {
  switch (toolCall.type) {
    case "file_operation":
      switch (toolCall.input?.type) {
        case 'write': return <Edit3 className="h-4 w-4" />;
        case 'read': return <FileText className="h-4 w-4" />;
        case 'delete': return <Trash2 className="h-4 w-4" />;
        case 'list': return <List className="h-4 w-4" />;
        case 'create': return toolCall.input.path.endsWith('/') ? <FolderPlus className="h-4 w-4" /> : <File className="h-4 w-4" />;
        default: return <File className="h-4 w-4" />;
      }
    case 'shell_command':
      return <Terminal className="h-4 w-4" />;
    case 'code_execution':
      return <Code className="h-4 w-4" />;
    default:
      return <Terminal className="h-4 w-4" />;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
      case 'completed':
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 ml-2"><CheckCircle className="h-3 w-3 mr-1" />Completed</span>;
      case 'error':
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 ml-2"><XCircle className="h-3 w-3 mr-1" />Error</span>;
      case 'running':
      case 'pending':
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 ml-2"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Running</span>;
      default:
        return null;
    }
}

export const ToolCallDisplay: React.FC<ToolCallDisplayProps> = ({ toolCall }) => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className={`border rounded-lg p-3 bg-gray-50`}> {/* Always light background for tool calls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {getIcon(toolCall)}
          <span className="font-medium text-sm">
            {getToolCallSummary(toolCall)}
          </span>
          {getStatusBadge(toolCall.status)}
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-gray-500 hover:text-gray-700"
        >
          {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {showDetails && (
        <div className="mt-3 space-y-2">
          {/* Input details */}
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1">Input:</div>
            <div className="font-mono text-xs bg-white p-2 rounded border">
              {JSON.stringify(toolCall.input, null, 2)}
            </div>
          </div>
          {/* Output details */}
          {toolCall.output && (
            <div>
              <div className="text-xs font-medium text-gray-600 mb-1">Output:</div>
              <div className="font-mono text-xs bg-white p-2 rounded border">
                {toolCall.output.stdout && (
                  <div className="text-green-800">
                    <div className="font-semibold">stdout:</div>
                    <pre className="whitespace-pre-wrap">{toolCall.output.stdout}</pre>
                  </div>
                )}
                {toolCall.output.stderr && (
                  <div className="text-red-800 mt-2">
                    <div className="font-semibold">stderr:</div>
                    <pre className="whitespace-pre-wrap">{toolCall.output.stderr}</pre>
                  </div>
                )}
                {toolCall.output.exitCode !== undefined && (
                  <div className="text-gray-600 mt-2">
                    Exit code: {toolCall.output.exitCode}
                  </div>
                )}
                {toolCall.output.content && (
                  <pre className="whitespace-pre-wrap">{toolCall.output.content}</pre>
                )}
                {toolCall.output.files && (
                  <div>
                    {toolCall.output.files.map((file: any, index: number) => (
                      <div key={index} className="flex items-center space-x-2">
                        <span>{file.isDir ? '📁' : '📄'}</span>
                        <span>{file.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {/* Error details */}
          {toolCall.error && (
            <div>
              <div className="text-xs font-medium text-red-600 mb-1">Error:</div>
              <div className="font-mono text-xs bg-red-100 text-red-800 p-2 rounded border">
                {toolCall.error}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};