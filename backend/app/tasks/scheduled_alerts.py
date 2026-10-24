"""Scheduled alert task entry point shared by the worker and manual API route."""

from app.services.scheduled_alerts import generate_scheduled_alerts, run_scheduled_alerts

__all__ = ["generate_scheduled_alerts", "run_scheduled_alerts"]
