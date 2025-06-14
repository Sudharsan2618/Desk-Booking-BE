from datetime import datetime
import uuid
from typing import Dict, Optional, Tuple
from app.utils.db_utils import get_db_connection
from app.config.database import DB_CONFIG

class User:
    def __init__(
        self,
        email: str,
        first_name: str,
        last_name: str,
        phone: Optional[str] = None,
        id: Optional[uuid.UUID] = None,
        created_at: Optional[datetime] = None,
        updated_at: Optional[datetime] = None,
        is_active: bool = True
    ):
        self.id = id or uuid.uuid4()
        self.email = email
        self.first_name = first_name
        self.last_name = last_name
        self.phone = phone
        self.created_at = created_at or datetime.utcnow()
        self.updated_at = updated_at or datetime.utcnow()
        self.is_active = is_active

    @staticmethod
    def create_user(email: str, first_name: str, last_name: str, phone: Optional[str] = None) -> Tuple[Dict, int]:
        """
        Create a new user in the database
        Returns: Tuple of (result_dict, status_code)
        """
        conn = get_db_connection(DB_CONFIG)
        if not conn:
            return {"error": "Database connection failed"}, 500

        try:
            cursor = conn.cursor()
            # Check if email already exists
            cursor.execute("SELECT id FROM sena.users WHERE email = %s", (email,))
            if cursor.fetchone():
                return {"error": "Email already registered"}, 409

            # Create new user
            user = User(email=email, first_name=first_name, last_name=last_name, phone=phone)
            cursor.execute("""
                INSERT INTO sena.users (id, email, first_name, last_name, phone)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, email, first_name, last_name, phone, created_at, updated_at, is_active
            """, (user.id, user.email, user.first_name, user.last_name, user.phone))
            
            new_user = cursor.fetchone()
            conn.commit()
            
            return {
                "id": new_user[0],
                "email": new_user[1],
                "first_name": new_user[2],
                "last_name": new_user[3],
                "phone": new_user[4],
                "created_at": new_user[5],
                "updated_at": new_user[6],
                "is_active": new_user[7]
            }, 201

        except Exception as e:
            conn.rollback()
            return {"error": f"Failed to create user: {str(e)}"}, 500
        finally:
            conn.close()

    @staticmethod
    def get_user_by_email(email: str) -> Tuple[Optional[Dict], int]:
        """
        Retrieve a user by email
        Returns: Tuple of (user_dict or None, status_code)
        """
        conn = get_db_connection(DB_CONFIG)
        if not conn:
            return None, 500

        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, email, first_name, last_name, phone, created_at, updated_at, is_active
                FROM sena.users
                WHERE email = %s
            """, (email,))
            
            user = cursor.fetchone()
            if not user:
                return None, 404

            return {
                "id": user[0],
                "email": user[1],
                "first_name": user[2],
                "last_name": user[3],
                "phone": user[4],
                "created_at": user[5],
                "updated_at": user[6],
                "is_active": user[7]
            }, 200

        except Exception as e:
            return None, 500
        finally:
            conn.close()
