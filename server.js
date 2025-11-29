var _type = async_load[? "type"];
var _id = async_load[? "id"];

if (_id != global.ws_socket) exit;

switch (_type) {
    case network_type_non_blocking_connect:
        if (async_load[? "succeeded"]) {
            global.ws_connected = true;
            show_debug_message("Connected to relay server!");
            
            with (obj_character_menu) {
                mp_status_message = "Connected to server";
            }
            
            if (global.ws_pending_action == "create") {
                ws_create_lobby();
            } else if (global.ws_pending_action == "join") {
                ws_join_lobby(global.ws_pending_code);
            }
            global.ws_pending_action = "";
            global.ws_pending_code = "";
        } else {
            show_debug_message("Failed to connect to relay server");
            with (obj_character_menu) {
                mp_state = "idle";
                mp_status_message = "Failed to connect!";
            }
        }
        break;
        
    case network_type_data:
        var _buffer = async_load[? "buffer"];
        buffer_seek(_buffer, buffer_seek_start, 0);
        var _json_str = buffer_read(_buffer, buffer_text);
        
        show_debug_message("Received: " + _json_str);
        
        try {
            var _msg = json_parse(_json_str);
            
            switch (_msg.type) {
                case "lobby_created":
                    global.ws_lobby_code = _msg.code;
                    global.ws_is_host = true;
                    
                    with (obj_character_menu) {
                        mp_state = "hosting";
                        mp_status_message = "Lobby created!";
                        lobby_code = _msg.code;
                    }
                    show_debug_message("Lobby created: " + _msg.code);
                    break;
                    
                case "join_success":
                    global.ws_is_connected = true;
                    global.ws_is_host = false;
                    
                    if (instance_exists(obj_hero)) {
                        global.ws_other_player = instance_create_layer(obj_hero.x + 50, obj_hero.y, "Instances", obj_player_other);
                        global.ws_other_player.player_name = _msg.hostName;
                    }
                    
                    with (obj_character_menu) {
                        mp_state = "connected";
                        mp_status_message = "Connected!";
                        connected_player_name = _msg.hostName;
                    }
                    show_debug_message("Joined lobby!");
                    break;
                    
                case "join_failed":
                    with (obj_character_menu) {
                        mp_state = "idle";
                        mp_status_message = "Failed: " + _msg.reason;
                    }
                    show_debug_message("Join failed: " + _msg.reason);
                    break;
                    
                case "player_joined":
                    global.ws_is_connected = true;
                    
                    if (instance_exists(obj_hero)) {
                        global.ws_other_player = instance_create_layer(obj_hero.x + 50, obj_hero.y, "Instances", obj_player_other);
                        global.ws_other_player.player_name = _msg.playerName;
                    }
                    
                    with (obj_character_menu) {
                        mp_state = "connected";
                        mp_status_message = "Player joined!";
                        connected_player_name = _msg.playerName;
                    }
                    show_debug_message("Player joined: " + _msg.playerName);
                    break;
                    
                case "player_left":
                    global.ws_is_connected = false;
                    
                    if (instance_exists(global.ws_other_player)) {
                        instance_destroy(global.ws_other_player);
                        global.ws_other_player = noone;
                    }
                    
                    with (obj_character_menu) {
                        if (global.ws_is_host) {
                            mp_state = "hosting";
                            mp_status_message = "Player left";
                        } else {
                            mp_state = "idle";
                            mp_status_message = "Host left";
                            lobby_code = "";
                        }
                        connected_player_name = "";
                    }
                    show_debug_message("Player left");
                    break;
                    
                case "game_data":
                    var _data = _msg.data;
                    
                    if (_data.t == "pos") {
                        if (instance_exists(global.ws_other_player)) {
                            global.ws_other_player.target_x = _data.x;
                            global.ws_other_player.target_y = _data.y;
                            global.ws_other_player.aim_angle = _data.a;
                            global.ws_other_player.sprite_index = _data.s;
                            global.ws_other_player.image_xscale = _data.xs;
                        }
                    }
                    else if (_data.t == "bullet") {
                        var _bullet = instance_create_layer(_data.x, _data.y, "Instances", obj_hero_bullet);
                        _bullet.direction = _data.dir;
                        _bullet.speed = 28;
                        _bullet.image_angle = _data.dir;
                        _bullet.image_xscale = 0.375;
                        _bullet.image_yscale = 0.375;
                        _bullet.from_network = true;
                    }
                    break;
            }
        } catch (e) {
            show_debug_message("Parse error: " + string(e));
        }
        break;
        
    case network_type_disconnect:
        global.ws_connected = false;
        global.ws_is_connected = false;
        global.ws_socket = -1;
        
        if (instance_exists(global.ws_other_player)) {
            instance_destroy(global.ws_other_player);
            global.ws_other_player = noone;
        }
        
        with (obj_character_menu) {
            mp_state = "idle";
            mp_status_message = "Disconnected";
            connected_player_name = "";
            lobby_code = "";
        }
        show_debug_message("Disconnected from server");
        break;
}