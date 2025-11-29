const dgram = require('dgram');
const http = require('http');

const PORT = process.env.PORT || 3000;
const UDP_PORT = 5000;

// === HTTP SERVER (for Fly.io health checks) ===
const httpServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Game Matchmaker Server Running\n');
});

httpServer.listen(PORT, () => {
    console.log(`HTTP health check server running on port ${PORT}`);
});

// === UDP MATCHMAKING SERVER ===
const udpServer = dgram.createSocket('udp4');

const lobbies = new Map();

udpServer.on('message', (msg, rinfo) => {
    try {
        const data = JSON.parse(msg.toString());
        const clientAddr = `${rinfo.address}:${rinfo.port}`;
        
        console.log(`From ${clientAddr}:`, data);
        
        switch (data.type) {
            case 'create':
                const code = Math.random().toString(36).substring(2, 8).toUpperCase();
                
                lobbies.set(code, {
                    host: { ip: rinfo.address, port: rinfo.port, name: data.name },
                    guest: null,
                    created: Date.now()
                });
                
                const response = JSON.stringify({ type: 'created', code: code });
                udpServer.send(response, rinfo.port, rinfo.address);
                
                console.log(`Lobby created: ${code}`);
                break;
                
            case 'join':
                const lobby = lobbies.get(data.code);
                
                if (!lobby) {
                    const err = JSON.stringify({ type: 'error', msg: 'Lobby not found' });
                    udpServer.send(err, rinfo.port, rinfo.address);
                    return;
                }
                
                if (lobby.guest) {
                    const err = JSON.stringify({ type: 'error', msg: 'Lobby full' });
                    udpServer.send(err, rinfo.port, rinfo.address);
                    return;
                }
                
                lobby.guest = { ip: rinfo.address, port: rinfo.port, name: data.name };
                
                // Tell guest about host
                const toGuest = JSON.stringify({
                    type: 'peer',
                    ip: lobby.host.ip,
                    port: lobby.host.port,
                    name: lobby.host.name
                });
                udpServer.send(toGuest, rinfo.port, rinfo.address);
                
                // Tell host about guest
                const toHost = JSON.stringify({
                    type: 'peer',
                    ip: lobby.guest.ip,
                    port: lobby.guest.port,
                    name: lobby.guest.name
                });
                udpServer.send(toHost, lobby.host.port, lobby.host.ip);
                
                console.log(`Peer exchange for lobby: ${data.code}`);
                
                // Clean up lobby
                lobbies.delete(data.code);
                break;
                
            case 'ping':
                const pong = JSON.stringify({ type: 'pong' });
                udpServer.send(pong, rinfo.port, rinfo.address);
                break;
        }
    } catch (e) {
        console.error('Error:', e);
    }
});

udpServer.on('listening', () => {
    console.log(`UDP Matchmaking server running on port ${UDP_PORT}`);
});

// Clean up old lobbies every minute
setInterval(() => {
    const now = Date.now();
    for (const [code, lobby] of lobbies) {
        if (now - lobby.created > 300000) { // 5 minutes
            lobbies.delete(code);
            console.log(`Cleaned up old lobby: ${code}`);
        }
    }
}, 60000);

udpServer.bind(UDP_PORT);