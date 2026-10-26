# Запуск ERP на сервере

Пример рассчитан на отдельный Linux-сервер с systemd. Приложение работает
в Docker Compose, Caddy установлен на сервере и принимает HTTPS-запросы.
Единственная внешняя точка входа в приложение — веб-интерфейс через Caddy;
Next.js сам передаёт запросы API в FastAPI по внутренней сети Compose.

## Подготовка

Нужны Git, Docker Engine с Compose, OpenSSL и
[Caddy, установленный как системный сервис](https://caddyserver.com/docs/install).
Направьте DNS-записи своего домена на сервер. Порты `80` и `443` должны быть
доступны извне для Caddy. Для доступа администратора к серверу оставьте SSH.
PostgreSQL, FastAPI и внутренний порт веб-интерфейса публикуются на `127.0.0.1`.

Скачайте проект:

```sh
git clone https://github.com/27xyline/organization-erp.git
cd organization-erp
cp .env.example .env
chmod 600 .env
```

Сгенерируйте два разных значения: пароль PostgreSQL и секрет CSRF:

```sh
openssl rand -hex 24
openssl rand -hex 32
```

В `.env` замените настройки следующими, подставив результаты генерации
и свой домен вместо `erp.example.com`:

```dotenv
POSTGRES_USER=organization_erp_app
POSTGRES_PASSWORD=REPLACE_WITH_GENERATED_DATABASE_PASSWORD
POSTGRES_DB=organization_erp
POSTGRES_PORT=5434
BACKEND_DATABASE_URL=postgresql+asyncpg://organization_erp_app:REPLACE_WITH_GENERATED_DATABASE_PASSWORD@127.0.0.1:5434/organization_erp

BACKEND_ENVIRONMENT=production
BACKEND_CSRF_SECRET=REPLACE_WITH_GENERATED_CSRF_SECRET
BACKEND_PUBLIC_ORIGIN=https://erp.example.com
NEXT_PUBLIC_APP_URL=https://erp.example.com
BACKEND_PORT=8000

APP_BIND_ADDRESS=127.0.0.1
APP_PORT=3001
BACKEND_OTEL_ENABLED=false
```

Пароль в `POSTGRES_PASSWORD` и `BACKEND_DATABASE_URL` должен совпадать.
Сгенерированный hex-пароль подходит для URL без дополнительного кодирования.
Контейнеры формируют подключение к БД из `POSTGRES_*`; `BACKEND_DATABASE_URL`
нужен для административных команд Python на хосте.

Оба публичных URL должны содержать один и тот же адрес с `https://`, без пути.
`BACKEND_PUBLIC_ORIGIN` используется для проверки источника запросов,
`NEXT_PUBLIC_APP_URL` — в том числе для ссылок в QR-кодах. В production
сессионные cookie получают флаг Secure, поэтому входите через HTTPS.

Эта инструкция предназначена для новой установки с пустыми volumes.
Переменные `POSTGRES_*` инициализируют базу при первом запуске: изменение
пароля в `.env` не меняет пароль в уже существующей PostgreSQL.

## Приложение и HTTPS

Запустите сервисы из корня проекта:

```sh
docker compose config --quiet
docker compose up --build -d --wait --wait-timeout 180
docker compose ps -a
curl --fail http://127.0.0.1:3001/api/health/ready
```

Compose сначала применяет миграции через сервис `migrate`, затем запускает
API, веб-интерфейс и worker. У `migrate` нормальное состояние — `Exited (0)`.
При ошибке посмотрите `docker compose logs --tail=100 migrate backend app`.

Скопируйте пример [Caddyfile](Caddyfile) в `/etc/caddy/Caddyfile` и замените
`erp.example.com` своим доменом. Если изменили `APP_PORT`, укажите тот же порт
в `reverse_proxy`. Адрес `127.0.0.1` в этом примере относится к серверу,
поэтому Caddy запускается как системный сервис на хосте.

```sh
sudo cp ops/deployment/Caddyfile /etc/caddy/Caddyfile
sudoedit /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy
curl --fail https://erp.example.com/api/health/ready
```

В последней команде подставьте свой домен. Caddy автоматически получает
и продлевает TLS-сертификат и перенаправляет HTTP на HTTPS при выполнении
[условий автоматического HTTPS](https://caddyserver.com/docs/automatic-https).

Создайте администратора:

```sh
docker compose exec backend python -m app.scripts.create_admin
```

Команда запросит пароль, логин будет `admin`. Откройте свой домен в браузере
и выполните [шаги первого входа](../../README.md#первый-вход-и-начало-работы).

## Обновление

Обновление выполняется с остановкой приложения. Перед обновлением сохраните
резервную копию PostgreSQL и файлов документов: новая версия может применять
миграции, после которых возврата только к старому коду будет недостаточно.

Из корня проекта:

```sh
git pull --ff-only
docker compose build
docker compose down
docker compose up -d --wait --wait-timeout 180
docker compose ps -a
curl --fail https://erp.example.com/api/health/ready
```

Подставьте свой домен в последней команде. Сборка выполняется до остановки
сервисов; данные сохраняются в тех же volumes. При изменении `.env`
повторный `up` пересоздаёт сервисы с новыми настройками.

## Мониторинг

При необходимости подключите [профиль observability](../observability/README.md).
Для отправки Python-телеметрии установите `BACKEND_OTEL_ENABLED=true` и запустите
`docker compose --profile observability up -d --wait`.
Grafana и Prometheus доступны с самого сервера; для удалённого просмотра
можно использовать SSH-туннель.

## Резервные копии

Перед обновлениями и регулярно в окно обслуживания создавайте копию по
[инструкции резервного копирования](../backup/README.md). Она включает БД
и документы, кратко останавливает запись и возвращает сервисы в работу.
Проверяйте восстановление в отдельном проекте и храните копию вне сервера.
