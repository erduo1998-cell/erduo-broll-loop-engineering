import { createHash } from 'node:crypto';
import { fingerprintArtifactValue } from './artifact-manifest.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const ARTIFACT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const MAX_PPM_BYTES = 128 * 1024 * 1024;

export class RoiContributionError extends Error {
  constructor(code, message, field) {
    super(message);
    this.name = 'RoiContributionError';
    this.code = code;
    if (field) this.field = field;
  }
}

const fail = (code, message, field) => {
  throw new RoiContributionError(code, message, field);
};

const exact = (value, fields, code = 'roi_receipt_invalid', field = '$') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) {
    fail(code, 'ROI contribution record has an invalid shape.', field);
  }
};

const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');

function asBytes(value, field) {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    fail('resolved_frame_bytes_required', 'ROI contribution validation requires actual frame bytes.', field);
  }
  const bytes = Buffer.from(value);
  if (bytes.length < 8 || bytes.length > MAX_PPM_BYTES) {
    fail('ppm_size_invalid', 'Resolved PPM bytes have an invalid size.', field);
  }
  return bytes;
}

function skipSpaceAndComments(bytes, state) {
  while (state.offset < bytes.length) {
    const byte = bytes[state.offset];
    if (byte === 35) {
      while (state.offset < bytes.length && bytes[state.offset] !== 10 && bytes[state.offset] !== 13) state.offset += 1;
      continue;
    }
    if (byte === 9 || byte === 10 || byte === 13 || byte === 32) {
      state.offset += 1;
      continue;
    }
    break;
  }
}

function readToken(bytes, state, field) {
  skipSpaceAndComments(bytes, state);
  const start = state.offset;
  while (state.offset < bytes.length) {
    const byte = bytes[state.offset];
    if (byte === 35 || byte === 9 || byte === 10 || byte === 13 || byte === 32) break;
    state.offset += 1;
  }
  if (state.offset === start) fail('ppm_header_invalid', 'PPM header token is missing.', field);
  return bytes.subarray(start, state.offset).toString('ascii');
}

function positiveIntegerToken(token, field) {
  if (!/^[1-9][0-9]*$/u.test(token)) fail('ppm_header_invalid', 'PPM dimensions must be positive decimal integers.', field);
  const value = Number(token);
  if (!Number.isSafeInteger(value)) fail('ppm_header_invalid', 'PPM dimension exceeds safe integer range.', field);
  return value;
}

export function parseNormalizedPpm(value, field = '$frame') {
  const bytes = asBytes(value, field);
  const state = { offset: 0 };
  const format = readToken(bytes, state, field);
  if (format !== 'P6' && format !== 'P3') {
    fail('unsupported_normalized_capture', 'Normalized captures must be P6 or P3 PPM, not a filename or unparsed PNG.', field);
  }
  const width = positiveIntegerToken(readToken(bytes, state, field), field);
  const height = positiveIntegerToken(readToken(bytes, state, field), field);
  const maxValue = positiveIntegerToken(readToken(bytes, state, field), field);
  if (maxValue !== 255) fail('ppm_max_value_invalid', 'Normalized captures must use 8-bit RGB with max value 255.', field);
  const sampleCount = width * height * 3;
  if (!Number.isSafeInteger(sampleCount) || sampleCount < 3 || sampleCount > MAX_PPM_BYTES) {
    fail('ppm_raster_invalid', 'PPM raster is too large for deterministic validation.', field);
  }

  let pixels;
  if (format === 'P6') {
    if (state.offset >= bytes.length || ![9, 10, 13, 32].includes(bytes[state.offset])) {
      fail('ppm_header_invalid', 'P6 header must end with one whitespace separator.', field);
    }
    state.offset += 1;
    pixels = bytes.subarray(state.offset);
    if (pixels.length !== sampleCount) fail('ppm_pixel_count_invalid', 'P6 pixel bytes do not match the declared raster.', field);
    pixels = Buffer.from(pixels);
  } else {
    const values = [];
    while (true) {
      skipSpaceAndComments(bytes, state);
      if (state.offset >= bytes.length) break;
      const token = readToken(bytes, state, field);
      if (!/^(?:0|[1-9][0-9]{0,2})$/u.test(token)) fail('ppm_sample_invalid', 'P3 samples must be decimal bytes.', field);
      const sample = Number(token);
      if (sample > 255) fail('ppm_sample_invalid', 'P3 samples must be in 0..255.', field);
      values.push(sample);
      if (values.length > sampleCount) fail('ppm_pixel_count_invalid', 'P3 has more samples than its declared raster.', field);
    }
    if (values.length !== sampleCount) fail('ppm_pixel_count_invalid', 'P3 sample count does not match the declared raster.', field);
    pixels = Buffer.from(values);
  }
  return { format, width, height, max_value: maxValue, pixels, bytes, sha256: hashBytes(bytes) };
}

function validateRaster(value, field) {
  exact(value, ['width', 'height'], 'roi_receipt_invalid', field);
  if (!Number.isSafeInteger(value.width) || value.width < 1
    || !Number.isSafeInteger(value.height) || value.height < 1) {
    fail('roi_raster_invalid', 'Target raster is invalid.', field);
  }
}

function validateBbox(value, raster, field) {
  exact(value, ['x', 'y', 'width', 'height'], 'roi_receipt_invalid', field);
  if (!Number.isSafeInteger(value.x) || value.x < 0
    || !Number.isSafeInteger(value.y) || value.y < 0
    || !Number.isSafeInteger(value.width) || value.width < 1
    || !Number.isSafeInteger(value.height) || value.height < 1
    || value.x + value.width > raster.width || value.y + value.height > raster.height) {
    fail('roi_outside_raster', 'Result ROI must be a positive rectangle inside the target raster.', field);
  }
}

function validateArtifactRecord(value, field) {
  exact(value, ['artifact_id', 'sha256', 'size_bytes'], 'roi_receipt_invalid', field);
  if (!ARTIFACT_ID.test(value.artifact_id ?? '') || !SHA256.test(value.sha256 ?? '')
    || !Number.isSafeInteger(value.size_bytes) || value.size_bytes < 1) {
    fail('roi_artifact_record_invalid', 'ROI evidence artifact record is invalid.', field);
  }
}

function resolveArtifact(record, artifacts, field) {
  validateArtifactRecord(record, field);
  if (!(artifacts instanceof Map) || !artifacts.has(record.artifact_id)) {
    fail('roi_artifact_bytes_missing', 'Declared ROI evidence bytes are missing.', field);
  }
  const bytes = asBytes(artifacts.get(record.artifact_id), field);
  if (bytes.length !== record.size_bytes || hashBytes(bytes) !== record.sha256) {
    fail('roi_artifact_hash_mismatch', 'Resolved ROI evidence bytes do not match their record.', field);
  }
  return bytes;
}

function samePixels(a, b) {
  return a.length === b.length && a.equals(b);
}

function computeAbsoluteDiff(enabled, disabled, raster, roi) {
  const expectedDiff = Buffer.alloc(enabled.length);
  let changedInside = 0;
  let changedOutside = 0;
  const { x, y, width, height } = roi;
  for (let row = 0; row < raster.height; row += 1) {
    for (let column = 0; column < raster.width; column += 1) {
      const pixel = row * raster.width + column;
      const offset = pixel * 3;
      let changed = false;
      for (let channel = 0; channel < 3; channel += 1) {
        const delta = Math.abs(enabled[offset + channel] - disabled[offset + channel]);
        expectedDiff[offset + channel] = delta;
        if (delta !== 0) changed = true;
      }
      if (changed) {
        if (column >= x && column < x + width && row >= y && row < y + height) changedInside += 1;
        else changedOutside += 1;
      }
    }
  }
  return { expectedDiff, changedInside, changedOutside };
}

function p6Bytes(width, height, pixels) {
  return Buffer.concat([
    Buffer.from(`P6\n${width} ${height}\n255\n`, 'ascii'),
    pixels,
  ]);
}

export function buildMaterialContributionReceipt({
  capture_frame,
  target_raster,
  result_roi,
  enabled_frame,
  disabled_frame,
  roi_diff_artifact_id,
} = {}) {
  if (!Number.isSafeInteger(capture_frame) || capture_frame < 0) {
    fail('roi_receipt_invalid', 'Capture frame must be a non-negative integer.', '$.capture_frame');
  }
  validateRaster(target_raster, '$.target_raster');
  validateBbox(result_roi, target_raster, '$.result_roi');
  exact(enabled_frame, ['artifact_id', 'bytes'], 'roi_artifact_record_invalid', '$.enabled_frame');
  exact(disabled_frame, ['artifact_id', 'bytes'], 'roi_artifact_record_invalid', '$.disabled_frame');
  if (!ARTIFACT_ID.test(enabled_frame.artifact_id ?? '')
    || !ARTIFACT_ID.test(disabled_frame.artifact_id ?? '')
    || !ARTIFACT_ID.test(roi_diff_artifact_id ?? '')
    || new Set([enabled_frame.artifact_id, disabled_frame.artifact_id, roi_diff_artifact_id]).size !== 3) {
    fail('roi_artifact_record_invalid', 'Enabled, disabled, and diff artifacts need unique opaque IDs.');
  }
  const enabled = parseNormalizedPpm(enabled_frame.bytes, '$.enabled_frame.bytes');
  const disabled = parseNormalizedPpm(disabled_frame.bytes, '$.disabled_frame.bytes');
  if (enabled.format !== disabled.format) {
    fail('capture_format_mismatch', 'Enabled and disabled captures must use the same PPM format.');
  }
  for (const frame of [enabled, disabled]) {
    if (frame.width !== target_raster.width || frame.height !== target_raster.height) {
      fail('capture_raster_mismatch', 'Enabled and disabled captures must match the target raster.');
    }
  }
  if (samePixels(enabled.pixels, disabled.pixels)) {
    fail('zero_pixel_contribution', 'Resolved enabled and disabled pixels are identical.');
  }
  const comparison = computeAbsoluteDiff(enabled.pixels, disabled.pixels, target_raster, result_roi);
  if (comparison.changedInside < 1) {
    fail(comparison.changedOutside > 0 ? 'change_outside_roi_only' : 'zero_pixel_contribution', 'Primary material must change at least one pixel inside its frozen result ROI.');
  }
  const diffBytes = p6Bytes(target_raster.width, target_raster.height, comparison.expectedDiff);
  const core = {
    schema_version: 1,
    pipeline_contract_version: 2,
    status: 'verified',
    producer: 'master-build-deterministic-roi-gate-v1',
    verification_mode: 'byte-resolved-pixel-ablation',
    capture_frame,
    target_raster,
    result_roi,
    capture_format: enabled.format,
    enabled_frame: {
      artifact_id: enabled_frame.artifact_id,
      sha256: enabled.sha256,
      size_bytes: enabled.bytes.length,
    },
    disabled_frame: {
      artifact_id: disabled_frame.artifact_id,
      sha256: disabled.sha256,
      size_bytes: disabled.bytes.length,
    },
    roi_diff: {
      artifact_id: roi_diff_artifact_id,
      sha256: hashBytes(diffBytes),
      size_bytes: diffBytes.length,
    },
    roi_pixel_count: result_roi.width * result_roi.height,
    changed_pixel_count: comparison.changedInside,
  };
  const receipt = { ...core, gate_receipt_sha256: fingerprintArtifactValue(core) };
  const artifacts = new Map([
    [enabled_frame.artifact_id, enabled.bytes],
    [disabled_frame.artifact_id, disabled.bytes],
    [roi_diff_artifact_id, diffBytes],
  ]);
  verifyMaterialContribution(receipt, { artifacts });
  return {
    receipt,
    roi_diff_bytes: diffBytes,
    changed_outside_pixel_count: comparison.changedOutside,
  };
}

export function verifyMaterialContribution(receipt, { artifacts } = {}) {
  exact(receipt, [
    'schema_version',
    'pipeline_contract_version',
    'status',
    'producer',
    'verification_mode',
    'capture_frame',
    'target_raster',
    'result_roi',
    'capture_format',
    'enabled_frame',
    'disabled_frame',
    'roi_diff',
    'roi_pixel_count',
    'changed_pixel_count',
    'gate_receipt_sha256',
  ]);
  if (receipt.schema_version !== 1 || receipt.pipeline_contract_version !== 2
    || receipt.status !== 'verified'
    || receipt.producer !== 'master-build-deterministic-roi-gate-v1'
    || receipt.verification_mode !== 'byte-resolved-pixel-ablation'
    || !Number.isSafeInteger(receipt.capture_frame) || receipt.capture_frame < 0
    || !['P6', 'P3'].includes(receipt.capture_format)) {
    fail('roi_receipt_invalid', 'ROI contribution receipt identity is invalid.');
  }
  validateRaster(receipt.target_raster, '$.target_raster');
  validateBbox(receipt.result_roi, receipt.target_raster, '$.result_roi');
  const enabledBytes = resolveArtifact(receipt.enabled_frame, artifacts, '$.enabled_frame');
  const disabledBytes = resolveArtifact(receipt.disabled_frame, artifacts, '$.disabled_frame');
  const diffBytes = resolveArtifact(receipt.roi_diff, artifacts, '$.roi_diff');
  if (receipt.enabled_frame.artifact_id === receipt.disabled_frame.artifact_id
    || receipt.enabled_frame.sha256 === receipt.disabled_frame.sha256) {
    fail('ablation_frames_not_distinct', 'Enabled and disabled captures must be distinct actual artifacts.', '$.enabled_frame');
  }

  const enabled = parseNormalizedPpm(enabledBytes, '$.enabled_frame');
  const disabled = parseNormalizedPpm(disabledBytes, '$.disabled_frame');
  const diff = parseNormalizedPpm(diffBytes, '$.roi_diff');
  if (enabled.format !== disabled.format || enabled.format !== receipt.capture_format) {
    fail('capture_format_mismatch', 'Enabled and disabled captures must use the same declared PPM format.');
  }
  for (const frame of [enabled, disabled, diff]) {
    if (frame.width !== receipt.target_raster.width || frame.height !== receipt.target_raster.height) {
      fail('capture_raster_mismatch', 'Every resolved ROI evidence image must match the target raster.');
    }
  }
  if (samePixels(enabled.pixels, disabled.pixels)) {
    fail('zero_pixel_contribution', 'Different files or hashes cannot pass when resolved pixels are identical.');
  }

  const comparison = computeAbsoluteDiff(enabled.pixels, disabled.pixels, receipt.target_raster, receipt.result_roi);
  if (!diff.pixels.equals(comparison.expectedDiff)) {
    fail('roi_diff_pixels_mismatch', 'Resolved diff artifact is not the full-raster absolute enabled/disabled pixel difference.', '$.roi_diff');
  }
  const roiPixelCount = receipt.result_roi.width * receipt.result_roi.height;
  if (receipt.roi_pixel_count !== roiPixelCount || receipt.changed_pixel_count !== comparison.changedInside) {
    fail('roi_count_mismatch', 'Receipt pixel counts do not equal the resolved frame comparison.');
  }
  if (comparison.changedInside < 1) {
    fail(comparison.changedOutside > 0 ? 'change_outside_roi_only' : 'zero_pixel_contribution', 'Primary material must change at least one pixel inside its frozen result ROI.');
  }
  const core = {
    schema_version: receipt.schema_version,
    pipeline_contract_version: receipt.pipeline_contract_version,
    status: receipt.status,
    producer: receipt.producer,
    verification_mode: receipt.verification_mode,
    capture_frame: receipt.capture_frame,
    target_raster: receipt.target_raster,
    result_roi: receipt.result_roi,
    capture_format: receipt.capture_format,
    enabled_frame: receipt.enabled_frame,
    disabled_frame: receipt.disabled_frame,
    roi_diff: receipt.roi_diff,
    roi_pixel_count: receipt.roi_pixel_count,
    changed_pixel_count: receipt.changed_pixel_count,
  };
  if (!SHA256.test(receipt.gate_receipt_sha256 ?? '')
    || receipt.gate_receipt_sha256 !== fingerprintArtifactValue(core)) {
    fail('roi_gate_receipt_hash_mismatch', 'ROI gate receipt hash does not bind its deterministic evidence.');
  }
  return {
    status: 'verified',
    capture_frame: receipt.capture_frame,
    changed_pixel_count: comparison.changedInside,
    roi_pixel_count: roiPixelCount,
    changed_outside_pixel_count: comparison.changedOutside,
    gate_receipt_sha256: receipt.gate_receipt_sha256,
  };
}
