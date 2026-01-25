import { useRef, useEffect } from 'react';

export default function VideoGrid({
  localStream,
  remoteStreams,
  participants,
  localUserName,
  pinnedId,
  onPin,
  isMuted,
  isCameraOff,
  isScreenSharing,
  onRemoteMute,
  onRemoteCameraOff
}) {
  const totalParticipants = remoteStreams.size + 1;
  const isPinned = pinnedId !== null;
  
  const getGridClass = () => {
    if (isPinned) return 'grid-pinned';
    if (totalParticipants === 1) return 'grid-1';
    if (totalParticipants === 2) return 'grid-2';
    if (totalParticipants <= 4) return 'grid-3-4';
    if (totalParticipants <= 6) return 'grid-5-6';
    return 'grid-7-9';
  };

  const renderVideoTile = (id, stream, participant, isLocal) => (
    <VideoTile
      key={id}
      visitorId={id}
      stream={stream}
      userName={participant?.userName || (isLocal ? localUserName || 'You' : 'Participant')}
      isMuted={participant?.isMuted || (isLocal ? isMuted : false)}
      isCameraOff={participant?.isCameraOff || (isLocal ? isCameraOff : false)}
      isLocal={isLocal}
      isScreenSharing={isLocal ? isScreenSharing : false}
      isPinned={pinnedId === id}
      onPin={() => onPin(id)}
      onMute={!isLocal ? () => onRemoteMute(id) : undefined}
      onCameraOff={!isLocal ? () => onRemoteCameraOff(id) : undefined}
    />
  );

  return (
    <div className={`video-grid ${getGridClass()}`}>
      {/* Pinned View */}
      {isPinned && (
        <div className="pinned-stage">
          {pinnedId === 'local' 
            ? renderVideoTile('local', localStream, null, true)
            : renderVideoTile(pinnedId, remoteStreams.get(pinnedId), participants.get(pinnedId), false)
          }
        </div>
      )}

      {/* Grid View / Sidebar */}
      <div className={`video-list ${isPinned ? 'sidebar' : ''}`}>
        {/* Local Video - if not pinned or if pinned is someone else */}
        {(!isPinned || pinnedId !== 'local') && 
          renderVideoTile('local', localStream, null, true)
        }
        
        {/* Remote Videos */}
        {Array.from(remoteStreams.entries()).map(([id, stream]) => {
          if (isPinned && pinnedId === id) return null;
          return renderVideoTile(id, stream, participants.get(id), false);
        })}
      </div>
    </div>
  );
}

function VideoTile({ 
  stream, 
  userName, 
  visitorId,
  isMuted, 
  isCameraOff, 
  isLocal, 
  isScreenSharing,
  isPinned,
  onPin,
  onMute,
  onCameraOff 
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (videoElement && stream) {
      // Always re-attach the stream when it changes
      videoElement.srcObject = stream;
      
      // Ensure video plays after attaching stream
      videoElement.play().catch(error => {
        // Autoplay might be blocked, try muted
        console.log('Autoplay blocked, trying muted:', error);
        videoElement.muted = true;
        videoElement.play().catch(e => console.error('Video play failed:', e));
      });
    }
    
    // Cleanup function
    return () => {
      if (videoElement) {
        videoElement.srcObject = null;
      }
    };
  }, [stream, isCameraOff, isScreenSharing]);

  const getInitials = (name) => {
    return (name || 'Anonymous')
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className={`video-tile ${isCameraOff && !isScreenSharing ? 'camera-off' : ''}`}>
      {isCameraOff && !isScreenSharing ? (
        <div className="video-avatar">
          {getInitials(userName)}
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          style={{ transform: isLocal && !isScreenSharing ? 'scaleX(-1)' : 'none' }}
        />
      )}
      
      <div className="video-tile-overlay">
        <div className="video-tile-name">
          {isLocal && <span className="local-indicator"></span>}
          <span>{userName}</span>
          {isScreenSharing && isLocal && (
            <span className="badge">Screen</span>
          )}
        </div>
        <div className="video-tile-status">
          <button 
            className={`status-icon action-btn ${isPinned ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); onPin(); }}
            title={isPinned ? "Unpin" : "Pin"}
          >
            📌
          </button>
          
          {isMuted && (
            <span className="status-icon muted" title="Muted">
              🔇
            </span>
          )}
          {isCameraOff && (
            <span className="status-icon" title="Camera off">
              📷
            </span>
          )}
        </div>
      </div>

      {!isLocal && (
        <div className="video-tile-controls">
          <button 
            className="tile-control-btn" 
            onClick={(e) => { e.stopPropagation(); onMute(); }}
            title="Mute this participant"
          >
            🔇
          </button>
        </div>
      )}
    </div>
  );
}
