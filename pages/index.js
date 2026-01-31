import { useState } from 'react';
import { useRouter } from 'next/router';
import { v4 as uuidv4 } from 'uuid';
import Head from 'next/head';
import { Video, Plus, ArrowRight, Shield, Globe } from 'lucide-react';

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
      </Head>

      <div className="home-container">
        <div className="home-content animate-fade-in">
          <div className="logo">
            <Video size={48} color="var(--accent-primary)" strokeWidth={2.5} />
          </div>
          <h1 className="home-title">MeetUp</h1>
          <p className="home-subtitle">
            Premium video meetings. Now free for everyone.
          </p>

          <div className="home-card">
            <button 
              className="btn btn-primary" 
              onClick={createRoom}
              disabled={isCreating}
              style={{ width: '100%', padding: '16px', gap: '12px' }}
            >
              {isCreating ? (
                <>
                  <Plus className="animate-spin" size={20} />
                  Creating Room...
                </>
              ) : (
                <>
                  <Plus size={20} />
                  New Meeting
                </>
              )}
            </button>

            <div className="home-divider">
              <span>or</span>
            </div>

            <form className="join-form" onSubmit={joinRoom}>
              <input
                type="text"
                className="input"
                placeholder="Enter a code or link"
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

          <div className="home-features">
            <div className="feature">
              <Shield size={18} />
              <span>Secure & Private</span>
            </div>
            <div className="feature">
              <Globe size={18} />
              <span>No Account Needed</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
