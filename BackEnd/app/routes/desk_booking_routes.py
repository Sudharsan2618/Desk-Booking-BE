from flask import Blueprint, jsonify, request
from app.models.desk_booking_model import DeskBooking

desk_booking_bp = Blueprint('desk_booking', __name__)

@desk_booking_bp.route('/api/desks/confirm', methods=['POST'])
def book_from_hold():
    """
    Book a desk that is currently on hold
    """
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
        
    if 'booking_id' not in data:
        return jsonify({"error": "Missing booking_id"}), 400
    
    result, status_code = DeskBooking.book_from_hold(
        booking_id=data['booking_id']
    )
    return jsonify(result), status_code 