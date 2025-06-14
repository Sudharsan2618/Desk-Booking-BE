from typing import Dict, Tuple
from app.utils.db_utils import get_db_connection
from app.config.database import DB_CONFIG

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

            # Insert the hold transaction
            cursor.execute("""
                INSERT INTO sena.booking_transactions 
                (user_id, desk_id, slot_id, status)
                VALUES (%s, %s, %s, 'held')
                RETURNING user_id, desk_id, slot_id, status
            """, (user_id, desk_id, slot_id))
            
            conn.commit()
            result = cursor.fetchone()
            
            return {
                "message": "Desk put on hold successfully",
                "booking": {
                    "user_id": result[0],
                    "desk_id": result[1],
                    "slot_id": result[2],
                    "status": result[3]
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
                SELECT bt.user_id, bt.status, u.email
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
                    "user_id": hold_info[0],
                    "email": hold_info[2]
                },
                "status": hold_info[1]
            }, 200

        except Exception as e:
            return {"error": str(e)}, 500
        finally:
            conn.close() 