"""Audio processing and normalization for Saaras STT (SPEC section 3.1 & 5.1).

Uses PyAV to decode and resample any audio container (WebM/Opus, MP4/AAC, OGG, MP3, WAV)
to 16kHz mono 16-bit PCM WAV. This ensures 100% compatibility across Chrome, Safari iOS,
and Android microphones without requiring external ffmpeg binaries.
"""
from __future__ import annotations

import io
import wave
from typing import Tuple

TARGET_SAMPLE_RATE = 16000
TARGET_CHANNELS = 1
BYTES_PER_SAMPLE = 2  # 16-bit PCM


def normalize_audio(data: bytes) -> Tuple[bytes, float]:
    """Transcode and normalize audio to 16kHz mono 16-bit PCM WAV.

    Returns:
        (wav_bytes, duration_seconds)

    Raises:
        ValueError: if the audio is corrupt or has no audio streams.
    """
    if not data or len(data) < 12:
        raise ValueError("Audio data is empty or too short.")

    # Fast path: If it's already a clean standard 16kHz mono WAV, inspect directly
    if data.startswith(b"RIFF") and data[8:12] == b"WAVE":
        try:
            with wave.open(io.BytesIO(data), "rb") as w:
                channels = w.getnchannels()
                rate = w.getframerate()
                sampwidth = w.getsampwidth()
                frames = w.getnframes()
                if channels == 1 and rate == TARGET_SAMPLE_RATE and sampwidth == BYTES_PER_SAMPLE:
                    duration_s = frames / float(rate)
                    return data, round(duration_s, 2)
        except Exception:  # noqa: BLE001
            # If standard wave reader fails, fallback to PyAV resampler
            pass

    # Universal path: use PyAV
    try:
        import av
    except ImportError as e:
        raise RuntimeError("PyAV is required for universal audio normalization.") from e

    input_buf = io.BytesIO(data)
    try:
        container = av.open(input_buf)
    except Exception as exc:
        raise ValueError(f"Could not open audio container: {exc}") from exc

    audio_stream = next((s for s in container.streams if s.type == "audio"), None)
    if not audio_stream:
        raise ValueError("No audio track found in the uploaded file.")

    resampler = av.AudioResampler(
        format="s16",
        layout="mono",
        rate=TARGET_SAMPLE_RATE,
    )

    out_buf = io.BytesIO()
    with wave.open(out_buf, "wb") as wav_out:
        wav_out.setnchannels(TARGET_CHANNELS)
        wav_out.setsampwidth(BYTES_PER_SAMPLE)
        wav_out.setframerate(TARGET_SAMPLE_RATE)

        total_samples = 0
        for frame in container.decode(audio_stream):
            for resampled_frame in resampler.resample(frame):
                pcm_bytes = bytes(resampled_frame.planes[0])
                wav_out.writeframes(pcm_bytes)
                total_samples += len(pcm_bytes) // BYTES_PER_SAMPLE

    duration_s = total_samples / float(TARGET_SAMPLE_RATE)
    return out_buf.getvalue(), round(duration_s, 2)

