import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { ToolCallDisplay } from './ToolCallDisplay';
import { StreamResponse, ChatMessage, ToolCall } from '@ai-agent/shared';

export const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [currentThinking, setCurrentThinking] = useState('');
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCall[]>([]);
  
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentThinking, activeToolCalls]);

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

  const handleStreamResponse = (response: StreamResponse) => {
    switch (response.type) {
      case 'thinking':
        setIsTyping(true);
        setCurrentThinking(prev => prev + response.data.content);
        break;
        
      case 'tool_call':
        const toolCall = response.data as ToolCall;
        setActiveToolCalls(prev => {
          const existing = prev.find(tc => tc.id === toolCall.id);
          if (existing) {
            return prev.map(tc => tc.id === toolCall.id ? toolCall : tc);
          }
          return [...prev, toolCall];
        });
        break;
        
      case 'message':
        setIsTyping(false);
        const newMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'assistant',
          content: response.data.content,
          timestamp: new Date(),
          thinking: currentThinking,
          toolCalls: activeToolCalls.length > 0 ? [...activeToolCalls] : undefined
        };
        setMessages(prev => [...prev, newMessage]);
        setCurrentThinking('');
        setActiveToolCalls([]);
        break;
        
      case 'error':
        setIsTyping(false);
        console.error('Error:', response.data);
        break;
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

    setMessages(prev => [...prev, userMessage]);
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
        {messages.length === 0 && (
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

        {messages.map((message) => (
          <div key={message.id}>
            <MessageBubble message={message} />
            {message.toolCalls && (
              <div className="mt-2 space-y-2">
                {message.toolCalls.map((toolCall) => (
                  <ToolCallDisplay key={toolCall.id} toolCall={toolCall} />
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Current Thinking */}
        {isTyping && currentThinking && (
          <div className="bg-blue-50 rounded-lg p-4 border-l-4 border-blue-400">
            <div className="flex items-center mb-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600 mr-2" />
              <span className="text-sm font-medium text-blue-800">AI is thinking...</span>
            </div>
            <div className="text-sm text-blue-700 whitespace-pre-wrap">{currentThinking}</div>
          </div>
        )}

        {/* Active Tool Calls */}
        {activeToolCalls.map((toolCall) => (
          <ToolCallDisplay key={toolCall.id} toolCall={toolCall} />
        ))}

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