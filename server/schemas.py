"""Request models for the Q-Relay API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class NoiseIn(BaseModel):
    level: float | None = Field(None, ge=0, le=1, description="one-knob slider value; overrides the fields below")
    p1: float = Field(0.0, ge=0, le=1)
    p2: float = Field(0.0, ge=0, le=1)
    t1_us: float = Field(0.0, ge=0)
    t2_us: float = Field(0.0, ge=0)
    readout: float = Field(0.0, ge=0, le=0.5)


class QrngRequest(BaseModel):
    n_bits: int = Field(100_000, ge=1_000, le=1_000_000)
    mode: Literal["sim", "hw_cached", "emulated"] = "sim"
    mitigate: Literal["none", "vn", "xor", "toeplitz"] = "none"
    seed: int | None = None


class TeleportRequest(BaseModel):
    theta: float | None = Field(None, ge=0, le=3.1416)
    phi: float | None = None
    random: bool = False
    noise: NoiseIn = NoiseIn()
    variant: Literal["dynamic", "deferred"] = "dynamic"
    shots: int = Field(1024, ge=64, le=4096)


class DJRequest(BaseModel):
    n: int = Field(3, ge=1, le=8)
    oracle: str = "parity"
    truth_table: list[int] | None = None
    noise: NoiseIn = NoiseIn()
    shots: int = Field(1024, ge=64, le=4096)
    distributed: bool = False
    seed: int = 0


class GameNew(BaseModel):
    n: int = Field(4, ge=2, le=6)


class GameQuery(BaseModel):
    game_id: str
    x: int = Field(ge=0)


class GameQuantum(BaseModel):
    game_id: str
    noise: NoiseIn = NoiseIn()
