// reproduce-silo.js
import WebSocket from "ws";
import { createToken } from "./auth.js";

const PORT1 = 8080;
const PORT2 = 8081;
const ROOM = "shared-room";

const token1 = createToken("User_A");
const token2 = createToken("User_B");

// Client A connects to Node 1
const wsA = new WebSocket(`ws://localhost:${PORT1}?token=${token1}`);

// Client B connects to Node 2
const wsB = new WebSocket(`ws://localhost:${PORT2}?token=${token2}`);

wsA.on("open", () => {
    console.log("Client A connected to 8080");
    wsA.send(JSON.stringify({ type: "join", room: ROOM }));
});

wsB.on("open", () => {
    console.log("Client B connected to 8081");
    wsB.send(JSON.stringify({ type: "join", room: ROOM }));
});

wsB.on("message", (data) => {
    console.log(`[CLIENT B] Received: ${data}`);
});

// After 2 seconds, Client A sends a message
setTimeout(() => {
    console.log("Client A sending message to room...");
    wsA.send(JSON.stringify({ 
        type: "chat", 
        room: ROOM, 
        text: "Hello from 8080! Can you hear me?" 
    }));
}, 2000);

// After 5 seconds, exit
setTimeout(() => {
    console.log("Test finished. If Client B didn't see the message, the silo is confirmed.");
    process.exit(0);
}, 5000);
