import { useState, useEffect, useCallback, useRef } from 'react';

export interface Message {
  type: string;
  from?: string;
  room?: string;
  text?: string;
  msgId?: string;
  users?: string[];
  message?: string;
}

export const useWebSocket = (url: string | null, token: string | null) => {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [serverId, setServerId] = useState<string>('');
  
  const reconnectTimer = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (!url || !token) return;

    setStatus('connecting');
    const socket = new WebSocket(`${url}?token=${token}`);

    socket.onopen = () => {
      setStatus('connected');
      setWs(socket);
      // Get initial online list
      socket.send(JSON.stringify({ type: 'who-is-online' }));
    };

    socket.onmessage = (event) => {
      // Handle the plain text welcome message
      if (typeof event.data === 'string' && event.data.startsWith('Welcome')) {
        const match = event.data.match(/to (server:\d+)/);
        if (match) setServerId(match[1]);
        return;
      }

      try {
        const data: Message = JSON.parse(event.data);
        if (data.type === 'online-list') {
          setOnlineUsers(data.users || []);
        } else if (data.type === 'chat' || data.type === 'dm' || data.type === 'error') {
          setMessages((prev) => [...prev, data]);
        }
      } catch (err) {
        console.warn('Received non-JSON message:', event.data);
      }
    };

    socket.onclose = () => {
      setStatus('disconnected');
      setWs(null);
      // Auto-reconnect after 3 seconds
      reconnectTimer.current = window.setTimeout(connect, 3000);
    };

    return socket;
  }, [url, token]);

  useEffect(() => {
    const socket = connect();
    return () => {
      if (socket) socket.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  const sendMessage = (msg: any) => {
    if (ws && status === 'connected') {
      ws.send(JSON.stringify(msg));
    }
  };

  return { status, messages, onlineUsers, serverId, sendMessage };
};
