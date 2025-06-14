from flask import Blueprint, request, jsonify
from app.utils.db_utils import get_db_connection
from app.config.database import DB_CONFIG
import re

signup_bp = Blueprint('signup', __name__)

def validate_email(email: str) -> bool:
    """Validate email format"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))

@signup_bp.route('/api/auth/signup', methods=['POST'])
def signup():
    data = request.get_json()
    
    # Extract required fields
    email = data.get('email')
    password = data.get('password')
    first_name = data.get('first_name')
    last_name = data.get('last_name')
    phone = data.get('phone')

    # Validate required fields
    if not all([email, password, first_name, last_name]):
        return jsonify({
            'error': 'Missing required fields',
            'required': ['email', 'password', 'first_name', 'last_name']
        }), 400

    # Validate email format
    if not validate_email(email):
        return jsonify({'error': 'Invalid email format'}), 400

    conn = get_db_connection(DB_CONFIG)
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500

    try:
        cursor = conn.cursor()
        # Check if email already exists
        cursor.execute("SELECT id FROM sena.users WHERE email = %s", (email,))
        if cursor.fetchone():
            return jsonify({'error': 'Email already registered'}), 409

        # Create new user - let database generate UUID
        cursor.execute("""
            INSERT INTO sena.users (email, first_name, last_name, phone, password)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, email, first_name, last_name, phone, created_at, updated_at, is_active
        """, (email, first_name, last_name, phone, password))
        
        new_user = cursor.fetchone()
        conn.commit()
        
        return jsonify({
            'message': 'User created successfully',
            'user': {
                'id': new_user[0],
                'email': new_user[1],
                'first_name': new_user[2],
                'last_name': new_user[3],
                'phone': new_user[4],
                'created_at': new_user[5],
                'updated_at': new_user[6],
                'is_active': new_user[7]
            }
        }), 201

    except Exception as e:
        conn.rollback()
        return jsonify({'error': f'Failed to create user: {str(e)}'}), 500
    finally:
        conn.close()
