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
  const [pinnedId, setPinnedId] = useState(null);
  
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedAudioId, setSelectedAudioId] = useState('');
  const [selectedVideoId, setSelectedVideoId] = useState('');

  const { socket, isConnected } = useSocket();

  const handleAutoPin = useCallback((id) => {
    setPinnedId(id);
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

  const sendMessage = (message) => {
    if (message.trim()) {
      socket?.emit('chat-message', { roomId, message: message.trim() });
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
        <title>Room: {roomId} | MeetUp</title>
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
              pinnedId={pinnedId}
              onPin={(id) => setPinnedId(prev => prev === id ? null : id)}
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
            // Device switching logic can be added to useWebRTC if needed
          }}
          onChangeVideo={(id) => {
            setSelectedVideoId(id);
            // Device switching logic can be added to useWebRTC if needed
          }}
        />
      </div>
    </>
  );
}
