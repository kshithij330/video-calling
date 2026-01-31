import { useState, useEffect, useRef } from 'react';
import { Send, X, MessageSquare, Smile } from 'lucide-react';

export default function ChatPanel({ messages, onSendMessage, onClose, currentUserId }) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-panel animate-slide-in">
      <div className="chat-header">
        <div className="chat-header-title">
          <MessageSquare size={18} />
          <span>In-call messages</span>
        </div>
        <button className="chat-close-btn" onClick={onClose} title="Close chat">
          <X size={20} />
        </button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <MessageSquare size={48} className="chat-empty-icon" />
            <p>No messages yet.</p>
            <span>Messages are only visible to people in the call and are deleted when the call ends.</span>
          </div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`chat-message ${msg.senderId === currentUserId ? 'own' : ''}`}
            >
              <div className="chat-message-info">
                <span className="chat-sender">{msg.senderId === currentUserId ? 'You' : msg.senderName}</span>
                <span className="chat-time">{formatTime(msg.timestamp)}</span>
              </div>
              <div className="chat-message-bubble">
                {msg.message}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-area" onSubmit={handleSubmit}>
        <div className="chat-input-wrapper">
          <input
            type="text"
            className="chat-input"
            placeholder="Send a message"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <button 
            type="submit" 
            className="chat-send-btn"
            disabled={!inputText.trim()}
            title="Send"
          >
            <Send size={18} />
          </button>
        </div>
      </form>
    </div>
  );
}
