from typing import Dict, List, Tuple
from app.utils.db_utils import get_db_connection
from app.config.database import DB_CONFIG
import json

class DeskData:
    @staticmethod
    def get_desk_availability() -> Tuple[Dict, int]:
        """
        Get desk availability data with slots and pricing
        Returns: Tuple of (desk_data_dict, status_code)
        """
        conn = get_db_connection(DB_CONFIG)
        if not conn:
            return {"error": "Database connection failed"}, 500

        try:
            cursor = conn.cursor()
            cursor.execute("""
                WITH desk_details AS (
                    SELECT 
                        d.id AS desk_id,
                        d.name AS desk_name,
                        d.floor_number,
                        d.capacity,
                        d.description,
                        d.status AS desk_status,
                        b.name AS building_name,
                        b.address AS building_address,
                        b.amenities,
                        b.operating_hours,
                        l.name AS city,
                        d.desk_type_id
                    FROM sena.desks AS d
                    LEFT JOIN sena.buildings AS b ON b.id = d.building_id
                    LEFT JOIN sena.locations AS l ON l.id = d.location_id
                ),
                slot_status AS (
                    SELECT 
                        bt.desk_id,
                        bt.slot_id,
                        COALESCE(MAX(CASE 
                            WHEN bt.status = 'booked' THEN 'booked'
                            WHEN bt.status = 'held' THEN 'held'
                            ELSE NULL 
                        END), 'available') AS slot_status
                    FROM sena.booking_transactions AS bt
                    GROUP BY bt.desk_id, bt.slot_id
                ),
                desk_pricing AS (
                    SELECT 
                        dp.desk_type_id,
                        dp.slot_id,
                        dp.price
                    FROM sena.desk_pricing AS dp
                    WHERE dp.is_active = true
                ),
                slot_master AS (
                    SELECT 
                        sm.id AS slot_id,
                        sm.slot_type,
                        sm.start_time,
                        sm.end_time,
                        sm.time_zone
                    FROM sena.slot_master AS sm
                    WHERE sm.is_active = true
                )
                SELECT 
                    JSON_AGG(
                        JSON_BUILD_OBJECT(
                            'desk_id', dd.desk_id,
                            'desk_name', dd.desk_name,
                            'floor_number', dd.floor_number,
                            'capacity', dd.capacity,
                            'description', dd.description,
                            'desk_status', dd.desk_status,
                            'building_name', dd.building_name,
                            'building_address', dd.building_address,
                            'amenities', dd.amenities,
                            'operating_hours', dd.operating_hours,
                            'city', dd.city,
                            'slots', (
                                SELECT JSON_AGG(
                                    JSON_BUILD_OBJECT(
                                        'slot_id', sm.slot_id,
                                        'slot_type', sm.slot_type,
                                        'start_time', sm.start_time,
                                        'end_time', sm.end_time,
                                        'time_zone', sm.time_zone,
                                        'status', ss.slot_status,
                                        'price', dp.price
                                    )
                                )
                                FROM slot_master AS sm
                                LEFT JOIN slot_status AS ss 
                                    ON ss.desk_id = dd.desk_id AND ss.slot_id = sm.slot_id
                                LEFT JOIN desk_pricing AS dp 
                                    ON dp.desk_type_id = dd.desk_type_id AND dp.slot_id = sm.slot_id
                            )
                        )
                    ) AS desks_json
                FROM desk_details AS dd
            """)
            
            result = cursor.fetchone()
            if not result or not result[0]:
                return {"desks": []}, 200

            # Parse the JSON string from PostgreSQL
            desks_data = result[0]
            return {"desks": desks_data}, 200

        except Exception as e:
            return {"error": f"Failed to fetch desk data: {str(e)}"}, 500
        finally:
            conn.close() 