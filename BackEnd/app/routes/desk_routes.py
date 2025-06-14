from flask import Blueprint, jsonify, request
from flask_socketio import SocketIO, emit
from app.models.desk_model import DeskData
import threading
import time

desk_bp = Blueprint('desk', __name__)
socketio = SocketIO()

# Store connected clients
connected_clients = set()

def background_desk_updates():
    """
    Background task to send desk updates to connected clients
    """
    while True:
        if connected_clients:
            try:
                desk_data, status_code = DeskData.get_desk_availability()
                print(f"[Background Task] Fetched desk data: {desk_data}, Status: {status_code}")
                if status_code == 200:
                    socketio.emit('desk_update', desk_data)
                    print("[Background Task] Emitted desk_update event.")
            except Exception as e:
                print(f"Error in background task: {str(e)}")
        time.sleep(5)  # Update every 5 seconds

# Start background task
update_thread = threading.Thread(target=background_desk_updates, daemon=True)
update_thread.start()

@socketio.on('connect')
def handle_connect():
    """
    Handle client connection
    """
    client_id = request.sid
    connected_clients.add(client_id)
    print(f"Client connected: {client_id}")
    
    # Send initial desk data
    desk_data, status_code = DeskData.get_desk_availability()
    print(f"[Initial Connect] Fetched desk data: {desk_data}, Status: {status_code}")
    if status_code == 200:
        emit('desk_update', desk_data)
        print("[Initial Connect] Emitted desk_update event.")

@socketio.on('disconnect')
def handle_disconnect():
    """
    Handle client disconnection
    """
    client_id = request.sid
    if client_id in connected_clients:
        connected_clients.remove(client_id)
        print(f"Client disconnected: {client_id}")

@desk_bp.route('/api/desks', methods=['GET'])
def get_desks():
    """
    Regular HTTP endpoint for getting desk data
    """
    desk_data, status_code = DeskData.get_desk_availability()
    return jsonify(desk_data), status_code 