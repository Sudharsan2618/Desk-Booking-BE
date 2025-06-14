from typing import Dict, List, Tuple, Optional
from app.utils.db_utils import get_db_connection
from app.config.database import DB_CONFIG
import json

class DeskData:
    @staticmethod
    def get_desk_availability(location_ids: Optional[List[str]] = None, desk_type_ids: Optional[List[str]] = None, slot_type_ids: Optional[List[str]] = None, booking_date: Optional[str] = None) -> Tuple[Dict, int]:
        """
        Get desk availability data with slots and pricing, with optional filters.
        Args:
            location_ids (Optional[List[str]]): List of location IDs to filter by.
            desk_type_ids (Optional[List[str]]): List of desk type IDs to filter by.
            slot_type_ids (Optional[List[str]]): List of slot type IDs to filter by.
            booking_date (Optional[str]): The date to check availability for (YYYY-MM-DD).
        Returns: Tuple of (desk_data_dict, status_code)
        """
        conn = get_db_connection(DB_CONFIG)
        if not conn:
            return {"error": "Database connection failed"}, 500

        try:
            cursor = conn.cursor()

            query_params = []
            
            # --- Desk Details Filters (l.id, d.desk_type_id) ---
            desk_details_conditions = []
            if location_ids:
                filtered_location_ids = [loc_id for loc_id in location_ids if loc_id]
                print(f"[Debug DeskData] filtered_location_ids: {filtered_location_ids}") # Debug log
                if filtered_location_ids: # Only add condition if there are actual location IDs
                    desk_details_conditions.append("l.id IN %s")
                    query_params.append(tuple(filtered_location_ids))
            
            if desk_type_ids:
                # Ensure conversion to int only for non-empty strings
                filtered_desk_type_ids = []
                for dt_id in desk_type_ids:
                    if dt_id:
                        try:
                            filtered_desk_type_ids.append(int(dt_id))
                        except ValueError:
                            print(f"[Debug DeskData] Invalid desk_type_id found: {dt_id}") # Debug log
                            continue
                print(f"[Debug DeskData] filtered_desk_type_ids: {filtered_desk_type_ids}") # Debug log
                if filtered_desk_type_ids: # Only add condition if there are actual desk type IDs
                    desk_details_conditions.append("d.desk_type_id IN %s")
                    query_params.append(tuple(filtered_desk_type_ids))

            desk_details_where_clause = "" # Initialize as empty string
            if desk_details_conditions:
                desk_details_where_clause = "WHERE " + " AND ".join(desk_details_conditions)

            # --- Slot Booking Status Filter (bt.updated_at::date) ---
            # This parameter (booking_date) will be added to query_params after desk_details_conditions
            booking_date_condition_sql = "bt.updated_at::date = CURRENT_DATE" # Default to current date if not provided
            if booking_date:
                booking_date_condition_sql = "bt.updated_at::date = %s"
                query_params.append(booking_date) # Add the parameter here

            # --- All Relevant Slots Filter (sm.id) ---
            # This parameter (slot_type_ids) will be added to query_params after booking_date
            all_relevant_slots_conditions = ["sm.is_active = true"]
            if slot_type_ids:
                # Ensure conversion to int only for non-empty strings
                filtered_slot_type_ids = []
                for st_id in slot_type_ids:
                    if st_id:
                        try:
                            filtered_slot_type_ids.append(int(st_id))
                        except ValueError:
                            print(f"[Debug DeskData] Invalid slot_type_id found: {st_id}") # Debug log
                            continue
                print(f"[Debug DeskData] filtered_slot_type_ids: {filtered_slot_type_ids}") # Debug log
                if filtered_slot_type_ids: # Only add condition if there are actual slot type IDs
                    all_relevant_slots_conditions.append("sm.id IN %s")
                    query_params.append(tuple(filtered_slot_type_ids)) # Add the parameter here

            all_relevant_slots_where_clause = "WHERE " + " AND ".join(all_relevant_slots_conditions)


            sql_query = f"""
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
                    {desk_details_where_clause}
                ),
                slot_booking_status AS (
                    SELECT 
                        bt.desk_id,
                        bt.slot_id,
                        COALESCE(MAX(CASE 
                            WHEN bt.status = 'booked' THEN 'booked'
                            WHEN bt.status = 'held' THEN 'held'
                            ELSE NULL 
                        END), 'available') AS slot_status
                    FROM sena.booking_transactions AS bt
                    WHERE {booking_date_condition_sql}
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
                all_relevant_slots AS (
                    SELECT
                        sm.id AS slot_id,
                        sm.slot_type,
                        sm.start_time,
                        sm.end_time,
                        sm.time_zone
                    FROM sena.slot_master AS sm
                    {all_relevant_slots_where_clause}
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
                                        'slot_id', ars.slot_id,
                                        'slot_type', ars.slot_type,
                                        'start_time', ars.start_time,
                                        'end_time', ars.end_time,
                                        'time_zone', ars.time_zone,
                                        'status', COALESCE(sbs.slot_status, 'available'),
                                        'price', dp.price
                                    )
                                )
                                FROM all_relevant_slots AS ars
                                CROSS JOIN desk_details AS d_cross_join -- Use desk_details here to ensure correct desk_type_id for pricing
                                LEFT JOIN slot_booking_status AS sbs 
                                    ON sbs.desk_id = d_cross_join.desk_id AND sbs.slot_id = ars.slot_id
                                LEFT JOIN desk_pricing AS dp 
                                    ON dp.desk_type_id = d_cross_join.desk_type_id AND dp.slot_id = ars.slot_id
                                WHERE d_cross_join.desk_id = dd.desk_id
                            )
                        )
                    ) AS desks_json
                FROM desk_details AS dd;
            """

            cursor.execute(sql_query, tuple(query_params))
            
            result = cursor.fetchone()
            if not result or not result[0]:
                return {"desks": []}, 200

            desks_data = result[0]
            print(f"[DeskData] Returning {{'desks': {len(desks_data) if desks_data else 0}}}, Status: 200")
            return {"desks": desks_data}, 200

        except Exception as e:
            print(f"[DeskData ERROR] Failed to fetch desk data: {str(e)}")
            return {"error": f"Failed to fetch desk data: {str(e)}"}, 500
        finally:
            conn.close() 