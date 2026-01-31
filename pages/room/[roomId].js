import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { io } from 'socket.io-client';
import { 
  Copy, 
  Check, 
  Users, 
  Video as VideoIcon, 
  Settings, 
  Shield, 
  Info 
} from 'lucide-react';
import VideoGrid from '../../components/VideoGrid';
import ControlBar from '../../components/ControlBar';
import ChatPanel from '../../components/ChatPanel';
import { useWebRTC } from '../../hooks/useWebRTC';
import { useSocket } from '../../hooks/useSocket';

export default function Room() {
  const router = useRouter();
  const { roomId } = router.query;
  
  const [userName, setUserName] = useState('');
  const [showNameModal, setShowNameModal] = useState(true);
  const [isJoined, setIsJoined] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [pinnedIds, setPinnedIds] = useState([]);
  const [privateRecipient, setPrivateRecipient] = useState(null);
  
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedAudioId, setSelectedAudioId] = useState('');
  const [selectedVideoId, setSelectedVideoId] = useState('');

  const { socket, isConnected } = useSocket();

  const handleAutoPin = useCallback((id) => {
    setPinnedIds(prev => prev.includes(id) ? prev : [...prev, id]);
  }, []);

  const {
    localStream,
    localScreenStream,
    remoteStreams,
    remoteScreenStreams,
    participants,
    isMuted,
    isCameraOff,
    isScreenSharing,
    isHandRaised,
    initializeMedia,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    toggleHandRaise,
    remoteMute,
    remoteCameraOff,
    switchAudioInput,
    switchVideoInput,
    cleanup
  } = useWebRTC({ socket, roomId, userName, onAutoPin: handleAutoPin });

  // Handle joining room
  const joinRoom = async (e) => {
    e.preventDefault();
    if (!userName.trim() || !roomId || !socket) return;

    const stream = await initializeMedia();
    if (stream) {
      socket.emit('join-room', { roomId, userName: userName.trim() });
      setIsJoined(true);
      setShowNameModal(false);
    } else {
      alert('Could not access camera or microphone. Please allow permissions.');
    }
  };

  // Chat logic
  useEffect(() => {
    if (!socket || !isJoined) return;

    const handleChatHistory = (history) => setMessages(history);
    const handleNewMessage = (message) => {
      setMessages(prev => [...prev, message]);
      if (!showChat) setUnreadCount(prev => prev + 1);
    };

    socket.on('chat-history', handleChatHistory);
    socket.on('new-message', handleNewMessage);

    return () => {
      socket.off('chat-history', handleChatHistory);
      socket.off('new-message', handleNewMessage);
    };
  }, [socket, isJoined, showChat]);

  const sendMessage = (messagePayload) => {
    // messagePayload is { type, content, to }
    socket?.emit('chat-message', { roomId, message: messagePayload, to: messagePayload.to });
  };

  const handlePrivateMessage = (toId, toName) => {
    if (toId) {
      setPrivateRecipient({ id: toId, name: toName });
      setShowChat(true);
    } else {
      setPrivateRecipient(null);
    }
  };

  // Device management
  useEffect(() => {
    if (!isJoined) return;

    const getDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAudioDevices(devices.filter(d => d.kind === 'audioinput'));
        setVideoDevices(devices.filter(d => d.kind === 'videoinput'));
      } catch (err) {
        console.error('Error enumerating devices:', err);
      }
    };

    getDevices();
    navigator.mediaDevices.addEventListener('devicechange', getDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', getDevices);
  }, [isJoined]);

  // Copy room ID
  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'd') {
          e.preventDefault();
          toggleMute();
        } else if (e.key.toLowerCase() === 'e') {
          e.preventDefault();
          toggleCamera();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleMute, toggleCamera]);

  // Leave room
  const leaveRoom = () => {
    cleanup();
    router.push('/');
  };

  if (!roomId) return null;

  return (
    <>
      <Head>
        <title>Joining Room: {roomId} | MeetUp</title>
        <meta name="description" content={`Join my video call on MeetUp in room ${roomId}. Secure and private.`} />
        
        {/* Open Graph / Facebook / WhatsApp */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={`MeetUp Call - Room ${roomId}`} />
        <meta property="og:description" content="Click the link to join my private video call. No account needed." />
        <meta property="og:image" content="/preview.png" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`Join MeetUp Call: ${roomId}`} />
        <meta name="twitter:description" content="Secure, high-quality video calling. Join now." />
        <meta name="twitter:image" content="/preview.png" />
      </Head>

      {showNameModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2 className="modal-title">Join Meeting</h2>
            <p className="modal-subtitle">
              Enter your name to join room <strong>{roomId}</strong>
            </p>
            <form className="modal-form" onSubmit={joinRoom}>
              <input
                type="text"
                className="input"
                placeholder="Your name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                autoFocus
                required
              />
              <button 
                type="submit" 
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={!userName.trim() || !isConnected}
              >
                {isConnected ? 'Join Room' : 'Connecting...'}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="room-container">
        <header className="room-header">
          <div className="room-info">
            <VideoIcon className="room-logo-icon" size={24} color="var(--accent-primary)" />
            <div className="room-id-container">
              <span className="room-id-label">Room ID:</span>
              <span className="room-id">{roomId}</span>
              <button className="copy-btn" onClick={copyRoomId} title="Copy Room ID">
                {copied ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
              </button>
            </div>
          </div>
          <div className="participant-count">
            <Users size={18} />
            <span>{participants.size + 1} participant{participants.size !== 0 ? 's' : ''}</span>
          </div>
        </header>

        <div className="room-main">
          <div className="video-area">
            <VideoGrid
              localStream={localStream}
              localScreenStream={localScreenStream}
              remoteStreams={remoteStreams}
              remoteScreenStreams={remoteScreenStreams}
              participants={participants}
              localUserName={userName}
              localHandRaised={isHandRaised}
              pinnedIds={pinnedIds}
              onTogglePin={(id) => setPinnedIds(prev => 
                prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
              )}
              onPrivateMessage={handlePrivateMessage}
              isMuted={isMuted}
              isCameraOff={isCameraOff}
              onRemoteMute={remoteMute}
              onRemoteCameraOff={remoteCameraOff}
            />
          </div>

          {showChat && (
            <ChatPanel
              messages={messages}
              onSendMessage={sendMessage}
              onClose={() => setShowChat(false)}
              currentUserId={socket?.id}
              privateRecipient={privateRecipient}
              onClearPrivateRecipient={() => setPrivateRecipient(null)}
              onReplyPrivate={(senderId, senderName) => handlePrivateMessage(senderId, senderName)}
            />
          )}
        </div>

        <ControlBar
          isMuted={isMuted}
          isCameraOff={isCameraOff}
          isScreenSharing={isScreenSharing}
          isHandRaised={isHandRaised}
          unreadCount={unreadCount}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
          onToggleScreenShare={toggleScreenShare}
          onToggleHandRaise={toggleHandRaise}
          onToggleChat={() => {
            setShowChat(!showChat);
            setUnreadCount(0);
          }}
          onLeave={leaveRoom}
          audioDevices={audioDevices}
          videoDevices={videoDevices}
          selectedAudioId={selectedAudioId}
          selectedVideoId={selectedVideoId}
          onChangeAudio={(id) => {
            setSelectedAudioId(id);
            switchAudioInput(id);
          }}
          onChangeVideo={(id) => {
            setSelectedVideoId(id);
            switchVideoInput(id);
          }}
        />
      </div>
    </>
  );
}
