from typing import Dict, Tuple
from app.utils.db_utils import get_db_connection
from app.config.database import DB_CONFIG

class DeskBooking:
    @staticmethod
    def book_from_hold(booking_id: int) -> Tuple[Dict, int]:
        """
        Book a desk that is currently on hold by updating the booking transaction status
        Args:
            booking_id: ID of the booking transaction
        Returns: Tuple of (response_dict, status_code)
        """
        conn = get_db_connection(DB_CONFIG)
        if not conn:
            return {"error": "Database connection failed"}, 500

        try:
            cursor = conn.cursor()
            
            # First check if the booking exists and is on hold
            cursor.execute("""
                SELECT user_id, desk_id, slot_id, status, booking_details
                FROM sena.booking_transactions 
                WHERE id = %s
            """, (booking_id,))
            
            booking = cursor.fetchone()
            if not booking:
                return {
                    "error": "Booking transaction not found"
                }, 404

            if booking[3] != 'held':
                return {
                    "error": "Booking is not in held status"
                }, 400

            # Update the status to booked
            cursor.execute("""
                UPDATE sena.booking_transactions 
                SET status = 'booked'
                WHERE id = %s
                RETURNING id, user_id, desk_id, slot_id, status, booking_details
            """, (booking_id,))
            
            conn.commit()
            result = cursor.fetchone()
            
            return {
                "message": "Desk booked successfully",
                "booking": {
                    "id": result[0],
                    "user_id": result[1],
                    "desk_id": result[2],
                    "slot_id": result[3],
                    "status": result[4],
                    "booking_details": result[5]
                }
            }, 200

        except Exception as e:
            conn.rollback()
            return {"error": str(e)}, 500
        finally:
            conn.close() 