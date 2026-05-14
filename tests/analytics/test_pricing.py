"""Tests for analytics.pricing — model pricing data and strategies."""

import json
import time
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch


class TestModelPricing:
    def test_defaults_to_zero(self):
        from clau_decode.analytics.pricing import ModelPricing

        p = ModelPricing()
        assert p.input_per_mtok == Decimal("0")
        assert p.output_per_mtok == Decimal("0")
        assert p.cache_write_per_mtok == Decimal("0")
        assert p.cache_read_per_mtok == Decimal("0")

    def test_cost_for_breakdown_exact(self):
        from clau_decode.analytics.models import TokenBreakdown
        from clau_decode.analytics.pricing import ModelPricing

        p = ModelPricing(
            input_per_mtok=Decimal("3.00"),
            output_per_mtok=Decimal("15.00"),
            cache_write_per_mtok=Decimal("3.75"),
            cache_read_per_mtok=Decimal("0.30"),
        )
        bd = TokenBreakdown(
            input_tokens=1_000_000,
            output_tokens=1_000_000,
            cache_creation_tokens=1_000_000,
            cache_read_tokens=1_000_000,
        )
        cost = p.compute_cost(bd)
        assert cost == Decimal("22.05")  # 3 + 15 + 3.75 + 0.30

    def test_cost_is_zero_for_empty_breakdown(self):
        from clau_decode.analytics.models import TokenBreakdown
        from clau_decode.analytics.pricing import ModelPricing

        p = ModelPricing(
            input_per_mtok=Decimal("3.00"),
            output_per_mtok=Decimal("15.00"),
        )
        cost = p.compute_cost(TokenBreakdown())
        assert cost == Decimal("0")

    def test_cost_scales_correctly_for_small_counts(self):
        from clau_decode.analytics.models import TokenBreakdown
        from clau_decode.analytics.pricing import ModelPricing

        p = ModelPricing(
            input_per_mtok=Decimal("3.00"), output_per_mtok=Decimal("15.00")
        )
        bd = TokenBreakdown(input_tokens=1000, output_tokens=1000)
        cost = p.compute_cost(bd)
        # 1000 tokens = 0.001M tokens; 0.001 * (3 + 15) = 0.018
        assert cost == Decimal("0.018")


class TestHardcodedPricingStrategy:
    def test_knows_sonnet_46(self):
        from clau_decode.analytics.pricing import HardcodedPricingStrategy

        strat = HardcodedPricingStrategy()
        p = strat.get_pricing("claude-sonnet-4-6")
        assert p is not None
        assert p.input_per_mtok == Decimal("3.00")
        assert p.output_per_mtok == Decimal("15.00")

    def test_knows_haiku_45(self):
        from clau_decode.analytics.pricing import HardcodedPricingStrategy

        strat = HardcodedPricingStrategy()
        p = strat.get_pricing("claude-haiku-4-5-20251001")
        assert p is not None
        assert p.input_per_mtok == Decimal("0.80")
        assert p.output_per_mtok == Decimal("4.00")

    def test_knows_opus_47(self):
        from clau_decode.analytics.pricing import HardcodedPricingStrategy

        strat = HardcodedPricingStrategy()
        p = strat.get_pricing("claude-opus-4-7")
        assert p is not None
        assert p.input_per_mtok == Decimal("15.00")
        assert p.output_per_mtok == Decimal("75.00")

    def test_unknown_model_returns_none(self):
        from clau_decode.analytics.pricing import HardcodedPricingStrategy

        strat = HardcodedPricingStrategy()
        assert strat.get_pricing("gpt-4-turbo") is None

    def test_prefix_match_for_versioned_models(self):
        from clau_decode.analytics.pricing import HardcodedPricingStrategy

        strat = HardcodedPricingStrategy()
        p = strat.get_pricing("claude-sonnet-4-6-20250514")
        assert p is not None
        assert p.input_per_mtok == Decimal("3.00")


class TestLiteLLMPricingFetcher:
    async def test_parses_litellm_json_format(self):
        from clau_decode.analytics.pricing import LiteLLMPricingFetcher

        fake_data = {
            "claude-sonnet-4-6": {
                "input_cost_per_token": 0.000003,
                "output_cost_per_token": 0.000015,
                "cache_creation_input_token_cost": 0.00000375,
                "cache_read_input_token_cost": 0.0000003,
            },
            "gpt-4-turbo": {
                "input_cost_per_token": 0.00001,
                "output_cost_per_token": 0.00003,
            },
        }

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.text = json.dumps(fake_data)

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__ = AsyncMock(
                return_value=mock_client
            )
            mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)

            fetcher = LiteLLMPricingFetcher()
            result = await fetcher.fetch()

        assert "claude-sonnet-4-6" in result
        p = result["claude-sonnet-4-6"]
        assert p.input_per_mtok == Decimal("3.0")
        assert p.output_per_mtok == Decimal("15.0")
        assert p.cache_write_per_mtok == Decimal("3.75")
        assert p.cache_read_per_mtok == Decimal("0.3")
        # Non-Claude model excluded
        assert "gpt-4-turbo" not in result

    async def test_fetch_returns_empty_dict_on_http_error(self):
        import httpx as _httpx
        from clau_decode.analytics.pricing import LiteLLMPricingFetcher

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__ = AsyncMock(
                return_value=mock_client
            )
            mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(side_effect=_httpx.RequestError("timeout"))

            fetcher = LiteLLMPricingFetcher()
            result = await fetcher.fetch()

        assert result == {}


class TestCachedPricingStrategy:
    async def test_returns_hardcoded_when_cache_empty(self):
        from clau_decode.analytics.pricing import CachedPricingStrategy

        strat = CachedPricingStrategy()
        p = strat.get_pricing("claude-sonnet-4-6")
        assert p is not None
        assert p.input_per_mtok == Decimal("3.00")

    async def test_live_data_takes_precedence_over_hardcoded(self):
        from clau_decode.analytics.pricing import CachedPricingStrategy, ModelPricing

        strat = CachedPricingStrategy()
        strat._cached_data = {
            "claude-sonnet-4-6": ModelPricing(
                input_per_mtok=Decimal("2.50"),
                output_per_mtok=Decimal("12.50"),
            )
        }
        strat._cache_fetched_at = time.monotonic()
        p = strat.get_pricing("claude-sonnet-4-6")
        assert p is not None
        assert p.input_per_mtok == Decimal("2.50")

    async def test_unknown_model_returns_none(self):
        from clau_decode.analytics.pricing import CachedPricingStrategy

        strat = CachedPricingStrategy()
        assert strat.get_pricing("unknown-model-xyz") is None

    async def test_cache_is_stale_after_ttl(self):
        from clau_decode.analytics.pricing import CachedPricingStrategy

        strat = CachedPricingStrategy(ttl_seconds=0)
        strat._cache_fetched_at = time.monotonic() - 1
        assert strat._is_cache_stale()

    async def test_cache_is_fresh_within_ttl(self):
        from clau_decode.analytics.pricing import CachedPricingStrategy

        strat = CachedPricingStrategy(ttl_seconds=3600)
        strat._cache_fetched_at = time.monotonic()
        assert not strat._is_cache_stale()
