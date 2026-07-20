# HyperFrames template time contract

The normalized coverage report is the only master timeline source. Each window produces one master clip at its SRT-global `start_ms / 1000` with `duration_ms / 1000`, and one per-shot composition with local start zero and the same duration. The root master begins at zero and lasts until `timeline.end_ms / 1000`; this deliberately preserves a non-zero first SRT timestamp instead of shifting clips or truncating the final one. Windows must be contiguous across the SRT coverage interval. The mapping contains no subtitle text, paths, or media URLs.
