from flask import Blueprint, jsonify
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
                if status_code == 200:
                    socketio.emit('desk_update', desk_data)
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
    connected_clients.add(request.sid)
    # Send initial desk data
    desk_data, status_code = DeskData.get_desk_availability()
    if status_code == 200:
        emit('desk_update', desk_data)

@socketio.on('disconnect')
def handle_disconnect():
    """
    Handle client disconnection
    """
    connected_clients.remove(request.sid)

@desk_bp.route('/api/desks', methods=['GET'])
def get_desks():
    """
    Regular HTTP endpoint for getting desk data
    """
    desk_data, status_code = DeskData.get_desk_availability()
    return jsonify(desk_data), status_code 