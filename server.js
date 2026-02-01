const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const next = require('next');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const PORT = process.env.PORT || 3000;

// Store room data
const rooms = new Map();

app.prepare().then(() => {
  const server = express();
  const httpServer = createServer(server);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Setup Multer for video uploads
  const upload = multer({ 
    dest: os.tmpdir(),
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
  });

  // Conversion API
  server.post('/api/convert', upload.single('video'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const inputPath = req.file.path;
    const outputPath = path.join(os.tmpdir(), `${req.file.filename}.mp4`);

    console.log(`Starting conversion: ${inputPath} -> ${outputPath}`);

    // ffmpeg -i input.webm -c:v libx264 -preset ultrafast -crf 22 -c:a aac -b:a 128k -movflags +faststart -y outputPath
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '22',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y', 
      outputPath
    ]);

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log('Conversion successful');
        res.download(outputPath, 'recording.mp4', (err) => {
          // Cleanup files after download
          fs.unlink(inputPath, () => {});
          fs.unlink(outputPath, () => {});
          if (err) console.error('Download error:', err);
        });
      } else {
        console.error(`FFmpeg process exited with code ${code}`);
        res.status(500).json({ error: 'Conversion failed' });
        fs.unlink(inputPath, () => {});
      }
    });

    ffmpeg.on('error', (err) => {
      console.error('FFmpeg error:', err);
      res.status(500).json({ error: 'FFmpeg process error' });
      fs.unlink(inputPath, () => {});
    });
  });

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join a room
    socket.on('join-room', ({ roomId, userName }) => {
      socket.join(roomId);
      
      // Initialize room if it doesn't exist
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          participants: new Map(),
          messages: [],
          settings: {
            isContinuousChat: false
          },
          startTime: null,
          recordingState: {
            isRecording: false,
            startTime: null,
            initiatorId: null
          }
        });
      }

      const room = rooms.get(roomId);
      
      // Start timer if first participant
      if (room.participants.size === 0) {
        room.startTime = Date.now();
      }

      room.participants.set(socket.id, {
        id: socket.id,
        userName: userName || `User ${socket.id.slice(0, 4)}`,
        isMuted: false,
        isCameraOff: false,
        isScreenSharing: false
      });

      // Notify others in the room
      socket.to(roomId).emit('user-joined', {
        id: socket.id,
        userName: room.participants.get(socket.id).userName
      });

      // Send existing participants to the new user
      const existingParticipants = [];
      room.participants.forEach((participant, id) => {
        if (id !== socket.id) {
          existingParticipants.push(participant);
        }
      });
      socket.emit('existing-participants', existingParticipants);

      // Send chat history (only public messages for simplicity/security)
      const publicHistory = room.messages.filter(msg => !msg.toId);
      socket.emit('chat-history', publicHistory);

      // Send room settings, start time, and recording state
      socket.emit('room-settings-updated', room.settings);
      socket.emit('room-start-time', room.startTime);
      socket.emit('recording-state-updated', room.recordingState);

      console.log(`${socket.id} joined room ${roomId}`);
    });

    // WebRTC Signaling: Offer
    socket.on('offer', ({ to, offer }) => {
      socket.to(to).emit('offer', {
        from: socket.id,
        offer
      });
    });

    // WebRTC Signaling: Answer
    socket.on('answer', ({ to, answer }) => {
      socket.to(to).emit('answer', {
        from: socket.id,
        answer
      });
    });

    // WebRTC Signaling: ICE Candidate
    socket.on('ice-candidate', ({ to, candidate }) => {
      socket.to(to).emit('ice-candidate', {
        from: socket.id,
        candidate
      });
    });

    // Toggle mute
    socket.on('toggle-mute', ({ roomId, isMuted }) => {
      const room = rooms.get(roomId);
      if (room && room.participants.has(socket.id)) {
        room.participants.get(socket.id).isMuted = isMuted;
        socket.to(roomId).emit('user-toggled-mute', {
          id: socket.id,
          isMuted
        });
      }
    });

    // Toggle camera
    socket.on('toggle-camera', ({ roomId, isCameraOff }) => {
      const room = rooms.get(roomId);
      if (room && room.participants.has(socket.id)) {
        room.participants.get(socket.id).isCameraOff = isCameraOff;
        socket.to(roomId).emit('user-toggled-camera', {
          id: socket.id,
          isCameraOff
        });
      }
    });

    // Toggle screen sharing
    socket.on('toggle-screen-share', ({ roomId, isScreenSharing }) => {
      const room = rooms.get(roomId);
      if (room && room.participants.has(socket.id)) {
        room.participants.get(socket.id).isScreenSharing = isScreenSharing;
        socket.to(roomId).emit('user-toggled-screen-share', {
          id: socket.id,
          isScreenSharing
        });
      }
    });

    // Toggle hand raise
    socket.on('toggle-hand-raise', ({ roomId, isHandRaised }) => {
      const room = rooms.get(roomId);
      if (room && room.participants.has(socket.id)) {
        room.participants.get(socket.id).isHandRaised = isHandRaised;
        socket.to(roomId).emit('user-toggled-hand-raise', {
          id: socket.id,
          isHandRaised
        });
      }
    });

    // Update room settings
    socket.on('update-room-settings', ({ roomId, settings }) => {
      const room = rooms.get(roomId);
      if (room) {
        room.settings = { ...room.settings, ...settings };
        io.to(roomId).emit('room-settings-updated', room.settings);
      }
    });

    // Remote control: mute another user
    socket.on('remote-mute', ({ roomId, targetId }) => {
      const room = rooms.get(roomId);
      if (room && room.participants.has(targetId)) {
        io.to(targetId).emit('force-mute', { by: socket.id });
        room.participants.get(targetId).isMuted = true;
        io.to(roomId).emit('user-toggled-mute', {
          id: targetId,
          isMuted: true
        });
      }
    });

    // Remote control: turn off another user's camera
    socket.on('remote-camera-off', ({ roomId, targetId }) => {
      const room = rooms.get(roomId);
      if (room && room.participants.has(targetId)) {
        io.to(targetId).emit('force-camera-off', { by: socket.id });
        room.participants.get(targetId).isCameraOff = true;
        io.to(roomId).emit('user-toggled-camera', {
          id: targetId,
          isCameraOff: true
        });
      }
    });

    // Recording State
    socket.on('start-recording', ({ roomId }) => {
      const room = rooms.get(roomId);
      if (room && !room.recordingState.isRecording) {
        room.recordingState = {
          isRecording: true,
          startTime: Date.now(),
          initiatorId: socket.id
        };
        io.to(roomId).emit('recording-state-updated', room.recordingState);
      }
    });

    socket.on('stop-recording', ({ roomId }) => {
      const room = rooms.get(roomId);
      if (room && room.recordingState.isRecording) {
        room.recordingState = {
          isRecording: false,
          startTime: null,
          initiatorId: null
        };
        io.to(roomId).emit('recording-state-updated', room.recordingState);
      }
    });

    // Chat message
    socket.on('chat-message', ({ roomId, message, toId }) => {
      const room = rooms.get(roomId);
      if (room) {
        const participant = room.participants.get(socket.id);
        const chatMessage = {
          id: Date.now(),
          senderId: socket.id,
          senderName: participant?.userName || 'Unknown',
          message,
          toId, // recipient ID if private
          toName: toId ? room.participants.get(toId)?.userName : null,
          timestamp: new Date().toISOString()
        };
        
        room.messages.push(chatMessage);
        
        if (toId) {
          // Private message: emit only to sender and recipient
          socket.emit('new-message', chatMessage);
          io.to(toId).emit('new-message', chatMessage);
        } else {
          // Public message: emit to everyone in room
          io.to(roomId).emit('new-message', chatMessage);
        }
      }
    });

    // Leave room
    socket.on('leave-room', ({ roomId }) => {
      handleUserLeave(socket, roomId);
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      // Find and leave all rooms
      rooms.forEach((room, roomId) => {
        if (room.participants.has(socket.id)) {
          handleUserLeave(socket, roomId);
        }
      });
    });

    function handleUserLeave(socket, roomId) {
      const room = rooms.get(roomId);
      if (room) {
        room.participants.delete(socket.id);
        socket.to(roomId).emit('user-left', { id: socket.id });
        socket.leave(roomId);

        // If recording initiator leaves, stop recording
        if (room.recordingState.isRecording && room.recordingState.initiatorId === socket.id) {
          room.recordingState = {
            isRecording: false,
            startTime: null,
            initiatorId: null
          };
          io.to(roomId).emit('recording-state-updated', room.recordingState);
        }

        // Clean up empty rooms unless continuous chat is enabled
        if (room.participants.size === 0 && !room.settings.isContinuousChat) {
          rooms.delete(roomId);
        }
      }
    }
  });

  // Handle all other routes with Next.js
  server.all('/{*path}', (req, res) => {
    return handle(req, res);
  });

  httpServer.listen(PORT, () => {
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});
