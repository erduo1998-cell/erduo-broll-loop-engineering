# Dual-host E2E fixture contract

`assets/fixtures/e2e-contract.json` supplies two artificial, public-safe runs: one talking-head fixture with a generated control video/audio contract, and one SRT-only faceless fixture. No private footage, transcript, credential, path, or third-party material is included.

Both hosts must execute the same fixture ID and produce the declared 4,000 ms, 100% coverage candidate set. Talking-head preserves the supplied audio; faceless is silent. Native graphics are required so the fixture neither needs Pexels nor a host image-generation capability. Later VAL-002/003 record real paths separately and compare only this public artifact/duration/audio/coverage contract.

For the faceless render receipt, use `scripts/create-e2e-host-receipt.mjs` followed by `scripts/compare-e2e-contract.mjs`. The comparison deliberately accepts only path-free, public fields: fixture ID, current `check` duration, MP4/H.264/yuv420p media metadata, silent-audio policy and visible-frame sample count. It rejects a host-specific file path, internal render text or a pass claim unsupported by the fixture's duration, coverage, resolution and frame-rate contract.
