from typing import Dict, List, Tuple
from app.utils.db_utils import get_db_connection
from app.config.database import DB_CONFIG

class DeskData:
    @staticmethod
    def get_desk_availability(target_date: str = None) -> Tuple[Dict, int]:
        """
        Get desk availability data with slots and pricing for a specific date.
        If no date is provided, it defaults to the current date.
        Returns: Tuple of (desk_data_dict, status_code)
        """
        conn = get_db_connection(DB_CONFIG)
        if not conn:
            return {"error": "Database connection failed"}, 500

        try:
            cursor = conn.cursor()
            # Use CURRENT_DATE if target_date is not provided
            date_condition = f"AND bt.updated_at::date = '{target_date}'" if target_date else "AND bt.updated_at::date = CURRENT_DATE"
            
            cursor.execute(f"""
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
                        sm.id AS slot_id,
                        sm.slot_type,
                        sm.start_time,
                        sm.end_time,
                        sm.time_zone,
                        d.id AS desk_id,
                        COALESCE(bt.status, 'available') AS slot_status
                    FROM sena.slot_master AS sm
                    CROSS JOIN sena.desks AS d
                    LEFT JOIN sena.booking_transactions AS bt 
                        ON sm.id = bt.slot_id
                        AND d.id = bt.desk_id
                        {date_condition}
                ),
                desk_pricing AS (
                    SELECT 
                        dp.desk_type_id,
                        dp.slot_id,
                        dp.price
                    FROM sena.desk_pricing AS dp
                    WHERE dp.is_active = true
                ),
                slots_with_pricing AS (
                    SELECT 
                        ss.slot_id,
                        ss.slot_type,
                        ss.start_time,
                        ss.end_time,
                        ss.time_zone,
                        ss.desk_id,
                        ss.slot_status,
                        dp.price
                    FROM slot_status AS ss
                    LEFT JOIN desk_pricing AS dp 
                        ON dp.slot_id = ss.slot_id
                        AND dp.desk_type_id = (SELECT desk_type_id FROM sena.desks WHERE id = ss.desk_id)
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
                                        'slot_id', sp.slot_id,
                                        'slot_type', sp.slot_type,
                                        'start_time', sp.start_time,
                                        'end_time', sp.end_time,
                                        'time_zone', sp.time_zone,
                                        'status', sp.slot_status,
                                        'price', sp.price
                                    )
                                )
                                FROM slots_with_pricing AS sp
                                WHERE sp.desk_id = dd.desk_id
                            )
                        )
                    ) AS desks_json
                FROM desk_details AS dd;
            """)
            
            result = cursor.fetchone()
            if not result or not result[0]:
                return {"desks": []}, 200

            print(f"Debug: Type of result[0]: {type(result[0])}")
            print(f"Debug: Value of result[0]: {result[0]}")
            desks_data = result[0]
            return {"desks": desks_data}, 200

        except Exception as e:
            return {"error": f"Failed to fetch desk data: {str(e)}"}, 500
        finally:
            conn.close() 