import { useEffect, useRef, useState, useCallback } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
};

export function useWebRTC({ socket, roomId, userName }) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [participants, setParticipants] = useState(new Map());
  
  const peerConnectionsRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);

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
      // Try audio only if video fails
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
    
    // Add local tracks to the connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Handle incoming tracks
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      setRemoteStreams((prev) => {
        const newMap = new Map(prev);
        newMap.set(remoteId, remoteStream);
        return newMap;
      });
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('ice-candidate', {
          to: remoteId,
          candidate: event.candidate
        });
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${remoteId}:`, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        // Handle reconnection logic here if needed
      }
    };

    peerConnectionsRef.current.set(remoteId, pc);
    return pc;
  }, [socket]);

  // Create and send offer
  const createOffer = useCallback(async (remoteId) => {
    const pc = createPeerConnection(remoteId);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket?.emit('offer', { to: remoteId, offer });
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  }, [createPeerConnection, socket]);

  // Handle incoming offer
  const handleOffer = useCallback(async ({ from, offer }) => {
    const pc = createPeerConnection(from);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket?.emit('answer', { to: from, answer });
    } catch (error) {
      console.error('Error handling offer:', error);
    }
  }, [createPeerConnection, socket]);

  // Handle incoming answer
  const handleAnswer = useCallback(async ({ from, answer }) => {
    const pc = peerConnectionsRef.current.get(from);
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (error) {
        console.error('Error handling answer:', error);
      }
    }
  }, []);

  // Handle incoming ICE candidate
  const handleIceCandidate = useCallback(async ({ from, candidate }) => {
    const pc = peerConnectionsRef.current.get(from);
    if (pc && candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    }
  }, []);

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
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOff(!videoTrack.enabled);
        socket?.emit('toggle-camera', { roomId, isCameraOff: !videoTrack.enabled });
      }
    }
  }, [socket, roomId]);

  // Force mute (called when another user mutes you)
  const forceMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = false;
        setIsMuted(true);
      }
    }
  }, []);

  // Force camera off (called when another user turns off your camera)
  const forceCameraOff = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = false;
        setIsCameraOff(true);
      }
    }
  }, []);

  // Start screen sharing
  const startScreenShare = useCallback(async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });
      
      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];

      // Replace video track in all peer connections
      peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(screenTrack);
        }
      });

      // Update local stream display
      setLocalStream(screenStream);
      setIsScreenSharing(true);
      socket?.emit('toggle-screen-share', { roomId, isScreenSharing: true });

      // Handle when user stops sharing via browser UI
      screenTrack.onended = () => {
        stopScreenShare();
      };
    } catch (error) {
      console.error('Error starting screen share:', error);
    }
  }, [socket, roomId]);

  // Stop screen sharing
  const stopScreenShare = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }

    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      
      // Replace screen track with camera track in all peer connections
      peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender && videoTrack) {
          sender.replaceTrack(videoTrack);
        }
      });

      setLocalStream(localStreamRef.current);
    }

    setIsScreenSharing(false);
    socket?.emit('toggle-screen-share', { roomId, isScreenSharing: false });
  }, [socket, roomId]);

  // Toggle screen share
  const toggleScreenShare = useCallback(() => {
    if (isScreenSharing) {
      stopScreenShare();
    } else {
      startScreenShare();
    }
  }, [isScreenSharing, startScreenShare, stopScreenShare]);

  // Remote control: mute another user
  const remoteMute = useCallback((targetId) => {
    socket?.emit('remote-mute', { roomId, targetId });
  }, [socket, roomId]);

  // Remote control: turn off another user's camera
  const remoteCameraOff = useCallback((targetId) => {
    socket?.emit('remote-camera-off', { roomId, targetId });
  }, [socket, roomId]);

  // Clean up peer connection
  const removePeerConnection = useCallback((remoteId) => {
    const pc = peerConnectionsRef.current.get(remoteId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(remoteId);
    }
    setRemoteStreams((prev) => {
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

  // Clean up all connections
  const cleanup = useCallback(() => {
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    
    setLocalStream(null);
    setRemoteStreams(new Map());
    setParticipants(new Map());
  }, []);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    const handleUserJoined = ({ id, userName }) => {
      console.log('User joined:', id, userName);
      setParticipants((prev) => {
        const newMap = new Map(prev);
        newMap.set(id, { id, userName, isMuted: false, isCameraOff: false });
        return newMap;
      });
      createOffer(id);
    };

    const handleExistingParticipants = (existingParticipants) => {
      existingParticipants.forEach((participant) => {
        setParticipants((prev) => {
          const newMap = new Map(prev);
          newMap.set(participant.id, participant);
          return newMap;
        });
      });
    };

    const handleUserLeft = ({ id }) => {
      console.log('User left:', id);
      removePeerConnection(id);
    };

    const handleToggleMute = ({ id, isMuted }) => {
      setParticipants((prev) => {
        const newMap = new Map(prev);
        const participant = newMap.get(id);
        if (participant) {
          newMap.set(id, { ...participant, isMuted });
        }
        return newMap;
      });
    };

    const handleToggleCamera = ({ id, isCameraOff }) => {
      setParticipants((prev) => {
        const newMap = new Map(prev);
        const participant = newMap.get(id);
        if (participant) {
          newMap.set(id, { ...participant, isCameraOff });
        }
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
      socket.off('force-mute', forceMute);
      socket.off('force-camera-off', forceCameraOff);
    };
  }, [socket, createOffer, handleOffer, handleAnswer, handleIceCandidate, removePeerConnection, forceMute, forceCameraOff]);

  return {
    localStream,
    remoteStreams,
    participants,
    isMuted,
    isCameraOff,
    isScreenSharing,
    initializeMedia,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    remoteMute,
    remoteCameraOff,
    cleanup
  };
}
