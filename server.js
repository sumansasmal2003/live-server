// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: 'http://localhost:5173', // Update to match frontend URL if necessary
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type'],
        credentials: true,
    },
});

app.use(cors());

// Store active streams and viewer connections
const activeStreams = new Map();

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Start broadcasting
    socket.on('start-broadcast', (data) => {
        activeStreams.set(socket.id, { streamId: socket.id, viewers: [], broadcasterData: data });
        io.emit('active-streams', Array.from(activeStreams.values()));
        console.log('Broadcast started:', socket.id);
    });

    // Stop broadcasting
    socket.on('stop-broadcast', () => {
        activeStreams.delete(socket.id);
        io.emit('active-streams', Array.from(activeStreams.values()));
        console.log('Broadcast stopped:', socket.id);
    });

    // Viewer requests an offer to connect to a stream
    socket.on('request-offer', (streamId) => {
        if (activeStreams.has(streamId)) {
            const stream = activeStreams.get(streamId);
            stream.viewers.push(socket.id); // Track the viewer
            io.to(streamId).emit('send-offer', socket.id);
            io.emit('viewer-count-update', { streamId, viewers: stream.viewers.length });
            console.log(`Viewer ${socket.id} requested offer for stream ${streamId}`);
        } else {
            socket.emit('error', 'Stream not available');
        }
    });

    // Send offer to viewer
    socket.on('offer', ({ offer, streamId, viewerSocketId }) => {
        socket.to(viewerSocketId).emit('offer', { offer, streamId });
        console.log(`Sent offer from ${socket.id} to viewer ${viewerSocketId} for stream ${streamId}`);
    });

    // Receive answer from viewer
    socket.on('answer', ({ answer, streamId }) => {
        socket.to(streamId).emit('answer', { answer });
        console.log(`Received answer for stream ${streamId}`);
    });

    // Handle ICE candidates, targeted to either the stream or a viewer
    socket.on('ice-candidate', ({ candidate, streamId, viewerSocketId }) => {
        if (viewerSocketId) {
            socket.to(viewerSocketId).emit('ice-candidate', { candidate, streamId });
        } else if (streamId) {
            socket.to(streamId).emit('ice-candidate', { candidate });
        }
        console.log(`ICE candidate for ${streamId} from ${socket.id}`);
    });

    // Send active streams to newly connected clients
    socket.on('get-active-streams', () => {
        socket.emit('active-streams', Array.from(activeStreams.values()));
    });

    // Handle disconnection of broadcasters and viewers
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);

        // If broadcaster disconnects, remove the stream and update clients
        if (activeStreams.has(socket.id)) {
            activeStreams.delete(socket.id);
            io.emit('active-streams', Array.from(activeStreams.values()));
            console.log('Broadcast stopped:', socket.id);
        } else {
            // If a viewer disconnects, remove them from the stream's viewer list
            activeStreams.forEach((stream, streamId) => {
                const viewerIndex = stream.viewers.indexOf(socket.id);
                if (viewerIndex !== -1) {
                    stream.viewers.splice(viewerIndex, 1);
                    io.emit('viewer-count-update', { streamId, viewers: stream.viewers.length });
                }
            });
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
