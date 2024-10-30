// server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: 'http://localhost:5173', // Adjust this to your frontend URL if necessary
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type'],
        credentials: true,
    },
});

app.use(cors());

// Store active streams and viewers
const activeStreams = new Map();

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Start broadcasting
    socket.on('start-broadcast', (data) => {
        activeStreams.set(socket.id, { streamId: socket.id, viewers: 0, broadcasterData: data });
        io.emit('active-streams', Array.from(activeStreams.values()));
        console.log('Broadcast started:', socket.id);
    });

    // Stop broadcasting
    socket.on('stop-broadcast', () => {
        activeStreams.delete(socket.id);
        io.emit('active-streams', Array.from(activeStreams.values()));
        console.log('Broadcast stopped:', socket.id);
    });

    // Request an offer for a viewer
    socket.on('request-offer', (streamId) => {
        if (activeStreams.has(streamId)) {
            io.to(streamId).emit('send-offer', socket.id);
            activeStreams.get(streamId).viewers += 1;
            io.emit('viewer-count-update', {
                streamId,
                viewers: activeStreams.get(streamId).viewers,
            });
        }
    });

    // Send offer to viewer
    socket.on('offer', ({ offer, streamId, viewerSocketId }) => {
        socket.to(viewerSocketId).emit('offer', { offer, streamId });
    });

    // Receive answer from viewer
    socket.on('answer', ({ answer, streamId }) => {
        socket.to(streamId).emit('answer', { answer });
    });

    // Handle ICE candidates
    socket.on('ice-candidate', (data) => {
        socket.broadcast.emit('ice-candidate', data);
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        if (activeStreams.has(socket.id)) {
            activeStreams.delete(socket.id);
            io.emit('active-streams', Array.from(activeStreams.values()));
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
