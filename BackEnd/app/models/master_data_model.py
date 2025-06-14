from typing import Dict, List, Tuple
from app.utils.db_utils import get_db_connection
from app.config.database import DB_CONFIG

class MasterData:
    @staticmethod
    def get_locations() -> Tuple[List[Dict], int]:
        """
        Get all locations
        Returns: Tuple of (locations_list, status_code)
        """
        conn = get_db_connection(DB_CONFIG)
        if not conn:
            return [], 500

        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT l.id as location_id, l.name as location_name 
                FROM sena.locations as l
            """)
            
            locations = cursor.fetchall()
            return [
                {
                    "location_id": loc[0],
                    "location_name": loc[1]
                } for loc in locations
            ], 200

        except Exception as e:
            return [], 500
        finally:
            conn.close()

    @staticmethod
    def get_slots() -> Tuple[List[Dict], int]:
        """
        Get all slots
        Returns: Tuple of (slots_list, status_code)
        """
        conn = get_db_connection(DB_CONFIG)
        if not conn:
            return [], 500

        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT s.id as slot_id, s.slot_type, s.start_time, s.end_time, s.time_zone
                FROM sena.slot_master as s
            """)
            
            slots = cursor.fetchall()
            return [
                {
                    "slot_id": slot[0],
                    "slot_type": slot[1],
                    "start_time": slot[2].strftime('%H:%M:%S') if slot[2] else None,
                    "end_time": slot[3].strftime('%H:%M:%S') if slot[3] else None,
                    "time_zone": slot[4]
                } for slot in slots
            ], 200

        except Exception as e:
            return [], 500
        finally:
            conn.close()

    @staticmethod
    def get_desk_types() -> Tuple[List[Dict], int]:
        """
        Get all desk types
        Returns: Tuple of (desk_types_list, status_code)
        """
        conn = get_db_connection(DB_CONFIG)
        if not conn:
            return [], 500

        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT d.id as desk_type_id, d.type, d.capacity
                FROM sena.desk_type_master as d
            """)
            
            desk_types = cursor.fetchall()
            return [
                {
                    "desk_type_id": desk[0],
                    "type": desk[1],
                    "capacity": desk[2]
                } for desk in desk_types
            ], 200

        except Exception as e:
            return [], 500
        finally:
            conn.close()

    @staticmethod
    def get_all_master_data() -> Tuple[Dict, int]:
        """
        Get all master data (locations, slots, desk types)
        Returns: Tuple of (master_data_dict, status_code)
        """
        locations, loc_status = MasterData.get_locations()
        slots, slot_status = MasterData.get_slots()
        desk_types, desk_status = MasterData.get_desk_types()

        if any(status != 200 for status in [loc_status, slot_status, desk_status]):
            return {"error": "Failed to fetch master data"}, 500

        return {
            "locations": locations,
            "slots": slots,
            "desk_types": desk_types
        }, 200 