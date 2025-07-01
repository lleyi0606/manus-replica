import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { ToolCallDisplay } from './ToolCallDisplay';
import { StreamResponse, ChatMessage, ToolCall } from '@manus-replica/shared';

// Define a union type for all chat events
// You can expand this as needed
export type ChatEvent =
  | { type: 'message'; data: ChatMessage }
  | { type: 'thinking'; data: { content: string } }
  | { type: 'tool_call'; data: ToolCall }
  | { type: 'error'; data: any };

// Minimal thinking and error components
const ThinkingBubble: React.FC<{ content: string }> = ({ content }) => (
  <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-400">
    <div className="flex items-center mb-2">
      <span className="text-sm font-medium text-blue-800">AI is thinking...</span>
    </div>
    <div className="text-sm text-blue-700 whitespace-pre-wrap">{content}</div>
  </div>
);

const ErrorBubble: React.FC<{ error: any }> = ({ error }) => (
  <div className="bg-red-50 rounded-lg p-4 border-l-4 border-red-400">
    <div className="text-sm text-red-700 font-medium">Error: {typeof error === 'string' ? error : error?.message || 'Unknown error'}</div>
  </div>
);

export const ChatInterface: React.FC = () => {
  const [chatEvents, setChatEvents] = useState<ChatEvent[]>([]);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
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
      console.log('Connected to server');
    };
    ws.onmessage = (event) => {
      const response: StreamResponse = JSON.parse(event.data);
      handleStreamResponse(response);
    };
    ws.onclose = () => {
      setIsConnected(false);
      console.log('Disconnected from server');
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
    console.log('[StreamResponse]', response.type, response.data);
    setChatEvents(prev => {
      switch (response.type) {
        case 'thinking':
          return mergeThinking(prev, response.data.content);
        case 'tool_call': {
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
          return [...prev, { type: 'error', data: response.data }];
        default:
          return prev;
      }
    });
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

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] bg-white rounded-lg shadow-sm border">
      {/* Connection Status */}
      <div className={`px-4 py-2 text-sm ${isConnected ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
        {isConnected ? '🟢 Connected to AI Agent' : '🔴 Disconnected'}
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
              return <ToolCallDisplay key={idx} toolCall={event.data} />;
            case 'error':
              return <ErrorBubble key={idx} error={event.data} />;
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
            disabled={!isConnected}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || !isConnected}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};