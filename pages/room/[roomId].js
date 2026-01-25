import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { io } from 'socket.io-client';
import VideoGrid from '../../components/VideoGrid';
import ControlBar from '../../components/ControlBar';
import ChatPanel from '../../components/ChatPanel';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Only include TURN servers if they are provided via environment variables
    ...(process.env.NEXT_PUBLIC_TURN_URL ? [{
      urls: process.env.NEXT_PUBLIC_TURN_URL,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_PASSWORD
    }] : [])
  ]
};

export default function Room() {
  const router = useRouter();
  const { roomId } = router.query;
  
  const [socket, setSocket] = useState(null);
  const [userName, setUserName] = useState('');
  const [showNameModal, setShowNameModal] = useState(true);
  const [isJoined, setIsJoined] = useState(false);
  
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [participants, setParticipants] = useState(new Map());
  
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [pinnedId, setPinnedId] = useState(null);
  
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedAudioId, setSelectedAudioId] = useState('');
  const [selectedVideoId, setSelectedVideoId] = useState('');
  
  const peerConnectionsRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const socketRef = useRef(null);

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io();
    socketRef.current = newSocket;
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Socket event handlers
  useEffect(() => {
    if (!socket || !isJoined) return;

    const handleUserJoined = async ({ id, userName: name }) => {
      console.log('User joined:', id, name);
      setParticipants(prev => {
        const newMap = new Map(prev);
        newMap.set(id, { id, userName: name, isMuted: false, isCameraOff: false });
        return newMap;
      });
      
      // Create offer for new user
      await createPeerConnection(id, true);
    };

    const handleExistingParticipants = (existingParticipants) => {
      existingParticipants.forEach(participant => {
        setParticipants(prev => {
          const newMap = new Map(prev);
          newMap.set(participant.id, participant);
          return newMap;
        });
      });
    };

    const handleUserLeft = ({ id }) => {
      console.log('User left:', id);
      const pc = peerConnectionsRef.current.get(id);
      if (pc) {
        pc.close();
        peerConnectionsRef.current.delete(id);
      }
      setRemoteStreams(prev => {
        const newMap = new Map(prev);
        newMap.delete(id);
        return newMap;
      });
      setParticipants(prev => {
        const newMap = new Map(prev);
        newMap.delete(id);
        return newMap;
      });
    };

    const handleIceCandidate = async ({ from, candidate }) => {
      const pc = peerConnectionsRef.current.get(from);
      if (pc && candidate) {
        try {
          // Only add candidate if remote description is set
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } else {
            // Queue candidate if not ready (simple queue)
            if (!pc.candidateQueue) pc.candidateQueue = [];
            pc.candidateQueue.push(candidate);
          }
        } catch (error) {
          console.error('Error adding ICE candidate:', error);
        }
      }
    };

    const handleAnswer = async ({ from, answer }) => {
      console.log('Received answer from:', from);
      const pc = peerConnectionsRef.current.get(from);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        
        // Process queued candidates
        if (pc.candidateQueue) {
          pc.candidateQueue.forEach(cand => pc.addIceCandidate(new RTCIceCandidate(cand)));
          pc.candidateQueue = [];
        }
      }
    };

    const handleOffer = async ({ from, offer }) => {
      console.log('Received offer from:', from);
      const pc = await createPeerConnection(from, false);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', { to: from, answer });

      // Process queued candidates
      if (pc.candidateQueue) {
        pc.candidateQueue.forEach(cand => pc.addIceCandidate(new RTCIceCandidate(cand)));
        pc.candidateQueue = [];
      }
    };

    const handleToggleMute = ({ id, isMuted }) => {
      setParticipants(prev => {
        const newMap = new Map(prev);
        const participant = newMap.get(id);
        if (participant) {
          newMap.set(id, { ...participant, isMuted });
        }
        return newMap;
      });
    };

    const handleToggleCamera = ({ id, isCameraOff }) => {
      setParticipants(prev => {
        const newMap = new Map(prev);
        const participant = newMap.get(id);
        if (participant) {
          newMap.set(id, { ...participant, isCameraOff });
        }
        return newMap;
      });
    };

    const handleForceMute = () => {
      if (localStreamRef.current) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = false;
          setIsMuted(true);
        }
      }
    };

    const handleForceCameraOff = () => {
      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = false;
          setIsCameraOff(true);
        }
      }
    };

    const handleChatHistory = (history) => {
      setMessages(history);
    };

    const handleNewMessage = (message) => {
      setMessages(prev => [...prev, message]);
      if (!showChat) {
        setUnreadCount(prev => prev + 1);
      }
    };

    socket.on('user-joined', handleUserJoined);
    socket.on('existing-participants', handleExistingParticipants);
    socket.on('user-left', handleUserLeft);
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('user-toggled-mute', handleToggleMute);
    socket.on('user-toggled-camera', handleToggleCamera);
    socket.on('force-mute', handleForceMute);
    socket.on('force-camera-off', handleForceCameraOff);
    socket.on('chat-history', handleChatHistory);
    socket.on('new-message', handleNewMessage);

    return () => {
      socket.off('user-joined', handleUserJoined);
      socket.off('existing-participants', handleExistingParticipants);
      socket.off('user-left', handleUserLeft);
      socket.off('offer', handleOffer);
      socket.off('answer', handleAnswer);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('user-toggled-mute', handleToggleMute);
      socket.off('user-toggled-camera', handleToggleCamera);
      socket.off('force-mute', handleForceMute);
      socket.off('force-camera-off', handleForceCameraOff);
      socket.off('chat-history', handleChatHistory);
      socket.off('new-message', handleNewMessage);
    };
  }, [socket, isJoined, showChat]);

  // Create peer connection
  const createPeerConnection = useCallback(async (remoteId, createOffer) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionsRef.current.set(remoteId, pc);

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Handle incoming tracks
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      setRemoteStreams(prev => {
        const newMap = new Map(prev);
        newMap.set(remoteId, remoteStream);
        return newMap;
      });
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('ice-candidate', {
          to: remoteId,
          candidate: event.candidate
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${remoteId}:`, pc.connectionState);
    };

    if (createOffer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('offer', { to: remoteId, offer });
    }

    return pc;
  }, []);

  // Join room
  const joinRoom = async (e) => {
    e.preventDefault();
    if (!userName.trim() || !roomId) return;

    try {
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      localStreamRef.current = stream;
      setLocalStream(stream);

      // Join the room
      socket?.emit('join-room', { roomId, userName: userName.trim() });
      setIsJoined(true);
      setShowNameModal(false);
    } catch (error) {
      console.error('Error accessing media:', error);
      // Try audio only
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true
        });
        localStreamRef.current = audioStream;
        setLocalStream(audioStream);
        setIsCameraOff(true);

        socket?.emit('join-room', { roomId, userName: userName.trim() });
        setIsJoined(true);
        setShowNameModal(false);
      } catch (audioError) {
        alert('Could not access camera or microphone. Please allow permissions.');
      }
    }
  };

  // Enumerate devices
  useEffect(() => {
    if (!isJoined) return;

    const getDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audio = devices.filter(d => d.kind === 'audioinput');
        const video = devices.filter(d => d.kind === 'videoinput');
        
        setAudioDevices(audio);
        setVideoDevices(video);

        // Set initial selected devices from current tracks if not already set
        if (localStreamRef.current) {
          const aTrack = localStreamRef.current.getAudioTracks()[0];
          const vTrack = localStreamRef.current.getVideoTracks()[0];
          if (aTrack && !selectedAudioId) setSelectedAudioId(aTrack.getSettings().deviceId);
          if (vTrack && !selectedVideoId) setSelectedVideoId(vTrack.getSettings().deviceId);
        }
      } catch (err) {
        console.error('Error enumerating devices:', err);
      }
    };

    getDevices();
    navigator.mediaDevices.addEventListener('devicechange', getDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', getDevices);
  }, [isJoined, selectedAudioId, selectedVideoId]);

  // Switch Audio Device
  const changeAudioDevice = async (deviceId) => {
    setSelectedAudioId(deviceId);
    if (!localStreamRef.current) return;

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } }
      });
      const newTrack = newStream.getAudioTracks()[0];
      const oldTrack = localStreamRef.current.getAudioTracks()[0];

      if (oldTrack) {
        oldTrack.stop();
        localStreamRef.current.removeTrack(oldTrack);
      }
      
      localStreamRef.current.addTrack(newTrack);
      
      // Update all peer connections
      peerConnectionsRef.current.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
        if (sender) sender.replaceTrack(newTrack);
      });

      // Maintain current mute state
      newTrack.enabled = !isMuted;
      
    } catch (err) {
      console.error('Error switching audio device:', err);
    }
  };

  // Switch Video Device
  const changeVideoDevice = async (deviceId) => {
    setSelectedVideoId(deviceId);
    if (!localStreamRef.current || isScreenSharing) return;

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } }
      });
      const newTrack = newStream.getVideoTracks()[0];
      const oldTrack = localStreamRef.current.getVideoTracks()[0];

      if (oldTrack) {
        oldTrack.stop();
        localStreamRef.current.removeTrack(oldTrack);
      }
      
      localStreamRef.current.addTrack(newTrack);
      
      // Update all peer connections
      peerConnectionsRef.current.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(newTrack);
      });

      // Maintain current camera state
      newTrack.enabled = !isCameraOff;
      
      // Force re-render
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      
    } catch (err) {
      console.error('Error switching video device:', err);
    }
  };

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        socket?.emit('toggle-mute', { roomId, isMuted: !audioTrack.enabled });
      }
    }
  }, [socket, roomId]);

  // Toggle camera
  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        const newEnabled = !videoTrack.enabled;
        videoTrack.enabled = newEnabled;
        setIsCameraOff(!newEnabled);
        socket?.emit('toggle-camera', { roomId, isCameraOff: !newEnabled });
        
        // Force re-render by creating a new stream reference for the UI
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }
    }
  }, [socket, roomId]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Check for Ctrl/Cmd keys
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

  // Toggle screen share
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop screen sharing
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }

      // Replace screen track with camera track in all peer connections
      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          // Re-enable the camera track if it was disabled
          videoTrack.enabled = true;
          setIsCameraOff(false);
          
          peerConnectionsRef.current.forEach(pc => {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
              sender.replaceTrack(videoTrack);
            }
          });
        }
        // Update local display to show camera again
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }
      setIsScreenSharing(false);
      socket?.emit('toggle-screen-share', { roomId, isScreenSharing: false });
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: 'always'
          },
          audio: false
        });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        // Replace video track in all peer connections
        peerConnectionsRef.current.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        });

        // Create a combined stream for local display (screen video + original audio)
        const audioTrack = localStreamRef.current?.getAudioTracks()[0];
        const displayStream = new MediaStream();
        displayStream.addTrack(screenTrack);
        if (audioTrack) {
          displayStream.addTrack(audioTrack);
        }
        
        setLocalStream(displayStream);
        setIsScreenSharing(true);
        socket?.emit('toggle-screen-share', { roomId, isScreenSharing: true });

        // Handle when user stops sharing via browser UI
        screenTrack.onended = () => {
          // Clean up and switch back to camera
          screenStreamRef.current = null;
          if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0];
            if (videoTrack) {
              videoTrack.enabled = true;
              setIsCameraOff(false);
              
              peerConnectionsRef.current.forEach(pc => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) {
                  sender.replaceTrack(videoTrack);
                }
              });
            }
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
          }
          setIsScreenSharing(false);
          socket?.emit('toggle-screen-share', { roomId, isScreenSharing: false });
        };
      } catch (error) {
        console.error('Error sharing screen:', error);
      }
    }
  };

  // Remote mute
  const remoteMute = (targetId) => {
    socket?.emit('remote-mute', { roomId, targetId });
  };

  // Send chat message
  const sendMessage = (message) => {
    if (message.trim()) {
      socket?.emit('chat-message', { roomId, message: message.trim() });
    }
  };

  // Toggle chat
  const toggleChat = () => {
    setShowChat(!showChat);
    if (!showChat) {
      setUnreadCount(0);
    }
  };

  // Copy room ID
  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Leave room
  const leaveRoom = () => {
    socket?.emit('leave-room', { roomId });
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
    }
    router.push('/');
  };

  // Pin participant
  const handlePin = (id) => {
    setPinnedId(prev => (prev === id ? null : id));
  };

  if (!roomId) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Room: {roomId} | MeetUp</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
              />
              <button 
                type="submit" 
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={!userName.trim()}
              >
                Join Room
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="room-container">
        <header className="room-header">
          <div className="room-info">
            <span className="room-logo">📹</span>
            <div className="room-id-container">
              <span className="room-id-label">Room ID:</span>
              <span className="room-id">{roomId}</span>
              <button className="copy-btn" onClick={copyRoomId} title="Copy Room ID">
                {copied ? '✓' : '📋'}
              </button>
            </div>
          </div>
          <div className="participant-count">
            <span>👥</span>
            <span>{participants.size + 1} participant{participants.size !== 0 ? 's' : ''}</span>
          </div>
        </header>

        <div className="room-main">
          <div className="video-area">
            <VideoGrid
              localStream={localStream}
              remoteStreams={remoteStreams}
              participants={participants}
              localUserName={userName}
              pinnedId={pinnedId}
              onPin={handlePin}
              isMuted={isMuted}
              isCameraOff={isCameraOff}
              isScreenSharing={isScreenSharing}
              onRemoteMute={remoteMute}
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
          unreadCount={unreadCount}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
          onToggleScreenShare={toggleScreenShare}
          onToggleChat={toggleChat}
          onLeave={leaveRoom}
          audioDevices={audioDevices}
          videoDevices={videoDevices}
          selectedAudioId={selectedAudioId}
          selectedVideoId={selectedVideoId}
          onChangeAudio={changeAudioDevice}
          onChangeVideo={changeVideoDevice}
        />
      </div>
    </>
  );
}
