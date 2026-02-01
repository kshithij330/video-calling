import { useState, useMemo } from 'react';
import { X, Search, MicOff, Pin, PinOff, MoreVertical } from 'lucide-react';

export default function PeoplePanel({
  participants,
  localUserName,
  localUserId,
  pinnedIds,
  onTogglePin,
  onRemoteMute,
  onClose
}) {
  const [searchQuery, setSearchQuery] = useState('');

  // Build full participant list including local user
  const allParticipants = useMemo(() => {
    const list = [
      { id: 'local', userName: localUserName, isLocal: true, isMuted: false }
    ];
    
    participants.forEach((p, id) => {
      list.push({ id, ...p, isLocal: false });
    });
    
    return list;
  }, [participants, localUserName]);

  // Filter by search query
  const filteredParticipants = useMemo(() => {
    if (!searchQuery.trim()) return allParticipants;
    const query = searchQuery.toLowerCase();
    return allParticipants.filter(p => 
      p.userName?.toLowerCase().includes(query)
    );
  }, [allParticipants, searchQuery]);

  const getInitials = (name) => {
    return (name || 'A')
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="people-panel animate-slide-in">
      <div className="people-header">
        <h2>People</h2>
        <button className="people-close-btn" onClick={onClose} title="Close">
          <X size={20} />
        </button>
      </div>

      <div className="people-search">
        <Search size={18} className="search-icon" />
        <input
          type="text"
          placeholder="Search for people"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="people-section">
        <div className="people-section-header">
          <span className="section-label">IN THE MEETING</span>
        </div>
        <div className="people-section-title">
          <span>Contributors</span>
          <span className="contributor-count">{allParticipants.length}</span>
        </div>
      </div>

      <div className="people-list">
        {filteredParticipants.map((participant) => {
          const isPinned = pinnedIds.includes(participant.id);
          
          return (
            <div key={participant.id} className="person-item">
              <div className="person-avatar">
                {getInitials(participant.userName)}
              </div>
              <div className="person-info">
                <span className="person-name">
                  {participant.userName}
                  {participant.isLocal && <span className="you-label"> (You)</span>}
                </span>
              </div>
              <div className="person-actions">
                {participant.isMuted && (
                  <MicOff size={18} className="muted-indicator" />
                )}
                {!participant.isLocal && (
                  <>
                    <button
                      className="person-action-btn"
                      onClick={() => onRemoteMute(participant.id)}
                      title="Mute"
                    >
                      <MicOff size={18} />
                    </button>
                    <button
                      className={`person-action-btn ${isPinned ? 'active' : ''}`}
                      onClick={() => onTogglePin(participant.id)}
                      title={isPinned ? 'Unpin' : 'Pin'}
                    >
                      {isPinned ? <PinOff size={18} /> : <Pin size={18} />}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
