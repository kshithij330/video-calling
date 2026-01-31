import { useState, useEffect, useRef } from 'react';
import { Send, X, MessageSquare, Smile, Search, Loader2 } from 'lucide-react';

const GIPHY_API_KEY = 'WkByA9zfm6wqfkLmzH9PjcYiSl8DRGGi'; 

export default function ChatPanel({ messages, onSendMessage, onClose, currentUserId }) {
  const [inputText, setInputText] = useState('');
  const [showGifs, setShowGifs] = useState(false);
  const [gifSearch, setGifSearch] = useState('');
  const [gifs, setGifs] = useState([]);
  const [loadingGifs, setLoadingGifs] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (showGifs) {
        fetchGifs();
      }
    }, 500); // Debounce search
    return () => clearTimeout(timer);
  }, [showGifs, gifSearch]);

  const fetchGifs = async () => {
    setLoadingGifs(true);
    setGifs([]); // Clear existing to show loading
    try {
      const query = encodeURIComponent(gifSearch);
      const endpoint = gifSearch 
        ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${query}&limit=20&rating=g`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=g`;
      
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      setGifs(data.data || []);
    } catch (error) {
      console.error('Error fetching GIFs:', error);
      setGifs([]);
    } finally {
      setLoadingGifs(false);
    }
  };

  const handleSendGif = (gifUrl) => {
    // We send the URL as a special message or just as text
    onSendMessage({ type: 'gif', content: gifUrl });
    setShowGifs(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputText.trim()) {
      onSendMessage({ type: 'text', content: inputText.trim() });
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
          <MessageSquare size={18} className="accent-color" />
          <span>In-call messages</span>
        </div>
        <button className="chat-close-btn" onClick={onClose} title="Close chat">
          <X size={20} />
        </button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon-wrapper">
              <MessageSquare size={48} />
            </div>
            <h3>No messages yet</h3>
            <p>Messages are only visible to people in the call and are deleted when the call ends.</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isOwn = msg.senderId === currentUserId;
            const messageData = typeof msg.message === 'object' ? msg.message : { type: 'text', content: msg.message };
            
            return (
              <div 
                key={msg.id || idx} 
                className={`chat-message ${isOwn ? 'own' : ''}`}
              >
                <div className="chat-message-info">
                  <span className="chat-sender">{isOwn ? 'You' : msg.senderName}</span>
                  <span className="chat-time">{formatTime(msg.timestamp)}</span>
                </div>
                <div className="chat-message-bubble">
                  {messageData.type === 'gif' ? (
                    <img src={messageData.content} alt="GIF" className="chat-gif" />
                  ) : (
                    <p>{messageData.content}</p>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {showGifs && (
        <div className="gif-picker-panel animate-slide-up">
          <div className="gif-search-bar">
            <Search size={16} />
            <input 
              type="text" 
              placeholder="Search GIPHY..." 
              value={gifSearch}
              onChange={(e) => setGifSearch(e.target.value)}
              autoFocus
            />
            <button onClick={() => setShowGifs(false)}><X size={16} /></button>
          </div>
          <div className="gif-results">
            {loadingGifs ? (
              <div className="gif-loading">
                <Loader2 className="animate-spin" />
              </div>
            ) : gifs.length > 0 ? (
              gifs.map((gif) => (
                <img 
                  key={gif.id} 
                  src={gif.images.fixed_height_small.url} 
                  alt={gif.title}
                  onClick={() => handleSendGif(gif.images.fixed_height.url)}
                />
              ))
            ) : showGifs && (
              <div className="gif-no-results">
                <p>No GIFs found</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="chat-input-container">
        <form className="chat-input-area" onSubmit={handleSubmit}>
          <button 
            type="button" 
            className={`chat-gif-toggle ${showGifs ? 'active' : ''}`}
            onClick={() => setShowGifs(!showGifs)}
            title="Send GIF"
          >
            GIF
          </button>
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
    </div>
  );
}
