import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { AgentService } from './services/AgentService.js';
import { E2BService } from './services/E2BService.js';

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

const agentService = new AgentService();
const e2bService = new E2BService();

// WebSocket connection handling
wss.on('connection', async (ws) => {
  console.log('Client connected');
  // Send current sessionId (or create one if needed) on connect
  const session = await e2bService.getOrCreateSession();
  ws.send(JSON.stringify({ type: 'session', sessionId: session.sessionId }));
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      if (data.type === 'chat') {
        await agentService.processMessage(data.message, (response) => {
          ws.send(JSON.stringify(response));
        });
      } else if (data.type === 'reset') {
        // Reset conversation context
        await agentService.resetConversation();
        const session = await e2bService.getOrCreateSession();
        ws.send(JSON.stringify({ type: 'session', sessionId: session.sessionId }));
      } else if (data.type === 'sanitize') {
        await e2bService.resumeSession();
        await agentService.sanitizeConversationHistory();
        ws.send(JSON.stringify({
          type: 'message',
          data: { content: 'Conversation history sanitized. You can try again.' }
        }));
      } else if (data.type === 'stop') {
        await agentService.stopThoughtCycle();
      } else if (data.type === 'resume') {
        // Attempt to resume the E2B session with the provided sessionId
        let session = await e2bService.resumeSession(data.sessionId);
        if (!session) {
          session = await e2bService.createSession();
        }
        await agentService.sanitizeConversationHistory();
        ws.send(JSON.stringify({ type: 'session', sessionId: session.sessionId }));
        ws.send(JSON.stringify({
          type: 'message',
          data: { content: 'Session resumed and conversation history sanitized. You can try again.' }
        }));
      }
    } catch (error) {
      console.error('WebSocket error:', error);
      ws.send(JSON.stringify({ 
        type: 'error', 
        data: { message: 'Failed to process message' }
      }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// REST API endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/session', async (req, res) => {
  try {
    const session = await e2bService.createSession();
    res.json(session);
  } catch (error) {
    console.error('Session creation error:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});