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
        if (activeStreams.has(socket.id)) {
            // Notify viewers and remove the stream
            const stream = activeStreams.get(socket.id);
            stream.viewers.forEach(viewerId => {
                io.to(viewerId).emit('broadcast-ended');
            });
            activeStreams.delete(socket.id);
            io.emit('active-streams', Array.from(activeStreams.values()));
            console.log('Broadcast stopped:', socket.id);
        }
    });

    // Viewer requests an offer to connect to a stream
    socket.on('request-offer', (streamId) => {
        if (activeStreams.has(streamId)) {
            const stream = activeStreams.get(streamId);
            stream.viewers.push(socket.id); // Track the viewer
            io.to(streamId).emit('send-offer', socket.id); // Request broadcaster to send an offer
            io.emit('viewer-count-update', { streamId, viewers: stream.viewers.length });
            console.log(`Viewer ${socket.id} requested offer for stream ${streamId}`);
        } else {
            socket.emit('error', 'Stream not available');
        }
    });

    // Send offer to viewer
    socket.on('offer', ({ offer, streamId, viewerSocketId }) => {
        io.to(viewerSocketId).emit('offer', { offer, streamId });
        console.log(`Sent offer from ${socket.id} to viewer ${viewerSocketId} for stream ${streamId}`);
    });

    // Receive answer from viewer
    socket.on('answer', ({ answer, streamId, viewerSocketId }) => {
        io.to(streamId).emit('answer', { answer, viewerSocketId });
        console.log(`Received answer from viewer ${viewerSocketId} for stream ${streamId}`);
    });

    // Handle ICE candidates, targeted to either the broadcaster or a viewer
    socket.on('ice-candidate', ({ candidate, streamId, targetSocketId }) => {
        io.to(targetSocketId).emit('ice-candidate', { candidate, streamId });
        console.log(`ICE candidate sent to ${targetSocketId} for stream ${streamId} from ${socket.id}`);
    });

    // Send active streams to newly connected clients
    socket.on('get-active-streams', () => {
        socket.emit('active-streams', Array.from(activeStreams.values()));
    });

    // Handle disconnection of broadcasters and viewers
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);

        // If broadcaster disconnects, remove the stream and notify clients
        if (activeStreams.has(socket.id)) {
            const stream = activeStreams.get(socket.id);
            // Notify all viewers of the stream that the broadcast ended
            stream.viewers.forEach(viewerId => {
                io.to(viewerId).emit('broadcast-ended');
            });
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
                    console.log(`Viewer ${socket.id} disconnected from stream ${streamId}`);
                }
            });
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
