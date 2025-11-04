const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(__dirname));

// Root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Store active users
const users = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // User login
    socket.on('user-login', (userData) => {
        users.set(userData.username, { 
            ...userData, 
            socketId: socket.id, 
            online: true 
        });
        
        console.log(`User ${userData.username} logged in`);
        
        // Notify other user about online status
        socket.broadcast.emit('user-online', userData);
        
        // Send current online users to the new user
        const onlineUsers = Array.from(users.values()).filter(user => user.online);
        socket.emit('online-users', onlineUsers);
    });

    // WebRTC Signaling
    socket.on('call-user', (data) => {
        const targetUser = users.get(data.target);
        if (targetUser && targetUser.online) {
            socket.to(targetUser.socketId).emit('incoming-call', {
                from: data.from,
                offer: data.offer,
                callType: data.callType
            });
            console.log(`Call from ${data.from} to ${data.target}`);
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
            socket.to(callerUser.socketId).emit('call-rejected');
        }
    });

    socket.on('end-call', (data) => {
        const targetUser = users.get(data.target);
        if (targetUser && targetUser.online) {
            socket.to(targetUser.socketId).emit('call-ended');
        }
    });

    socket.on('ice-candidate', (data) => {
        const targetUser = users.get(data.target);
        if (targetUser && targetUser.online) {
            socket.to(targetUser.socketId).emit('ice-candidate', data.candidate);
        }
    });

    // Message handling
    socket.on('send-message', (messageData) => {
        // Broadcast to both users
        io.emit('new-message', messageData);
    });

    socket.on('disconnect', () => {
        // Find and mark user as offline
        for (let [username, user] of users.entries()) {
            if (user.socketId === socket.id) {
                user.online = false;
                console.log(`User ${username} disconnected`);
                socket.broadcast.emit('user-offline', user);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
