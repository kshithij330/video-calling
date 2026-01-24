export default function ControlBar({
  isMuted,
  isCameraOff,
  isScreenSharing,
  unreadCount,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onToggleChat,
  onLeave
}) {
  return (
    <div className="control-bar">
      <button
        className={`control-btn tooltip ${isMuted ? 'active' : ''}`}
        onClick={onToggleMute}
        data-tooltip={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? '🔇' : '🎤'}
      </button>

      <button
        className={`control-btn tooltip ${isCameraOff ? 'active' : ''}`}
        onClick={onToggleCamera}
        data-tooltip={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
      >
        {isCameraOff ? '📷' : '🎥'}
      </button>

      <button
        className={`control-btn screen-share tooltip ${isScreenSharing ? 'active' : ''}`}
        onClick={onToggleScreenShare}
        data-tooltip={isScreenSharing ? 'Stop sharing' : 'Share screen'}
      >
        {isScreenSharing ? '🖥️' : '💻'}
      </button>

      <button
        className="control-btn tooltip"
        onClick={onToggleChat}
        data-tooltip="Chat"
      >
        💬
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount}</span>
        )}
      </button>

      <button
        className="control-btn leave tooltip"
        onClick={onLeave}
        data-tooltip="Leave meeting"
      >
        📞
      </button>
    </div>
  );
}
