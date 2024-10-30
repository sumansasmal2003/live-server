// server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: 'http://localhost:5173', // Change to your frontend URL if necessary
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type'],
        credentials: true,
    },
});

app.use(cors());

// Store active streams and their viewer count
const activeStreams = new Map(); // Map of streamId to { streamId, viewers: Set of viewer socket IDs }

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Send current active streams to the newly connected client
    socket.emit('active-streams', Array.from(activeStreams.values()).map(stream => ({
        streamId: stream.streamId,
        viewerCount: stream.viewers.size,
    })));

    // When broadcasting starts, add to activeStreams
    socket.on('start-broadcast', () => {
        activeStreams.set(socket.id, { streamId: socket.id, viewers: new Set() });
        io.emit('active-streams', Array.from(activeStreams.values()).map(stream => ({
            streamId: stream.streamId,
            viewerCount: stream.viewers.size,
        })));
    });

    // When broadcasting stops, remove from activeStreams
    socket.on('stop-broadcast', () => {
        if (activeStreams.delete(socket.id)) {
            io.emit('active-streams', Array.from(activeStreams.values()).map(stream => ({
                streamId: stream.streamId,
                viewerCount: stream.viewers.size,
            })));
        }
    });

    // Handle offer sent by broadcaster to a viewer
    socket.on('offer', ({ offer, streamId, viewerSocketId }) => {
        if (offer && offer.sdp && offer.type === 'offer') {
            socket.to(viewerSocketId).emit('offer', { offer, streamId });
        } else {
            console.error('Invalid offer received from broadcaster:', offer);
        }
    });

    socket.on('request-offer', (streamId) => {
        // Notify broadcaster to send an offer to this viewer
        const stream = activeStreams.get(streamId);
        if (stream) {
            stream.viewers.add(socket.id); // Add viewer to the stream's viewers set
            io.to(streamId).emit('viewer-joined'); // Notify broadcaster of a new viewer
            io.emit('active-streams', Array.from(activeStreams.values()).map(stream => ({
                streamId: stream.streamId,
                viewerCount: stream.viewers.size,
            }))); // Update all clients with new viewer count
            io.to(streamId).emit('send-offer', socket.id);
        }
    });

    // Handle answer from viewer to broadcaster
    socket.on('answer', ({ answer, streamId }) => {
        socket.to(streamId).emit('answer', { answer, streamId });
    });

    // Handle ICE candidates for WebRTC connections
    socket.on('ice-candidate', (data) => {
        socket.broadcast.emit('ice-candidate', data);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);

        // Check if the disconnected socket was a broadcaster
        if (activeStreams.delete(socket.id)) {
            io.emit('active-streams', Array.from(activeStreams.values()).map(stream => ({
                streamId: stream.streamId,
                viewerCount: stream.viewers.size,
            })));
        } else {
            // Check if the disconnected socket was a viewer and remove from viewers list
            activeStreams.forEach((stream, streamId) => {
                if (stream.viewers.delete(socket.id)) {
                    io.to(streamId).emit('viewer-left'); // Notify broadcaster of viewer departure
                    io.emit('active-streams', Array.from(activeStreams.values()).map(stream => ({
                        streamId: stream.streamId,
                        viewerCount: stream.viewers.size,
                    }))); // Update all clients with new viewer count
                }
            });
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
