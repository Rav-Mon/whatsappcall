const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from current directory
app.use(express.static(__dirname));

// Root route - serve the chat app
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Store active users
const users = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('user-login', (userData) => {
        users[socket.id] = userData;
        socket.userData = userData;
        
        console.log(`User ${userData.username} logged in`);
        socket.broadcast.emit('user-online', userData);
        
        const onlineUsers = Object.values(users);
        socket.emit('online-users', onlineUsers);
    });

    socket.on('offer', (data) => {
        socket.to(data.target).emit('offer', {
            offer: data.offer,
            caller: socket.userData
        });
    });

    socket.on('answer', (data) => {
        socket.to(data.target).emit('answer', {
            answer: data.answer,
            callee: socket.userData
        });
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.target).emit('ice-candidate', data.candidate);
    });

    socket.on('call-user', (data) => {
        socket.to(data.target).emit('incoming-call', {
            from: socket.userData,
            offer: data.offer,
            callType: data.callType
        });
    });

    socket.on('accept-call', (data) => {
        socket.to(data.from).emit('call-accepted', {
            answer: data.answer
        });
    });

    socket.on('reject-call', (data) => {
        socket.to(data.from).emit('call-rejected', {
            reason: data.reason
        });
    });

    socket.on('end-call', (data) => {
        socket.to(data.target).emit('call-ended');
    });

    socket.on('send-message', (messageData) => {
        io.emit('new-message', messageData);
    });

    socket.on('disconnect', () => {
        if (socket.userData) {
            console.log(`User ${socket.userData.username} disconnected`);
            socket.broadcast.emit('user-offline', socket.userData);
            delete users[socket.id];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Mango Chat Server running on port ${PORT}`);
});