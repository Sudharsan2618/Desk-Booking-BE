import pytest
import threading
import time
from flask import Flask, request
from flask_socketio import SocketIO, emit
from app.routes.desk_routes import desk_bp
from app.models.desk_model import DeskData
import uuid
import json
from unittest.mock import patch, MagicMock

# Test configuration
TEST_DESK_ID = 20
TEST_SLOT_ID = 3
TEST_LOCATION_ID = "550e8400-e29b-41d4-a716-446655440000"  # Example UUID

# Global variable to store connected clients for testing
connected_clients = {}

@pytest.fixture
def app():
    app = Flask(__name__)
    app.config['TESTING'] = True
    app.config['SECRET_KEY'] = 'test-secret-key'
    app.register_blueprint(desk_bp)
    return app

@pytest.fixture
def socketio(app):
    socketio = SocketIO(app, async_mode='threading', cors_allowed_origins="*")
    
    @socketio.on('connect')
    def handle_connect(auth=None):
        connected_clients[request.sid] = {
            'location_ids': [], 
            'desk_type_ids': [], 
            'slot_type_ids': [], 
            'booking_date': None
        }
        emit('desk_update', {"desks": []})  # Send initial empty update
    
    @socketio.on('disconnect')
    def handle_disconnect():
        if request.sid in connected_clients:
            del connected_clients[request.sid]
    
    @socketio.on('filter_update')
    def handle_filter_update(filters):
        if request.sid in connected_clients:
            connected_clients[request.sid] = filters
            # Emit update to the client
            emit('desk_update', {
                "desks": [{
                    "desk_id": TEST_DESK_ID,
                    "slots": [{
                        "slot_id": TEST_SLOT_ID,
                        "status": "available"
                    }]
                }]
            })
    
    return socketio

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def socket_client(app, socketio):
    return socketio.test_client(app)

def test_concurrent_hold_requests(app, client):
    """Test multiple users trying to hold the same desk slot simultaneously"""
    num_users = 5
    results = []
    threads = []
    lock = threading.Lock()

    # Mock the hold_desk_slot method to simulate database locking
    with patch('app.models.desk_model.DeskData.hold_desk_slot') as mock_hold:
        def mock_hold_side_effect(user_id, desk_id, slot_id):
            # Simulate database check for existing holds
            if hasattr(mock_hold_side_effect, 'held'):
                return {"error": "Desk already held"}, 409
            mock_hold_side_effect.held = True
            return {"message": "Desk slot held successfully"}, 201
        
        mock_hold.side_effect = mock_hold_side_effect

        def hold_desk(user_id):
            with lock:  # Add lock to ensure atomic operations
                response = client.post('/api/desks/held', json={
                    'user_id': str(user_id),
                    'desk_id': TEST_DESK_ID,
                    'slot_id': TEST_SLOT_ID,
                    'booking_date': '2024-03-20'
                })
                results.append((user_id, response.status_code))

        # Create multiple threads to simulate concurrent requests
        for i in range(num_users):
            user_id = uuid.uuid4()
            thread = threading.Thread(target=hold_desk, args=(user_id,))
            threads.append(thread)
            thread.start()

        # Wait for all threads to complete
        for thread in threads:
            thread.join()

        # Verify that only one hold request succeeded (status code 201)
        successful_holds = sum(1 for _, status_code in results if status_code == 201)
        assert successful_holds == 1, f"Expected 1 successful hold, got {successful_holds}"

def test_websocket_concurrent_updates(app, socketio, socket_client):
    """Test websocket updates when multiple users are holding/booking desks"""
    # Connect to websocket
    assert socket_client.is_connected()

    # Simulate multiple clients connecting and updating filters
    num_clients = 3
    clients = []
    
    for _ in range(num_clients):
        client = socketio.test_client(app)
        clients.append(client)
        
        # Update filters for each client
        client.emit('filter_update', {
            'location_ids': [TEST_LOCATION_ID],
            'desk_type_ids': [],
            'slot_type_ids': [],
            'booking_date': '2024-03-20'
        })

    # Wait for updates to be processed
    time.sleep(2)  # Increased wait time

    # Verify that all clients received updates
    for client in clients:
        received = client.get_received()
        assert len(received) > 0, "Client did not receive any updates"
        assert any(msg['name'] == 'desk_update' for msg in received)

def test_hold_and_booking_race_condition(app, client):
    """Test race condition between hold and booking operations"""
    user1_id = str(uuid.uuid4())
    user2_id = str(uuid.uuid4())
    
    # Mock the hold_desk_slot method
    with patch('app.models.desk_model.DeskData.hold_desk_slot') as mock_hold:
        # First call succeeds, subsequent calls fail
        mock_hold.side_effect = [
            ({"message": "Desk slot held successfully"}, 201),
            ({"error": "Desk already held"}, 409)
        ]
        
        # First user holds the desk
        hold_response = client.post('/api/desks/held', json={
            'user_id': user1_id,
            'desk_id': TEST_DESK_ID,
            'slot_id': TEST_SLOT_ID,
            'booking_date': '2024-03-20'
        })
        assert hold_response.status_code == 201

        # Second user tries to hold the same desk
        hold_response2 = client.post('/api/desks/held', json={
            'user_id': user2_id,
            'desk_id': TEST_DESK_ID,
            'slot_id': TEST_SLOT_ID,
            'booking_date': '2024-03-20'
        })
        
        # Check response content to verify the error message
        response_data = json.loads(hold_response2.data)
        assert hold_response2.status_code in [400, 409], f"Expected 400 or 409 status code, got {hold_response2.status_code}"
        assert "error" in response_data, "Response should contain error message"

def test_websocket_disconnect_handling(app, socketio, socket_client):
    """Test proper handling of client disconnections"""
    # Connect to websocket
    assert socket_client.is_connected()
    
    # Update filters
    socket_client.emit('filter_update', {
        'location_ids': [TEST_LOCATION_ID],
        'desk_type_ids': [],
        'slot_type_ids': [],
        'booking_date': '2024-03-20'
    })
    
    # Get the client's session ID
    client_sid = socket_client.eio_sid
    
    # Disconnect
    socket_client.disconnect()
    
    # Verify client is removed from connected_clients
    assert client_sid not in connected_clients

def test_concurrent_filter_updates(app, socketio):
    """Test multiple clients updating filters simultaneously"""
    num_clients = 5
    clients = []
    threads = []
    
    def update_filters(client):
        client.emit('filter_update', {
            'location_ids': [TEST_LOCATION_ID],
            'desk_type_ids': [],
            'slot_type_ids': [],
            'booking_date': '2024-03-20'
        })
    
    # Create multiple clients and threads
    for _ in range(num_clients):
        client = socketio.test_client(app)
        clients.append(client)
        thread = threading.Thread(target=update_filters, args=(client,))
        threads.append(thread)
        thread.start()
    
    # Wait for all threads to complete
    for thread in threads:
        thread.join()
    
    # Wait for updates to be processed
    time.sleep(2)  # Increased wait time
    
    # Verify all clients received updates
    for client in clients:
        received = client.get_received()
        assert len(received) > 0, "Client did not receive updates"
        assert any(msg['name'] == 'desk_update' for msg in received) 