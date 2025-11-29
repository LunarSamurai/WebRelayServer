const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Game Relay Server Running\n');
});

const wss = new WebSocket.Server({ server });

const lobbies = new Map();

wss.on('connection', (ws) => {
    console.log('Client connected');
    
    ws.lobbyCode = null;
    ws.playerName = '';
    ws.isHost = false;
    
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            console.log('Received:', msg.type);
            
            switch (msg.type) {
                case 'create_lobby':
                    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
                    
                    lobbies.set(code, {
                        host: ws,
                        guest: null,
                        hostName: msg.name || 'Host'
                    });
                    
                    ws.lobbyCode = code;
                    ws.playerName = msg.name || 'Host';
                    ws.isHost = true;
                    
                    ws.send(JSON.stringify({
                        type: 'lobby_created',
                        code: code
                    }));
                    
                    console.log(`Lobby created: ${code}`);
                    break;
                    
                case 'join_lobby':
                    const lobby = lobbies.get(msg.code);
                    
                    if (!lobby) {
                        ws.send(JSON.stringify({
                            type: 'join_failed',
                            reason: 'Lobby not found'
                        }));
                        return;
                    }
                    
                    if (lobby.guest) {
                        ws.send(JSON.stringify({
                            type: 'join_failed',
                            reason: 'Lobby is full'
                        }));
                        return;
                    }
                    
                    lobby.guest = ws;
                    ws.lobbyCode = msg.code;
                    ws.playerName = msg.name || 'Guest';
                    ws.isHost = false;
                    
                    ws.send(JSON.stringify({
                        type: 'join_success',
                        hostName: lobby.hostName
                    }));
                    
                    lobby.host.send(JSON.stringify({
                        type: 'player_joined',
                        playerName: ws.playerName
                    }));
                    
                    console.log(`Player joined lobby: ${msg.code}`);
                    break;
                    
                case 'game_data':
                    const gameLobby = lobbies.get(ws.lobbyCode);
                    if (gameLobby) {
                        const target = ws.isHost ? gameLobby.guest : gameLobby.host;
                        if (target && target.readyState === WebSocket.OPEN) {
                            target.send(JSON.stringify({
                                type: 'game_data',
                                data: msg.data
                            }));
                        }
                    }
                    break;
                    
                case 'leave_lobby':
                    leaveLobby(ws);
                    break;
            }
        } catch (e) {
            console.error('Error:', e);
        }
    });
    
    ws.on('close', () => {
        console.log('Client disconnected');
        leaveLobby(ws);
    });
    
    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
    });
});

function leaveLobby(ws) {
    if (ws.lobbyCode) {
        const lobby = lobbies.get(ws.lobbyCode);
        if (lobby) {
            const other = ws.isHost ? lobby.guest : lobby.host;
            if (other && other.readyState === WebSocket.OPEN) {
                other.send(JSON.stringify({ type: 'player_left' }));
                other.lobbyCode = null;
            }
            lobbies.delete(ws.lobbyCode);
            console.log(`Lobby closed: ${ws.lobbyCode}`);
        }
        ws.lobbyCode = null;
    }
}

server.listen(PORT, '0.0.0.0', () => {
    console.log(`WebSocket Relay server running on 0.0.0.0:${PORT}`);
});