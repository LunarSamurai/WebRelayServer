const dgram = require('dgram');
const server = dgram.createSocket('udp4');

const PORT = 3000;
const lobbies = new Map();

server.on('message', (msg, rinfo) => {
    try {
        const data = JSON.parse(msg.toString());
        const clientAddr = `${rinfo.address}:${rinfo.port}`;
        
        console.log(`From ${clientAddr}:`, data);
        
        switch (data.type) {
            case 'create':
                // Generate lobby code
                const code = Math.random().toString(36).substring(2, 8).toUpperCase();
                
                lobbies.set(code, {
                    host: { ip: rinfo.address, port: rinfo.port, name: data.name },
                    guest: null
                });
                
                // Send code back to host
                const response = JSON.stringify({ type: 'created', code: code });
                server.send(response, rinfo.port, rinfo.address);
                
                console.log(`Lobby created: ${code}`);
                break;
                
            case 'join':
                const lobby = lobbies.get(data.code);
                
                if (!lobby) {
                    const err = JSON.stringify({ type: 'error', msg: 'Lobby not found' });
                    server.send(err, rinfo.port, rinfo.address);
                    return;
                }
                
                if (lobby.guest) {
                    const err = JSON.stringify({ type: 'error', msg: 'Lobby full' });
                    server.send(err, rinfo.port, rinfo.address);
                    return;
                }
                
                // Store guest info
                lobby.guest = { ip: rinfo.address, port: rinfo.port, name: data.name };
                
                // Send peer info to both players
                // Tell guest about host
                const toGuest = JSON.stringify({
                    type: 'peer',
                    ip: lobby.host.ip,
                    port: lobby.host.port,
                    name: lobby.host.name
                });
                server.send(toGuest, rinfo.port, rinfo.address);
                
                // Tell host about guest
                const toHost = JSON.stringify({
                    type: 'peer',
                    ip: lobby.guest.ip,
                    port: lobby.guest.port,
                    name: lobby.guest.name
                });
                server.send(toHost, lobby.host.port, lobby.host.ip);
                
                console.log(`Peer exchange for lobby: ${data.code}`);
                
                // Clean up lobby
                lobbies.delete(data.code);
                break;
                
            case 'ping':
                // Keep-alive
                const pong = JSON.stringify({ type: 'pong' });
                server.send(pong, rinfo.port, rinfo.address);
                break;
        }
    } catch (e) {
        console.error('Error:', e);
    }
});

server.on('listening', () => {
    console.log(`UDP Matchmaking server running on port ${PORT}`);
});

server.bind(PORT);