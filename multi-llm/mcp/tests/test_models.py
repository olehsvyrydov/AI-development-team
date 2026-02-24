"""Tests for model registry."""

import pytest

from consult_mcp.models import (
    MODELS,
    DEFAULT_MODELS,
    get_model,
    list_models,
    estimate_cost,
)


class TestModels:
    def test_default_models_exist(self):
        for model_id in DEFAULT_MODELS:
            assert model_id in MODELS, f"Default model {model_id} not in registry"

    def test_each_model_has_required_fields(self):
        for model_id, info in MODELS.items():
            assert "provider" in info, f"{model_id} missing provider"
            assert "context" in info, f"{model_id} missing context"
            assert "cost_input" in info, f"{model_id} missing cost_input"
            assert "cost_output" in info, f"{model_id} missing cost_output"
            assert "strengths" in info, f"{model_id} missing strengths"

    def test_get_model_existing(self):
        model = get_model("openai/gpt-5-2")
        assert model is not None
        assert model["provider"] == "OpenAI"

    def test_get_model_nonexistent(self):
        model = get_model("nonexistent/model")
        assert model is None

    def test_list_models_returns_all(self):
        result = list_models()
        assert len(result) >= len(DEFAULT_MODELS)
        for entry in result:
            assert "model_id" in entry
            assert "provider" in entry
            assert "is_default" in entry

    def test_default_models_flagged(self):
        result = list_models()
        defaults = [m for m in result if m["is_default"]]
        assert len(defaults) == len(DEFAULT_MODELS)

    def test_estimate_cost(self):
        cost = estimate_cost("openai/gpt-5-2", input_tokens=1000, output_tokens=500)
        assert cost > 0
        assert isinstance(cost, float)

    def test_estimate_cost_unknown_model(self):
        cost = estimate_cost("unknown/model", input_tokens=1000, output_tokens=500)
        assert cost == 0.0

    def test_three_default_models(self):
        assert len(DEFAULT_MODELS) == 3
