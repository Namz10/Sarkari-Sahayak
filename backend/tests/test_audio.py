import io
import wave
import pytest

from app.engine.audio import normalize_audio


def make_dummy_wav(channels: int = 1, rate: int = 16000, duration_s: float = 1.0) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        num_samples = int(rate * duration_s * channels)
        w.writeframes(b"\x00\x00" * num_samples)
    return buf.getvalue()


def test_normalize_valid_16k_mono_wav():
    raw = make_dummy_wav(channels=1, rate=16000, duration_s=1.5)
    wav_out, dur = normalize_audio(raw)
    assert len(wav_out) > 44
    assert dur == pytest.approx(1.5, abs=0.1)


def test_normalize_stereo_44k_wav_resamples_to_16k_mono():
    raw = make_dummy_wav(channels=2, rate=44100, duration_s=1.0)
    wav_out, dur = normalize_audio(raw)
    # Check output wave properties
    with wave.open(io.BytesIO(wav_out), "rb") as w:
        assert w.getnchannels() == 1
        assert w.getframerate() == 16000
        assert w.getsampwidth() == 2
    assert dur == pytest.approx(1.0, abs=0.1)


def test_normalize_rejects_empty_or_corrupt_data():
    with pytest.raises(ValueError):
        normalize_audio(b"")

    with pytest.raises(ValueError):
        normalize_audio(b"random garbage bytes that are not audio")

