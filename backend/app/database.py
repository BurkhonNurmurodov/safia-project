from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings

# pool_pre_ping: the shared host drops Postgres connections that sit idle, and
# without a liveness test SQLAlchemy hands the dead one to the next caller —
# the first query after an idle gap raises OperationalError. In the web app
# that's a failed request the user retries away; in the bot it's a handler that
# dies before it sends anything, i.e. a command that answers with pure silence
# (see the _admin_ids() call at the top of /start). pool_recycle rotates
# connections out before the host's own idle timeout can reach them.
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_recycle=1800,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
