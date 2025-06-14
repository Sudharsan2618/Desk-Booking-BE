from flask import Blueprint, request, jsonify
from app.models.user_model import User
from app.utils.db_utils import get_db_connection
from app.config.database import DB_CONFIG

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    conn = get_db_connection(DB_CONFIG)
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500

    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, email, first_name, last_name, phone, created_at, updated_at, is_active
            FROM sena.users
            WHERE email = %s AND password = %s
        """, (email, password))
        
        user = cursor.fetchone()
        if not user:
            return jsonify({'error': 'Invalid credentials'}), 401

        return jsonify({
            'message': 'Login successful',
            'user': {
                'id': user[0],
                'email': user[1],
                'first_name': user[2],
                'last_name': user[3],
                'phone': user[4],
                'created_at': user[5],
                'updated_at': user[6],
                'is_active': user[7]
            }
        }), 200

    except Exception as e:
        return jsonify({'error': f'An error occurred: {str(e)}'}), 500
    finally:
        conn.close()

@auth_bp.route('/api/auth/me', methods=['GET'])
def get_current_user():
    email = request.args.get('email')
    if not email:
        return jsonify({'error': 'Email is required'}), 400

    conn = get_db_connection(DB_CONFIG)
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500

    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, email, first_name, last_name, phone, created_at, updated_at, is_active
            FROM sena.users
            WHERE email = %s
        """, (email,))
        
        user = cursor.fetchone()
        if not user:
            return jsonify({'error': 'User not found'}), 404

        return jsonify({
            'id': user[0],
            'email': user[1],
            'first_name': user[2],
            'last_name': user[3],
            'phone': user[4],
            'created_at': user[5],
            'updated_at': user[6],
            'is_active': user[7]
        }), 200

    except Exception as e:
        return jsonify({'error': f'An error occurred: {str(e)}'}), 500
    finally:
        conn.close()
