import { useRef, useEffect, useMemo } from 'react'; // Re-trigger build

import { 
  Pin, 
  PinOff, 
  MicOff, 
  VideoOff, 
  Hand,
  MessageCircle
} from 'lucide-react';

export default function VideoGrid({
  localStream,
  localScreenStream,
  remoteStreams,
  remoteScreenStreams,
  participants,
  localUserName,
  localHandRaised,
  pinnedIds = [], // Now an array for multi-pin
  onTogglePin,
  onPrivateMessage,
  isMuted,
  isCameraOff,
  onRemoteMute,
  onRemoteCameraOff
}) {
  // Calculate all tiles
  const tiles = useMemo(() => {
    const result = [];
    
    // Local camera
    result.push({
      id: 'local',
      stream: localStream,
      participant: null,
      isLocal: true,
      isScreen: false
    });
    
    // Local screen
    if (localScreenStream) {
      result.push({
        id: 'local-screen',
        stream: localScreenStream,
        participant: null,
        isLocal: true,
        isScreen: true
      });
    }
    
    // Remote participants
    participants.forEach((p, id) => {
      if (remoteStreams.has(id)) {
        result.push({
          id,
          stream: remoteStreams.get(id),
          participant: p,
          isLocal: false,
          isScreen: false
        });
      }
      
      if (remoteScreenStreams && remoteScreenStreams.has(id)) {
        result.push({
          id: `${id}-screen`,
          stream: remoteScreenStreams.get(id),
          participant: p,
          isLocal: false,
          isScreen: true
        });
      }
    });

    return result;
  }, [localStream, localScreenStream, remoteStreams, remoteScreenStreams, participants]);

  const hasPins = pinnedIds.length > 0;
  const pinnedTiles = tiles.filter(t => pinnedIds.includes(t.id));
  const unpinnedTiles = tiles.filter(t => !pinnedIds.includes(t.id));
  const totalUnpinned = unpinnedTiles.length;

  // Calculate optimal grid layout for unpinned tiles
  const getGridClass = () => {
    if (hasPins) return 'has-pins';
    const count = tiles.length;
    if (count === 1) return 'grid-1';
    if (count === 2) return 'grid-2';
    if (count <= 4) return 'grid-4';
    if (count <= 6) return 'grid-6';
    if (count <= 9) return 'grid-9';
    return 'grid-many';
  };

  // Calculate pinned stage layout
  const getPinnedGridClass = () => {
    const count = pinnedTiles.length;
    if (count === 1) return 'pinned-1';
    if (count === 2) return 'pinned-2';
    if (count <= 4) return 'pinned-4';
    return 'pinned-many';
  };

  const renderTile = (tile, inSidebar = false) => (
    <VideoTile
      key={tile.id}
      visitorId={tile.id}
      stream={tile.stream}
      userName={tile.isScreen 
        ? `${tile.participant?.userName || (tile.isLocal ? localUserName || 'You' : 'Participant')}'s Screen` 
        : (tile.participant?.userName || (tile.isLocal ? localUserName || 'You' : 'Participant'))}
      isMuted={tile.isScreen ? true : (tile.participant?.isMuted || (tile.isLocal ? isMuted : false))}
      isCameraOff={tile.isScreen ? false : (tile.participant?.isCameraOff || (tile.isLocal ? isCameraOff : false))}
      isHandRaised={tile.isScreen ? false : (tile.participant?.isHandRaised || (tile.isLocal ? localHandRaised : false))}
      isLocal={tile.isLocal}
      isScreenSharing={tile.isScreen}
      isPinned={pinnedIds.includes(tile.id)}
      onPin={() => onTogglePin(tile.id)}
      onPrivateMessage={!tile.isLocal ? () => onPrivateMessage(tile.participant ? tile.id : null, tile.participant?.userName) : undefined}
      onMute={!tile.isLocal && !tile.isScreen ? () => onRemoteMute(tile.id) : undefined}
      onCameraOff={!tile.isLocal && !tile.isScreen ? () => onRemoteCameraOff(tile.id) : undefined}
      inSidebar={inSidebar}
    />
  );

  return (
    <div className={`video-grid ${getGridClass()}`}>
      {/* Pinned Stage - when there are pinned tiles */}
      {hasPins && (
        <div className={`pinned-stage ${getPinnedGridClass()}`}>
          {pinnedTiles.map(tile => renderTile(tile, false))}
        </div>
      )}

      {/* Sidebar for unpinned tiles when pins exist, or main grid otherwise */}
      {hasPins ? (
        <div className="video-sidebar">
          {unpinnedTiles.map(tile => renderTile(tile, true))}
        </div>
      ) : (
        <div className="video-main-grid">
          {tiles.map(tile => renderTile(tile, false))}
        </div>
      )}
    </div>
  );
}

function VideoTile({ 
  stream, 
  userName, 
  visitorId,
  isMuted, 
  isCameraOff, 
  isHandRaised,
  isLocal, 
  isScreenSharing,
  isPinned,
  onPin,
  onPrivateMessage,
  onMute,
  onCameraOff,
  inSidebar
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (videoElement && stream) {
      videoElement.srcObject = stream;
      videoElement.play().catch(error => {
        console.log('Autoplay blocked, trying muted:', error);
        videoElement.muted = true;
        videoElement.play().catch(e => console.error('Video play failed:', e));
      });
    }
    
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
    <div className={`video-tile ${isCameraOff && !isScreenSharing ? 'camera-off' : ''} ${isScreenSharing ? 'screen-sharing' : ''} ${isPinned ? 'is-pinned' : ''} ${inSidebar ? 'in-sidebar' : ''}`}>
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
          {isScreenSharing && (
            <span className="badge">Screen</span>
          )}
        </div>
        <div className="video-tile-status">
          <button 
            className={`status-icon action-btn ${isPinned ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); onPin(); }}
            title={isPinned ? "Unpin" : "Pin"}
          >
            {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
          
          {onPrivateMessage && (
            <button
              className="status-icon action-btn"
              onClick={(e) => { e.stopPropagation(); onPrivateMessage(); }}
              title="Message privately"
            >
              <MessageCircle size={14} />
            </button>
          )}
          
          {isHandRaised && (
            <span className="status-icon hand-raised" title="Hand raised">
              <Hand size={14} fill="currentColor" />
            </span>
          )}

          {isMuted && (
            <span className="status-icon muted" title="Muted">
              <MicOff size={14} />
            </span>
          )}
          {isCameraOff && !isScreenSharing && (
            <span className="status-icon" title="Camera off">
              <VideoOff size={14} />
            </span>
          )}
        </div>
      </div>

      {!isLocal && onMute && (
        <div className="video-tile-controls">
          <button 
            className="tile-control-btn" 
            onClick={(e) => { e.stopPropagation(); onMute(); }}
            title="Mute this participant"
          >
            <MicOff size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
