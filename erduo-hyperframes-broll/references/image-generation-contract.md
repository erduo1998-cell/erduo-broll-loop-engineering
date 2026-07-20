# Host image-generation contract

Image generation is optional. A host adapter explicitly declares `{available, adapter_id, image_formats}`; absent, malformed, or unavailable declarations select `hyperframes-native` fallback without error. The public Skill never requires a Codex-only API.

Build a prompt from a validated brief’s visible subjects/action/result, selected design’s unprotected layers, target dimensions, and explicit prohibitions. Reject prompts containing paths, credentials, literal subtitle/claim fields, unverifiable people/products/interfaces/data, or protected user-design layers. The adapter writes a local image; the pipeline copies it into an artifact cache, probes it, and records only cache key plus verified media metadata. No adapter path enters state or public output.
