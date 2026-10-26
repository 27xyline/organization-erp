"Точка входа задачи запланированных уведомлений, общая для обработчика и ручного маршрута API."

from app.services.scheduled_alerts import generate_scheduled_alerts, run_scheduled_alerts

__all__ = ["generate_scheduled_alerts", "run_scheduled_alerts"]
