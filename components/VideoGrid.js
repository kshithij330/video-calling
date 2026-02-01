import { useRef, useEffect, useMemo, useState } from 'react';
import { 
  Pin, 
  PinOff, 
  MicOff, 
  Mic,
  VideoOff, 
  Hand,
  MessageSquare,
  Volume2,
  Volume1,
  VolumeX
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
  isMuted,
  isCameraOff,
  onRemoteMute,
  onRemoteCameraOff,
  onStartPrivateChat
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

  const pinnedTiles = tiles.filter(t => pinnedIds.includes(t.id));
  const hasPins = pinnedTiles.length > 0;
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
      isMuted={tile.isScreen 
        ? !tile.stream.getAudioTracks().some(t => t.enabled)
        : (tile.participant?.isMuted || (tile.isLocal ? isMuted : false))}
      isCameraOff={tile.isScreen ? false : (tile.participant?.isCameraOff || (tile.isLocal ? isCameraOff : false))}
      isHandRaised={tile.isScreen ? false : (tile.participant?.isHandRaised || (tile.isLocal ? localHandRaised : false))}
      isLocal={tile.isLocal}
      isScreenSharing={tile.isScreen}
      isPinned={pinnedIds.includes(tile.id)}
      onPin={() => onTogglePin(tile.id)}
      onMute={!tile.isLocal && !tile.isScreen ? () => onRemoteMute(tile.id) : undefined}
      onCameraOff={!tile.isLocal && !tile.isScreen ? () => onRemoteCameraOff(tile.id) : undefined}
      onStartPrivateChat={!tile.isLocal && !tile.isScreen ? () => onStartPrivateChat(tile.id, tile.participant?.userName) : undefined}
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
  onMute,
  onCameraOff,
  onStartPrivateChat,
  inSidebar
}) {
  const videoRef = useRef(null);
  const [aspectRatio, setAspectRatio] = useState(16/9);

  const handleLoadedMetadata = (e) => {
    const video = e.target;
    if (video.videoWidth && video.videoHeight) {
      setAspectRatio(video.videoWidth / video.videoHeight);
    }
  };

  const [volume, setVolume] = useState(1);
  const [showVolume, setShowVolume] = useState(false);
  const volumeRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
    }
  }, [volume]);

  // Handle click outside to close volume slider
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (volumeRef.current && !volumeRef.current.contains(event.target)) {
        setShowVolume(false);
      }
    };

    if (showVolume) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showVolume]);

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
    <div 
      className={`video-tile ${isCameraOff && !isScreenSharing ? 'camera-off' : ''} ${isScreenSharing ? 'screen-sharing' : ''} ${isPinned ? 'is-pinned' : ''} ${inSidebar ? 'in-sidebar' : ''}`}
      style={{ aspectRatio }}
    >
      {isCameraOff && !isScreenSharing ? (
        <div className="video-avatar">
          {getInitials(userName)}
        </div>
      ) : (
        <video
          ref={videoRef}
          id={`video-${visitorId}`}
          autoPlay
          playsInline
          muted={isLocal}
          onLoadedMetadata={handleLoadedMetadata}
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
          <div 
            role="button"
            tabIndex={0}
            className={`status-icon action-btn ${isPinned ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); onPin(); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onPin(); } }}
            title={isPinned ? "Unpin" : "Pin"}
          >
            {isPinned ? <PinOff size={20} /> : <Pin size={20} />}
          </div>

          {!isLocal && (
            <div 
              ref={volumeRef}
              className="volume-control-container"
              onClick={(e) => e.stopPropagation()}
            >
              <div 
                role="button"
                tabIndex={0}
                className={`status-icon action-btn ${showVolume ? 'active' : ''}`}
                onClick={() => setShowVolume(!showVolume)}
              >
                {volume === 0 ? <VolumeX size={20} /> : volume < 0.5 ? <Volume1 size={20} /> : <Volume2 size={20} />}
              </div>
              
              {showVolume && (
                <div className="volume-slider-popup">
                  <div className="volume-slider-track">
                    <div 
                      className="volume-slider-fill" 
                      style={{ height: `${volume * 100}%` }}
                    />
                    <div 
                      className="volume-slider-thumb"
                      style={{ bottom: `${volume * 100}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="vertical-slider"
                  />
                </div>
              )}
            </div>
          )}

          {!isLocal && onStartPrivateChat && (
            <div 
              role="button"
              tabIndex={0}
              className="status-icon action-btn"
              onClick={(e) => { e.stopPropagation(); onStartPrivateChat(); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onStartPrivateChat(); } }}
              title="Message privately"
            >
              <MessageSquare size={20} />
            </div>
          )}
          
          {isHandRaised && (
            <span className="status-icon hand-raised" title="Hand raised">
              <Hand size={20} fill="currentColor" />
            </span>
          )}

          {isMuted ? (
            <span className="status-icon muted" title="Muted">
              <MicOff size={18} />
            </span>
          ) : (
            <span className="status-icon unmuted" title="Unmuted">
              <Mic size={18} />
            </span>
          )}
          {isCameraOff && !isScreenSharing && (
            <span className="status-icon" title="Camera off">
              <VideoOff size={20} />
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
