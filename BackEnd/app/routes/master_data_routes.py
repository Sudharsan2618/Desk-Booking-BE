from flask import Blueprint, jsonify
from app.models.master_data_model import MasterData

master_data_bp = Blueprint('master_data', __name__)

@master_data_bp.route('/api/master-data', methods=['GET'])
def get_all_master_data():
    """
    Get all master data (locations, slots, desk types) in a single call
    """
    result, status_code = MasterData.get_all_master_data()
    return jsonify(result), status_code

@master_data_bp.route('/api/master-data/locations', methods=['GET'])
def get_locations():
    """
    Get all locations
    """
    locations, status_code = MasterData.get_locations()
    return jsonify({"locations": locations}), status_code

@master_data_bp.route('/api/master-data/slots', methods=['GET'])
def get_slots():
    """
    Get all slots
    """
    slots, status_code = MasterData.get_slots()
    return jsonify({"slots": slots}), status_code

@master_data_bp.route('/api/master-data/desk-types', methods=['GET'])
def get_desk_types():
    """
    Get all desk types
    """
    desk_types, status_code = MasterData.get_desk_types()
    return jsonify({"desk_types": desk_types}), status_code 