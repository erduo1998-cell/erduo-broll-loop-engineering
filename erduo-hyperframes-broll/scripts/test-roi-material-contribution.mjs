import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fingerprintArtifactValue } from './artifact-manifest.mjs';
import {
  buildMaterialContributionReceipt,
  parseNormalizedPpm,
  RoiContributionError,
  verifyMaterialContribution,
} from './roi-material-contribution.mjs';

const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');

function p6(width, height, pixels) {
  return Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`, 'ascii'), Buffer.from(pixels)]);
}

function p3(width, height, pixels) {
  return Buffer.from(`P3\n# normalized fixture\n${width} ${height}\n255\n${[...pixels].join(' ')}\n`, 'ascii');
}

function record(artifactId, bytes) {
  return { artifact_id: artifactId, sha256: hashBytes(bytes), size_bytes: bytes.length };
}

function fixture({ format = 'P6', inside = true, outside = false, samePixels = false } = {}) {
  const width = 4;
  const height = 3;
  const disabledPixels = Buffer.alloc(width * height * 3);
  const enabledPixels = Buffer.from(disabledPixels);
  if (!samePixels && inside) enabledPixels[(1 * width + 1) * 3] = 180;
  if (!samePixels && outside) enabledPixels[0] = 90;
  const diffPixels = Buffer.alloc(enabledPixels.length);
  for (let index = 0; index < enabledPixels.length; index += 1) {
    diffPixels[index] = Math.abs(enabledPixels[index] - disabledPixels[index]);
  }
  const encode = format === 'P6' ? p6 : p3;
  const enabled = encode(width, height, enabledPixels);
  const disabled = encode(width, height, disabledPixels);
  const diff = p6(width, height, diffPixels);
  const core = {
    schema_version: 1,
    pipeline_contract_version: 2,
    status: 'verified',
    producer: 'master-build-deterministic-roi-gate-v1',
    verification_mode: 'byte-resolved-pixel-ablation',
    capture_frame: 22,
    target_raster: { width, height },
    result_roi: { x: 1, y: 1, width: 2, height: 1 },
    capture_format: format,
    enabled_frame: record('enabled-S001', enabled),
    disabled_frame: record('disabled-S001', disabled),
    roi_diff: record('diff-S001', diff),
    roi_pixel_count: 2,
    changed_pixel_count: inside && !samePixels ? 1 : 0,
  };
  const receipt = { ...core, gate_receipt_sha256: fingerprintArtifactValue(core) };
  return {
    receipt,
    artifacts: new Map([
      [receipt.enabled_frame.artifact_id, enabled],
      [receipt.disabled_frame.artifact_id, disabled],
      [receipt.roi_diff.artifact_id, diff],
    ]),
  };
}

async function expectCode(run, code) {
  assert.throws(
    run,
    (error) => error instanceof RoiContributionError && error.code === code,
  );
}

test('parses real normalized P6 and P3 bytes without pretending to parse PNG', () => {
  const pixels = Buffer.from([0, 1, 2, 3, 4, 5]);
  assert.deepEqual(parseNormalizedPpm(p6(2, 1, pixels)).pixels, pixels);
  assert.deepEqual(parseNormalizedPpm(p3(2, 1, pixels)).pixels, pixels);
  expectCode(() => parseNormalizedPpm(Buffer.from('\u0089PNG\r\n', 'binary')), 'ppm_size_invalid');
});

test('verifies positive in-ROI pixel contribution for P6 and P3 captures', () => {
  for (const format of ['P6', 'P3']) {
    const value = fixture({ format, inside: true, outside: true });
    const receipt = verifyMaterialContribution(value.receipt, value);
    assert.equal(receipt.changed_pixel_count, 1);
    assert.equal(receipt.roi_pixel_count, 2);
    assert.equal(receipt.changed_outside_pixel_count, 1);
  }
});

test('builds the deterministic receipt and full-raster P6 diff from actual captures', () => {
  const value = fixture({ format: 'P3', inside: true, outside: true });
  const built = buildMaterialContributionReceipt({
    capture_frame: 22,
    target_raster: value.receipt.target_raster,
    result_roi: value.receipt.result_roi,
    enabled_frame: {
      artifact_id: value.receipt.enabled_frame.artifact_id,
      bytes: value.artifacts.get(value.receipt.enabled_frame.artifact_id),
    },
    disabled_frame: {
      artifact_id: value.receipt.disabled_frame.artifact_id,
      bytes: value.artifacts.get(value.receipt.disabled_frame.artifact_id),
    },
    roi_diff_artifact_id: value.receipt.roi_diff.artifact_id,
  });
  assert.equal(built.receipt.capture_format, 'P3');
  assert.equal(built.receipt.changed_pixel_count, 1);
  assert.equal(built.changed_outside_pixel_count, 1);
  assert.equal(parseNormalizedPpm(built.roi_diff_bytes).format, 'P6');
  assert.equal(hashBytes(built.roi_diff_bytes), built.receipt.roi_diff.sha256);
});

test('rejects missing or tampered actual bytes', () => {
  const missing = fixture();
  missing.artifacts.delete('enabled-S001');
  expectCode(() => verifyMaterialContribution(missing.receipt, missing), 'roi_artifact_bytes_missing');

  const tampered = fixture();
  tampered.artifacts.set('enabled-S001', Buffer.concat([tampered.artifacts.get('enabled-S001'), Buffer.from([0])]));
  expectCode(() => verifyMaterialContribution(tampered.receipt, tampered), 'roi_artifact_hash_mismatch');
});

test('rejects equal resolved pixels even when P3 metadata bytes and hashes differ', () => {
  const value = fixture({ format: 'P3', samePixels: true });
  const alternate = Buffer.from(value.artifacts.get('enabled-S001').toString('ascii').replace('P3\n', 'P3\n# metadata-only difference\n'), 'ascii');
  value.artifacts.set('enabled-S001', alternate);
  value.receipt.enabled_frame = record('enabled-S001', alternate);
  const { gate_receipt_sha256: ignored, ...core } = value.receipt;
  value.receipt.gate_receipt_sha256 = fingerprintArtifactValue(core);
  expectCode(() => verifyMaterialContribution(value.receipt, value), 'zero_pixel_contribution');
});

test('rejects changes that occur only outside the frozen ROI', () => {
  const value = fixture({ inside: false, outside: true });
  expectCode(() => verifyMaterialContribution(value.receipt, value), 'change_outside_roi_only');
});

test('rejects wrong raster, wrong ROI counts, and a diff artifact not derived from frames', () => {
  const raster = fixture();
  raster.receipt.target_raster.width = 5;
  const { gate_receipt_sha256: ignoredRaster, ...rasterCore } = raster.receipt;
  raster.receipt.gate_receipt_sha256 = fingerprintArtifactValue(rasterCore);
  expectCode(() => verifyMaterialContribution(raster.receipt, raster), 'capture_raster_mismatch');

  const roi = fixture();
  roi.receipt.roi_pixel_count = 3;
  const { gate_receipt_sha256: ignoredRoi, ...roiCore } = roi.receipt;
  roi.receipt.gate_receipt_sha256 = fingerprintArtifactValue(roiCore);
  expectCode(() => verifyMaterialContribution(roi.receipt, roi), 'roi_count_mismatch');

  const diff = fixture();
  const corruptDiff = Buffer.from(diff.artifacts.get('diff-S001'));
  corruptDiff[corruptDiff.length - 1] = 1;
  diff.artifacts.set('diff-S001', corruptDiff);
  diff.receipt.roi_diff = record('diff-S001', corruptDiff);
  const { gate_receipt_sha256: ignoredDiff, ...diffCore } = diff.receipt;
  diff.receipt.gate_receipt_sha256 = fingerprintArtifactValue(diffCore);
  expectCode(() => verifyMaterialContribution(diff.receipt, diff), 'roi_diff_pixels_mismatch');
});
