import { useState } from 'react';
import { useRouter } from 'next/router';
import { v4 as uuidv4 } from 'uuid';
import Head from 'next/head';

export default function Home() {
  const router = useRouter();
  const [roomId, setRoomId] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const createRoom = async () => {
    setIsCreating(true);
    const newRoomId = uuidv4().split('-')[0]; // Shorter room ID
    router.push(`/room/${newRoomId}`);
  };

  const joinRoom = (e) => {
    e.preventDefault();
    if (roomId.trim()) {
      router.push(`/room/${roomId.trim()}`);
    }
  };

  return (
    <>
      <Head>
        <title>MeetUp - Video Calling Platform</title>
        <meta name="description" content="Connect with anyone, anywhere with high-quality video calls" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📹</text></svg>" />
      </Head>

      <div className="home-container">
        <div className="home-content animate-fade-in">
          <div className="logo">📹</div>
          <h1 className="home-title">MeetUp</h1>
          <p className="home-subtitle">
            Connect with anyone, anywhere with crystal-clear video calls
          </p>

          <div className="home-card">
            <button 
              className="btn btn-primary" 
              onClick={createRoom}
              disabled={isCreating}
              style={{ width: '100%', padding: '16px' }}
            >
              {isCreating ? (
                <>
                  <span className="spinner">⏳</span>
                  Creating Room...
                </>
              ) : (
                <>
                  <span>➕</span>
                  Create New Room
                </>
              )}
            </button>

            <div className="home-divider">
              <span>or join an existing room</span>
            </div>

            <form className="join-form" onSubmit={joinRoom}>
              <input
                type="text"
                className="input"
                placeholder="Enter Room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
              />
              <button 
                type="submit" 
                className="btn btn-secondary"
                disabled={!roomId.trim()}
              >
                Join
              </button>
            </form>
          </div>

          <p style={{ 
            marginTop: '32px', 
            color: 'var(--text-muted)', 
            fontSize: '13px' 
          }}>
            🔒 End-to-end encrypted • No account required
          </p>
        </div>
      </div>
    </>
  );
}
