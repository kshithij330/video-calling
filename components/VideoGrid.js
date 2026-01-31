import { useRef, useEffect } from 'react';
import { 
  Pin, 
  PinOff, 
  MicOff, 
  VideoOff, 
  Hand, 
  Maximize2, 
  MoreVertical 
} from 'lucide-react';

export default function VideoGrid({
  localStream,
  localScreenStream,
  remoteStreams,
  remoteScreenStreams,
  participants,
  localUserName,
  localHandRaised,
  pinnedId,
  onPin,
  isMuted,
  isCameraOff,
  onRemoteMute,
  onRemoteCameraOff
}) {
  const isPinned = pinnedId !== null;
  
  // Calculate total number of tiles to determine grid size
  const getTiles = () => {
    const tiles = [];
    
    // Local camera
    tiles.push({
      id: 'local',
      stream: localStream,
      participant: null,
      isLocal: true,
      isScreen: false
    });
    
    // Local screen
    if (localScreenStream) {
      tiles.push({
        id: 'local-screen',
        stream: localScreenStream,
        participant: null,
        isLocal: true,
        isScreen: true
      });
    }
    
    // Remote participants
    participants.forEach((p, id) => {
      // Camera
      if (remoteStreams.has(id)) {
        tiles.push({
          id,
          stream: remoteStreams.get(id),
          participant: p,
          isLocal: false,
          isScreen: false
        });
      }
      
      // Screen
      if (remoteScreenStreams.has(id)) {
        tiles.push({
          id: `${id}-screen`,
          stream: remoteScreenStreams.get(id),
          participant: p,
          isLocal: false,
          isScreen: true
        });
      }
    });

    return tiles;
  };

  const tiles = getTiles();
  const totalTiles = tiles.length;

  const getGridClass = () => {
    if (isPinned) return 'grid-pinned';
    if (totalTiles === 1) return 'grid-1';
    if (totalTiles === 2) return 'grid-2';
    if (totalTiles <= 4) return 'grid-3-4';
    if (totalTiles <= 6) return 'grid-5-6';
    return 'grid-7-9';
  };

  const renderTile = (tile) => (
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
      isPinned={pinnedId === tile.id}
      onPin={() => onPin(tile.id)}
      onMute={!tile.isLocal && !tile.isScreen ? () => onRemoteMute(tile.id) : undefined}
      onCameraOff={!tile.isLocal && !tile.isScreen ? () => onRemoteCameraOff(tile.id) : undefined}
    />
  );

  return (
    <div className={`video-grid ${getGridClass()}`}>
      {/* Pinned View */}
      {isPinned && (
        <div className="pinned-stage">
          {renderTile(tiles.find(t => t.id === pinnedId) || tiles[0])}
        </div>
      )}

      {/* Grid View / Sidebar */}
      <div className={`video-list ${isPinned ? 'sidebar' : ''}`}>
        {tiles.map((tile) => {
          if (isPinned && pinnedId === tile.id) return null;
          return renderTile(tile);
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
  isHandRaised,
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
    <div className={`video-tile ${isCameraOff && !isScreenSharing ? 'camera-off' : ''} ${isScreenSharing ? 'screen-sharing' : ''}`}>
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

      {!isLocal && (
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
