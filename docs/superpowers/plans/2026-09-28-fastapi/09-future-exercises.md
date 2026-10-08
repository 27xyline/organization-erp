# Самостоятельные расширения после базового переноса

Эти технологии не входят в обязательную миграцию. Пользователь хочет добавить их сам. Не устанавливать пакеты, не создавать сервисы Compose и не реализовывать заготовки «на будущее» в процессе этапов 00–14.

Перед каждым расширением сформулировать реальную задачу, измерить исходное поведение и выбрать один небольшой сценарий. API frontend должен продолжать работать без необъявленного изменения контрактов.

## Redis: кэш выбранного отчёта

Исходная точка — медленный read-only report из 12, с latency/SQL measurements. Добавить redis-py integration, bounded pool/timeouts, cache-aside и TTL. Для целого неизменяемого JSON snapshot подходит String; независимо изменяемые поля — другой access pattern.

Ключ включает endpoint/schema version, actor/scope/filter hash и revision. Авторизация проверяется до cache read. После изменения данных/прав нужна явная стратегия invalidation; отказ Redis должен переводить запрос на PostgreSQL. Не кэшировать решение «можно ли закрыть период».

Задание: доказать tests, что два пользователя с разными scopes не получают общий cached report, Redis outage не ломает endpoint, а измеренное количество SQL/latency уменьшается. Рассказать, какой stale window допустим продукту.

## Celery: тяжёлый экспорт

Исходная точка — синхронный экспорт из 12. Добавить отдельный job API: создать job → получить status → скачать готовый файл. Это осознанное расширение API, а не скрытая смена synchronous response на job ID.

Очередь не должна быть единственным хранилищем факта задания: PostgreSQL job state, idempotency, lease/recovery, checks доступа при запуске и скачивании. В задачу передаётся job ID. Рабочий процесс имеет собственный session lifecycle; API AsyncSession/engine не передаётся в prefork Celery. Выбрать и объяснить sync worker/async boundary отдельно.

Если Redis используется как broker, отделить его от evictable cache; изучить redelivery/visibility timeout и ack policy. Outbox доставки писем уже работает и не обязан переноситься в Celery.

Задание: crash worker в середине export → восстановить job → получить один согласованный результат; сменить права пользователя до download → отказать в доступе. Проверить не только eager-mode Celery, но реальный broker+worker.

## S3/MinIO: внешнее хранилище документов

Исходная точка — StoragePort и copy volume из 08. Реализовать новый adapter без изменения document rules/service API. Учесть multipart, credentials, size/hash, retry, orphan cleanup и access к download.

Задание: один service test suite проходит с local и object storage; существующие document links/versions мигрированы и hash совпадает. Публичный bucket не заменяет авторизацию.

## RabbitMQ или Kafka: только после вопроса о задаче

RabbitMQ можно изучить как альтернативный broker для конкретных jobs; Kafka — как журнал событий с replay/consumer groups для отдельного аналитического потребителя. Не добавлять обе системы ради списка технологий.

Задание: определить delivery semantics, consumer idempotency, retry/DLQ и измерить сценарий. Перенос существующего outbox не требует брокера; consumer не должен терять событие при rollback бизнес-транзакции.

## Дополнительная эксплуатация

Rate limiting, DB query tuning, object storage backup, отдельный admin UI, нагрузочные тесты и deployment improvements выбираются по одному после основного переноса. Сначала написать причину и критерий проверки, затем реализацию.

Для каждой самостоятельной работы создать небольшую заметку: проблема, выбранное решение, альтернативы, схема запроса, tests, измерение до/после, failure behavior. Это материал для объяснения проекта на собеседовании.
