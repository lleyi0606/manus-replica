import React, { useState } from 'react';
import { User, Bot, ChevronDown, ChevronUp } from 'lucide-react';
import { ChatMessage } from '@manus-replica/shared';

interface MessageBubbleProps {
  message: ChatMessage;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const [showThinking, setShowThinking] = useState(false);
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-3xl ${isUser ? 'order-2' : 'order-1'}`}>
        <div className={`flex items-end space-x-2 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
          <div className={`p-2 rounded-full ${isUser ? 'bg-blue-600' : 'bg-gray-600'}`}>
            {isUser ? (
              <User className="h-4 w-4 text-white" />
            ) : (
              <Bot className="h-4 w-4 text-white" />
            )}
          </div>
          
          <div className={`rounded-lg px-4 py-2 max-w-full ${
            isUser 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-100 text-gray-900'
          }`}>
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
            
            {message.thinking && (
              <div className="mt-2 pt-2 border-t border-gray-300">
                <button
                  onClick={() => setShowThinking(!showThinking)}
                  className="flex items-center text-xs text-gray-600 hover:text-gray-800"
                >
                  {showThinking ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                  {showThinking ? 'Hide' : 'Show'} thinking process
                </button>
                
                {showThinking && (
                  <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-700 whitespace-pre-wrap">
                    {message.thinking}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        <div className={`text-xs text-gray-500 mt-1 ${isUser ? 'text-right' : 'text-left'}`}>
          {message.timestamp.toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};