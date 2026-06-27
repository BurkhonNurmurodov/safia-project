from app.database import SessionLocal
from app.models import Admin

def clear_admins():
    db = SessionLocal()
    try:
        # Delete all rows from the Admin table
        deleted = db.query(Admin).delete()
        db.commit()
        print(f"Successfully deleted {deleted} admin(s) from the database.")
        print("Now you can update your .env file and restart the backend. The app will re-seed the admins!")
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    clear_admins()
