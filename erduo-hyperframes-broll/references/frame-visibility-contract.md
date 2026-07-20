# Frame visibility gate contract

`frame-visibility-gate.mjs` samples real decoded frames at one frame after the start boundary, the midpoint, and one frame before the end boundary of every artifact. It takes the authoritative duration and rational frame rate, so it never extrapolates from filename or a rounded duration. Sampling invokes FFmpeg for exactly one decoded frame and signal analysis at each time; no temporary frames, source paths, or raw FFmpeg output are persisted.

Fullscreen, faceless and talking-head masters must show a non-flat visible image at every sample. Hard-alpha clips are checked on their extracted Alpha plane: their sampled frame must have both transparent and opaque pixels. Black light passes are permitted to be near black, but must retain a near-black floor and a brighter visible signal. Thus an intended transparent/black layer is not rejected merely for lacking opaque full-frame imagery, while a uniform black, uniform transparent, blank or extraction-failed frame is a hard failure.

The private resolver is only a runtime bridge from stable artifact ID/kind to its local media. The safe receipt contains sample times and numeric statistics, never paths or images.
