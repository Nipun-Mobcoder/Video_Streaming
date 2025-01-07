const client = require('./client');
const io = require('socket.io')(4040, {
    cors: {
        origin: "http://localhost:5173",
    }
});

const connectedClients = {};

async function init() {
    client.subscribe("video-stream", (err, count) => {
        if (err) {
            console.error("Redis subscription error:", err.message);
            return;
        }
        console.log(`Subscribed to ${count} channels.`);
    });

    client.on("message", (channel, message) => {
        const video = JSON.parse(message);

        io.emit("video_stream", video.loading);

        if (video.loading >= 100) {
            console.log(`Processing complete for video: ${video.id}`);
        }

        console.log("Redis message received:", video);
    });

    io.on("connection", (socket) => {
        console.log(`Client connected: ${socket.id}`);

        connectedClients[socket.id] = socket;

        socket.on("disconnect", () => {
            console.log(`Client disconnected: ${socket.id}`);
            delete connectedClients[socket.id];
        });
    });
}

init();