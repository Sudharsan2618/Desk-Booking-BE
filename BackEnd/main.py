from flask import Flask, jsonify
from flask_cors import CORS
from app.routes.auth_routes import auth_bp
from app.routes.signup_routes import signup_bp
from app.routes.master_data_routes import master_data_bp
from app.routes.desk_routes import desk_bp, socketio
from werkzeug.exceptions import HTTPException

app = Flask(__name__)
CORS(app)

# Register blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(signup_bp)
app.register_blueprint(master_data_bp)
app.register_blueprint(desk_bp)

# Initialize SocketIO
socketio.init_app(app, cors_allowed_origins="*")

# Error handlers
@app.errorhandler(HTTPException)
def handle_exception(e):
    response = {
        "error": e.description,
        "status_code": e.code
    }
    return jsonify(response), e.code

@app.errorhandler(Exception)
def handle_unexpected_error(e):
    response = {
        "error": "An unexpected error occurred",
        "status_code": 500
    }
    return jsonify(response), 500

if __name__ == '__main__':
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
