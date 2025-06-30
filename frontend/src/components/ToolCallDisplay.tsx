import React, { useState } from 'react';
import { Terminal, File, Code, CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { ToolCall } from '@ai-agent/shared';

interface ToolCallDisplayProps {
  toolCall: ToolCall;
}

export const ToolCallDisplay: React.FC<ToolCallDisplayProps> = ({ toolCall }) => {
  const [showDetails, setShowDetails] = useState(false);

  const getIcon = () => {
    switch (toolCall.type) {
      case 'shell':
        return <Terminal className="h-4 w-4" />;
      case 'file':
        return <File className="h-4 w-4" />;
      case 'code':
        return <Code className="h-4 w-4" />;
      default:
        return <Terminal className="h-4 w-4" />;
    }
  };

  const getStatusIcon = () => {
    switch (toolCall.status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'running':
      case 'pending':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (toolCall.status) {
      case 'completed':
        return 'border-green-200 bg-green-50';
      case 'error':
        return 'border-red-200 bg-red-50';
      case 'running':
      case 'pending':
        return 'border-blue-200 bg-blue-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  const formatInput = () => {
    if (toolCall.type === 'shell' && toolCall.input?.command) {
      return `$ ${toolCall.input.command}`;
    }
    if (toolCall.type === 'file') {
      return `${toolCall.input?.type} ${toolCall.input?.path}`;
    }
    if (toolCall.type === 'code') {
      return `${toolCall.input?.language}: ${toolCall.input?.code?.substring(0, 100)}${toolCall.input?.code?.length > 100 ? '...' : ''}`;
    }
    return JSON.stringify(toolCall.input, null, 2);
  };

  return (
    <div className={`border rounded-lg p-3 ${getStatusColor()}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {getIcon()}
          <span className="font-medium text-sm capitalize">
            {toolCall.type} {toolCall.type === 'shell' ? 'Command' : toolCall.type === 'file' ? 'Operation' : 'Execution'}
          </span>
          {getStatusIcon()}
        </div>
        
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-gray-500 hover:text-gray-700"
        >
          {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      <div className="mt-2 text-sm">
        <div className="font-mono text-xs bg-white p-2 rounded border">
          {formatInput()}
        </div>
      </div>

      {showDetails && (
        <div className="mt-3 space-y-2">
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