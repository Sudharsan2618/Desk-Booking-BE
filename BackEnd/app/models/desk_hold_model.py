from typing import Dict, Tuple
from app.utils.db_utils import get_db_connection
from app.config.database import DB_CONFIG
import json

class DeskHold:
    @staticmethod
    def put_desk_on_hold(user_id: str, desk_id: int, slot_id: int) -> Tuple[Dict, int]:
        """
        Put a desk on hold for a specific user and slot
        Args:
            user_id: UUID of the user
            desk_id: ID of the desk
            slot_id: ID of the slot
        Returns: Tuple of (response_dict, status_code)
        """
        conn = get_db_connection(DB_CONFIG)
        if not conn:
            return {"error": "Database connection failed"}, 500

        try:
            cursor = conn.cursor()
            
            # Check if desk is already booked or held for the slot
            cursor.execute("""
                SELECT status 
                FROM sena.booking_transactions 
                WHERE desk_id = %s AND slot_id = %s 
                AND status IN ('booked', 'held')
            """, (desk_id, slot_id))
            
            existing_booking = cursor.fetchone()
            if existing_booking:
                return {
                    "error": "Desk is already booked or held for this slot"
                }, 400

            # Get booking details JSON
            cursor.execute("""
                SELECT json_build_object(
                    'user_details', json_build_object(
                        'First Name', u.first_name,
                        'Description', d.description,
                        'Capacity', d.capacity,
                        'floor_number', d.floor_number
                    ),
                    'desk_details', json_build_object(
                        'name', d.name,
                        'description', d.description,
                        'capacity', d.capacity,
                        'floor_number', d.floor_number
                    ),
                    'building_information', json_build_object(
                        'name', b.name,
                        'address', b.address,
                        'floor_count', b.floor_count,
                        'amenities', b.amenities,
                        'operating_hours', b.operating_hours
                    ),
                    'slot_details', json_build_object(
                        'type', sm.slot_type,
                        'start_time', sm.start_time,
                        'end_time', sm.end_time,
                        'time_zone', sm.time_zone
                    ),
                    'desk_type', json_build_object(
                        'type', dtm.type,
                        'capacity', dtm.capacity
                    ),
                    'pricing', json_build_object(
                        'price', dp.price
                    )
                ) AS booking_json
                FROM sena.desks AS d
                LEFT JOIN sena.buildings AS b ON b.id = d.building_id
                LEFT JOIN sena.slot_master AS sm ON sm.id = %s
                LEFT JOIN sena.desk_type_master AS dtm ON dtm.id = d.desk_type_id
                LEFT JOIN sena.desk_pricing AS dp ON dp.slot_id = sm.id AND dp.desk_type_id = dtm.id
                LEFT JOIN sena.users as u on u.id = %s
                WHERE d.id = %s
            """, (slot_id, user_id, desk_id))
            
            booking_details = cursor.fetchone()[0]
            
            # Convert the booking details to a JSON string
            booking_details_json = json.dumps(booking_details)

            # Insert the hold transaction with booking details
            cursor.execute("""
                INSERT INTO sena.booking_transactions 
                (user_id, desk_id, slot_id, status, booking_details)
                VALUES (%s, %s, %s, 'held', %s::jsonb)
                RETURNING id, user_id, desk_id, slot_id, status
            """, (user_id, desk_id, slot_id, booking_details_json))
            
            conn.commit()
            result = cursor.fetchone()
            
            return {
                "message": "Desk put on hold successfully",
                "booking": {
                    "booking_id": result[0],
                    "user_id": result[1],
                    "desk_id": result[2],
                    "slot_id": result[3],
                    "status": result[4],
                    "booking_details": booking_details
                }
            }, 201

        except Exception as e:
            conn.rollback()
            return {"error": str(e)}, 500
        finally:
            conn.close()

    @staticmethod
    def get_desk_hold_status(desk_id: int, slot_id: int) -> Tuple[Dict, int]:
        """
        Check if a desk is on hold for a specific slot
        Args:
            desk_id: ID of the desk
            slot_id: ID of the slot
        Returns: Tuple of (response_dict, status_code)
        """
        conn = get_db_connection(DB_CONFIG)
        if not conn:
            return {"error": "Database connection failed"}, 500

        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT bt.id, bt.user_id, bt.status, u.email
                FROM sena.booking_transactions bt
                JOIN sena.users u ON bt.user_id = u.id
                WHERE bt.desk_id = %s AND bt.slot_id = %s 
                AND bt.status = 'held'
            """, (desk_id, slot_id))
            
            hold_info = cursor.fetchone()
            
            if not hold_info:
                return {
                    "is_held": False,
                    "message": "Desk is not on hold"
                }, 200

            return {
                "is_held": True,
                "held_by": {
                    "booking_id": hold_info[0],
                    "user_id": hold_info[1],
                    "email": hold_info[3]
                },
                "status": hold_info[2]
            }, 200

        except Exception as e:
            return {"error": str(e)}, 500
        finally:
            conn.close() 