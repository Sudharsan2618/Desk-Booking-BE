from typing import Dict, List, Tuple, Optional
from app.utils.db_utils import get_db_connection
from app.config.database import DB_CONFIG
import json
import uuid

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
                if filtered_location_ids:
                    desk_details_conditions.append("l.id IN %s")
                    query_params.append(tuple(filtered_location_ids))
            
            if desk_type_ids:
                filtered_desk_type_ids = []
                for dt_id in desk_type_ids:
                    if dt_id:
                        try:
                            filtered_desk_type_ids.append(int(dt_id))
                        except ValueError:
                            continue
                if filtered_desk_type_ids:
                    desk_details_conditions.append("d.desk_type_id IN %s")
                    query_params.append(tuple(filtered_desk_type_ids))

            desk_details_where_clause = ""
            if desk_details_conditions:
                desk_details_where_clause = "WHERE " + " AND ".join(desk_details_conditions)

            # --- Slot Booking Status Filter (bt.updated_at::date) ---
            booking_date_condition_sql = "bt.booking_date = CURRENT_DATE"
            if booking_date:
                booking_date_condition_sql = "bt.booking_date = %s"
                query_params.append(booking_date)

            # --- All Relevant Slots Filter (sm.id) ---
            all_relevant_slots_conditions = ["sm.is_active = true"]
            if slot_type_ids:
                filtered_slot_type_ids = []
                for st_id in slot_type_ids:
                    if st_id:
                        try:
                            filtered_slot_type_ids.append(int(st_id))
                        except ValueError:
                            continue
                if filtered_slot_type_ids:
                    all_relevant_slots_conditions.append("sm.id IN %s")
                    query_params.append(tuple(filtered_slot_type_ids))

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
                        d.rating,
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
                        sm.slot_type,
                        COALESCE(MAX(CASE 
                            WHEN bt.status = 'booked' THEN 'booked'
                            WHEN bt.status = 'held' THEN 'held'
                            ELSE NULL 
                        END), 'available') AS slot_status
                    FROM sena.booking_transactions AS bt
                    JOIN sena.slot_master AS sm ON sm.id = bt.slot_id
                    WHERE {booking_date_condition_sql}
                    GROUP BY bt.desk_id, bt.slot_id, sm.slot_type
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
                            'rating', dd.rating,
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
                                        'price', COALESCE(dp.price, 0)
                                    )
                                    ORDER BY dp.price ASC NULLS LAST
                                )
                                FROM all_relevant_slots ars
                                LEFT JOIN slot_booking_status sbs 
                                    ON sbs.desk_id = dd.desk_id 
                                    AND sbs.slot_id = ars.slot_id
                                LEFT JOIN desk_pricing dp 
                                    ON dp.desk_type_id = dd.desk_type_id 
                                    AND dp.slot_id = ars.slot_id
                            )
                        )
                        ORDER BY 
                            COALESCE(dd.rating, 0) DESC,
                            (SELECT MIN(dp.price) FROM desk_pricing dp WHERE dp.desk_type_id = dd.desk_type_id) ASC NULLS LAST
                    ) AS desks_json
                FROM desk_details AS dd;
            """

            cursor.execute(sql_query, tuple(query_params))
            result = cursor.fetchone()
            
            if not result or not result[0]:
                return {"desks": []}, 200

            desks_data = result[0]

            # Process the data in Python to implement the slot and desk status logic
            for desk in desks_data:
                if not desk.get('slots'):
                    continue

                # First, process slot statuses
                full_day_slot = None
                morning_slot = None
                evening_slot = None

                # Find the slots
                for slot in desk['slots']:
                    if slot['slot_type'].lower() == 'full day':
                        full_day_slot = slot
                    elif slot['slot_type'].lower() == 'morning':
                        morning_slot = slot
                    elif slot['slot_type'].lower() == 'evening':
                        evening_slot = slot

                # Apply slot availability rules
                if full_day_slot and full_day_slot['status'] in ['booked', 'held']:
                    # If full day is booked/held, make morning and evening unavailable
                    if morning_slot:
                        morning_slot['status'] = 'unavailable'
                    if evening_slot:
                        evening_slot['status'] = 'unavailable'
                elif (morning_slot and morning_slot['status'] in ['booked', 'held']) or \
                     (evening_slot and evening_slot['status'] in ['booked', 'held']):
                    # If either morning or evening is booked/held, make full day unavailable
                    if full_day_slot:
                        full_day_slot['status'] = 'unavailable'

                # Then, determine desk status based on slot statuses
                if full_day_slot:
                    if full_day_slot['status'] == 'booked':
                        desk['desk_status'] = 'booked'
                    elif full_day_slot['status'] == 'held':
                        desk['desk_status'] = 'held'
                elif morning_slot and evening_slot:
                    if morning_slot['status'] == 'booked' and evening_slot['status'] == 'booked':
                        desk['desk_status'] = 'booked'
                    elif morning_slot['status'] == 'held' and evening_slot['status'] == 'held':
                        desk['desk_status'] = 'held'
                    else:
                        desk['desk_status'] = 'available'
                else:
                    desk['desk_status'] = 'available'

            return {"desks": desks_data}, 200

        except Exception as e:
            print(f"[DeskData ERROR] Failed to fetch desk data: {str(e)}")
            return {"error": f"Failed to fetch desk data: {str(e)}"}, 500
        finally:
            conn.close()

    @staticmethod
    def hold_desk_slot(user_id: str, desk_id: int, slot_id: int) -> Tuple[Dict, int]:
        """
        Puts a desk slot on hold in the booking_transactions table.
        Args:
            user_id (str): UUID of the user.
            desk_id (int): ID of the desk.
            slot_id (int): ID of the slot.
        Returns: Tuple of (response_dict, status_code)
        """
        conn = get_db_connection(DB_CONFIG)
        if not conn:
            return {"error": "Database connection failed"}, 500

        try:
            cursor = conn.cursor()
            status = "held" # Default status for holding

            # Assuming the booking_transactions table has: id (SERIAL), user_id, desk_id, slot_id, status
            # We omit 'id' in the INSERT statement as it's SERIAL and auto-generated
            insert_query = """
                INSERT INTO sena.booking_transactions(
                    user_id, desk_id, slot_id, status)
                VALUES (%s, %s, %s, %s);
            """
            cursor.execute(insert_query, (user_id, desk_id, slot_id, status))
            conn.commit()
            
            # If you need the generated ID, you can fetch it after commit
            # For SERIAL, use: new_id = cursor.fetchone()[0] after RETURNING id; in the query
            
            return {"message": "Desk slot held successfully"}, 201

        except Exception as e:
            conn.rollback()
            print(f"[ERROR] Failed to hold desk slot: {str(e)}")
            return {"error": f"Failed to hold desk slot: {str(e)}"}, 500
        finally:
            conn.close()

    @staticmethod
    def get_user_bookings(user_id: str) -> Tuple[Dict, int]:
        """
        Get all bookings for a specific user
        Args:
            user_id: UUID of the user
        Returns: Tuple of (response_dict, status_code)
        """
        conn = get_db_connection(DB_CONFIG)
        if not conn:
            return {"error": "Database connection failed"}, 500

        try:
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT 
                    id,
                    booking_details,
                    updated_at,
                    status
                FROM sena.booking_transactions
                WHERE user_id = %s
                ORDER BY updated_at DESC
            """, (user_id,))
            
            bookings = cursor.fetchall()
            
            if not bookings:
                return {"bookings": []}, 200

            # Convert the results to a list of dictionaries
            booking_list = []
            for booking in bookings:
                booking_list.append({
                    "booking_id": booking[0],
                    "booking_details": booking[1],
                    "updated_at": booking[2].isoformat() if booking[2] else None,
                    "status": booking[3]
                })

            return {"bookings": booking_list}, 200

        except Exception as e:
            print(f"[DeskData ERROR] Failed to fetch user bookings: {str(e)}")
            return {"error": f"Failed to fetch user bookings: {str(e)}"}, 500
        finally:
            conn.close() 