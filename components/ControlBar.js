import { useState } from 'react';

export default function ControlBar({
  isMuted,
  isCameraOff,
  isScreenSharing,
  unreadCount,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onToggleChat,
  onLeave,
  audioDevices,
  videoDevices,
  selectedAudioId,
  selectedVideoId,
  onChangeAudio,
  onChangeVideo
}) {
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showVideoMenu, setShowVideoMenu] = useState(false);

  return (
    <div className="control-bar">
      <div className="control-group">
        <button
          className={`control-btn ${isMuted ? 'active' : ''}`}
          onClick={onToggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? '🔇' : '🎤'}
        </button>
        <button 
          className="control-menu-btn"
          onClick={() => setShowAudioMenu(!showAudioMenu)}
          title="Select microphone"
        >
          {showAudioMenu ? '▾' : '▴'}
        </button>
        {showAudioMenu && (
          <div className="control-menu">
            <div className="control-menu-header">Select Microphone</div>
            {audioDevices.map(device => (
              <div 
                key={device.deviceId} 
                className={`control-menu-item ${selectedAudioId === device.deviceId ? 'active' : ''}`}
                onClick={() => {
                  onChangeAudio(device.deviceId);
                  setShowAudioMenu(false);
                }}
              >
                {device.label || `Microphone ${device.deviceId.slice(0, 5)}`}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="control-group">
        <button
          className={`control-btn ${isCameraOff ? 'active' : ''}`}
          onClick={onToggleCamera}
          title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
        >
          {isCameraOff ? '📷' : '🎥'}
        </button>
        <button 
          className="control-menu-btn"
          onClick={() => setShowVideoMenu(!showVideoMenu)}
          title="Select camera"
        >
          {showVideoMenu ? '▾' : '▴'}
        </button>
        {showVideoMenu && (
          <div className="control-menu">
            <div className="control-menu-header">Select Camera</div>
            {videoDevices.map(device => (
              <div 
                key={device.deviceId} 
                className={`control-menu-item ${selectedVideoId === device.deviceId ? 'active' : ''}`}
                onClick={() => {
                  onChangeVideo(device.deviceId);
                  setShowVideoMenu(false);
                }}
              >
                {device.label || `Camera ${device.deviceId.slice(0, 5)}`}
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        className={`control-btn screen-share ${isScreenSharing ? 'active' : ''}`}
        onClick={onToggleScreenShare}
        title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
      >
        {isScreenSharing ? '🖥️' : '💻'}
      </button>

      <button
        className="control-btn"
        onClick={onToggleChat}
        title="Chat"
      >
        💬
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount}</span>
        )}
      </button>

      <button
        className="control-btn leave"
        onClick={onLeave}
        title="Leave meeting"
      >
        📞
      </button>
    </div>
  );
}
