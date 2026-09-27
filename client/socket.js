import { io } from "socket.io-client";

// Web builds use same-origin sockets. The Android package injects the
// Render URL at build time with VITE_SERVER_URL.
export const socket = io(import.meta.env.VITE_SERVER_URL || undefined, {
  autoConnect: true,
  transports: ["websocket", "polling"],
});
