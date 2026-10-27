# SE-Poker-Project
Create an online web app Caribbean Stud Poker game.

User Stories: https://docs.google.com/spreadsheets/d/1ZK9nbL_P-ona3qYUpoTqp4VovmGW50wVZ89ChktWSHo/edit?usp=sharing

Latex Document: https://www.overleaf.com/read/vhchpysbnftn#bb2fb6

## Running locally
`npm run dev` starts the API on http://localhost:4000 and the client on http://localhost:5173.

- The API port is 4000, not 5000, because macOS AirPlay Receiver uses 5000.
- If your `.env` has `PORT=5000`, delete that line so the server and client agree.
- To point the client at a different API address, put `VITE_API_URL=http://host:port` in `client/.env.local` (ignored by git).
