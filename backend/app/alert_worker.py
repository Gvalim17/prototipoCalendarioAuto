"""Run by a cron job every five minutes to dispatch due lesson alerts."""

import json

from .database import SessionLocal
from .logging_config import setup_logging
from .services.alert_dispatcher import dispatch_due_alerts


def main() -> None:
    setup_logging()
    with SessionLocal() as db:
        print(json.dumps(dispatch_due_alerts(db)))


if __name__ == "__main__":
    main()
