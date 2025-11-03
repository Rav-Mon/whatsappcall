const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static(__dirname));

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Store active users and their socket IDs
const users = new Map();
const userSockets = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User login
  socket.on('user-login', (userData) => {
    users.set(userData.username, { ...userData, socketId: socket.id, online: true });
    userSockets.set(socket.id, userData.username);
    
    console.log(`User ${userData.username} logged in`);
    
    // Notify all users about online status
    const onlineUsers = Array.from(users.values()).filter(user => user.online);
    io.emit('online-users', onlineUsers);
    
    // Send current online users to the new user
    socket.emit('online-users', onlineUsers);
  });

  // WebRTC Signaling - FIXED
  socket.on('call-user', (data) => {
    const targetUser = users.get(data.target);
    if (targetUser && targetUser.online) {
      socket.to(targetUser.socketId).emit('incoming-call', {
        from: data.from,
        offer: data.offer,
        callType: data.callType
      });
      console.log(`Call from ${data.from} to ${data.target}`);
    } else {
      socket.emit('call-rejected', { reason: 'User is offline' });
    }
  });

  socket.on('accept-call', (data) => {
    const callerUser = users.get(data.from);
    if (callerUser && callerUser.online) {
      socket.to(callerUser.socketId).emit('call-accepted', {
        answer: data.answer
      });
    }
  });

  socket.on('reject-call', (data) => {
    const callerUser = users.get(data.from);
    if (callerUser && callerUser.online) {
      socket.to(callerUser.socketId).emit('call-rejected', {
        reason: data.reason
      });
    }
  });

  socket.on('ice-candidate', (data) => {
    const targetUser = users.get(data.target);
    if (targetUser && targetUser.online) {
      socket.to(targetUser.socketId).emit('ice-candidate', data.candidate);
    }
  });

  socket.on('end-call', (data) => {
    const targetUser = users.get(data.target);
    if (targetUser && targetUser.online) {
      socket.to(targetUser.socketId).emit('call-ended');
    }
  });

  // Message handling with persistence
  socket.on('send-message', (messageData) => {
    // Store message (in production, use database)
    if (!global.messages) global.messages = [];
    global.messages.push(messageData);
    
    // Broadcast to both users
    io.emit('new-message', messageData);
  });

  socket.on('delete-message', (data) => {
    if (global.messages) {
      global.messages = global.messages.filter(msg => msg.id !== data.messageId);
    }
    io.emit('message-deleted', { messageId: data.messageId });
  });

  // Get message history
  socket.on('get-messages', () => {
    if (global.messages) {
      socket.emit('message-history', global.messages);
    }
  });

  socket.on('disconnect', () => {
    const username = userSockets.get(socket.id);
    if (username) {
      const user = users.get(username);
      if (user) {
        user.online = false;
        console.log(`User ${username} disconnected`);
        
        // Notify all users about offline status
        const onlineUsers = Array.from(users.values()).filter(user => user.online);
        io.emit('online-users', onlineUsers);
      }
      userSockets.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Mango Chat Server running on port ${PORT}`);
  console.log(`👉 Access your app: http://localhost:${PORT}`);
});
