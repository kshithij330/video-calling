import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Info,
  Circle,
  Square,
  Download,
  Loader2,
  MicOff,
  MessageSquare
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
  const [privateChatTarget, setPrivateChatTarget] = useState(null); // { id, name }
  const [showSettings, setShowSettings] = useState(false);
  const [roomSettings, setRoomSettings] = useState({ isContinuousChat: false });
  const [roomStartTime, setRoomStartTime] = useState(null);
  const [meetingDuration, setMeetingDuration] = useState('00:00');
  
  const [recordingState, setRecordingState] = useState({ isRecording: false, startTime: null, initiatorId: null });
  const [recordingDuration, setRecordingDuration] = useState('00:00');
  const [showRecordingModal, setShowRecordingModal] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const audioDestRef = useRef(null);
  const animationFrameRef = useRef(null);
  const timerWorkerRef = useRef(null);
  const recentMessagesRef = useRef([]); // For recording canvas notifications
  
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
      
      // Add to recent messages for recording canvas
      recentMessagesRef.current.push({
        ...message,
        addedAt: Date.now()
      });
      // Keep only last few or those within last 5s
      recentMessagesRef.current = recentMessagesRef.current.filter(m => Date.now() - m.addedAt < 5000);
    };

    socket.on('chat-history', handleChatHistory);
    socket.on('new-message', handleNewMessage);

    return () => {
      socket.off('chat-history', handleChatHistory);
      socket.off('new-message', handleNewMessage);
    };
  }, [socket, isJoined, showChat]);

  // Room Settings & Start Time sync
  useEffect(() => {
    if (!socket || !isJoined) return;

    const handleSettingsUpdate = (settings) => setRoomSettings(settings);
    const handleStartTime = (startTime) => setRoomStartTime(startTime);
    const handleRecordingState = (state) => setRecordingState(state);

    socket.on('room-settings-updated', handleSettingsUpdate);
    socket.on('room-start-time', handleStartTime);
    socket.on('recording-state-updated', handleRecordingState);

    return () => {
      socket.off('room-settings-updated', handleSettingsUpdate);
      socket.off('room-start-time', handleStartTime);
      socket.off('recording-state-updated', handleRecordingState);
    };
  }, [socket, isJoined]);

  // Auto-cleanup pinnedIds when streams are lost
  useEffect(() => {
    setPinnedIds(prev => {
      const validIds = prev.filter(id => {
        if (id === 'local') return !!localStream;
        if (id === 'local-screen') return !!localScreenStream;
        if (id.endsWith('-screen')) {
          const userId = id.replace('-screen', '');
          return remoteScreenStreams.has(userId);
        }
        return remoteStreams.has(id);
      });
      
      if (validIds.length !== prev.length) return validIds;
      return prev;
    });
  }, [localStream, localScreenStream, remoteStreams, remoteScreenStreams]);

  // Recording Timer logic
  useEffect(() => {
    if (!recordingState.isRecording || !recordingState.startTime) {
      setRecordingDuration('00:00');
      return;
    }

    const updateTimer = () => {
      const diff = Date.now() - recordingState.startTime;
      const seconds = Math.floor(diff / 1000);
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      setRecordingDuration(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [recordingState.isRecording, recordingState.startTime]);

  // Recording Engine
  useEffect(() => {
    if (!socket || !isJoined || !recordingState.isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        stopLocalRecording();
      }
      return;
    }

    if (recordingState.initiatorId === socket.id) {
      startLocalRecording();
    }

    async function startLocalRecording() {
      try {
        chunksRef.current = [];
        
        // 1. Setup Audio Mixing
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtxRef.current = audioCtx;
        const dest = audioCtx.createMediaStreamDestination();
        audioDestRef.current = dest;

        // Mix all audio tracks (Microphones and Screen Shares)
        const streamsToMix = [
          localStream, 
          localScreenStream,
          ...Array.from(remoteStreams.values()),
          ...Array.from(remoteScreenStreams.values())
        ];
        
        streamsToMix.forEach(stream => {
          if (stream && stream.getAudioTracks().length > 0) {
            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(dest);
          }
        });

        // 2. Setup Video Compositing (Canvas)
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const videoStream = canvas.captureStream(30); // 30 FPS

        // Helper to draw image/video with "cover" behavior (prevent stretching)
        const drawImageProp = (img, x, y, w, h) => {
          const iw = img.videoWidth || img.width;
          const ih = img.videoHeight || img.height;
          const r = Math.min(w / iw, h / ih);
          let nw = iw * r, nh = ih * r, cx, cy, cw, ch, ar = 1;

          if (nw < w) ar = w / nw;                             
          if (Math.abs(ar - 1) < 1e-14 && nh < h) ar = h / nh; 
          nw *= ar; nh *= ar;

          cw = iw / (nw / w);
          ch = ih / (nh / h);
          cx = (iw - cw) * 0.5;
          cy = (ih - ch) * 0.5;

          if (cx < 0) cx = 0; if (cy < 0) cy = 0;
          if (cw > iw) cw = iw; if (ch > ih) ch = ih;

          ctx.drawImage(img, cx, cy, cw, ch, x, y, w, h);
        };

        // Helper to draw a microphone icon (muted or unmuted)
        const drawMicStatus = (x, y, isMuted) => {
          const size = 32;
          ctx.save();
          ctx.translate(x - size, y);
          
          // Background circle
          ctx.fillStyle = isMuted ? 'rgba(239, 68, 68, 0.9)' : 'rgba(0, 0, 0, 0.6)';
          ctx.beginPath();
          ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 1;
          ctx.stroke();

          // Microphone icon
          ctx.strokeStyle = isMuted ? 'white' : '#22c55e';
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          
          // U-shape
          ctx.beginPath();
          ctx.arc(size/2, size/2 - 2, 4.5, 0, Math.PI);
          ctx.stroke();
          
          // Stem
          ctx.beginPath();
          ctx.moveTo(size/2, size/2 + 2.5);
          ctx.lineTo(size/2, size/2 + 6);
          ctx.stroke();

          if (isMuted) {
            // Slash
            ctx.beginPath();
            ctx.moveTo(size/2 - 6, size/2 - 7);
            ctx.lineTo(size/2 + 6, size/2 + 5);
            ctx.stroke();
          }
          
          ctx.restore();
        };

        // 0. Setup Background Timer Worker to prevent freezing in background tabs
        const workerCode = `
          let timer = null;
          self.onmessage = (e) => {
            if (e.data === 'start') {
              if (timer) clearInterval(timer);
              timer = setInterval(() => self.postMessage('tick'), 1000/30);
            } else if (e.data === 'stop') {
              clearInterval(timer);
              timer = null;
            }
          };
        `;
        const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
        const timerWorker = new Worker(URL.createObjectURL(workerBlob));
        timerWorkerRef.current = timerWorker;

        // Drawing loop
        const draw = () => {
          if (!recordingState.isRecording) return;
          
          ctx.fillStyle = '#09090b';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          const activeStreams = [
            { id: 'local', stream: localStream, name: userName },
            ...(localScreenStream ? [{ id: 'local-screen', stream: localScreenStream, name: `${userName}'s Screen` }] : []),
            ...Array.from(participants.entries()).flatMap(([id, p]) => {
              const res = [];
              if (remoteStreams.has(id)) {
                res.push({ id, stream: remoteStreams.get(id), name: p.userName });
              }
              if (remoteScreenStreams.has(id)) {
                res.push({ id: `${id}-screen`, stream: remoteScreenStreams.get(id), name: `${p.userName}'s Screen` });
              }
              return res;
            })
          ].filter(s => s.stream);

          if (activeStreams.length === 0) return;

          // Calculate grid
          const count = activeStreams.length;
          const cols = Math.ceil(Math.sqrt(count));
          const rows = Math.ceil(count / cols);
          const w = canvas.width / cols;
          const h = canvas.height / rows;

          activeStreams.forEach((s, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = col * w;
            const y = row * h;

            // Draw video or avatar
            const videoElem = document.getElementById(`video-${s.id}`);
            if (videoElem && videoElem.readyState >= 2) {
              drawImageProp(videoElem, x, y, w, h);
            } else {
              // Placeholder
              ctx.fillStyle = '#18181b';
              ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
              ctx.fillStyle = '#ffffff';
              ctx.font = `${Math.min(w, h) / 8}px Inter`;
              ctx.textAlign = 'center';
              ctx.fillText(s.name, x + w / 2, y + h / 2);
            }

            // Draw status indicator (Mic)
            const participantObj = s.id === 'local' ? { isMuted } : participants.get(s.id);
            drawMicStatus(x + w - 10, y + 10, participantObj?.isMuted);

            // Draw name tag
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.font = '14px Inter';
            const nameLabel = s.id === 'local' ? `${s.name} (You)` : s.name;
            const nameWidth = ctx.measureText(nameLabel).width;
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(x + 10, y + h - 35, nameWidth + 20, 25, 4);
            } else {
              ctx.rect(x + 10, y + h - 35, nameWidth + 20, 25);
            }
            ctx.fill();
            ctx.fillStyle = 'white';
            ctx.textAlign = 'left';
            ctx.fillText(nameLabel, x + 20, y + h - 17);
          });


          // Draw Chat Notifications
          const now = Date.now();
          const recentMsgs = recentMessagesRef.current.filter(m => now - m.addedAt < 5000);
          
          recentMsgs.forEach((msg, idx) => {
            const timeAlive = now - msg.addedAt;
            const opacity = timeAlive > 4000 ? (5000 - timeAlive) / 1000 : 1;
            const slideIn = timeAlive < 500 ? (timeAlive / 500) * 320 : 320;
            
            ctx.save();
            ctx.globalAlpha = opacity;
            const bubbleY = 100 + (idx * 80);
            const bubbleX = canvas.width - slideIn;
            
            // Bubble background
            ctx.fillStyle = 'rgba(24, 24, 27, 0.9)';
            ctx.beginPath();
            if (ctx.roundRect) {
              ctx.roundRect(bubbleX, bubbleY, 300, 60, 10);
            } else {
              ctx.rect(bubbleX, bubbleY, 300, 60);
            }
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.stroke();

            // Bubble content
            ctx.fillStyle = '#3b82f6';
            ctx.font = 'bold 12px Inter';
            ctx.fillText(msg.senderName, bubbleX + 15, bubbleY + 25);
            
            ctx.fillStyle = 'white';
            ctx.font = '14px Inter';
            const messageText = typeof msg.message === 'object' ? (msg.message.content || '') : msg.message;
            const truncatedMsg = messageText.length > 35 ? messageText.slice(0, 32) + '...' : messageText;
            ctx.fillText(truncatedMsg, bubbleX + 15, bubbleY + 45);
            ctx.restore();
          });
        };

        timerWorker.onmessage = () => draw();
        timerWorker.postMessage('start');

        // 3. Combine and Record
        const combinedStream = new MediaStream([
          ...videoStream.getVideoTracks(),
          ...dest.stream.getAudioTracks()
        ]);

        const recorder = new MediaRecorder(combinedStream, {
          mimeType: 'video/webm;codecs=vp8,opus'
        });

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          let blob = new Blob(chunksRef.current, { type: 'video/webm' });
          
          setRecordedBlob(blob);
          setShowRecordingModal(true);
          
          // Cleanup
          if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
          if (timerWorkerRef.current) {
            timerWorkerRef.current.postMessage('stop');
            timerWorkerRef.current.terminate();
            timerWorkerRef.current = null;
          }
          if (audioCtxRef.current) audioCtxRef.current.close();
        };

        recorder.start(1000); // chunk every second
        mediaRecorderRef.current = recorder;

      } catch (err) {
        console.error('Recording initialization failed:', err);
        socket.emit('stop-recording', { roomId });
        alert('Failed to start recording. Please check permissions.');
      }
    }

    function stopLocalRecording() {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    }

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (timerWorkerRef.current) {
        timerWorkerRef.current.postMessage('stop');
        timerWorkerRef.current.terminate();
        timerWorkerRef.current = null;
      }
    };
  }, [recordingState.isRecording, recordingState.initiatorId, localStream, remoteStreams, participants, socket, isJoined]);

  // Meeting Timer logic
  useEffect(() => {
    if (!roomStartTime) return;

    const updateTimer = () => {
      const diff = Date.now() - roomStartTime;
      const seconds = Math.floor(diff / 1000);
      
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;

      const formatted = [
        h > 0 ? h : null,
        m.toString().padStart(2, '0'),
        s.toString().padStart(2, '0')
      ].filter(Boolean).join(':');

      setMeetingDuration(formatted);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [roomStartTime]);

  const sendMessage = (message, toId) => {
    socket?.emit('chat-message', { roomId, message, toId });
  };

  const handleUpdateSettings = (newSettings) => {
    socket?.emit('update-room-settings', { roomId, settings: newSettings });
  };
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
            
            <div className="recording-controls">
              {!recordingState.isRecording ? (
                <button 
                  className="record-btn" 
                  onClick={() => socket.emit('start-recording', { roomId })}
                  title="Start Recording"
                >
                  <Circle size={16} fill="currentColor" />
                  <span>Record</span>
                </button>
              ) : (
                <div className="recording-status">
                  <div className="recording-indicator">
                    <Circle size={12} fill="#ef4444" color="#ef4444" className="pulse-icon" />
                    <span>REC {recordingDuration}</span>
                  </div>
                  {recordingState.initiatorId === socket?.id && (
                    <button 
                      className="stop-record-btn" 
                      onClick={() => socket.emit('stop-recording', { roomId })}
                      title="Stop Recording"
                    >
                      <Square size={14} fill="currentColor" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="header-stats">
            <div className="meeting-duration" title="Meeting duration">
              <span>{meetingDuration}</span>
            </div>
            <div className="participant-count">
              <Users size={18} />
              <span>{participants.size + 1} participant{participants.size !== 0 ? 's' : ''}</span>
            </div>
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
              isMuted={isMuted}
              isCameraOff={isCameraOff}
              onRemoteMute={remoteMute}
              onRemoteCameraOff={remoteCameraOff}
              onStartPrivateChat={(id, name) => {
                setPrivateChatTarget({ id, name });
                setShowChat(true);
              }}
            />
          </div>

          {showChat && (
            <ChatPanel
              messages={messages}
              onSendMessage={sendMessage}
              onClose={() => setShowChat(false)}
              currentUserId={socket?.id}
              privateChatTarget={privateChatTarget}
              onClearPrivateChat={() => setPrivateChatTarget(null)}
              onPrivateReply={(id, name) => setPrivateChatTarget({ id, name })}
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
          onToggleSettings={() => setShowSettings(!showSettings)}
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

        {showSettings && (
          <SettingsModal 
            settings={roomSettings} 
            onUpdate={handleUpdateSettings} 
            onClose={() => setShowSettings(false)} 
          />
        )}

        {showRecordingModal && (
          <RecordingModal
            blob={recordedBlob}
            onClose={() => {
              setShowRecordingModal(false);
              setRecordedBlob(null);
            }}
          />
        )}

        <canvas ref={canvasRef} style={{ display: 'none' }} width={1280} height={720} />
      </div>
    </>
  );
}

function SettingsModal({ settings, onUpdate, onClose }) {
  return (
    <div className="modal-overlay">
      <div className="modal-content settings-modal">
        <div className="modal-header">
          <div className="modal-title">
            <Settings size={20} className="modal-title-icon" />
            <h2>Room Settings</h2>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="settings-list">
          <div className="settings-item">
            <div className="settings-info">
              <label>Continuous Chat</label>
              <p>Keep chat history and room active after everyone leaves</p>
            </div>
            <label className="switch">
              <input 
                type="checkbox" 
                checked={settings?.isContinuousChat}
                onChange={(e) => onUpdate({ isContinuousChat: e.target.checked })}
              />
              <span className="slider round"></span>
            </label>
          </div>
        </div>

        <div className="settings-footer">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function RecordingModal({ blob, onClose }) {
  const [isConverting, setIsConverting] = useState(false);
  const videoUrl = useMemo(() => {
    return blob ? URL.createObjectURL(blob) : null;
  }, [blob]);

  // Handle video load to fix seeking for WebM
  const handleLoadedMetadata = (e) => {
    const video = e.target;
    if (video.duration === Infinity) {
      video.currentTime = 1e101;
      video.ontimeupdate = function() {
        this.ontimeupdate = () => {};
        this.currentTime = 0;
      };
    }
  };

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const handleConvertToMp4 = async () => {
    if (!blob || isConverting) return;
    
    setIsConverting(true);
    try {
      const formData = new FormData();
      formData.append('video', blob, 'recording.webm');

      const response = await fetch('/api/convert', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Conversion failed');

      const mp4Blob = await response.blob();
      const mp4Url = URL.createObjectURL(mp4Blob);
      
      const a = document.createElement('a');
      a.href = mp4Url;
      a.download = `meeting-recording-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(mp4Url);
    } catch (err) {
      console.error('MP4 Conversion Error:', err);
      alert('Failed to convert to MP4. Please try downloading the WebM version instead.');
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content recording-modal">
        <div className="modal-header">
          <div className="modal-title">
            <Circle size={20} fill="#ef4444" color="#ef4444" />
            <h2>Recording Ready</h2>
          </div>
          <button className="modal-close" onClick={onClose} disabled={isConverting}>×</button>
        </div>
        
        <div className="recording-preview">
          {videoUrl ? (
            <video 
              src={videoUrl} 
              controls 
              autoPlay 
              onLoadedMetadata={handleLoadedMetadata}
              className="preview-video" 
            />
          ) : (
            <div className="preview-placeholder">Processing recording...</div>
          )}
          
          {isConverting && (
            <div className="conversion-overlay">
              <div className="conversion-status">
                <Loader2 className="animate-spin" size={32} color="var(--accent-primary)" />
                <p>Converting to MP4 for offline playback...</p>
                <p className="status-note">This may take a moment depending on recording length.</p>
              </div>
            </div>
          )}
        </div>

        <div className="recording-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={isConverting}>Close</button>
          
          <div className="footer-actions">
            <button 
              className="btn btn-primary btn-with-icon" 
              onClick={handleConvertToMp4}
              disabled={isConverting}
              style={{ padding: '12px 24px' }}
            >
              {isConverting ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  <span>Converting...</span>
                </>
              ) : (
                <>
                  <Download size={20} />
                  <span>Download Recording (MP4)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



