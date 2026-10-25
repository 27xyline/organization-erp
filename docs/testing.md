# Тестирование

## Python

Интеграционные тесты работают только с отдельной PostgreSQL-базой `erp_test`.
Создайте её на локальном сервере PostgreSQL и задайте `BACKEND_TEST_DATABASE_URL`
и `BACKEND_DATABASE_URL` с одинаковым адресом этой базы. Например:

```sh
cd backend
export BACKEND_TEST_DATABASE_URL=postgresql+asyncpg://tester:password@localhost:5434/erp_test
export BACKEND_DATABASE_URL="$BACKEND_TEST_DATABASE_URL"
uv run alembic upgrade head
uv run pytest
```

Для тестов без PostgreSQL: `uv run pytest tests/unit tests/architecture tests/contracts`.
Очистка аудита разрешена только в `erp_test`; рабочие базы отвергаются до очистки.

## Frontend

```sh
cd frontend
npm run lint
npm run typecheck
npm test
npm run build
```

## Браузерные сценарии

Создайте отдельную пустую БД `erp_e2e`, примените к ней Alembic из `backend/`.
Из `frontend/` задайте одинаковые `DATABASE_URL` и `E2E_DATABASE_URL`
с адресом этой базы в формате `postgresql://…/erp_e2e`, затем:

```sh
export BACKEND_CSRF_SECRET=$(openssl rand -hex 32)
npm run test:e2e
```

Тесты выполняются последовательно, чтобы не конфликтовать по общим периодам
зарплаты. Они создают синтетические данные и документы в `.test-data/e2e/`.
Для проверки сохранности после перезапуска сначала выполните сценарий полного
цикла, перезапустите приложение и API с той же БД и хранилищем, затем запустите:
`E2E_VERIFY_ONLY=1 npm run test:e2e -- --grep "persistence survives"`.
