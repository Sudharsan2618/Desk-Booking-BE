from flask import Blueprint, jsonify, request
from flask_socketio import SocketIO, emit
from app.models.desk_model import DeskData
import threading
import time
from datetime import date

desk_bp = Blueprint('desk', __name__)
socketio = SocketIO()

# Store connected clients and current display date
connected_clients = set()
current_display_date = date.today().isoformat()  # Initialize with current date as YYYY-MM-DD

def background_desk_updates():
    """
    Background task to send desk updates to connected clients based on current_display_date
    """
    global current_display_date
    while True:
        if connected_clients:
            try:
                desk_data, status_code = DeskData.get_desk_availability(current_display_date)
                print(f"[Background Task] Fetched desk data for {current_display_date}: {desk_data}, Status: {status_code}")
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
    
    # Send initial desk data for the current_display_date
    desk_data, status_code = DeskData.get_desk_availability(current_display_date)
    print(f"[Initial Connect] Fetched desk data for {current_display_date}: {desk_data}, Status: {status_code}")
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

@socketio.on('request_desk_update_by_date')
def handle_request_desk_update_by_date(data):
    """
    Handle request from client to update desk data for a specific date.
    """
    global current_display_date
    requested_date = data.get('date')
    if requested_date:
        try:
            # Validate date format (YYYY-MM-DD)
            date.fromisoformat(requested_date)
            current_display_date = requested_date
            print(f"Client requested desk data for date: {current_display_date}")
            
            # Immediately send updated data for the new date
            desk_data, status_code = DeskData.get_desk_availability(current_display_date)
            if status_code == 200:
                emit('desk_update', desk_data)
                print("Emitted desk_update event for new date.")
            else:
                emit('error', {'message': f'Failed to fetch data for {requested_date}: {desk_data.get("error")}'})
        except ValueError:
            emit('error', {'message': f'Invalid date format. Please use YYYY-MM-DD.'})
    else:
        emit('error', {'message': 'Date not provided in request.'})

@desk_bp.route('/api/desks', methods=['GET'])
def get_desks():
    """
    Regular HTTP endpoint for getting desk data (current date only)
    """
    desk_data, status_code = DeskData.get_desk_availability(date.today().isoformat())
    return jsonify(desk_data), status_code 