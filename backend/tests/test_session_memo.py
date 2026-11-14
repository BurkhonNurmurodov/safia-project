"""`app/session_memo.py` — a permission read is asked once per session, and a
write in that session is never answered from before it."""
import unittest

from sqlalchemy import Column, Integer, create_engine
from sqlalchemy.orm import Session, declarative_base

from app import session_memo

Base = declarative_base()


class _Row(Base):
    __tablename__ = "memo_rows"
    id = Column(Integer, primary_key=True)


class SessionMemoTest(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        self.db = Session(engine)
        self.calls = 0

    def tearDown(self):
        self.db.close()

    def ask(self):
        def fn():
            self.calls += 1
            return self.calls
        return session_memo.get(self.db, ("k",), fn)

    def test_reused_within_a_session(self):
        self.assertEqual((self.ask(), self.ask()), (1, 1))

    def test_bypassed_while_a_write_is_pending(self):
        self.ask()
        self.db.add(_Row(id=1))
        self.assertEqual(self.ask(), 2)

    def test_dropped_on_flush_and_commit(self):
        self.ask()
        self.db.add(_Row(id=1))
        self.db.flush()
        self.assertEqual(self.ask(), 2)
        self.db.commit()
        self.assertEqual(self.ask(), 3)

    def test_not_a_session_is_never_cached(self):
        n = []
        session_memo.get(object(), ("k",), lambda: n.append(1))
        session_memo.get(object(), ("k",), lambda: n.append(1))
        self.assertEqual(len(n), 2)


if __name__ == "__main__":
    unittest.main()
