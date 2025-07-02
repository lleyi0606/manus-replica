import React, { useState, useRef, useEffect } from 'react';
import { Send, RotateCcw } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { ToolCallDisplay } from './ToolCallDisplay';
import { StreamResponse, ChatMessage, ToolCall } from '@manus-replica/shared';
import ReactMarkdown from 'react-markdown';

export type ChatEvent =
  | { type: 'message'; data: ChatMessage }
  | { type: 'thinking'; data: { content: string } }
  | { type: 'tool_call'; data: ToolCall }
  | { type: 'error'; data: any };

const ThinkingBubble: React.FC<{ content: string }> = ({ content }) => (
  <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-400">
    <div className="flex items-center mb-2">
      <span className="text-sm font-medium text-blue-800">AI is thinking...</span>
    </div>
    <div className="text-sm text-blue-700 whitespace-pre-wrap prose prose-sm max-w-none !leading-tight [&_p]:my-1 [&_li]:my-0.5">
      <ReactMarkdown
        components={{
          code({inline, children, ...props}: any) {
            return inline
              ? <code className="bg-blue-100 rounded px-1 py-0.5 text-xs" {...props}>{children}</code>
              : <pre className="bg-blue-900 text-white rounded p-2 overflow-x-auto text-xs"><code {...props}>{children}</code></pre>;
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  </div>
);

const ErrorBubble: React.FC<{ error: any, onClear?: () => void }> = ({ error, onClear }) => (
  <div className="bg-red-50 rounded-lg p-4 border-l-4 border-red-400 flex items-center justify-between">
    <div className="text-sm text-red-700 font-medium">
      Error: {typeof error === 'string' ? error : error?.message || 'Unknown error'}
    </div>
    {/* {onClear && (
      <button
        onClick={onClear}
        className="ml-4 px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700 transition-colors"
      >
        Reconnect
      </button>
    )} */}
  </div>
);

const SuccessBanner: React.FC<{ summary?: string; reason?: string }> = ({ summary, reason }) => (
  <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-4 rounded flex items-center space-x-3">
    <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
    <div>
      <div className="font-semibold text-green-800">Task Completed</div>
      {summary && <div className="text-green-700 text-sm mt-1">{summary}</div>}
      {reason && <div className="text-green-600 text-xs mt-1">Reason: {reason}</div>}
    </div>
  </div>
);

export const ChatInterface: React.FC = () => {
  const [chatEvents, setChatEvents] = useState<ChatEvent[]>([]);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [chatEvents]);

  const connectWebSocket = () => {
    const ws = new WebSocket('ws://localhost:3001');
    ws.onopen = () => {
      setIsConnected(true);
    };
    ws.onmessage = (event) => {
      const response: StreamResponse = JSON.parse(event.data);
      handleStreamResponse(response);
    };
    ws.onclose = () => {
      setIsConnected(false);
    };
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    wsRef.current = ws;
  };

  // Helper to merge consecutive thinking events
  const mergeThinking = (prev: ChatEvent[], newContent: string): ChatEvent[] => {
    if (prev.length > 0 && prev[prev.length - 1].type === 'thinking') {
      // Merge with previous thinking
      return [
        ...prev.slice(0, -1),
        { type: 'thinking', data: { content: prev[prev.length - 1].data.content + newContent } }
      ];
    }
    return [...prev, { type: 'thinking', data: { content: newContent } }];
  };

  const handleStreamResponse = (response: StreamResponse) => {
    setChatEvents(prev => {
      switch (response.type) {
        case 'thinking':
          setIsThinking(true);
          return mergeThinking(prev, response.data.content);
        case 'tool_call': {
          console.log('[Frontend] tool_call event:', response.data);
          setIsThinking(true);
          // Update or add tool_call by id
          const idx = prev.findIndex(
            e => e.type === 'tool_call' && e.data.id === response.data.id
          );
          if (idx !== -1) {
            const updated = [...prev];
            updated[idx] = { type: 'tool_call', data: response.data };
            return updated;
          }
          return [...prev, { type: 'tool_call', data: response.data }];
        }
        case 'message': {
          setIsThinking(false);
          // Remove trailing thinking events
          let events = [...prev];
          while (events.length > 0 && events[events.length - 1].type === 'thinking') {
            events.pop();
          }
          // Deduplicate by content and role
          const last = events[events.length - 1];
          if (
            last &&
            last.type === 'message' &&
            last.data.content === response.data.content &&
            last.data.role === 'assistant'
          ) {
            return events;
          }
          return [
            ...events,
            {
              type: 'message',
              data: {
                id: Date.now().toString(),
                role: 'assistant',
                content: response.data.content,
                timestamp: new Date()
              }
            }
          ];
        }
        case 'error':
          setIsThinking(false);
          return [...prev, { type: 'error', data: response.data }];
        default:
          return prev;
      }
    });
  };

  const clearConversation = async () => {
    setIsResetting(true);
    setChatEvents([]);
    
    // Send a reset message to the backend
    if (wsRef.current && isConnected) {
      wsRef.current.send(JSON.stringify({
        type: 'reset',
        message: 'Reset conversation context'
      }));
    }
    
    // Simulate a brief loading time for better UX
    setTimeout(() => {
      setIsResetting(false);
    }, 1000);
  };

  const handleReconnectAndSanitize = () => {
    if (wsRef.current && !isConnected) {
      wsRef.current.send(JSON.stringify({ type: 'sanitize' }));
      connectWebSocket();
    }
  };

  const sendMessage = () => {
    if (!input.trim() || !wsRef.current || !isConnected) return;
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };
    setChatEvents(prev => [...prev, { type: 'message', data: userMessage }]);
    setInput('');
    wsRef.current.send(JSON.stringify({
      type: 'chat',
      message: input
    }));
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleStop = () => {
    if (wsRef.current && isConnected) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }
  };

  // Check if a terminate tool_call with completed status is present
  const hasCompletedTerminate = chatEvents.some(e =>
    e.type === 'tool_call' &&
    e.data.status === 'completed' &&
    e.data.input?.reason &&
    e.data.output?.terminated
  );

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] bg-white rounded-lg shadow-sm border">
      {/* Header with connection status and reset button */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div className={`flex items-center text-sm ${isConnected ? 'text-green-700' : 'text-red-700'}`}>
          <div className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>
        
        <div className="flex items-center space-x-2">
          {!isConnected && (
            <button
              onClick={handleReconnectAndSanitize}
              className="flex items-center px-3 py-1.5 bg-yellow-500 text-white text-sm rounded-md hover:bg-yellow-600 transition-colors"
              title="Reconnect to the agent"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reconnect
            </button>
          )}
          {isConnected && (
            <button
              onClick={clearConversation}
              disabled={isResetting}
              className="flex items-center px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Clear conversation and start fresh"
            >
              {isResetting ? (
                <>
                  <RotateCcw className="h-4 w-4 mr-1 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Clear Chat
                </>
              )}
            </button>
          )}
          {isThinking && isConnected && !hasCompletedTerminate && (
            <button
              onClick={handleStop}
              className="flex items-center px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
              title="Stop the agent's thought cycle"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatEvents.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <div className="text-lg mb-2">👋 Hello! I'm your AI Agent</div>
            <div className="text-sm">
              I can help you execute shell commands, manage files, and run code in a virtual machine.
              <br />
              Try asking me to:
              <ul className="mt-2 text-left max-w-md mx-auto">
                <li>• "List files in the current directory"</li>
                <li>• "Create a Python script that prints hello world"</li>
                <li>• "Check system information"</li>
              </ul>
            </div>
          </div>
        )}

        {chatEvents.map((event, idx) => {
          switch (event.type) {
            case 'message':
              return <MessageBubble key={idx} message={event.data} />;
            case 'thinking':
              return <ThinkingBubble key={idx} content={event.data.content} />;
            case 'tool_call':
              if (event.data.input?.reason && event.data.output?.terminated) {
                return (
                  <SuccessBanner
                    key={idx}
                    summary={event.data.output?.summary}
                    reason={event.data.output?.reason}
                  />
                );
              }
              return <ToolCallDisplay key={idx} toolCall={event.data} />;
            case 'error':
              return <ErrorBubble key={idx} error={event.data} onClear={
                (typeof event.data === 'string' ? event.data : event.data?.message) === 'Failed to process message'
                  ? undefined
                  : undefined
              } />;
            default:
              return null;
          }
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t p-4">
        <div className="flex space-x-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me to execute commands, manage files, or run code..."
            className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={2}
            disabled={!isConnected || isResetting}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || !isConnected || isResetting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};