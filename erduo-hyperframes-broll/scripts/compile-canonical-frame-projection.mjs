import {
  PIPELINE_CONTRACT_VERSION,
  ScriptOnlyV3ContractError,
  assertNoLegacyActiveFields,
  fingerprintV3Value,
} from './validate-production-contract.mjs';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const SHOT_ID = /^S[0-9]{3}$/u;

const fail = (code, message, location) => {
  throw new ScriptOnlyV3ContractError(code, message, location);
};

function exact(value, fields, code, message, location) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...fields].sort())
  ) fail(code, message, location);
}

function validateFps(value, shotPlanFps) {
  exact(
    value,
    ['numerator', 'denominator'],
    'projection_time_truth_mismatch',
    'Frame rate must be one positive integer ratio.',
  );
  if (
    !Number.isSafeInteger(value.numerator)
    || value.numerator < 1
    || !Number.isSafeInteger(value.denominator)
    || value.denominator < 1
    || fingerprintV3Value(value) !== fingerprintV3Value(shotPlanFps)
  ) {
    fail(
      'projection_time_truth_mismatch',
      'Projection frame rate must equal the shot-plan frame rate.',
    );
  }
}

function validateParsedSrt(value) {
  exact(
    value,
    ['schema_version', 'artifact_kind', 'cues'],
    'projection_time_truth_mismatch',
    'Canonical parsed-SRT input is invalid.',
  );
  if (
    value.schema_version !== 1
    || value.artifact_kind !== 'parsed-srt'
    || !Array.isArray(value.cues)
    || value.cues.length < 1
  ) {
    fail(
      'projection_time_truth_mismatch',
      'Canonical parsed-SRT input is invalid.',
    );
  }
  const ids = new Set();
  let previousEnd = 0;
  for (const cue of value.cues) {
    exact(
      cue,
      ['cue_id', 'start_ms', 'end_ms', 'text'],
      'projection_time_truth_mismatch',
      'Canonical parsed-SRT cue is invalid.',
    );
    if (
      !SAFE_ID.test(cue.cue_id ?? '')
      || ids.has(cue.cue_id)
      || !Number.isSafeInteger(cue.start_ms)
      || !Number.isSafeInteger(cue.end_ms)
      || cue.start_ms < previousEnd
      || cue.end_ms <= cue.start_ms
      || typeof cue.text !== 'string'
      || cue.text.trim().length < 1
    ) {
      fail(
        'projection_time_truth_mismatch',
        'Canonical parsed-SRT cues must be unique, ordered and non-empty.',
        cue?.cue_id,
      );
    }
    ids.add(cue.cue_id);
    previousEnd = cue.end_ms;
  }
}

function projectFrame(milliseconds, fps) {
  const frame = Math.round(
    milliseconds * fps.numerator / (1000 * fps.denominator),
  );
  if (!Number.isSafeInteger(frame) || frame < 0) {
    fail(
      'projection_frame_mapping_mismatch',
      'Projected frame boundary is outside the safe integer range.',
    );
  }
  return frame;
}

function buildProjection({ parsed_srt: parsedSrt, shot_plan: shotPlan, fps }) {
  assertNoLegacyActiveFields({ parsedSrt, shotPlan, fps });
  validateParsedSrt(parsedSrt);
  if (
    !shotPlan
    || typeof shotPlan !== 'object'
    || Array.isArray(shotPlan)
    || shotPlan.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION
    || !SHA256.test(shotPlan.shot_plan_sha256 ?? '')
    || !Array.isArray(shotPlan.shots)
    || shotPlan.shots.length < 1
  ) {
    fail(
      'pipeline_upgrade_required',
      'A script-only v3 shot plan is required for canonical projection.',
    );
  }
  validateFps(fps, shotPlan.fps);

  const firstCue = parsedSrt.cues[0];
  const lastCue = parsedSrt.cues.at(-1);
  const firstShot = shotPlan.shots[0];
  const lastShot = shotPlan.shots.at(-1);
  if (
    firstShot?.start_ms !== firstCue.start_ms
    || lastShot?.end_ms !== lastCue.end_ms
  ) {
    fail(
      'projection_time_truth_mismatch',
      'Shot-plan first and last boundaries must equal the actual SRT.',
    );
  }

  const coveredCueIds = new Set();
  const shots = shotPlan.shots.map((shot, index) => {
    const previous = shotPlan.shots[index - 1];
    if (
      !SHOT_ID.test(shot?.shot_id ?? '')
      || !Number.isSafeInteger(shot.start_ms)
      || !Number.isSafeInteger(shot.end_ms)
      || !Number.isSafeInteger(shot.duration_ms)
      || shot.end_ms <= shot.start_ms
      || shot.duration_ms !== shot.end_ms - shot.start_ms
      || previous && shot.start_ms !== previous.end_ms
    ) {
      fail(
        'projection_time_truth_mismatch',
        'Shot windows must be ordered, contiguous and duration-exact.',
        shot?.shot_id,
      );
    }
    const expectedCueIds = parsedSrt.cues
      .filter((cue) => cue.start_ms < shot.end_ms && cue.end_ms > shot.start_ms)
      .map((cue) => cue.cue_id);
    if (
      !Array.isArray(shot.cue_ids)
      || expectedCueIds.length < 1
      || fingerprintV3Value(shot.cue_ids)
        !== fingerprintV3Value(expectedCueIds)
    ) {
      fail(
        'projection_cue_coverage_mismatch',
        'Shot cue IDs must equal actual ordered SRT coverage.',
        shot.shot_id,
      );
    }
    expectedCueIds.forEach((cueId) => coveredCueIds.add(cueId));
    const startFrame = projectFrame(shot.start_ms, fps);
    const endFrame = projectFrame(shot.end_ms, fps);
    if (endFrame <= startFrame) {
      fail(
        'projection_frame_mapping_mismatch',
        'Every shot must project to at least one frame.',
        shot.shot_id,
      );
    }
    return {
      shot_id: shot.shot_id,
      cue_ids: structuredClone(expectedCueIds),
      srt_window_ms: {
        start_ms: shot.start_ms,
        end_ms: shot.end_ms,
      },
      frame_window: {
        start_frame: startFrame,
        end_frame: endFrame,
        duration_frames: endFrame - startFrame,
      },
    };
  });

  if (
    coveredCueIds.size !== parsedSrt.cues.length
    || parsedSrt.cues.some((cue) => !coveredCueIds.has(cue.cue_id))
  ) {
    fail(
      'projection_cue_coverage_mismatch',
      'Canonical projection must cover every SRT cue exactly once.',
    );
  }

  return {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    artifact_kind: 'frame-projection',
    parsed_srt_sha256: fingerprintV3Value(parsedSrt),
    shot_plan_sha256: shotPlan.shot_plan_sha256,
    fps: structuredClone(fps),
    shots,
  };
}

export function compileCanonicalFrameProjection(input) {
  exact(
    input,
    ['parsed_srt', 'shot_plan', 'fps'],
    'projection_time_truth_mismatch',
    'Canonical projection compiler input is invalid.',
  );
  return buildProjection(input);
}

export function validateCanonicalFrameProjection(projection, input) {
  assertNoLegacyActiveFields({ projection, input });
  const expected = compileCanonicalFrameProjection(input);
  exact(
    projection,
    [
      'schema_version',
      'pipeline_contract_version',
      'artifact_kind',
      'parsed_srt_sha256',
      'shot_plan_sha256',
      'fps',
      'shots',
    ],
    'projection_binding_mismatch',
    'Canonical projection shape is invalid.',
  );
  if (
    projection.schema_version !== expected.schema_version
    || projection.pipeline_contract_version
      !== expected.pipeline_contract_version
    || projection.artifact_kind !== expected.artifact_kind
    || projection.parsed_srt_sha256 !== expected.parsed_srt_sha256
    || projection.shot_plan_sha256 !== expected.shot_plan_sha256
    || fingerprintV3Value(projection.fps)
      !== fingerprintV3Value(expected.fps)
    || !Array.isArray(projection.shots)
    || projection.shots.length !== expected.shots.length
  ) {
    fail(
      'projection_binding_mismatch',
      'Canonical projection identity or artifact binding is invalid.',
    );
  }
  for (let index = 0; index < expected.shots.length; index += 1) {
    const actualShot = projection.shots[index];
    const expectedShot = expected.shots[index];
    exact(
      actualShot,
      ['shot_id', 'cue_ids', 'srt_window_ms', 'frame_window'],
      'projection_binding_mismatch',
      'Canonical projected shot shape is invalid.',
      expectedShot.shot_id,
    );
    if (
      actualShot.shot_id !== expectedShot.shot_id
      || fingerprintV3Value(actualShot.cue_ids)
        !== fingerprintV3Value(expectedShot.cue_ids)
    ) {
      fail(
        'projection_cue_coverage_mismatch',
        'Projected shot identity or cue coverage is invalid.',
        expectedShot.shot_id,
      );
    }
    if (
      fingerprintV3Value(actualShot.srt_window_ms)
        !== fingerprintV3Value(expectedShot.srt_window_ms)
    ) {
      fail(
        'projection_time_truth_mismatch',
        'Projected SRT window is not canonical.',
        expectedShot.shot_id,
      );
    }
    if (
      fingerprintV3Value(actualShot.frame_window)
        !== fingerprintV3Value(expectedShot.frame_window)
    ) {
      fail(
        'projection_frame_mapping_mismatch',
        'Projected frame window is not canonical.',
        expectedShot.shot_id,
      );
    }
  }
  return {
    status: 'passed',
    shot_count: expected.shots.length,
    cue_count: input.parsed_srt.cues.length,
    start_frame: expected.shots[0].frame_window.start_frame,
    end_frame: expected.shots.at(-1).frame_window.end_frame,
  };
}
