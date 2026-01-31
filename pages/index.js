import { useState } from 'react';
import { useRouter } from 'next/router';
import { v4 as uuidv4 } from 'uuid';
import Head from 'next/head';
import { Video, Plus, ArrowRight, Shield, Globe, Users, Zap, Lock, UserCircle } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [roomId, setRoomId] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const createRoom = async () => {
    setIsCreating(true);
    const newRoomId = uuidv4().split('-')[0];
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
        <title>MeetUp - Premium Video Calling</title>
        <meta name="description" content="Connect instantly with high-quality video calls. Secure, fast, and no account required." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        
        {/* Open Graph / Facebook / WhatsApp */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="MeetUp - Premium Video Calling" />
        <meta property="og:description" content="Connect instantly with high-quality video calls. Secure, fast, and no account required." />
        <meta property="og:image" content="/preview.png" />
        <meta property="og:url" content="https://meetup-video.vercel.app" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="MeetUp - Premium Video Calling" />
        <meta name="twitter:description" content="Connect instantly with high-quality video calls. Secure, fast, and no account required." />
        <meta name="twitter:image" content="/preview.png" />
      </Head>

      <div className="landing-page">
        {/* Hero Section */}
        <section className="hero-section">
          <div className="hero-content animate-fade-in">
            <div className="logo-wrapper">
              <Video size={56} color="var(--accent-primary)" strokeWidth={2} />
            </div>
            <h1 className="hero-title">MeetUp</h1>
            <p className="hero-subtitle">
              Premium video meetings. Now free for everyone.
            </p>

            <div className="action-card">
              <button 
                className="btn btn-primary action-btn" 
                onClick={createRoom}
                disabled={isCreating}
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

              <div className="divider">
                <span>or join existing</span>
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
                  <ArrowRight size={18} />
                  Join
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="features-section">
          <h2 className="section-title">Why MeetUp?</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <Shield size={28} />
              </div>
              <h3>Secure & Private</h3>
              <p>Your calls are end-to-end encrypted. We never store your video data.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Globe size={28} />
              </div>
              <h3>No Account Needed</h3>
              <p>Just create a room and share the link. It's that simple.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Zap size={28} />
              </div>
              <h3>Crystal Clear Quality</h3>
              <p>High-definition video and audio for a seamless experience.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Users size={28} />
              </div>
              <h3>Unlimited Participants</h3>
              <p>Invite as many people as you need. Group calls made easy.</p>
            </div>
          </div>
        </section>

        {/* Team Section */}
        <section className="team-section">
          <h2 className="section-title">Meet the Team</h2>
          <div className="team-grid">
            <div className="team-card">
              <div className="team-avatar">
                {/* Replace src with actual image path */}
                <img src="/team/kshithij.png" alt="Kshithij Anand Belman" />
              </div>
              <h3>Kshithij Anand Belman</h3>
              <span className="team-role">Main Developer</span>
            </div>
            <div className="team-card">
              <div className="team-avatar">
                {/* Replace src with actual image path */}
                <img src="/team/trisha.png" alt="Trisha SS Belman" />
              </div>
              <h3>Trisha SS Belman</h3>
              <span className="team-role">QA Tester</span>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="landing-footer">
          <div className="footer-logos">
            <a href="https://www.belmans4kids.com/" target="_blank" rel="noopener noreferrer">
              <img src="/footer/belmans4kids.png" alt="Belmans for Kids" />
            </a>
            <a href="https://www.belmans4kids.com/b_to_b_homepage" target="_blank" rel="noopener noreferrer">
              <img src="/footer/belmans4business.png" alt="Belmans for Business" />
            </a>
          </div>
        </footer>
      </div>
    </>
  );
}
