import os

from flask import Flask

from gwa import bp as gwa_bp, init_db

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-change-me')
app.register_blueprint(gwa_bp)
init_db()

if __name__ == '__main__':
    app.run(debug=True)
