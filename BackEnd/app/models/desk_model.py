from typing import Dict, List, Tuple, Optional
from app.utils.db_utils import get_db_connection
from app.config.database import DB_CONFIG
import json
import uuid
import time
from decimal import Decimal

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)

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
            
            # Build WHERE conditions more efficiently
            where_conditions = []
            
            if location_ids:
                filtered_location_ids = [loc_id for loc_id in location_ids if loc_id]
                if filtered_location_ids:
                    where_conditions.append("d.location_id = ANY(%s::uuid[])")
                    query_params.append(filtered_location_ids)
            
            if desk_type_ids:
                filtered_desk_type_ids = []
                for dt_id in desk_type_ids:
                    if dt_id:
                        try:
                            filtered_desk_type_ids.append(int(dt_id))
                        except ValueError:
                            continue
                if filtered_desk_type_ids:
                    where_conditions.append("d.desk_type_id = ANY(%s)")
                    query_params.append(filtered_desk_type_ids)

            # Build the main WHERE clause
            main_where = "WHERE " + " AND ".join(where_conditions) if where_conditions else ""

            # Handle slot type filtering separately
            slot_type_where = ""
            if slot_type_ids:
                filtered_slot_type_ids = []
                for st_id in slot_type_ids:
                    if st_id:
                        try:
                            filtered_slot_type_ids.append(int(st_id))
                        except ValueError:
                            continue
                if filtered_slot_type_ids:
                    slot_type_where = "AND sm.id = ANY(%s)"
                    query_params.append(filtered_slot_type_ids)

            # Use current date if booking_date not provided
            target_date = booking_date or time.strftime('%Y-%m-%d')
            query_params.append(target_date)

            # Optimized query with better structure and indexing considerations
            sql_query = f"""
                WITH desk_base AS (
                    SELECT 
                        d.id AS desk_id,
                        d.name AS desk_name,
                        d.floor_number,
                        d.capacity,
                        d.description,
                        d.status AS desk_status,
                        d.rating,
                        d.desk_type_id,
                        b.name AS building_name,
                        b.address AS building_address,
                        b.amenities,
                        b.operating_hours,
                        l.name AS city
                    FROM sena.desks d
                    INNER JOIN sena.buildings b ON b.id = d.building_id
                    INNER JOIN sena.locations l ON l.id = d.location_id
                    {main_where}
                ),
                active_slots AS (
                    SELECT 
                        sm.id AS slot_id,
                        sm.slot_type,
                        sm.start_time,
                        sm.end_time,
                        sm.time_zone
                    FROM sena.slot_master sm
                    WHERE sm.is_active = true
                    {slot_type_where}
                ),
                booking_status AS (
                    SELECT 
                        bt.desk_id,
                        bt.slot_id,
                        CASE 
                            WHEN COUNT(CASE WHEN bt.status = 'booked' THEN 1 END) > 0 THEN 'booked'
                            WHEN COUNT(CASE WHEN bt.status = 'held' THEN 1 END) > 0 THEN 'held'
                            ELSE 'available'
                        END AS slot_status
                    FROM sena.booking_transactions bt
                    WHERE bt.booking_date = %s
                    GROUP BY bt.desk_id, bt.slot_id
                ),
                desk_pricing_active AS (
                    SELECT 
                        dp.desk_type_id,
                        dp.slot_id,
                        dp.price
                    FROM sena.desk_pricing dp
                    WHERE dp.is_active = true
                )
                SELECT 
                    db.desk_id,
                    db.desk_name,
                    db.floor_number,
                    db.capacity,
                    db.description,
                    db.desk_status,
                    db.rating,
                    db.building_name,
                    db.building_address,
                    db.amenities,
                    db.operating_hours,
                    db.city,
                    JSON_AGG(
                        JSON_BUILD_OBJECT(
                            'slot_id', aslt.slot_id,
                            'slot_type', aslt.slot_type,
                            'start_time', aslt.start_time,
                            'end_time', aslt.end_time,
                            'time_zone', aslt.time_zone,
                            'status', COALESCE(bs.slot_status, 'available'),
                            'price', COALESCE(dpa.price, 0)
                        ) ORDER BY dpa.price ASC NULLS LAST
                    ) AS slots
                FROM desk_base db
                CROSS JOIN active_slots aslt
                LEFT JOIN booking_status bs ON bs.desk_id = db.desk_id AND bs.slot_id = aslt.slot_id
                LEFT JOIN desk_pricing_active dpa ON dpa.desk_type_id = db.desk_type_id AND dpa.slot_id = aslt.slot_id
                GROUP BY 
                    db.desk_id, db.desk_name, db.floor_number, db.capacity, 
                    db.description, db.desk_status, db.rating, db.building_name,
                    db.building_address, db.amenities, db.operating_hours, db.city,
                    db.desk_type_id
                ORDER BY 
                    COALESCE(db.rating, 0) DESC,
                    (SELECT MIN(dpa2.price) FROM desk_pricing_active dpa2 WHERE dpa2.desk_type_id = db.desk_type_id) ASC NULLS LAST;
            """

            cursor.execute(sql_query, tuple(query_params))
            results = cursor.fetchall()
            
            if not results:
                return {"desks": []}, 200

            # Process results more efficiently
            desks_data = []
            for row in results:
                desk_data = {
                    'desk_id': row[0],
                    'desk_name': row[1],
                    'floor_number': row[2],
                    'capacity': row[3],
                    'description': row[4],
                    'desk_status': row[5],
                    'rating': float(row[6]) if row[6] is not None else None,
                    'building_name': row[7],
                    'building_address': row[8],
                    'amenities': row[9],
                    'operating_hours': row[10],
                    'city': row[11],
                    'slots': row[12] if row[12] else []
                }
                
                # Convert Decimal values in slots to float
                if desk_data['slots']:
                    for slot in desk_data['slots']:
                        if 'price' in slot and isinstance(slot['price'], Decimal):
                            slot['price'] = float(slot['price'])
                
                # Apply slot availability rules efficiently
                DeskData._apply_slot_rules(desk_data)
                desks_data.append(desk_data)

            return {"desks": desks_data}, 200

        except Exception as e:
            print(f"[DeskData ERROR] Failed to fetch desk data: {str(e)}")
            return {"error": f"Failed to fetch desk data: {str(e)}"}, 500
        finally:
            conn.close()

    @staticmethod
    def _apply_slot_rules(desk_data):
        """Apply slot availability rules more efficiently"""
        if not desk_data.get('slots'):
            return

        slots = desk_data['slots']
        
        # Create slot lookup for faster access
        slot_lookup = {}
        for slot in slots:
            slot_type = slot['slot_type'].lower()
            slot_lookup[slot_type] = slot

        full_day = slot_lookup.get('full day')
        morning = slot_lookup.get('morning')
        evening = slot_lookup.get('evening')

        # Apply rules
        if full_day and full_day['status'] in ['booked', 'held']:
            if morning:
                morning['status'] = 'unavailable'
            if evening:
                evening['status'] = 'unavailable'
        elif ((morning and morning['status'] in ['booked', 'held']) or 
              (evening and evening['status'] in ['booked', 'held'])):
            if full_day:
                full_day['status'] = 'unavailable'

        # Set desk status based on slot statuses
        if full_day:
            if full_day['status'] == 'booked':
                desk_data['desk_status'] = 'booked'
            elif full_day['status'] == 'held':
                desk_data['desk_status'] = 'held'
        elif morning and evening:
            if morning['status'] == 'booked' and evening['status'] == 'booked':
                desk_data['desk_status'] = 'booked'
            elif morning['status'] == 'held' and evening['status'] == 'held':
                desk_data['desk_status'] = 'held'
            else:
                desk_data['desk_status'] = 'available'
        else:
            desk_data['desk_status'] = 'available'

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