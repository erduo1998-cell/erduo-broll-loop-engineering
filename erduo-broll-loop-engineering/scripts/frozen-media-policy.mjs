export const DEFAULT_MEZZANINE_FORMAT = 'h264-mp4';

export function validateMezzaninePolicy(mezzanine, { allowLegacy = true } = {}) {
  const errors = [];
  const legacy = mezzanine?.encoder === undefined;
  if (legacy && allowLegacy && mezzanine?.codec === 'ffv1'
    && mezzanine.container === 'matroska'
    && mezzanine.pixelFormat === 'yuv444p10le'
    && mezzanine.class === 'lossless') return errors;

  if (mezzanine?.codec === 'h264') {
    if (mezzanine.container !== 'mp4') errors.push('H.264 mezzanine container must be mp4');
    if (mezzanine.encoder !== 'libx264') errors.push('H.264 mezzanine encoder must be libx264');
    if (mezzanine.pixelFormat !== 'yuv420p') errors.push('H.264 mezzanine pixel format must be yuv420p');
    if (mezzanine.class !== 'visually-lossless') errors.push('H.264 mezzanine class must be visually-lossless');
    if (typeof mezzanine.preset !== 'string' || !mezzanine.preset) errors.push('H.264 mezzanine preset is required');
    if (!Number.isSafeInteger(mezzanine.crf) || mezzanine.crf < 0 || mezzanine.crf > 18) {
      errors.push('H.264 mezzanine CRF must be an integer from 0 through 18');
    }
    if (!Number.isSafeInteger(mezzanine.gopFrames) || mezzanine.gopFrames < 1) {
      errors.push('H.264 mezzanine GOP must be a positive frame count');
    }
    if (mezzanine.keyframeScenecut !== false) errors.push('H.264 mezzanine must disable scene-cut keyframes');
    if (mezzanine.upgradeReason !== null) errors.push('default H.264 mezzanine must not claim a lossless upgrade reason');
  } else if (mezzanine?.codec === 'ffv1') {
    if (mezzanine.container !== 'matroska') errors.push('FFV1 mezzanine container must be matroska');
    if (mezzanine.encoder !== 'ffv1') errors.push('FFV1 mezzanine encoder must be ffv1');
    if (mezzanine.pixelFormat !== 'yuv444p10le') errors.push('FFV1 mezzanine pixel format must be yuv444p10le');
    if (mezzanine.class !== 'lossless') errors.push('FFV1 mezzanine class must be lossless');
    if (typeof mezzanine.upgradeReason !== 'string' || !mezzanine.upgradeReason.trim()) {
      errors.push('FFV1 mezzanine requires an explicit upgrade reason');
    }
  } else {
    errors.push(`unsupported mezzanine codec ${JSON.stringify(mezzanine?.codec)}`);
  }
  return errors;
}

export function mezzanineVideoArgs(productionProfile) {
  const policy = productionProfile?.mezzanine;
  const errors = validateMezzaninePolicy(policy, { allowLegacy: false });
  if (errors.length) throw new Error(`invalid v1 mezzanine policy: ${errors.join('; ')}`);
  const color = policy.color;
  const common = [
    '-pix_fmt', policy.pixelFormat,
    '-colorspace', color.space,
    '-color_trc', color.transfer,
    '-color_primaries', color.primaries,
    '-color_range', color.range,
  ];
  if (policy.codec === 'h264') {
    return [
      '-c:v', policy.encoder,
      '-preset', policy.preset,
      '-crf', String(policy.crf),
      '-g', String(policy.gopFrames),
      '-keyint_min', String(policy.gopFrames),
      '-sc_threshold', '0',
      ...common,
      '-movflags', '+faststart',
    ];
  }
  return ['-c:v', 'ffv1', '-level', '3', '-g', '1', ...common];
}

export function mezzanineAudioArgs(productionProfile) {
  const audio = productionProfile?.mezzanine?.audio;
  if (audio?.policy === 'silent') return ['-an'];
  return [
    '-c:a', audio.codec,
    '-ar', String(audio.sampleRate),
    '-ac', String(audio.channels),
  ];
}
