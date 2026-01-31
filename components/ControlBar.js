import { useState } from 'react';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  MonitorUp, 
  MonitorOff, 
  MessageSquare, 
  PhoneOff, 
  Hand,
  ChevronUp, 
  ChevronDown,
  Settings
} from 'lucide-react';

export default function ControlBar({
  isMuted,
  isCameraOff,
  isScreenSharing,
  isHandRaised,
  unreadCount,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onToggleHandRaise,
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
          className={`control-btn ${isMuted ? 'active danger' : ''}`}
          onClick={onToggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <button 
          className="control-menu-btn"
          onClick={() => setShowAudioMenu(!showAudioMenu)}
          title="Select microphone"
        >
          {showAudioMenu ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
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
          className={`control-btn ${isCameraOff ? 'active danger' : ''}`}
          onClick={onToggleCamera}
          title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
        >
          {isCameraOff ? <VideoOff size={20} /> : <Video size={20} />}
        </button>
        <button 
          className="control-menu-btn"
          onClick={() => setShowVideoMenu(!showVideoMenu)}
          title="Select camera"
        >
          {showVideoMenu ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
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
        className={`control-btn ${isHandRaised ? 'active warning' : ''}`}
        onClick={onToggleHandRaise}
        title={isHandRaised ? 'Lower hand' : 'Raise hand'}
      >
        <Hand size={20} fill={isHandRaised ? "currentColor" : "none"} />
      </button>

      <button
        className={`control-btn screen-share ${isScreenSharing ? 'active' : ''}`}
        onClick={onToggleScreenShare}
        title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
      >
        {isScreenSharing ? <MonitorOff size={20} /> : <MonitorUp size={20} />}
      </button>

      <button
        className="control-btn"
        onClick={onToggleChat}
        title="Chat"
      >
        <MessageSquare size={20} />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount}</span>
        )}
      </button>

      <button
        className="control-btn leave"
        onClick={onLeave}
        title="Leave meeting"
      >
        <PhoneOff size={20} />
      </button>
    </div>
  );
}
