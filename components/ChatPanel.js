import { useState, useRef, useEffect } from 'react';

const GIPHY_API_KEY = 'WkByA9zfm6wqfkLmzH9PjcYiSl8DRGGi'; // User provided key

export default function ChatPanel({ 
  messages, 
  onSendMessage, 
  onClose,
  currentUserId 
}) {
  const [newMessage, setNewMessage] = useState('');
  const [showGifPicker, setShowGifPicker] = useState(false);
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

  // Fetch GIFs when picker is opened or search changes
  useEffect(() => {
    if (!showGifPicker) return;

    const fetchGifs = async () => {
      setLoadingGifs(true);
      try {
        const endpoint = gifSearch.trim() 
          ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(gifSearch)}&limit=20&rating=g`
          : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=g`;
        
        const response = await fetch(endpoint);
        const data = await response.json();
        setGifs(data.data || []);
      } catch (error) {
        console.error('Error fetching GIFs:', error);
      } finally {
        setLoadingGifs(false);
      }
    };

    const timeoutId = setTimeout(fetchGifs, 500);
    return () => clearTimeout(timeoutId);
  }, [gifSearch, showGifPicker]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (newMessage.trim()) {
      onSendMessage(newMessage);
      setNewMessage('');
    }
  };

  const handleGifSelect = (gifUrl) => {
    onSendMessage(gifUrl);
    setShowGifPicker(false);
    setGifSearch('');
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isGifUrl = (text) => {
    return text.match(/\.(preview|media)\.giphy\.com|giphy\.com\/media|giphy\.com\/gifs|\.gif$/);
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h3 className="chat-title">Chat</h3>
        <button className="chat-close" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            color: 'var(--text-muted)',
            padding: '40px 20px'
          }}>
            <p style={{ fontSize: '32px', marginBottom: '12px' }}>💬</p>
            <p>No messages yet</p>
            <p style={{ fontSize: '13px' }}>Be the first to say hello!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id} 
              className="chat-message"
              style={{
                alignSelf: msg.senderId === currentUserId ? 'flex-end' : 'flex-start'
              }}
            >
              <div className="chat-message-header">
                <span className="chat-message-sender">
                  {msg.senderId === currentUserId ? 'You' : msg.senderName}
                </span>
                <span className="chat-message-time">
                  {formatTime(msg.timestamp)}
                </span>
              </div>
              <div className="chat-message-content" style={{
                background: msg.senderId === currentUserId 
                  ? 'var(--accent-primary)' 
                  : 'var(--bg-glass)',
                borderTopRightRadius: msg.senderId === currentUserId ? '4px' : 'var(--radius-md)',
                borderTopLeftRadius: msg.senderId !== currentUserId ? '4px' : 'var(--radius-md)',
                padding: isGifUrl(msg.message) ? '4px' : '10px 14px'
              }}>
                {isGifUrl(msg.message) ? (
                  <img 
                    src={msg.message} 
                    alt="GIF" 
                    className="chat-gif" 
                    onLoad={scrollToBottom}
                  />
                ) : (
                  msg.message
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {showGifPicker && (
        <div className="gif-picker-popup">
          <div className="gif-picker-header">
            <input
              type="text"
              className="gif-search-input"
              placeholder="Search GIFs..."
              value={gifSearch}
              onChange={(e) => setGifSearch(e.target.value)}
              autoFocus
            />
            <button className="gif-picker-close" onClick={() => setShowGifPicker(false)}>
              ✕
            </button>
          </div>
          <div className="gif-grid">
            {loadingGifs ? (
              <div className="gif-loading">Loading...</div>
            ) : gifs.length > 0 ? (
              gifs.map((gif) => (
                <img
                  key={gif.id}
                  src={gif.images.fixed_height_small.url}
                  alt={gif.title}
                  className="gif-item"
                  onClick={() => handleGifSelect(gif.images.original.url)}
                />
              ))
            ) : (
              <div className="gif-no-results">No GIFs found</div>
            )}
          </div>
        </div>
      )}

      <form className="chat-input-container" onSubmit={handleSubmit}>
        <button 
          type="button" 
          className={`chat-gif-btn ${showGifPicker ? 'active' : ''}`}
          onClick={() => setShowGifPicker(!showGifPicker)}
        >
          GIF
        </button>
        <input
          type="text"
          className="chat-input"
          placeholder="Type a message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          disabled={showGifPicker}
        />
        <button type="submit" className="chat-send-btn" disabled={!newMessage.trim() || showGifPicker}>
          ➤
        </button>
      </form>
    </div>
  );
}
