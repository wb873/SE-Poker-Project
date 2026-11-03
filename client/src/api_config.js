// Where the client reaches the API server. One place for every page and the
// chat socket, so the address can't drift between files.
// 4000 matches the server default in server.js; 5000 is avoided because macOS
// AirPlay Receiver listens on it. Set VITE_API_URL in client/.env.local to override.
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
