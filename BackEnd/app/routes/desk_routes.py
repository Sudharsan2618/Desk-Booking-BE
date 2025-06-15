from flask import Blueprint, jsonify, request
from flask_socketio import SocketIO, emit
from app.models.desk_model import DeskData
from app.config.database import DB_CONFIG
import threading
import time
import gevent
from psycopg2 import pool

desk_bp = Blueprint('desk', __name__)

# Configure SocketIO with optimized settings
socketio = SocketIO(
    cors_allowed_origins="*",
    async_mode='threading',
    logger=False,
    engineio_logger=False
)

# Create connection pool
connection_pool = pool.ThreadedConnectionPool(
    minconn=1,
    maxconn=10,
    **DB_CONFIG
)

# Store connected clients and their active filters
connected_clients = {}
client_lock = threading.Lock()

def get_db_connection():
    """Get a connection from the pool"""
    return connection_pool.getconn()

def return_db_connection(conn):
    """Return a connection to the pool"""
    connection_pool.putconn(conn)

def background_desk_updates():
    """
    Optimized background task to send desk updates to connected clients
    """
    while True:
        if connected_clients:
            # Batch process clients to reduce database load
            with client_lock:
                clients_to_update = list(connected_clients.items())
            
            for client_id, filters in clients_to_update:
                try:
                    desk_data, status_code = DeskData.get_desk_availability(
                        location_ids=filters.get('location_ids'), 
                        desk_type_ids=filters.get('desk_type_ids'),
                        slot_type_ids=filters.get('slot_type_ids'),
                        booking_date=filters.get('booking_date')
                    )
                    if status_code == 200:
                        socketio.emit('desk_update', desk_data, room=client_id)
                except Exception as e:
                    print(f"Error in background task for client {client_id}: {str(e)}")
                    # Remove problematic client
                    with client_lock:
                        if client_id in connected_clients:
                            del connected_clients[client_id]
        
        # Increased sleep time to reduce server load
        time.sleep(10)

# Start background task in a separate thread
def start_background_task():
    thread = threading.Thread(target=background_desk_updates)
    thread.daemon = True
    thread.start()

# Start the background task when the module is loaded
start_background_task()

@socketio.on('connect')
def handle_connect():
    """
    Handle client connection with optimized initial data load
    """
    client_id = request.sid
    with client_lock:
        connected_clients[client_id] = {
            'location_ids': [], 
            'desk_type_ids': [], 
            'slot_type_ids': [], 
            'booking_date': None
        }
    
    # Send initial desk data without filters
    try:
        desk_data, status_code = DeskData.get_desk_availability()
        if status_code == 200:
            emit('desk_update', desk_data, room=client_id)
    except Exception as e:
        print(f"Error sending initial data to client {client_id}: {str(e)}")

@socketio.on('disconnect')
def handle_disconnect():
    """
    Handle client disconnection with cleanup
    """
    client_id = request.sid
    with client_lock:
        if client_id in connected_clients:
            del connected_clients[client_id]

@socketio.on('filter_update')
def handle_filter_update(filters):
    """
    Handle filter updates with optimized data fetching
    """
    client_id = request.sid
    with client_lock:
        if client_id in connected_clients:
            connected_clients[client_id] = filters
    
    try:
        desk_data, status_code = DeskData.get_desk_availability(
            location_ids=filters.get('location_ids'), 
            desk_type_ids=filters.get('desk_type_ids'),
            slot_type_ids=filters.get('slot_type_ids'),
            booking_date=filters.get('booking_date')
        )
        if status_code == 200:
            emit('desk_update', desk_data, room=client_id)
    except Exception as e:
        print(f"Error updating filters for client {client_id}: {str(e)}")

@desk_bp.route('/api/desks', methods=['GET'])
def get_desks():
    """
    Optimized HTTP endpoint for getting desk data
    """
    try:
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

        desk_data, status_code = DeskData.get_desk_availability(
            location_ids=location_ids if location_ids else None,
            desk_type_ids=desk_type_ids if desk_type_ids else None,
            slot_type_ids=slot_type_ids if slot_type_ids else None,
            booking_date=booking_date
        )
        return jsonify(desk_data), status_code
    except Exception as e:
        print(f"Error in get_desks endpoint: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

@desk_bp.route('/api/desks/held', methods=['POST'])
def hold_desk():
    """
    Optimized API endpoint to put a desk slot on hold
    """
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        desk_id = data.get('desk_id')
        slot_id = data.get('slot_id')
        booking_date = data.get('booking_date')

        if not all([user_id, desk_id, slot_id, booking_date]):
            return jsonify({"error": "Missing required fields"}), 400
        
        try:
            desk_id = int(desk_id)
            slot_id = int(slot_id)
        except ValueError:
            return jsonify({"error": "desk_id and slot_id must be integers"}), 400

        response, status_code = DeskData.hold_desk_slot(user_id, desk_id, slot_id)
        return jsonify(response), status_code

    except Exception as e:
        print(f"Error in hold_desk endpoint: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

@desk_bp.route('/api/desks/user-bookings', methods=['GET'])
def get_user_bookings():
    """
    Optimized endpoint to get user bookings
    """
    try:
        user_id = request.args.get('user_id')
        if not user_id:
            return jsonify({"error": "User ID is required"}), 400
            
        result, status_code = DeskData.get_user_bookings(user_id)
        return jsonify(result), status_code
    except Exception as e:
        print(f"Error in get_user_bookings endpoint: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500 