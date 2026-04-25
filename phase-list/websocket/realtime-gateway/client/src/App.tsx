import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Send, 
  MessageSquare, 
  Server, 
  Activity, 
  LogOut,
  Hash,
  User,
  ShieldCheck
} from 'lucide-react';
import { useWebSocket } from './hooks/useWebSocket';

const App: React.FC = () => {
  const [username, setUsername] = useState('');
  const [port, setPort] = useState('8080');
  const [token, setToken] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentRoom, setCurrentRoom] = useState('General');
  const [inputText, setInputText] = useState('');
  const [dmRecipient, setDmRecipient] = useState<string | null>(null);
  const [dmText, setDmText] = useState('');
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { status, messages, onlineUsers, serverId, sendMessage } = useWebSocket(
    isLoggedIn ? `ws://localhost:${port}` : null,
    token
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) return;
    try {
      const res = await axios.get(`http://localhost:${port}/token/${username}`);
      setToken(res.data.token);
      setIsLoggedIn(true);
    } catch (err) {
      alert('Failed to connect to server. Make sure it is running on port ' + port);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText) return;
    sendMessage({ type: 'chat', room: currentRoom, text: inputText });
    setInputText('');
  };

  const handleSendDM = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dmText || !dmRecipient) return;
    sendMessage({ type: 'dm', to: dmRecipient, text: dmText });
    setDmText('');
  };

  const joinRoom = (roomName: string) => {
    setCurrentRoom(roomName);
    sendMessage({ type: 'join', room: roomName });
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-md bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-2xl shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="bg-blue-500/10 p-4 rounded-full mb-4">
              <ShieldCheck className="w-12 h-12 text-blue-500" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Realtime Gateway</h1>
            <p className="text-slate-400 mt-2 text-center text-sm">Distributed WebSocket Dashboard</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-2 ml-1">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-5 h-5 text-slate-500" />
                <input 
                  type="text" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white pl-10 pr-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                  placeholder="Enter your name..."
                />
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-2 ml-1">Target Node (Port)</label>
              <select 
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white px-4 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              >
                <option value="8080">Node 1 (8080)</option>
                <option value="8081">Node 2 (8081)</option>
                <option value="8082">Node 3 (8082)</option>
              </select>
            </div>

            <button 
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-500/20 transform transition active:scale-95"
            >
              Enter Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* Sidebar - Presence */}
      <div className="w-64 bg-slate-900/80 border-r border-slate-800 flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Presence</span>
          </div>
          <h2 className="text-xl font-bold text-white">Online Cluster</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {onlineUsers.map(user => (
            <div 
              key={user}
              onClick={() => user !== username && setDmRecipient(user)}
              className={`flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer group ${
                user === username ? 'bg-slate-800/50' : 'hover:bg-slate-800'
              }`}
            >
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center text-xs font-bold text-white uppercase">
                  {user[0]}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full shadow-sm"></div>
              </div>
              <span className={`text-sm font-medium ${user === username ? 'text-blue-400' : 'text-slate-300'}`}>
                {user} {user === username && '(You)'}
              </span>
            </div>
          ))}
        </div>

        <div className="p-4 bg-slate-900/50 border-t border-slate-800">
          <button 
            onClick={() => window.location.reload()}
            className="w-full flex items-center justify-center gap-2 p-2 text-slate-400 hover:text-white transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            Disconnect
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative">
        {/* Header */}
        <header className="h-16 border-b border-slate-800 bg-slate-900/30 backdrop-blur-md flex items-center justify-between px-6 z-10">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Hash className="w-5 h-5 text-slate-500" />
              <h3 className="font-bold text-white">{currentRoom}</h3>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium text-slate-500 uppercase tracking-tighter">
              <div className="flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5" />
                <span>Node: <span className="text-blue-400">{serverId || 'Detecting...'}</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                <span>Status: <span className={status === 'connected' ? 'text-emerald-400' : 'text-red-400'}>{status}</span></span>
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
            {['General', 'Tech', 'Random'].map(room => (
              <button
                key={room}
                onClick={() => joinRoom(room)}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                  currentRoom === room 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {room}
              </button>
            ))}
          </div>
        </header>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.filter(m => !m.room || m.room === currentRoom).map((msg, idx) => (
            <div 
              key={idx} 
              className={`flex flex-col ${msg.from === username ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className="text-xs font-bold text-slate-500">{msg.from}</span>
                {msg.type === 'dm' && (
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 rounded uppercase font-black">Direct Message</span>
                )}
              </div>
              <div 
                className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm shadow-lg ${
                  msg.from === username 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : msg.type === 'dm'
                    ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-100 rounded-tl-none'
                    : 'bg-slate-800 text-slate-100 rounded-tl-none'
                }`}
              >
                {msg.text}
                <div className="text-[9px] mt-1 opacity-40 font-mono flex justify-end">
                  {msg.msgId?.split('-')[0]}
                </div>
              </div>
            </div>
          ))}
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-600">
              <MessageSquare className="w-12 h-12 mb-2 opacity-20" />
              <p className="text-sm italic">No messages yet. Start the conversation!</p>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input bar */}
        <div className="p-6 bg-slate-900/30 border-t border-slate-800">
          <form onSubmit={handleSendChat} className="relative">
            <input 
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-700 text-white pl-4 pr-14 py-3 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600"
              placeholder={`Message #${currentRoom}...`}
            />
            <button 
              type="submit"
              className="absolute right-2 top-2 p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>

        {/* DM Popup */}
        {dmRecipient && (
          <div className="absolute bottom-24 right-6 w-80 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            <div className="p-4 bg-slate-800/50 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                <span className="font-bold text-sm">DM with {dmRecipient}</span>
              </div>
              <button onClick={() => setDmRecipient(null)} className="text-slate-500 hover:text-white">✕</button>
            </div>
            <div className="p-4">
              <form onSubmit={handleSendDM} className="flex flex-col gap-3">
                <textarea 
                  value={dmText}
                  onChange={(e) => setDmText(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none h-24"
                  placeholder="Type a private message..."
                />
                <button 
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Send DM
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
