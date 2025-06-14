from flask import Blueprint, jsonify, request
from app.models.desk_hold_model import DeskHold

desk_hold_bp = Blueprint('desk_hold', __name__)

@desk_hold_bp.route('/api/desks/hold', methods=['POST'])
def put_desk_on_hold():
    """
    Put a desk on hold for a specific user and slot
    """
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
        
    required_fields = ['user_id', 'desk_id', 'slot_id']
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Missing required fields"}), 400
    
    result, status_code = DeskHold.put_desk_on_hold(
        user_id=data['user_id'],
        desk_id=data['desk_id'],
        slot_id=data['slot_id']
    )
    return jsonify(result), status_code

@desk_hold_bp.route('/api/hold/status/<int:desk_id>/<int:slot_id>', methods=['GET'])
def get_desk_hold_status(desk_id, slot_id):
    """
    Check if a desk is on hold for a specific slot
    """
    result, status_code = DeskHold.get_desk_hold_status(desk_id, slot_id)
    return jsonify(result), status_code 