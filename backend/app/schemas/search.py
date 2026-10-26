from pydantic import BaseModel, Field


class SearchResult(BaseModel):
    id: str
    type: str
    title: str
    subtitle: str
    href: str


class SearchResponse(BaseModel):
    data: list[SearchResult]


class SearchQuery(BaseModel):
    q: str = Field(min_length=2, max_length=100)
