import React, { useState, useEffect, useCallback, useRef, Suspense } from "react";
import dynamic from "next/dynamic";
// Import Excalidraw CSS - CRITICAL for the UI to render and tools to be selectable
import "@excalidraw/excalidraw/index.css";
import { 
  RoomProvider, 
  useStorage, 
  useMutation, 
  useUpdateMyPresence, 
  useOthers, 
  useHistory 
} from "../liveblocks.config";
import { LiveMap } from "@liveblocks/client";
import { Loader2, Download, Trash2, Undo2, Redo2, X, Shield } from "lucide-react";

// Dynamically import Excalidraw to avoid SSR issues
const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false }
);

// Helper to generate a consistent color for a user
const getUserColor = (id) => {
  const colors = ['#FF4D4D', '#4DFF4D', '#4D4DFF', '#FFFF4D', '#FF4DFF', '#4DFFFF', '#FFA500'];
  const index = Math.abs(id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % colors.length;
  return colors[index];
};

// Isolated Cursors Component to prevent main board rerenders
const CollaborativeCursors = React.memo(({ others, excalidrawAPI }) => {
  if (!excalidrawAPI) return null;
  const appState = excalidrawAPI.getAppState();

  return (
    <div className="cursors-overlay">
      {others.map(({ connectionId, presence }) => {
        if (!presence?.cursor) return null;
        const color = getUserColor(connectionId.toString());
        
        // Convert world coordinates to screen coordinates
        const x = (presence.cursor.x + appState.scrollX) * appState.zoom.value;
        const y = (presence.cursor.y + appState.scrollY) * appState.zoom.value;

        return (
          <div 
            key={connectionId}
            className="collaborator-cursor"
            style={{ transform: `translate(${x}px, ${y}px)` }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path 
                d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7841 12.3673H5.65376Z" 
                fill={color}
              />
            </svg>
            <div className="cursor-label" style={{ backgroundColor: color }}>
              {presence.userName || "Participant"}
            </div>
          </div>
        );
      })}
      <style jsx>{`
        .cursors-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 100;
        }
        .collaborator-cursor {
          position: absolute;
          top: 0;
          left: 0;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          transition: transform 0.08s linear;
          will-change: transform;
        }
        .cursor-label {
          margin-top: 4px;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          color: white;
          white-space: nowrap;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
      `}</style>
    </div>
  );
});

// Participant Indicators Component
const ParticipantDots = React.memo(({ others }) => {
  return (
    <div className="participant-cursors-list">
      {others.map(({ connectionId, presence }) => (
        presence?.userName && (
          <div 
            key={connectionId} 
            className="participant-dot" 
            style={{ backgroundColor: getUserColor(connectionId.toString()) }}
            title={presence.userName}
          />
        )
      ))}
      <style jsx>{`
        .participant-cursors-list {
          display: flex;
          gap: 6px;
          margin-left: 12px;
          padding-left: 12px;
          border-left: 1px solid #333;
        }
        .participant-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
      `}</style>
    </div>
  );
});

function WhiteboardContent({ roomId, onClose, userName }) {
  const excalidrawAPIRef = useRef(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [apiReady, setApiReady] = useState(false);
  const lastElementsRef = useRef([]);
  const lastSyncTimeRef = useRef(0);
  const isSyncingRef = useRef(false); // Atomic Sync Guard
  
  // Liveblocks Hooks
  const elements = useStorage((root) => root.elements);
  const history = useHistory();
  const others = useOthers();
  const updateMyPresence = useUpdateMyPresence();

  // Memoized Sync Mutation
  const syncElements = useMutation(({ storage }, newElements) => {
    let liveElements = storage.get("elements");
    if (!liveElements) {
      storage.set("elements", new LiveMap());
      liveElements = storage.get("elements");
    }
    
    newElements.forEach((element) => {
      const liveElement = liveElements.get(element.id);
      
      // CRITICAL: Only update if local version is newer or remote is missing
      // This prevents "stale" remote updates from clobbering active local transformations
      if (!liveElement || 
          element.version > liveElement.version || 
          (element.version === liveElement.version && element.versionNonce !== liveElement.versionNonce)) {
        liveElements.set(element.id, element);
      }
    });

    if (newElements.length < liveElements.size) {
      const newElementIds = new Set(newElements.map((e) => e.id));
      for (const id of liveElements.keys()) {
        if (!newElementIds.has(id)) liveElements.delete(id);
      }
    }
  }, []);

  // Sync from storage to canvas
  useEffect(() => {
    if (!excalidrawAPIRef.current || !elements) return;

    const liveElementsList = Array.from(elements.values());
    const currentElements = excalidrawAPIRef.current.getSceneElements();
    
    // 1. Check if we actually need to update (Remote is strictly newer)
    const hasNewerRemote = liveElementsList.some((remote) => {
      const local = currentElements.find(e => e.id === remote.id);
      return !local || remote.version > local.version || (remote.version === local.version && remote.versionNonce !== local.versionNonce);
    }) || liveElementsList.length !== currentElements.length;
    
    if (hasNewerRemote) {
      isSyncingRef.current = true;
      lastElementsRef.current = liveElementsList;
      
      excalidrawAPIRef.current.updateScene({ 
        elements: liveElementsList,
        commitToHistory: false 
      });

      // Handle Initial Viewport Alignment
      if (isInitializing && liveElementsList.length > 0) {
        // Wait a tiny bit for the scene to settle then zoom to fit
        setTimeout(() => {
          if (excalidrawAPIRef.current) {
            excalidrawAPIRef.current.scrollToContent(liveElementsList, { fitToViewport: true, padding: 20 });
            setIsInitializing(false);
          }
        }, 100);
      } else if (isInitializing) {
        setIsInitializing(false);
      }

      // Briefly wait to let Excalidraw's internal state settle before releasing the guard
      setTimeout(() => {
        isSyncingRef.current = false;
      }, 50);
    }
  }, [elements, isInitializing]);

  // Memoized Interaction Handlers
  const onChange = useCallback((newElements, appState) => {
    // 0. If we are currently applying a remote update, ignore local change events
    if (isSyncingRef.current) return;

    // 1. Sync view state to presence (for coordination)
    updateMyPresence({
      viewState: {
        zoom: appState.zoom.value,
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
      }
    });

    // 2. Efficient change detection
    const now = Date.now();
    const hasChanges = newElements.some((e) => {
      const last = lastElementsRef.current.find(l => l.id === e.id);
      // We only care if the version or nonce changed (prevents empty updates)
      return !last || last.version !== e.version || last.versionNonce !== e.versionNonce;
    }) || newElements.length !== lastElementsRef.current.length;

    if (!hasChanges) return;

    // 3. Throttle gesture updates for performance
    const isGesture = appState.draggingElement || appState.resizingElement || appState.editingElement;
    if (isGesture && now - lastSyncTimeRef.current < 35) return; // ~30fps

    lastSyncTimeRef.current = now;
    lastElementsRef.current = newElements;
    syncElements(newElements);
  }, [updateMyPresence, syncElements]);

  const onPointerUpdate = useCallback((payload) => {
    if (!payload.pointer) return;
    updateMyPresence({
      cursor: payload.pointer,
      userName: userName || "Participant",
    });
  }, [updateMyPresence, userName]);

  const handleClear = useMutation(({ storage }) => {
    const liveElements = storage.get("elements");
    if (liveElements) liveElements.clear();
    if (excalidrawAPIRef.current) excalidrawAPIRef.current.updateScene({ elements: [] });
  }, []);

  const handleExport = useCallback(() => {
    if (!excalidrawAPIRef.current) return;
    const elements = excalidrawAPIRef.current.getSceneElements();
    const blob = new Blob([JSON.stringify(elements)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `whiteboard-${roomId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [roomId]);

  return (
    <div className="whiteboard-container">
      <div className="whiteboard-header">
        <div className="whiteboard-title">
          <Shield size={20} color="var(--accent-primary)" />
          <h3>Collaborative Whiteboard</h3>
          <ParticipantDots others={others} />
        </div>
        <div className="whiteboard-actions">
          <button className="whiteboard-btn" onClick={() => history.undo()} title="Undo">
            <Undo2 size={18} />
          </button>
          <button className="whiteboard-btn" onClick={() => history.redo()} title="Redo">
            <Redo2 size={18} />
          </button>
          <div className="whiteboard-divider" />
          <button className="whiteboard-btn" onClick={handleExport} title="Export JSON">
            <Download size={18} />
          </button>
          <button className="whiteboard-btn danger" onClick={handleClear} title="Clear Board">
            <Trash2 size={18} />
          </button>
          <button className="whiteboard-btn close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
      </div>
      
      <div className="excalidraw-wrapper">
        <Excalidraw
          excalidrawAPI={(api) => {
            excalidrawAPIRef.current = api;
            if (elements && isInitializing) {
              const liveElements = Array.from(elements.values());
              if (liveElements.length > 0) {
                api.updateScene({ elements: liveElements });
                setTimeout(() => api.scrollToContent(liveElements, { fitToViewport: true, padding: 50 }), 100);
              }
              setIsInitializing(false);
            }
            setApiReady(true);
          }}
          onChange={onChange}
          onPointerUpdate={onPointerUpdate}
          theme="dark"
          UIOptions={{
            canvasActions: { loadScene: false, saveAsImage: true, export: false }
          }}
        />

        {apiReady && <CollaborativeCursors others={others} excalidrawAPI={excalidrawAPIRef.current} />}
      </div>

      <style jsx>{`
        .whiteboard-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: #121214;
          z-index: 2000;
          display: flex;
          flex-direction: column;
        }
        .whiteboard-header {
          height: 60px;
          background: #1e1e20;
          border-bottom: 1px solid #333;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 20px;
        }
        .whiteboard-title { display: flex; align-items: center; gap: 12px; }
        .whiteboard-title h3 { color: white; font-size: 14px; font-weight: 500; margin: 0; }
        .whiteboard-actions { display: flex; gap: 8px; align-items: center; }
        .whiteboard-btn {
          background: transparent;
          border: none;
          color: #888;
          padding: 8px;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .whiteboard-btn:hover { background: #2a2a2d; color: white; }
        .whiteboard-btn.danger:hover { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        .whiteboard-divider { width: 1px; height: 20px; background: #333; margin: 0 4px; }
        .excalidraw-wrapper { flex: 1; position: relative; overflow: hidden; }
      `}</style>
    </div>
  );
}

function LoadingBoard() {
  return (
    <div className="loading-board">
      <Loader2 className="animate-spin" size={48} color="var(--accent-primary)" />
      <p>Loading Whiteboard...</p>
      <style jsx>{`
        .loading-board {
          position: fixed;
          inset: 0;
          background: #121214;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          color: white;
          z-index: 2100;
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function ConfigGuide({ onClose, error }) {
  const isAccessError = error?.message?.toLowerCase().includes("access") || error?.message?.toLowerCase().includes("4001");
  
  return (
    <div className="config-guide">
      <div className="guide-content">
        <Shield size={48} color="var(--accent-primary)" style={{ marginBottom: '16px' }} />
        <h2>{isAccessError ? "Access Denied" : "Something went wrong"}</h2>
        <p>
          {isAccessError 
            ? "Your Liveblocks API Key seems to be invalid or doesn't have access to this room." 
            : "We encountered an unexpected error while loading the whiteboard."}
        </p>
        
        {isAccessError && (
          <div className="steps-list">
            <div className="step">
              <span className="step-num">1</span>
              <p>Verify your <strong>Public Key</strong> in <code>liveblocks.config.js</code>.</p>
            </div>
            <div className="step">
              <span className="step-num">2</span>
              <p>Ensure the key matches the environment (Development vs Production).</p>
            </div>
          </div>
        )}

        <div className="error-details" style={{ fontSize: '12px', color: '#666', marginTop: '10px', background: '#1a1a1c', padding: '10px', borderRadius: '8px', textAlign: 'left', wordBreak: 'break-all' }}>
          <code>{error?.message || "Unknown error"}</code>
        </div>

        <button className="btn btn-primary" style={{ width: '100%', marginTop: '20px' }} onClick={onClose}>
          Close Whiteboard
        </button>
      </div>
      <style jsx>{`
        .config-guide {
          position: fixed;
          inset: 0;
          background: rgba(9, 9, 11, 0.95);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2500;
          padding: 20px;
        }
        .guide-content {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 20px;
          padding: 40px;
          max-width: 450px;
          text-align: center;
          box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        }
        h2 { margin: 0 0 16px 0; font-size: 24px; color: white; }
        p { color: var(--text-secondary); line-height: 1.6; margin-bottom: 24px; }
        .steps-list { text-align: left; display: flex; flex-direction: column; gap: 16px; margin-bottom: 10px; }
        .step { display: flex; gap: 12px; align-items: flex-start; }
        .step-num { 
          background: var(--accent-primary); 
          color: white; 
          width: 24px; 
          height: 24px; 
          border-radius: 50%; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          font-size: 12px; 
          font-weight: 700;
          flex-shrink: 0;
        }
        .step p { margin: 0; font-size: 14px; color: var(--text-primary); }
        code { font-family: monospace; }
        a { color: var(--accent-primary); text-decoration: none; }
      `}</style>
    </div>
  );
}

class WhiteboardErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) return <ConfigGuide onClose={this.props.onClose} error={this.state.error} />;
    return this.props.children;
  }
}

export default function Whiteboard({ roomId, onClose, userName }) {
  if (!roomId) return null;

  return (
    <WhiteboardErrorBoundary onClose={onClose}>
      <RoomProvider 
        id={roomId} 
        initialPresence={{ cursor: null, userName }}
        initialStorage={{ elements: new LiveMap() }}
      >
        <Suspense fallback={<LoadingBoard />}>
          <WhiteboardContent roomId={roomId} onClose={onClose} userName={userName} />
        </Suspense>
      </RoomProvider>
    </WhiteboardErrorBoundary>
  );
}
