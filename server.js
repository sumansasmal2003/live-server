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

// Store active streams
const activeStreams = new Map();

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // When broadcasting starts, add to activeStreams
    socket.on('start-broadcast', () => {
        activeStreams.set(socket.id, { streamId: socket.id });
        io.emit('active-streams', Array.from(activeStreams.values())); // Notify all clients
    });

    // When broadcasting stops, remove from activeStreams
    socket.on('stop-broadcast', () => {
        activeStreams.delete(socket.id);
        io.emit('active-streams', Array.from(activeStreams.values())); // Update clients
    });

    // Handle offer sent by broadcaster
    socket.on('offer', ({ offer, streamId, viewerSocketId }) => {
        if (offer && offer.sdp && offer.type === 'offer') {
            // Store the viewer's socket ID temporarily for sending the answer later
            socket.to(viewerSocketId).emit('offer', { offer, streamId });
        } else {
            console.error('Invalid offer received from broadcaster:', offer);
        }
    });

    socket.on('request-offer', (streamId) => {
        // Notify the broadcaster (by their stream ID) to send an offer to this socket
        io.to(streamId).emit('send-offer', socket.id);
    });

    // Modified the answer event handler to include the streamId
    socket.on('answer', ({ answer, streamId }) => {
        socket.to(streamId).emit('answer', { answer, streamId });
    });

    socket.on('ice-candidate', (data) => {
        socket.broadcast.emit('ice-candidate', data);
    });

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
