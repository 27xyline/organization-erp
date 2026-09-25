# Мониторинг ERP

Запуск после настройки `.env`:

```sh
docker compose --profile observability up -d --build
```

Grafana доступна на `http://127.0.0.1:3002` (логин `admin`, пароль из
`GRAFANA_ADMIN_PASSWORD`), Prometheus — на `http://127.0.0.1:9090`.
Установите `GRAFANA_ADMIN_PASSWORD` в `.env` перед запуском. Порты можно
переопределить через `GRAFANA_PORT` и `PROMETHEUS_PORT`. Collector и Tempo не
имеют опубликованных портов; приложение и worker отправляют данные на
`http://otel-collector:4318` по внутренней Docker-сети. Зависимости от профиля
нет: при остановленном Collector ERP и отправка писем продолжают работать.

Dashboard «ERP · состояние приложения» показывает HTTP-ошибки/время ответа,
время запросов к БД, очередь и состояние worker. Предупреждения определены в
`alerts.yml` и видны в Prometheus/Grafana. Внешняя отправка предупреждений
требует отдельной настройки канала уведомления/Alertmanager.

В метрики попадают только счётчики, длительности и технические статусы.
Collector удаляет все события span, включая текст исключений, очищает сообщения
об ошибках, заменяет имена операций и оставляет только разрешённые технические
атрибуты трассировок и метрик. Приложение дополнительно использует шаблоны
маршрутов вместо полных URL и не должно добавлять персональные данные в
названия метрик или значение `http.route`.

Проверка конфигурации:

```sh
docker compose --profile observability config --quiet
docker compose --profile observability run --rm --no-deps --entrypoint /otelcol-contrib otel-collector validate --config=/etc/otelcol-contrib/config.yaml
docker compose --profile observability run --rm --no-deps --entrypoint /bin/promtool prometheus check config /etc/prometheus/prometheus.yml
```
