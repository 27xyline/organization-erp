# Мониторинг ERP

Запуск после настройки `.env`:

```sh
docker compose --profile observability up -d --build
```

Grafana доступна на `http://127.0.0.1:3002` (логин `admin`, пароль из
`GRAFANA_ADMIN_PASSWORD`), Prometheus — на `http://127.0.0.1:9090`.
Установите `GRAFANA_ADMIN_PASSWORD` в `.env` перед запуском. Порты можно
переопределить через `GRAFANA_PORT` и `PROMETHEUS_PORT`. Сборщик телеметрии (Collector) и Tempo не
имеют опубликованных портов; приложение и фоновый процесс отправляют данные на
`http://otel-collector:4318` по внутренней Docker-сети. Зависимости от профиля
нет: при остановленном сборщике ERP и отправка писем продолжают работать.

Панель «ERP · состояние приложения» показывает HTTP-ошибки и время ответа,
время запросов к БД, очередь и состояние фонового процесса. Предупреждения определены в
`alerts.yml` и видны в Prometheus/Grafana. Внешняя отправка предупреждений
требует отдельной настройки канала уведомления/Alertmanager.

В метрики попадают только счётчики, длительности и технические статусы.
Сборщик удаляет все события участков трассировки, включая текст исключений, очищает сообщения
об ошибках, заменяет имена операций и оставляет только разрешённые технические
атрибуты трассировок и метрик. Приложение дополнительно использует шаблоны
маршрутов вместо полных URL и не должно добавлять персональные данные в
названия метрик или значение `http.route`.

API на Python и фоновый процесс отправляют трассировки и метрики OTLP по адресу
`BACKEND_OTEL_EXPORTER_OTLP_ENDPOINT` (по умолчанию — `http://otel-collector:4318`).
В Compose экспорт включён по умолчанию, но запуск сборщика остаётся необязательным:
ошибка экспорта ограничена таймаутом и не влияет на готовность приложения и обработку писем.
Длительности HTTP- и SQL-запросов публикуются в секундах (`erp_http_request_duration_seconds`,
`erp_db_query_duration_seconds`, `erp_db_pool_wait_seconds`); фоновый процесс сохраняет
совместимые имена метрик очереди исходящих сообщений и сигнала работоспособности,
используемые панелью мониторинга и правилами оповещений.
Участки трассировки SQL содержат только сведения о PostgreSQL, тип операции
и технические атрибуты HTTP; текст SQL и значения параметров не экспортируются.

Проверка конфигурации:

```sh
docker compose --profile observability config --quiet
docker compose --profile observability run --rm --no-deps --entrypoint /otelcol-contrib otel-collector validate --config=/etc/otelcol-contrib/config.yaml
docker compose --profile observability run --rm --no-deps --entrypoint /bin/promtool prometheus check config /etc/prometheus/prometheus.yml
```
