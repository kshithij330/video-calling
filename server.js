const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const next = require('next');

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
          messages: []
        });
      }

      const room = rooms.get(roomId);
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

      // Send chat history
      socket.emit('chat-history', room.messages);

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

    // Chat message
    socket.on('chat-message', ({ roomId, message }) => {
      const room = rooms.get(roomId);
      if (room) {
        const participant = room.participants.get(socket.id);
        const chatMessage = {
          id: Date.now(),
          senderId: socket.id,
          senderName: participant?.userName || 'Unknown',
          message,
          timestamp: new Date().toISOString()
        };
        room.messages.push(chatMessage);
        io.to(roomId).emit('new-message', chatMessage);
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

        // Clean up empty rooms
        if (room.participants.size === 0) {
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
