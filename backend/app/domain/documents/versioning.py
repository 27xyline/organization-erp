"Существующая матрица переходов статусов документа."

TRANSITIONS = {
    "DRAFT": ("IN_REVIEW",),
    "IN_REVIEW": ("DRAFT", "APPROVED"),
    "APPROVED": ("IN_REVIEW", "SIGNED"),
    "SIGNED": (),
    "ARCHIVED": (),
}


def can_transition(source: str, target: str) -> bool:
    return target in TRANSITIONS.get(source, ())
