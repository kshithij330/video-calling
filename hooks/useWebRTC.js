import { useEffect, useRef, useState, useCallback } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
};

export function useWebRTC({ socket, roomId, userName, onAutoPin }) {
  const [localStream, setLocalStream] = useState(null);
  const [localScreenStream, setLocalScreenStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map()); 
  const [remoteScreenStreams, setRemoteScreenStreams] = useState(new Map()); 
  
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [participants, setParticipants] = useState(new Map());
  
  const peerConnectionsRef = useRef(new Map()); 
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const signalingStateRef = useRef(new Map()); // remoteId -> { makingOffer, ignoreOffer }

  // Initialize local media stream
  const initializeMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true
        });
        localStreamRef.current = audioStream;
        setLocalStream(audioStream);
        setIsCameraOff(true);
        return audioStream;
      } catch (audioError) {
        console.error('Error accessing audio:', audioError);
        return null;
      }
    }
  }, []);

  // Create peer connection for a remote user
  const createPeerConnection = useCallback((remoteId) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    signalingStateRef.current.set(remoteId, { makingOffer: false, ignoreOffer: false });
    
    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, screenStreamRef.current);
      });
    }

    // Process ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('ice-candidate', {
          to: remoteId,
          candidate: event.candidate
        });
      }
    };

    // Perfect Negotiation pattern
    pc.onnegotiationneeded = async () => {
      try {
        const state = signalingStateRef.current.get(remoteId);
        state.makingOffer = true;
        await pc.setLocalDescription();
        socket?.emit('offer', { to: remoteId, offer: pc.localDescription });
      } catch (err) {
        console.error('Negotiation error:', err);
      } finally {
        const state = signalingStateRef.current.get(remoteId);
        if (state) state.makingOffer = false;
      }
    };

    // Handle incoming tracks - improved for multi-stream
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      const participantId = remoteId;

      // Heuristic: If we already have a stream and this is a new video track, it's screen share
      // In a real app, we'd use transceiver labels or SDP mid, but this works for simple dual-stream
      const videoTracks = pc.getReceivers().filter(r => r.track.kind === 'video');
      const isSecondVideo = videoTracks.length > 1;

      if (isSecondVideo && event.track.kind === 'video') {
        setRemoteScreenStreams((prev) => {
          const newMap = new Map(prev);
          newMap.set(participantId, stream);
          return newMap;
        });
      } else {
        setRemoteStreams((prev) => {
          const newMap = new Map(prev);
          newMap.set(participantId, stream);
          return newMap;
        });
      }
    };

    peerConnectionsRef.current.set(remoteId, pc);
    return pc;
  }, [socket]);

  // signaling handlers with Perfect Negotiation logic
  const handleOffer = useCallback(async ({ from, offer }) => {
    let pc = peerConnectionsRef.current.get(from);
    if (!pc) pc = createPeerConnection(from);

    const state = signalingStateRef.current.get(from);
    const polite = socket.id > from; // Simple tie-break: higher ID is polite
    
    try {
      const offerCollision = state.makingOffer || pc.signalingState !== 'stable';
      state.ignoreOffer = !polite && offerCollision;
      if (state.ignoreOffer) return;

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await pc.setLocalDescription();
      socket?.emit('answer', { to: from, answer: pc.localDescription });
    } catch (err) {
      console.error('Offer error:', err);
    }
  }, [createPeerConnection, socket]);

  const handleAnswer = useCallback(async ({ from, answer }) => {
    const pc = peerConnectionsRef.current.get(from);
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error('Answer error:', err);
      }
    }
  }, []);

  const handleIceCandidate = useCallback(async ({ from, candidate }) => {
    const pc = peerConnectionsRef.current.get(from);
    if (pc) {
      try {
        const state = signalingStateRef.current.get(from);
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        const state = signalingStateRef.current.get(from);
        if (!state?.ignoreOffer) {
          console.error('ICE candidate error:', err);
        }
      }
    }
  }, []);

  // Control functions
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

  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOff(!videoTrack.enabled);
        socket?.emit('toggle-camera', { roomId, isCameraOff: !videoTrack.enabled });
      }
    }
  }, [socket, roomId]);

  const toggleHandRaise = useCallback(() => {
    const newState = !isHandRaised;
    setIsHandRaised(newState);
    socket?.emit('toggle-hand-raise', { roomId, isHandRaised: newState });
  }, [socket, roomId, isHandRaised]);

  const forceMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = false;
        setIsMuted(true);
      }
    }
  }, []);

  const forceCameraOff = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = false;
        setIsCameraOff(true);
      }
    }
  }, []);

  // Screen sharing sync logic
  const startScreenShare = useCallback(async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });
      
      screenStreamRef.current = screenStream;
      setLocalScreenStream(screenStream);
      setIsScreenSharing(true);
      
      const screenTrack = screenStream.getVideoTracks()[0];

      // Add track to all active peer connections - will trigger onnegotiationneeded
      peerConnectionsRef.current.forEach((pc) => {
        pc.addTrack(screenTrack, screenStream);
      });

      socket?.emit('toggle-screen-share', { roomId, isScreenSharing: true });
      if (onAutoPin) onAutoPin('local-screen');

      screenTrack.onended = () => stopScreenShare();
    } catch (error) {
      console.error('Error starting screen share:', error);
    }
  }, [socket, roomId, onAutoPin]);

  const stopScreenShare = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        track.stop();
        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find(s => s.track === track);
          if (sender) pc.removeTrack(sender);
        });
      });
      screenStreamRef.current = null;
    }

    setLocalScreenStream(null);
    setIsScreenSharing(false);
    socket?.emit('toggle-screen-share', { roomId, isScreenSharing: false });
  }, [socket, roomId]);

  const toggleScreenShare = useCallback(() => {
    if (isScreenSharing) stopScreenShare();
    else startScreenShare();
  }, [isScreenSharing, startScreenShare, stopScreenShare]);

  const remoteMute = useCallback((targetId) => {
    socket?.emit('remote-mute', { roomId, targetId });
  }, [socket, roomId]);

  const remoteCameraOff = useCallback((targetId) => {
    socket?.emit('remote-camera-off', { roomId, targetId });
  }, [socket, roomId]);

  const removePeerConnection = useCallback((remoteId) => {
    const pc = peerConnectionsRef.current.get(remoteId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(remoteId);
    }
    signalingStateRef.current.delete(remoteId);
    setRemoteStreams((prev) => {
      const newMap = new Map(prev);
      newMap.delete(remoteId);
      return newMap;
    });
    setRemoteScreenStreams((prev) => {
      const newMap = new Map(prev);
      newMap.delete(remoteId);
      return newMap;
    });
    setParticipants((prev) => {
      const newMap = new Map(prev);
      newMap.delete(remoteId);
      return newMap;
    });
  }, []);

  const cleanup = useCallback(() => {
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    signalingStateRef.current.clear();
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach((track) => track.stop());
    if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach((track) => track.stop());
    setLocalStream(null);
    setLocalScreenStream(null);
    setRemoteStreams(new Map());
    setRemoteScreenStreams(new Map());
    setParticipants(new Map());
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleUserJoined = ({ id, userName }) => {
      setParticipants((prev) => {
        const newMap = new Map(prev);
        newMap.set(id, { id, userName, isMuted: false, isCameraOff: false, isHandRaised: false, isScreenSharing: false });
        return newMap;
      });
      // In perfect negotiation, the caller creates the offer on joining
    };

    const handleExistingParticipants = (existingParticipants) => {
      existingParticipants.forEach((p) => {
        setParticipants((prev) => {
          const newMap = new Map(prev);
          newMap.set(p.id, { ...p });
          return newMap;
        });
        // We'll negotiate with them as they joint (or we join)
        createPeerConnection(p.id);
      });
    };

    const handleUserLeft = ({ id }) => removePeerConnection(id);

    const handleToggleMute = ({ id, isMuted }) => {
      setParticipants((prev) => {
        const newMap = new Map(prev);
        const p = newMap.get(id);
        if (p) newMap.set(id, { ...p, isMuted });
        return newMap;
      });
    };

    const handleToggleCamera = ({ id, isCameraOff }) => {
      setParticipants((prev) => {
        const newMap = new Map(prev);
        const p = newMap.get(id);
        if (p) newMap.set(id, { ...p, isCameraOff });
        return newMap;
      });
    };

    const handleToggleScreenShare = ({ id, isScreenSharing }) => {
      setParticipants((prev) => {
        const newMap = new Map(prev);
        const p = newMap.get(id);
        if (p) newMap.set(id, { ...p, isScreenSharing });
        return newMap;
      });
    };

    const handleToggleHandRaise = ({ id, isHandRaised }) => {
      setParticipants((prev) => {
        const newMap = new Map(prev);
        const p = newMap.get(id);
        if (p) newMap.set(id, { ...p, isHandRaised });
        return newMap;
      });
    };

    socket.on('user-joined', handleUserJoined);
    socket.on('existing-participants', handleExistingParticipants);
    socket.on('user-left', handleUserLeft);
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('user-toggled-mute', handleToggleMute);
    socket.on('user-toggled-camera', handleToggleCamera);
    socket.on('user-toggled-screen-share', handleToggleScreenShare);
    socket.on('user-toggled-hand-raise', handleToggleHandRaise);
    socket.on('force-mute', forceMute);
    socket.on('force-camera-off', forceCameraOff);

    return () => {
      socket.off('user-joined', handleUserJoined);
      socket.off('existing-participants', handleExistingParticipants);
      socket.off('user-left', handleUserLeft);
      socket.off('offer', handleOffer);
      socket.off('answer', handleAnswer);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('user-toggled-mute', handleToggleMute);
      socket.off('user-toggled-camera', handleToggleCamera);
      socket.off('user-toggled-screen-share', handleToggleScreenShare);
      socket.off('user-toggled-hand-raise', handleToggleHandRaise);
      socket.off('force-mute', forceMute);
      socket.off('force-camera-off', forceCameraOff);
    };
  }, [socket, handleOffer, handleAnswer, handleIceCandidate, createPeerConnection, removePeerConnection, forceMute, forceCameraOff]);

  return {
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
  };
}
