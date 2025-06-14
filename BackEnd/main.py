from flask import Flask, jsonify
from flask_cors import CORS
from app.routes.auth_routes import auth_bp
from app.routes.signup_routes import signup_bp
from werkzeug.exceptions import HTTPException

app = Flask(__name__)
CORS(app)

# Register blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(signup_bp)

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
    app.run(host="0.0.0.0", port=5000, debug=True)
