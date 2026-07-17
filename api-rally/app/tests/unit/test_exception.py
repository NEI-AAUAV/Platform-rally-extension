"""Unit tests for APIException's default-populating constructor."""
from app.exception import APIException, NotFoundException


def test_defaults_status_code_detail_and_headers_when_omitted():
    exc = NotFoundException()
    assert exc.status_code == 404
    assert exc.detail == "Result Not Found"
    assert exc.headers is None


def test_explicit_kwargs_override_class_defaults():
    exc = APIException(status_code=422, detail="Custom", headers={"X-Foo": "bar"})
    assert exc.status_code == 422
    assert exc.detail == "Custom"
    assert exc.headers == {"X-Foo": "bar"}
