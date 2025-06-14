from flask import Blueprint, jsonify, request
from flask_socketio import SocketIO, emit
from app.models.desk_model import DeskData
import threading
import time

desk_bp = Blueprint('desk', __name__)
socketio = SocketIO()

# Store connected clients and their active filters
connected_clients = {}

def background_desk_updates():
    """
    Background task to send desk updates to connected clients
    """
    while True:
        if connected_clients:
            for client_id, filters in list(connected_clients.items()): # Iterate over a copy to avoid modification issues
                try:
                    desk_data, status_code = DeskData.get_desk_availability(
                        location_ids=filters.get('location_ids'), 
                        desk_type_ids=filters.get('desk_type_ids'),
                        slot_type_ids=filters.get('slot_type_ids'),
                        booking_date=filters.get('booking_date')
                    )
                    print(f"[Background Task] Fetched desk data for {client_id}: {desk_data}, Status: {status_code}")
                    if status_code == 200:
                        socketio.emit('desk_update', desk_data, room=client_id)
                        print(f"[Background Task] Emitted desk_update event to {client_id}.")
                except Exception as e:
                    print(f"Error in background task for client {client_id}: {str(e)}")
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
    # Initialize filters for new client, will be updated by 'filter_update' event
    connected_clients[client_id] = {'location_ids': [], 'desk_type_ids': [], 'slot_type_ids': [], 'booking_date': None}
    print(f"Client connected: {client_id}")
    
    # Send initial desk data (without filters initially, filters will be applied via filter_update event)
    desk_data, status_code = DeskData.get_desk_availability()
    print(f"[Initial Connect] Fetched desk data for {client_id}: {desk_data}, Status: {status_code}")
    if status_code == 200:
        emit('desk_update', desk_data, room=client_id)
        print(f"[Initial Connect] Emitted desk_update event to {client_id}.")

@socketio.on('disconnect')
def handle_disconnect():
    """
    Handle client disconnection
    """
    client_id = request.sid
    if client_id in connected_clients:
        del connected_clients[client_id]
        print(f"Client disconnected: {client_id}")

@socketio.on('filter_update')
def handle_filter_update(filters):
    """
    Handle filter updates from client
    """
    client_id = request.sid
    if client_id in connected_clients:
        connected_clients[client_id] = filters
        print(f"Filters updated for {client_id}: {filters}")
        # Immediately send updated data based on new filters
        desk_data, status_code = DeskData.get_desk_availability(
            location_ids=filters.get('location_ids'), 
            desk_type_ids=filters.get('desk_type_ids'),
            slot_type_ids=filters.get('slot_type_ids'),
            booking_date=filters.get('booking_date')
        )
        if status_code == 200:
            emit('desk_update', desk_data, room=client_id)
            print(f"Emitted filtered desk_update to {client_id}.")

@desk_bp.route('/api/desks', methods=['GET'])
def get_desks():
    """
    Regular HTTP endpoint for getting desk data
    """
    # This endpoint can also accept query parameters for filtering if needed for REST calls
    location_ids = request.args.getlist('location_ids')
    desk_type_ids = request.args.getlist('desk_type_ids')
    slot_type_ids = request.args.getlist('slot_type_ids')
    booking_date = request.args.get('booking_date')

    # Convert comma-separated strings to lists if necessary
    if location_ids and len(location_ids) == 1 and ',' in location_ids[0]:
        location_ids = location_ids[0].split(',')
    if desk_type_ids and len(desk_type_ids) == 1 and ',' in desk_type_ids[0]:
        desk_type_ids = desk_type_ids[0].split(',')
    if slot_type_ids and len(slot_type_ids) == 1 and ',' in slot_type_ids[0]:
        slot_type_ids = slot_type_ids[0].split(',')

    # Ensure lists are empty if no valid parameters are provided
    location_ids = location_ids if location_ids else None
    desk_type_ids = desk_type_ids if desk_type_ids else None
    slot_type_ids = slot_type_ids if slot_type_ids else None

    desk_data, status_code = DeskData.get_desk_availability(location_ids=location_ids, desk_type_ids=desk_type_ids, slot_type_ids=slot_type_ids, booking_date=booking_date)
    return jsonify(desk_data), status_code 