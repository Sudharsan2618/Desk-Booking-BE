import psycopg2

def get_db_connection(db_config):
    try:
        conn = psycopg2.connect(
            host=db_config['host'],
            port=db_config['port'],
            dbname=db_config['dbname'],
            user=db_config['user'],
            password=db_config['password']
        )
        return conn
    except Exception as e:
        print(f"Database connection error: {e}")
        return None
