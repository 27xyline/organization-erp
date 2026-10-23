from __future__ import annotations

import ast
from pathlib import Path

import pytest

FORBIDDEN_ROOTS = {"fastapi", "pydantic", "sqlalchemy", "asyncpg"}


def find_forbidden_imports(app: Path) -> list[str]:
    """Detect forbidden imports transitively reachable from domain and core/context."""
    modules: dict[str, tuple[Path, set[str]]] = {}
    for source in app.rglob("*.py"):
        relative = source.relative_to(app).with_suffix("")
        module = ".".join(relative.parts)
        if module.endswith(".__init__"):
            module = module[: -len(".__init__")]
        imports: set[str] = set()
        tree = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imported = alias.name
                    if imported.startswith("app."):
                        imported = imported.removeprefix("app.")
                    imports.add(imported)
            elif isinstance(node, ast.ImportFrom):
                base_parts = module.split(".")
                if node.level:
                    package_parts = base_parts[:-1] if source.name != "__init__.py" else base_parts
                    keep = max(0, len(package_parts) - node.level + 1)
                    base = package_parts[:keep]
                    if node.module:
                        base.extend(node.module.split("."))
                    imported = ".".join(base)
                else:
                    imported = node.module or ""
                if imported == "app":
                    imported = ""
                elif imported.startswith("app."):
                    imported = imported.removeprefix("app.")
                if imported:
                    imports.add(imported)
                if node.module:
                    for alias in node.names:
                        submodule = f"{imported}.{alias.name}" if imported else alias.name
                        submodule_path = app / Path(*submodule.split("."))
                        if (
                            submodule_path.with_suffix(".py").is_file()
                            or (submodule_path / "__init__.py").is_file()
                        ):
                            imports.add(submodule)
        modules[module] = (source, imports)

    violations: set[str] = set()
    visited: set[str] = set()

    def visit(module: str, origin: str) -> None:
        key = (module, origin)
        if key in visited:
            return
        visited.add(key)
        source, imports = modules.get(module, (app / (module.replace(".", "/") + ".py"), set()))
        for imported in imports:
            root = imported.split(".", maxsplit=1)[0]
            if (
                root in FORBIDDEN_ROOTS
                or (
                    origin.startswith(("domain", "services"))
                    and root in {"models", "repositories", "integrations", "db"}
                )
                or (origin.startswith("domain") and root == "services")
            ):
                violations.add(f"{origin}: {source}: forbidden dependency {imported}")
                continue
            for candidate in sorted(modules, key=len, reverse=True):
                if imported == candidate or imported.startswith(candidate + "."):
                    visit(candidate, origin)
                    break

    for source_module in modules:
        if (
            source_module == "domain"
            or source_module.startswith("domain.")
            or source_module == "core.context"
            or source_module == "services"
            or source_module.startswith("services.")
        ):
            visit(source_module, source_module)
    return sorted(violations)


BACKEND = Path(__file__).parents[2]
APP = BACKEND / "app"


def test_domain_and_core_context_do_not_depend_on_framework_or_infrastructure() -> None:
    violations = find_forbidden_imports(APP)

    assert violations == []


def test_import_checker_rejects_transitive_forbidden_import(tmp_path: Path) -> None:
    app = tmp_path / "app"
    (app / "core").mkdir(parents=True)
    (app / "domain").mkdir()
    (app / "core" / "context.py").write_text("from fastapi import Request\n", encoding="utf-8")
    (app / "domain" / "errors.py").write_text(
        "from app.core.context import RequestContext\n", encoding="utf-8"
    )

    violations = find_forbidden_imports(app)

    assert any("fastapi" in violation for violation in violations)
    assert any("domain.errors" in violation for violation in violations)


def test_import_checker_resolves_relative_imports(tmp_path: Path) -> None:
    app = tmp_path / "app"
    (app / "domain").mkdir(parents=True)
    (app / "domain" / "__init__.py").write_text("", encoding="utf-8")
    (app / "domain" / "rules.py").write_text("from ..core import context\n", encoding="utf-8")
    (app / "core.py").write_text("import sqlalchemy\n", encoding="utf-8")

    violations = find_forbidden_imports(app)

    assert any("sqlalchemy" in violation for violation in violations)
    assert any("domain.rules" in violation for violation in violations)


def test_domain_ports_cannot_depend_on_application_dtos(tmp_path: Path) -> None:
    app = tmp_path / "app"
    (app / "domain" / "ports").mkdir(parents=True)
    (app / "services" / "dto").mkdir(parents=True)
    (app / "services" / "dto" / "documents.py").write_text(
        "from dataclasses import dataclass\n", encoding="utf-8"
    )
    (app / "domain" / "ports" / "documents.py").write_text(
        "from app.services.dto.documents import DocumentView\n", encoding="utf-8"
    )
    assert any("services.dto.documents" in item for item in find_forbidden_imports(app))


@pytest.mark.parametrize(
    "domain_import",
    [
        "from app import core",
        "from app.core import *",
        "from app.core import config as settings_config",
        "import app.core.config as settings_config",
    ],
)
def test_import_checker_resolves_package_imports(tmp_path: Path, domain_import: str) -> None:
    app = tmp_path / "app"
    (app / "core").mkdir(parents=True)
    (app / "domain").mkdir()
    (app / "core" / "__init__.py").write_text("from .config import Settings\n", encoding="utf-8")
    (app / "core" / "config.py").write_text("import sqlalchemy\n", encoding="utf-8")
    (app / "domain" / "rules.py").write_text(f"{domain_import}\n", encoding="utf-8")

    violations = find_forbidden_imports(app)

    assert any("sqlalchemy" in violation for violation in violations)
    assert any("domain.rules" in violation for violation in violations)
