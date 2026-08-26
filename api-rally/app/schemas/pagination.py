from pydantic import BaseModel


class Page[ItemT: BaseModel](BaseModel):
    """Generic paginated envelope: one page of `items` out of `total`
    matches, plus the `page`/`page_size` that produced it.

    Used by listing endpoints whose underlying set can grow unbounded (e.g.
    every rally-staff/rally-guide user ever mirrored locally) so a client
    never has to render the whole thing at once.
    """

    items: list[ItemT]
    total: int
    page: int
    page_size: int
