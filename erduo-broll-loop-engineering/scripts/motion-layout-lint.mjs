#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROLES = new Set(['primary', 'secondary', 'text', 'structural', 'decorative']);
const MOTION_KINDS = new Set(['transition', 'continuous', 'cut']);
const TRACE_MODES = new Set(['rendered-dom-geometry', 'rendered-scene-geometry']);
const RENDERED_STATE_DELTA = 0.012;
const LONG_BEAT_RISK_SECONDS = 4;
const LONG_BEAT_MAX_UNDECLARED_IDLE_FRACTION = 0.25;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function finding(code, severity, message, shotId, elementIds, frames) {
  return { code, severity, message, shotId, elementIds, frames };
}

function usage() {
  return `Usage: node scripts/motion-layout-lint.mjs --trace <motion-layout-trace.json> [--recipes <shot-recipes-directory>] [--pretty]

The trace must come from rendered runtime geometry, not hand-authored estimates.
Pass --recipes to prove that planned micro-beats became visible development.
Normal output is one compact JSON line. Findings include bounded frame windows
that the owning Builder may render as diagnostic stills or clips.`;
}

function parseArgs(argv) {
  const options = { pretty: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--pretty') {
      options.pretty = true;
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (!['--trace', '--recipes'].includes(argument)) throw new Error(`Unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    options[argument === '--trace' ? 'trace' : 'recipes'] = value;
    index += 1;
  }
  if (!options.help && !options.trace) throw new Error('Missing --trace');
  return options;
}

function validateDiagramFrames(shot, label, errors) {
  if (shot.diagramFrames === undefined) return;
  if (!Array.isArray(shot.diagramFrames) || shot.diagramFrames.length === 0) {
    errors.push(`${label}.diagramFrames must be a non-empty array when present`);
    return;
  }
  const frames = new Set();
  for (const [frameIndex, diagramFrame] of shot.diagramFrames.entries()) {
    const frameLabel = `${label}.diagramFrames[${frameIndex}]`;
    if (!isRecord(diagramFrame) || !Number.isInteger(diagramFrame.frame)
      || diagramFrame.frame < shot.startFrame || diagramFrame.frame >= shot.endFrame) {
      errors.push(`${frameLabel}.frame is invalid`);
      continue;
    }
    if (frames.has(diagramFrame.frame)) errors.push(`${label}.diagramFrames repeats frame ${diagramFrame.frame}`);
    frames.add(diagramFrame.frame);
    if (!Array.isArray(diagramFrame.nodes) || diagramFrame.nodes.length === 0
      || !Array.isArray(diagramFrame.connectors) || !Array.isArray(diagramFrame.labels)) {
      errors.push(`${frameLabel} requires nodes, connectors, and labels arrays`);
      continue;
    }
    const nodeIds = new Set();
    for (const [nodeIndex, node] of diagramFrame.nodes.entries()) {
      const nodeLabel = `${frameLabel}.nodes[${nodeIndex}]`;
      if (!isRecord(node) || typeof node.id !== 'string' || node.id.length === 0
        || !['x', 'y', 'width', 'height'].every((key) => finite(node[key]))
        || node.width <= 0 || node.height <= 0) {
        errors.push(`${nodeLabel} is invalid`);
        continue;
      }
      if (nodeIds.has(node.id)) errors.push(`${frameLabel} repeats node ${node.id}`);
      nodeIds.add(node.id);
    }
    const connectorIds = new Set();
    for (const [connectorIndex, connector] of diagramFrame.connectors.entries()) {
      const connectorLabel = `${frameLabel}.connectors[${connectorIndex}]`;
      if (!isRecord(connector) || typeof connector.id !== 'string' || connector.id.length === 0
        || typeof connector.fromNodeId !== 'string' || !nodeIds.has(connector.fromNodeId)
        || typeof connector.toNodeId !== 'string' || !nodeIds.has(connector.toNodeId)
        || !Array.isArray(connector.points) || connector.points.length < 2
        || connector.points.some((point) => !isRecord(point) || !finite(point.x) || !finite(point.y))) {
        errors.push(`${connectorLabel} is invalid`);
        continue;
      }
      if (connectorIds.has(connector.id)) errors.push(`${frameLabel} repeats connector ${connector.id}`);
      connectorIds.add(connector.id);
      for (let pointIndex = 1; pointIndex < connector.points.length; pointIndex += 1) {
        const previous = connector.points[pointIndex - 1];
        const current = connector.points[pointIndex];
        if (previous.x === current.x && previous.y === current.y) {
          errors.push(`${connectorLabel} contains a zero-length segment`);
        }
      }
    }
    const labelIds = new Set();
    for (const [labelIndex, connectorLabel] of diagramFrame.labels.entries()) {
      const itemLabel = `${frameLabel}.labels[${labelIndex}]`;
      if (!isRecord(connectorLabel) || typeof connectorLabel.id !== 'string' || connectorLabel.id.length === 0
        || typeof connectorLabel.connectorId !== 'string' || !connectorIds.has(connectorLabel.connectorId)
        || !['x', 'y', 'width', 'height'].every((key) => finite(connectorLabel[key]))
        || connectorLabel.width <= 0 || connectorLabel.height <= 0) {
        errors.push(`${itemLabel} is invalid`);
        continue;
      }
      if (labelIds.has(connectorLabel.id)) errors.push(`${frameLabel} repeats label ${connectorLabel.id}`);
      labelIds.add(connectorLabel.id);
    }
  }
}

function validateTrace(trace) {
  const errors = [];
  if (!isRecord(trace)) return ['Trace must be an object'];
  const topAllowed = new Set([
    'schemaVersion', 'runtime', 'compositionId', 'compositionIdentity', 'capture',
    'fps', 'width', 'height', 'startFrame', 'endFrame', 'frameStep', 'sampling', 'safeArea', 'shots',
  ]);
  for (const key of Object.keys(trace)) {
    if (!topAllowed.has(key)) errors.push(`Unknown trace property: ${key}`);
  }
  if (!['1.0.0', '1.1.0', '1.2.0'].includes(trace.schemaVersion)) errors.push('schemaVersion must be 1.0.0, 1.1.0, or 1.2.0');
  if (!['remotion', 'hyperframes'].includes(trace.runtime)) errors.push('runtime must be remotion or hyperframes');
  if (typeof trace.compositionId !== 'string' || trace.compositionId.length === 0) errors.push('compositionId is required');
  if (!/^[0-9a-f]{64}$/.test(trace.compositionIdentity ?? '')) errors.push('compositionIdentity must be a SHA-256');
  if (!isRecord(trace.capture) || !TRACE_MODES.has(trace.capture?.mode)) {
    errors.push('capture.mode must identify rendered DOM or scene geometry');
  }
  if (typeof trace.capture?.source !== 'string' || trace.capture.source.length === 0) errors.push('capture.source is required');
  for (const key of ['fps', 'width', 'height', 'startFrame', 'endFrame', 'frameStep']) {
    if (!Number.isInteger(trace[key])) errors.push(`${key} must be an integer`);
  }
  if (Number.isInteger(trace.fps) && (trace.fps < 1 || trace.fps > 240)) errors.push('fps must be between 1 and 240');
  if (Number.isInteger(trace.width) && trace.width < 1) errors.push('width must be positive');
  if (Number.isInteger(trace.height) && trace.height < 1) errors.push('height must be positive');
  const sampledTrace = trace.schemaVersion === '1.2.0' && ['sampled', 'escalated'].includes(trace.sampling?.mode);
  const denseTrace = trace.frameStep === 1;
  if (trace.schemaVersion === '1.2.0') {
    if (!isRecord(trace.sampling) || !['sampled', 'escalated', 'dense'].includes(trace.sampling?.mode)) {
      errors.push('schema 1.2.0 requires sampling.mode');
    }
    if (!Array.isArray(trace.sampling?.frames) || trace.sampling.frames.length < 2
      || trace.sampling.frames.some((frame) => !Number.isInteger(frame))) {
      errors.push('schema 1.2.0 requires at least two integer sampling.frames');
    } else {
      for (let index = 0; index < trace.sampling.frames.length; index += 1) {
        const frame = trace.sampling.frames[index];
        if (frame < trace.startFrame || frame >= trace.endFrame) errors.push('sampling.frames must stay inside the trace window');
        if (index > 0 && frame <= trace.sampling.frames[index - 1]) errors.push('sampling.frames must be unique and increasing');
      }
    }
    if ((trace.sampling?.mode === 'dense' && trace.frameStep !== 1)
      || (['sampled', 'escalated'].includes(trace.sampling?.mode) && trace.frameStep !== 0)) {
      errors.push('frameStep must be 1 for dense capture and 0 for irregular sampled capture');
    }
    if (trace.sampling?.denseWindows !== undefined && !Array.isArray(trace.sampling.denseWindows)) {
      errors.push('sampling.denseWindows must be an array');
    }
    for (const [index, window] of (trace.sampling?.denseWindows ?? []).entries()) {
      if (!isRecord(window) || !Number.isInteger(window.startFrame) || !Number.isInteger(window.endFrame)
        || window.startFrame < trace.startFrame || window.endFrame > trace.endFrame
        || window.endFrame <= window.startFrame) errors.push(`sampling.denseWindows[${index}] is invalid`);
    }
  } else if (trace.frameStep !== 1) {
    errors.push('legacy trace frameStep must be 1');
  }
  if (!Number.isInteger(trace.startFrame) || !Number.isInteger(trace.endFrame) || trace.endFrame <= trace.startFrame) {
    errors.push('trace frame window is invalid');
  }
  if (!isRecord(trace.safeArea)) errors.push('safeArea is required');
  for (const key of ['left', 'top', 'right', 'bottom']) {
    if (!finite(trace.safeArea?.[key])) errors.push(`safeArea.${key} must be finite`);
  }
  if (isRecord(trace.safeArea) && [trace.safeArea.left, trace.safeArea.top, trace.safeArea.right, trace.safeArea.bottom].every(finite)) {
    if (!(trace.safeArea.left >= 0 && trace.safeArea.top >= 0 && trace.safeArea.right <= trace.width
      && trace.safeArea.bottom <= trace.height && trace.safeArea.right > trace.safeArea.left
      && trace.safeArea.bottom > trace.safeArea.top)) errors.push('safeArea bounds are invalid');
  }
  if (!Array.isArray(trace.shots) || trace.shots.length === 0) errors.push('shots must be a non-empty array');

  const shotIds = new Set();
  for (const [shotIndex, shot] of (trace.shots ?? []).entries()) {
    if (!isRecord(shot)) {
      errors.push(`shots[${shotIndex}] must be an object`);
      continue;
    }
    if (typeof shot.shotId !== 'string' || shot.shotId.length === 0) errors.push(`shots[${shotIndex}].shotId is required`);
    if (shotIds.has(shot.shotId)) errors.push(`Duplicate shotId: ${shot.shotId}`);
    shotIds.add(shot.shotId);
    if (!Number.isInteger(shot.startFrame) || !Number.isInteger(shot.endFrame)
      || shot.startFrame < trace.startFrame || shot.endFrame > trace.endFrame || shot.endFrame <= shot.startFrame) {
      errors.push(`${shot.shotId ?? `shots[${shotIndex}]`} has an invalid frame window`);
    }
    if (!Array.isArray(shot.readableHolds) || shot.readableHolds.length === 0) errors.push(`${shot.shotId} requires at least one readable hold`);
    for (const [holdIndex, hold] of (shot.readableHolds ?? []).entries()) {
      if (!isRecord(hold) || !Number.isInteger(hold.startFrame) || !Number.isInteger(hold.endFrame)
        || hold.startFrame < shot.startFrame || hold.endFrame > shot.endFrame || hold.endFrame <= hold.startFrame) {
        errors.push(`${shot.shotId}.readableHolds[${holdIndex}] is invalid`);
      }
    }
    if (!Array.isArray(shot.elements) || shot.elements.length === 0) errors.push(`${shot.shotId} requires elements`);
    const elementIds = new Set();
    for (const [elementIndex, element] of (shot.elements ?? []).entries()) {
      const label = `${shot.shotId}.elements[${elementIndex}]`;
      if (!isRecord(element)) {
        errors.push(`${label} must be an object`);
        continue;
      }
      if (typeof element.id !== 'string' || element.id.length === 0) errors.push(`${label}.id is required`);
      if (elementIds.has(element.id)) errors.push(`${shot.shotId} repeats element ${element.id}`);
      elementIds.add(element.id);
      if (!ROLES.has(element.role)) errors.push(`${label}.role is invalid`);
      if (typeof element.focusGroup !== 'string' || element.focusGroup.length === 0) errors.push(`${label}.focusGroup is required`);
      if (!Number.isInteger(element.layer)) errors.push(`${label}.layer must be an integer`);
      if (!finite(element.visualWeight) || element.visualWeight < 0 || element.visualWeight > 1) errors.push(`${label}.visualWeight must be between 0 and 1`);
      if (element.safeAreaPolicy !== undefined && !['inside', 'may-bleed'].includes(element.safeAreaPolicy)) errors.push(`${label}.safeAreaPolicy is invalid`);
      if (element.allowOverlapWith !== undefined && (!Array.isArray(element.allowOverlapWith)
        || element.allowOverlapWith.some((id) => typeof id !== 'string'))) errors.push(`${label}.allowOverlapWith is invalid`);
      if (!Array.isArray(element.samples) || element.samples.length === 0) errors.push(`${label}.samples must be non-empty`);
      let previousFrame = null;
      for (const [sampleIndex, sample] of (element.samples ?? []).entries()) {
        if (!isRecord(sample) || !Number.isInteger(sample.frame)
          || !['x', 'y', 'width', 'height', 'opacity', 'zIndex', 'visibleAreaRatio'].every((key) => finite(sample[key]))
          || typeof sample.visible !== 'boolean' || typeof sample.clipped !== 'boolean') {
          errors.push(`${label}.samples[${sampleIndex}] is invalid`);
          continue;
        }
        if (sample.frame < shot.startFrame || sample.frame >= shot.endFrame) errors.push(`${label} sample frame is outside its shot`);
        if (previousFrame !== null && sample.frame <= previousFrame) errors.push(`${label} samples must be strictly increasing`);
        if (denseTrace && previousFrame !== null && sample.frame !== previousFrame + 1) errors.push(`${label} dense samples must cover consecutive frames`);
        if (sampledTrace && Array.isArray(trace.sampling?.frames) && !trace.sampling.frames.includes(sample.frame)) {
          errors.push(`${label} sample frame is absent from sampling.frames`);
        }
        previousFrame = sample.frame;
        if (sample.width < 0 || sample.height < 0 || sample.opacity < 0 || sample.opacity > 1
          || sample.visibleAreaRatio < 0 || sample.visibleAreaRatio > 1) errors.push(`${label} sample geometry is invalid`);
      }
      if (denseTrace && element.samples?.length > 0) {
        if (element.samples[0]?.frame !== shot.startFrame
          || element.samples.at(-1)?.frame !== shot.endFrame - 1) {
          errors.push(`${label} dense samples must cover every frame in its shot`);
        }
      }
      for (const [sampleIndex, sample] of (element.samples ?? []).entries()) {
        if (sample.appearanceHash !== undefined && !/^[0-9a-f]{64}$/.test(sample.appearanceHash)) {
          errors.push(`${label}.samples[${sampleIndex}].appearanceHash must be a SHA-256`);
        }
      }
      if (element.motions !== undefined && !Array.isArray(element.motions)) errors.push(`${label}.motions must be an array`);
      for (const [motionIndex, motion] of (element.motions ?? []).entries()) {
        if (!isRecord(motion) || !Number.isInteger(motion.startFrame) || !Number.isInteger(motion.endFrame)
          || motion.startFrame < shot.startFrame || motion.endFrame > shot.endFrame
          || motion.endFrame <= motion.startFrame || !MOTION_KINDS.has(motion.kind)) {
          errors.push(`${label}.motions[${motionIndex}] is invalid`);
        }
        if (motion?.expectsSettle !== undefined && typeof motion.expectsSettle !== 'boolean') errors.push(`${label}.motions[${motionIndex}].expectsSettle must be boolean`);
        if (motion?.beatIds !== undefined && (!Array.isArray(motion.beatIds) || motion.beatIds.length === 0
          || motion.beatIds.some((beatId) => typeof beatId !== 'string' || beatId.length === 0)
          || new Set(motion.beatIds).size !== motion.beatIds.length)) {
          errors.push(`${label}.motions[${motionIndex}].beatIds must contain unique non-empty beat IDs`);
        }
      }
    }
    validateDiagramFrames(shot, shot.shotId ?? `shots[${shotIndex}]`, errors);
  }
  return errors;
}

function stateVector(sample, width, height) {
  return [
    (sample.x + sample.width / 2) / width,
    (sample.y + sample.height / 2) / height,
    sample.width / width,
    sample.height / height,
    sample.opacity,
  ];
}

function distance(left, right) {
  return Math.sqrt(left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0));
}

function speedSeries(samples, width, height) {
  const states = samples.map((sample) => stateVector(sample, width, height));
  return states.slice(1).map((state, index) => distance(state, states[index]));
}

function traceIsDenseForWindow(trace, startFrame, endFrame) {
  if (trace.frameStep === 1 || trace.sampling?.mode === 'dense') return true;
  return (trace.sampling?.denseWindows ?? []).some((window) => (
    window.startFrame <= startFrame && window.endFrame >= endFrame
  ));
}

function largestUnchangedSampleInterval(elements, startFrame, endFrame, width, height) {
  let largest = null;
  for (const element of elements) {
    const samples = samplesWithin(element, startFrame, endFrame);
    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1];
      const current = samples[index];
      if (renderedStateDiffers(previous, current, width, height)) continue;
      const candidate = {
        startFrame: previous.frame,
        endFrame: current.frame + 1,
        frameCount: current.frame - previous.frame + 1,
      };
      if (!largest || candidate.frameCount > largest.frameCount) largest = candidate;
    }
  }
  return largest;
}

function msWindowToFrames(beat, recipe, shot, fps) {
  const toFrame = (milliseconds) => shot.startFrame
    + Math.round(((milliseconds - recipe.window.startMs) * fps) / 1000);
  return {
    startFrame: Math.max(shot.startFrame, toFrame(beat.startMs)),
    endFrame: Math.min(shot.endFrame, toFrame(beat.endMs)),
  };
}

function renderedStateDiffers(left, right, width, height) {
  return distance(stateVector(left, width, height), stateVector(right, width, height)) >= RENDERED_STATE_DELTA
    || left.visible !== right.visible
    || Boolean(left.appearanceHash && right.appearanceHash && left.appearanceHash !== right.appearanceHash);
}

function renderedDevelopmentEvidence(element, motions, startFrame, endFrame, width, height) {
  const samples = samplesWithin(element, Math.max(element.samples[0].frame, startFrame - 1), endFrame);
  if (samples.length < 2) return { hasDevelopment: false, developmentFrames: [] };
  const initial = samples[0];
  let latestAcceptedState = initial;
  const developmentFrames = [];
  for (const current of samples.slice(1)) {
    if (!renderedStateDiffers(latestAcceptedState, current, width, height)) continue;
    latestAcceptedState = current;
    developmentFrames.push(current.frame);
  }
  const isContinuousOnly = motions.every(({ kind }) => kind === 'continuous');
  const hasDevelopment = isContinuousOnly
    ? renderedStateDiffers(initial, samples.at(-1), width, height)
    : developmentFrames.length > 0;
  return { hasDevelopment, developmentFrames };
}

function longestUndeclaredDevelopmentGap(developmentFrames, startFrame, endFrame) {
  const frames = [...new Set(developmentFrames)].sort((left, right) => left - right);
  if (frames.length === 0) return { startFrame, endFrame: endFrame - 1, frameCount: endFrame - startFrame };
  const gaps = [];
  const first = frames[0];
  if (first > startFrame) gaps.push({ startFrame, endFrame: first - 1, frameCount: first - startFrame });
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1];
    const current = frames[index];
    if (current > previous + 1) {
      gaps.push({ startFrame: previous + 1, endFrame: current - 1, frameCount: current - previous - 1 });
    }
  }
  const last = frames.at(-1);
  if (last < endFrame - 1) gaps.push({ startFrame: last + 1, endFrame: endFrame - 1, frameCount: endFrame - last - 1 });
  return gaps.sort((left, right) => right.frameCount - left.frameCount || left.startFrame - right.startFrame)[0]
    ?? { startFrame, endFrame: startFrame, frameCount: 0 };
}

function analyzeBeatDelivery(trace, recipes) {
  if (!(recipes instanceof Map)) return [];
  const findings = [];
  const traceShotIds = new Set(trace.shots.map(({ shotId }) => shotId));
  for (const shot of trace.shots) {
    const recipe = recipes.get(shot.shotId);
    if (!recipe) {
      findings.push(finding('rhythm.recipe-missing', 'error', 'No Shot Recipe was supplied for this rendered shot.', shot.shotId, [], [shot.startFrame]));
      continue;
    }
    const beats = ['2.0.0', '3.0.0'].includes(recipe.schemaVersion)
      ? recipe.microBeats ?? []
      : (recipe.motion?.phases ?? []).map((phase, index) => ({
        beatId: `${phase.name}-${index + 1}`, startMs: phase.startMs, endMs: phase.endMs,
        change: phase.easingIntent === 'deliberate-stillness' || phase.name === 'hold'
          ? 'deliberate-stillness' : 'legacy-motion-phase',
      }));
    if (beats.length === 0) {
      findings.push(finding('rhythm.beats-missing', 'error', 'The supplied Recipe declares no animation beats.', shot.shotId, [], [shot.startFrame]));
      continue;
    }
    for (const beat of beats) {
      const { startFrame, endFrame } = msWindowToFrames(beat, recipe, shot, trace.fps);
      if (endFrame <= startFrame) {
        findings.push(finding('rhythm.beat-window-invalid', 'error', `Beat ${beat.beatId} does not map to a measurable rendered frame window.`, shot.shotId, [], [startFrame]));
        continue;
      }
      if (beat.change === 'deliberate-stillness') continue;
      const candidates = shot.elements.filter((element) => element.role !== 'decorative').map((element) => ({
        element,
        motions: (element.motions ?? []).filter((motion) => motion.startFrame < endFrame
          && motion.endFrame > startFrame
          && (['2.0.0', '3.0.0'].includes(recipe.schemaVersion)
            ? motion.beatIds?.includes(beat.beatId)
            : ['transition', 'cut'].includes(motion.kind))),
      })).filter(({ motions }) => motions.length > 0);
      if (candidates.length === 0) {
        findings.push(finding(
          'rhythm.beat-unbound', 'error',
          `Beat ${beat.beatId} has no beat-bound non-decorative rendered action; ambient or decorative motion cannot fulfill it.`,
          shot.shotId, [], [startFrame, endFrame - 1],
        ));
        continue;
      }
      const developed = candidates.map(({ element, motions }) => ({
        element,
        evidence: renderedDevelopmentEvidence(
          element, motions, startFrame, endFrame, trace.width, trace.height,
        ),
      })).filter(({ evidence }) => evidence.hasDevelopment);
      if (developed.length === 0) {
        const dense = traceIsDenseForWindow(trace, startFrame, endFrame);
        const unproven = dense ? null : largestUnchangedSampleInterval(
          candidates.map(({ element }) => element), startFrame, endFrame, trace.width, trace.height,
        );
        findings.push(finding(
          dense ? 'rhythm.beat-no-development' : 'evidence.dense-development-required', 'error',
          dense
            ? `Beat ${beat.beatId} is declared in the Recipe and motion metadata but produces no measurable rendered development.`
            : `Sampled states cannot prove development for beat ${beat.beatId}; capture only this beat window densely before making a pass claim.`,
          shot.shotId, candidates.map(({ element }) => element.id).sort(),
          unproven ? [unproven.startFrame, unproven.endFrame - 1] : [startFrame, endFrame - 1],
        ));
        continue;
      }
      const beatFrames = endFrame - startFrame;
      const longBeatRiskFrames = Math.ceil(trace.fps * LONG_BEAT_RISK_SECONDS);
      const idleRiskFrames = Math.ceil(beatFrames * LONG_BEAT_MAX_UNDECLARED_IDLE_FRACTION);
      if (beatFrames >= longBeatRiskFrames) {
        if (traceIsDenseForWindow(trace, startFrame, endFrame)) {
          const developmentGap = longestUndeclaredDevelopmentGap(
            developed.flatMap(({ evidence }) => evidence.developmentFrames), startFrame, endFrame,
          );
          if (developmentGap.frameCount >= idleRiskFrames) {
            findings.push(finding(
              'rhythm.beat-development-gap', 'error',
              `Long non-still beat ${beat.beatId} leaves at least 25% of its window without a new measurable subject state; split meaningful waiting into deliberate-stillness or deliver the planned development.`,
              shot.shotId, developed.map(({ element }) => element.id).sort(),
              [developmentGap.startFrame, developmentGap.endFrame],
            ));
          }
        } else {
          const unproven = largestUnchangedSampleInterval(
            candidates.map(({ element }) => element), startFrame, endFrame, trace.width, trace.height,
          );
          if (unproven && unproven.frameCount >= idleRiskFrames) {
            findings.push(finding(
              'evidence.dense-development-required', 'error',
              `Sampled states leave a long unchanged interval in beat ${beat.beatId}; capture only this bounded window densely before deciding whether development is missing.`,
              shot.shotId, candidates.map(({ element }) => element.id).sort(),
              [unproven.startFrame, unproven.endFrame - 1],
            ));
          }
        }
      }
    }
  }
  for (const recipeShotId of recipes.keys()) {
    if (!traceShotIds.has(recipeShotId)) {
      findings.push(finding('rhythm.shot-missing', 'error', 'A supplied Shot Recipe has no rendered shot trace.', recipeShotId, [], [trace.startFrame]));
    }
  }
  return findings;
}

function samplesWithin(element, startFrame, endFrame) {
  return element.samples.filter((sample) => sample.frame >= startFrame && sample.frame < endFrame);
}

function motionAt(element, frame) {
  return (element.motions ?? []).find((motion) => frame >= motion.startFrame && frame < motion.endFrame);
}

function overlapRatio(left, right) {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  const area = width * height;
  const smaller = Math.min(left.width * left.height, right.width * right.height);
  return smaller > 0 ? area / smaller : 0;
}

function overlapArea(left, right) {
  const overlapWidth = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const overlapHeight = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  return overlapWidth * overlapHeight;
}

function diagramRectangle(item) {
  return {
    left: item.x,
    top: item.y,
    right: item.x + item.width,
    bottom: item.y + item.height,
  };
}

function rectanglesTouch(left, right) {
  return left.left <= right.right && left.right >= right.left
    && left.top <= right.bottom && left.bottom >= right.top;
}

function segmentTouchesRectangle(start, end, rectangle) {
  let minimum = 0;
  let maximum = 1;
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const boundaries = [
    [-deltaX, start.x - rectangle.left],
    [deltaX, rectangle.right - start.x],
    [-deltaY, start.y - rectangle.top],
    [deltaY, rectangle.bottom - start.y],
  ];
  for (const [direction, distanceToBoundary] of boundaries) {
    if (direction === 0) {
      if (distanceToBoundary < 0) return false;
      continue;
    }
    const ratio = distanceToBoundary / direction;
    if (direction < 0) minimum = Math.max(minimum, ratio);
    else maximum = Math.min(maximum, ratio);
    if (minimum > maximum) return false;
  }
  return true;
}

function connectorSegments(connector) {
  return connector.points.slice(1).map((point, index) => ({
    start: connector.points[index],
    end: point,
  }));
}

function collinearOverlapLength(left, right) {
  const ax = left.end.x - left.start.x;
  const ay = left.end.y - left.start.y;
  const lengthSquared = ax ** 2 + ay ** 2;
  if (lengthSquared === 0) return 0;
  const cross = (point) => ax * (point.y - left.start.y) - ay * (point.x - left.start.x);
  const tolerance = Math.max(0.01, Math.sqrt(lengthSquared) * 0.001);
  if (Math.abs(cross(right.start)) > tolerance || Math.abs(cross(right.end)) > tolerance) return 0;
  const projection = (point) => ((point.x - left.start.x) * ax + (point.y - left.start.y) * ay) / lengthSquared;
  const rightStart = projection(right.start);
  const rightEnd = projection(right.end);
  const overlap = Math.min(1, Math.max(rightStart, rightEnd)) - Math.max(0, Math.min(rightStart, rightEnd));
  return Math.max(0, overlap) * Math.sqrt(lengthSquared);
}

function diagramRecipe(recipe) {
  return typeof recipe?.craft?.primary?.entryId === 'string'
    && recipe.craft.primary.entryId.startsWith('diagram-');
}

function analyzeDiagramLayouts(trace, recipes) {
  const findings = [];
  const emitted = new Set();
  const emit = (code, message, shotId, elementIds, frame) => {
    const key = `${code}\0${shotId}\0${frame}\0${[...elementIds].sort().join('\0')}`;
    if (emitted.has(key)) return;
    emitted.add(key);
    findings.push(finding(code, 'error', message, shotId, [...elementIds].sort(), [frame]));
  };
  for (const shot of trace.shots) {
    const frames = shot.diagramFrames ?? [];
    const recipe = recipes instanceof Map ? recipes.get(shot.shotId) : null;
    if (diagramRecipe(recipe)) {
      if (frames.length === 0) {
        findings.push(finding(
          'diagram.runtime-geometry-missing', 'error',
          'A selected diagram craft has no runtime-captured node, connector, and connector-label geometry.',
          shot.shotId, [], [shot.startFrame],
        ));
      } else {
        for (const hold of shot.readableHolds) {
          if (!frames.some(({ frame }) => frame >= hold.startFrame && frame < hold.endFrame)) {
            findings.push(finding(
              'diagram.hold-evidence-missing', 'error',
              'A diagram readable hold has no runtime-captured topology frame.',
              shot.shotId, [], [hold.startFrame, hold.endFrame - 1],
            ));
          }
        }
      }
    }
    for (const diagramFrame of frames) {
      const nodes = new Map(diagramFrame.nodes.map((node) => [node.id, node]));
      const connectors = new Map(diagramFrame.connectors.map((connector) => [connector.id, connector]));
      for (const item of [...diagramFrame.nodes, ...diagramFrame.labels]) {
        const rectangle = diagramRectangle(item);
        if (rectangle.left < 0 || rectangle.top < 0
          || rectangle.right > trace.width || rectangle.bottom > trace.height) {
          emit(
            'diagram.outside-canvas',
            'A diagram node or connector label leaves the canvas in a declared readable state.',
            shot.shotId, [item.id], diagramFrame.frame,
          );
        }
      }
      for (const connector of diagramFrame.connectors) {
        const segments = connectorSegments(connector);
        if (connector.points.some(({ x, y }) => x < 0 || y < 0 || x > trace.width || y > trace.height)) {
          emit(
            'diagram.outside-canvas',
            'A diagram connector leaves the canvas in a declared readable state.',
            shot.shotId, [connector.id], diagramFrame.frame,
          );
        }
        for (const node of diagramFrame.nodes) {
          if ([connector.fromNodeId, connector.toNodeId].includes(node.id)) continue;
          if (segments.some(({ start, end }) => segmentTouchesRectangle(start, end, diagramRectangle(node)))) {
            emit(
              'diagram.connector-crosses-node',
              'A connector crosses a node that is not its source or destination.',
              shot.shotId, [connector.id, node.id], diagramFrame.frame,
            );
          }
        }
      }
      for (const label of diagramFrame.labels) {
        const rectangle = diagramRectangle(label);
        for (const node of nodes.values()) {
          if (rectanglesTouch(rectangle, diagramRectangle(node))) {
            emit(
              'diagram.label-touches-node',
              'A connector label touches or overlaps a diagram node.',
              shot.shotId, [label.id, node.id], diagramFrame.frame,
            );
          }
        }
        for (const connector of connectors.values()) {
          if (connectorSegments(connector).some(({ start, end }) => segmentTouchesRectangle(start, end, rectangle))) {
            emit(
              'diagram.label-touches-connector',
              'A connector label touches or overlaps a connector path.',
              shot.shotId, [label.id, connector.id], diagramFrame.frame,
            );
          }
        }
      }
      for (let leftIndex = 0; leftIndex < diagramFrame.connectors.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < diagramFrame.connectors.length; rightIndex += 1) {
          const left = diagramFrame.connectors[leftIndex];
          const right = diagramFrame.connectors[rightIndex];
          const overlaps = connectorSegments(left).some((leftSegment) => connectorSegments(right)
            .some((rightSegment) => collinearOverlapLength(leftSegment, rightSegment) > 1));
          if (overlaps) {
            emit(
              'diagram.connector-path-overlap',
              'Two connectors share a visible path segment and cannot be traced independently.',
              shot.shotId, [left.id, right.id], diagramFrame.frame,
            );
          }
        }
      }
    }
  }
  return findings;
}

function occupiedGridRatio(entries, bounds, columns = 24, rows = 14) {
  let occupied = 0;
  for (let row = 0; row < rows; row += 1) {
    const y = bounds.top + ((row + 0.5) / rows) * (bounds.bottom - bounds.top);
    for (let column = 0; column < columns; column += 1) {
      const x = bounds.left + ((column + 0.5) / columns) * (bounds.right - bounds.left);
      if (entries.some(({ sample }) => sample.visible && sample.opacity >= 0.05
        && x >= sample.x && x <= sample.x + sample.width && y >= sample.y && y <= sample.y + sample.height)) occupied += 1;
    }
  }
  return occupied / (columns * rows);
}

function diagnosticWindows(findings, fps, traceStart, traceEnd) {
  const padding = Math.max(2, Math.ceil(fps * 0.2));
  const windows = findings.map((item) => ({
    shotId: item.shotId,
    reasonCodes: [item.code],
    startFrame: Math.max(traceStart, item.frames[0] - padding),
    endFrame: Math.min(traceEnd, item.frames.at(-1) + padding + 1),
  })).sort((left, right) => left.startFrame - right.startFrame);
  const merged = [];
  for (const item of windows) {
    const previous = merged.at(-1);
    if (previous && previous.shotId === item.shotId && item.startFrame <= previous.endFrame) {
      previous.endFrame = Math.max(previous.endFrame, item.endFrame);
      previous.reasonCodes = [...new Set([...previous.reasonCodes, ...item.reasonCodes])].sort();
    } else merged.push(item);
  }
  return merged;
}

export function analyzeMotionLayoutTrace(trace, recipes = null) {
  const invalid = validateTrace(trace);
  if (invalid.length > 0) {
    return {
      schemaVersion: '1.0.0', status: 'invalid', runtime: trace?.runtime ?? null,
      compositionId: trace?.compositionId ?? null, findingCount: invalid.length,
      findings: invalid.map((message) => ({ code: 'trace.invalid', severity: 'error', message })),
      diagnosticWindows: [], limitations: ['No motion or layout claim was made because the runtime trace is invalid.'],
    };
  }

  const findings = [
    ...analyzeBeatDelivery(trace, recipes),
    ...analyzeDiagramLayouts(trace, recipes),
  ];
  const { width, height, fps } = trace;
  const safe = trace.safeArea;
  for (const shot of trace.shots) {
    const primaryElements = shot.elements.filter((element) => element.role === 'primary');
    const secondaryElements = shot.elements.filter((element) => ['secondary', 'decorative'].includes(element.role));
    if (primaryElements.length === 0) {
      findings.push(finding('staging.primary-missing', 'error', 'Shot declares no primary visual element.', shot.shotId, [], [shot.startFrame]));
    } else if (secondaryElements.length > 0) {
      const strongestPrimary = Math.max(...primaryElements.map((element) => element.visualWeight));
      const strongestSecondary = Math.max(...secondaryElements.map((element) => element.visualWeight));
      if (strongestPrimary <= strongestSecondary) {
        findings.push(finding('staging.weak-primary-weight', 'warning', 'Primary visual weight does not exceed secondary elements.', shot.shotId, primaryElements.map((element) => element.id), [shot.startFrame]));
      }
    }
    for (const hold of shot.readableHolds) {
      if (hold.endFrame - hold.startFrame < Math.ceil(fps * 0.35)) {
        findings.push(finding('readability.hold-too-short', 'error', 'Readable hold is shorter than 350ms.', shot.shotId, [], [hold.startFrame, hold.endFrame - 1]));
      }
      const visibleMeaningful = shot.elements.some((element) => ['primary', 'text'].includes(element.role)
        && samplesWithin(element, hold.startFrame, hold.endFrame).some((sample) => sample.opacity >= 0.8));
      if (!visibleMeaningful) findings.push(finding('readability.no-focus', 'error', 'Readable hold has no visible primary or text element.', shot.shotId, [], [hold.startFrame, hold.endFrame - 1]));
      for (const element of shot.elements) {
        const samples = samplesWithin(element, hold.startFrame, hold.endFrame).filter((sample) => sample.opacity >= 0.05);
        const speeds = speedSeries(samples.filter((sample) => sample.visible), width, height);
        if (speeds.some((speed) => speed > 0.0025)) {
          findings.push(finding('motion.unstable-hold', 'error', 'An element is still changing during a declared readable hold.', shot.shotId, [element.id], [hold.startFrame, hold.endFrame - 1]));
        }
      }
    }

    for (const element of shot.elements) {
      for (const motion of element.motions ?? []) {
        if (motion.kind !== 'transition') continue;
        const samples = samplesWithin(element, motion.startFrame, motion.endFrame);
        if (!traceIsDenseForWindow(trace, motion.startFrame, motion.endFrame)) {
          for (let index = 1; index < samples.length; index += 1) {
            const previous = samples[index - 1];
            const current = samples[index];
            const frameDistance = current.frame - previous.frame;
            if (frameDistance <= 0) continue;
            const stateDistance = distance(
              stateVector(previous, width, height), stateVector(current, width, height),
            );
            const averagePerFrame = stateDistance / frameDistance;
            if (frameDistance === 1 && stateDistance > 0.1) {
              findings.push(finding(
                'motion.jump', 'error',
                'Per-frame geometry change exceeds 10% of the normalized canvas state.',
                shot.shotId, [element.id], [previous.frame, current.frame],
              ));
              break;
            }
            if (averagePerFrame > 0.06) {
              findings.push(finding(
                'evidence.dense-motion-required', 'error',
                'Sampled transition states change too quickly to distinguish a smooth move from a jump; capture only this interval densely.',
                shot.shotId, [element.id], [previous.frame, current.frame],
              ));
              break;
            }
          }
          continue;
        }
        const speeds = speedSeries(samples, width, height);
        if (speeds.length < 3) continue;
        const peak = Math.max(...speeds);
        const jumpIndex = speeds.findIndex((speed) => speed > 0.1);
        if (jumpIndex >= 0) {
          const frame = samples[jumpIndex + 1].frame;
          findings.push(finding('motion.jump', 'error', 'Per-frame geometry change exceeds 10% of the normalized canvas state.', shot.shotId, [element.id], [frame - 1, frame]));
        }
        if (peak > 0.003 && (speeds[0] > peak * 0.45 || speeds.at(-1) > peak * 0.45)) {
          findings.push(finding('motion.hard-edge', 'warning', 'A finite transition enters or exits near peak speed; inspect easing or an intentional cut.', shot.shotId, [element.id], [motion.startFrame, motion.endFrame - 1]));
        }
        const accelerations = speeds.slice(1).map((speed, index) => speed - speeds[index]);
        const jerks = accelerations.slice(1).map((acceleration, index) => acceleration - accelerations[index]);
        const jerkIndex = jerks.findIndex((jerk) => Math.abs(jerk) > 0.05);
        if (jerkIndex >= 0) {
          const frame = samples[jerkIndex + 2].frame;
          findings.push(finding('motion.jerk', 'warning', 'Transition acceleration changes abruptly.', shot.shotId, [element.id], [frame - 2, frame]));
        }
        let reversals = 0;
        for (let index = 1; index < samples.length - 1; index += 1) {
          const before = stateVector(samples[index - 1], width, height);
          const current = stateVector(samples[index], width, height);
          const after = stateVector(samples[index + 1], width, height);
          const a = current.map((value, dimension) => value - before[dimension]);
          const b = after.map((value, dimension) => value - current[dimension]);
          const magnitude = distance(a, [0, 0, 0, 0, 0]) * distance(b, [0, 0, 0, 0, 0]);
          const dot = a.reduce((sum, value, dimension) => sum + value * b[dimension], 0);
          if (magnitude > 0.000004 && dot / magnitude < -0.35) reversals += 1;
        }
        if (reversals > 3) findings.push(finding('motion.excessive-rebound', 'warning', `Transition reverses direction ${reversals} times.`, shot.shotId, [element.id], [motion.startFrame, motion.endFrame - 1]));
        if (motion.expectsSettle !== false && peak > 0.002) {
          const tail = speeds.slice(-Math.max(2, Math.ceil(fps * 0.1)));
          const settleThreshold = Math.max(0.0015, Math.min(0.003, peak * 0.12));
          if (Math.max(...tail) > settleThreshold) {
            findings.push(finding('motion.not-settled', 'error', 'Finite transition does not settle before its declared end.', shot.shotId, [element.id], [Math.max(motion.startFrame, motion.endFrame - tail.length - 1), motion.endFrame - 1]));
          }
        }
      }
    }

    const transitions = shot.elements.flatMap((element) => (element.motions ?? [])
      .filter((motion) => motion.kind === 'transition')
      .map((motion) => ({ ...motion, elementId: element.id })));
    const starts = new Map();
    for (const motion of transitions) starts.set(motion.startFrame, [...(starts.get(motion.startFrame) ?? []), motion.elementId]);
    for (const [frame, ids] of starts) {
      if (ids.length >= 4 && ids.length / Math.max(1, shot.elements.length) >= 0.65) {
        findings.push(finding('staging.synchronized-start', 'warning', 'Most moving elements start together, weakening attention hierarchy.', shot.shotId, ids.sort(), [frame]));
      }
    }

    const samplesByFrame = new Map();
    for (const element of shot.elements) {
      for (const sample of element.samples) {
        if (sample.opacity < 0.05) continue;
        samplesByFrame.set(sample.frame, [...(samplesByFrame.get(sample.frame) ?? []), { element, sample }]);
        const inMotion = motionAt(element, sample.frame);
        const safeAreaPolicy = element.safeAreaPolicy ?? (['primary', 'text'].includes(element.role) ? 'inside' : 'may-bleed');
        if (sample.visible && sample.clipped && ['primary', 'text'].includes(element.role) && inMotion?.kind !== 'transition') {
          findings.push(finding('layout.clipped-focus', 'error', 'A focus-bearing element is clipped outside a transition.', shot.shotId, [element.id], [sample.frame]));
          break;
        }
        if (sample.visible && safeAreaPolicy === 'inside' && inMotion?.kind !== 'transition'
          && (sample.x < safe.left || sample.y < safe.top
            || sample.x + sample.width > safe.right || sample.y + sample.height > safe.bottom)) {
          findings.push(finding('layout.safe-area', 'error', 'A focus-bearing element leaves the declared safe area outside a transition.', shot.shotId, [element.id], [sample.frame]));
          break;
        }
        if (sample.visible && inMotion?.kind !== 'transition' && (sample.x + sample.width <= 0 || sample.y + sample.height <= 0
          || sample.x >= width || sample.y >= height)) {
          findings.push(finding('layout.off-canvas', 'error', 'A visible element is wholly outside the canvas outside a transition.', shot.shotId, [element.id], [sample.frame]));
          break;
        }
      }
    }

    const pairWorst = new Map();
    const busyFrames = [];
    const densityFrames = [];
    const crowdingSeries = [];
    for (const [frame, entries] of samplesByFrame) {
      const movingFocusGroups = new Set();
      for (const { element } of entries) {
        if (motionAt(element, frame) && ['primary', 'secondary', 'text'].includes(element.role)) movingFocusGroups.add(element.focusGroup);
      }
      if (movingFocusGroups.size > 3) busyFrames.push(frame);
      const density = occupiedGridRatio(entries, safe);
      if (entries.length >= 7 && density > 0.72) densityFrames.push(frame);
      let primaryArea = 0;
      let secondaryArea = 0;
      let primaryOcclusion = 0;
      for (const primary of entries.filter(({ element }) => element.role === 'primary')) {
        const area = primary.sample.width * primary.sample.height * primary.sample.visibleAreaRatio;
        primaryArea += area;
        const covers = entries.filter(({ element, sample }) => element.id !== primary.element.id
          && (element.layer > primary.element.layer || sample.zIndex > primary.sample.zIndex));
        const occluded = Math.min(area, covers.reduce((sum, cover) => sum + overlapArea(primary.sample, cover.sample), 0));
        primaryOcclusion = Math.max(primaryOcclusion, area > 0 ? occluded / area : 0);
      }
      for (const secondary of entries.filter(({ element }) => ['secondary', 'decorative'].includes(element.role))) {
        secondaryArea += secondary.sample.width * secondary.sample.height * secondary.sample.visibleAreaRatio;
      }
      if (primaryArea > 0 && secondaryArea > primaryArea * 2.5) {
        findings.push(finding('layout.primary-area-dominated', 'warning', 'Secondary visible area overwhelms the primary visual area.', shot.shotId, primaryElements.map((element) => element.id), [frame]));
      }
      if (primaryOcclusion > 0.35) {
        findings.push(finding('layout.primary-occluded', 'error', `Higher layers cover ${Math.round(primaryOcclusion * 100)}% of a primary element.`, shot.shotId, primaryElements.map((element) => element.id), [frame]));
      }
      crowdingSeries.push({ frame, density, primaryArea, overlapCount: 0 });
      for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
          const left = entries[leftIndex];
          const right = entries[rightIndex];
          if (left.element.focusGroup === right.element.focusGroup) continue;
          if (left.element.allowOverlapWith?.includes(right.element.id) || right.element.allowOverlapWith?.includes(left.element.id)) continue;
          if (left.element.role === 'decorative' && right.element.role === 'decorative') continue;
          const ratio = overlapRatio(left.sample, right.sample);
          if (ratio < 0.4) continue;
          crowdingSeries.at(-1).overlapCount += 1;
          const key = [left.element.id, right.element.id].sort().join('\0');
          if (!pairWorst.has(key) || pairWorst.get(key).ratio < ratio) pairWorst.set(key, { frame, ratio, ids: [left.element.id, right.element.id].sort() });
        }
      }
    }
    if (busyFrames.length > 0) findings.push(finding('staging.too-many-moving-foci', 'warning', 'More than three independent focus groups move at once.', shot.shotId, [], [busyFrames[0], busyFrames.at(-1)]));
    if (densityFrames.length > 0) findings.push(finding('layout.excessive-density', 'warning', 'Many visible elements occupy more than 72% of the safe area.', shot.shotId, [], [densityFrames[0], densityFrames.at(-1)]));
    const trendWindow = Math.max(5, Math.ceil(fps * 0.3));
    for (let index = trendWindow; index < crowdingSeries.length; index += 1) {
      const before = crowdingSeries[index - trendWindow];
      const after = crowdingSeries[index];
      if (after.density - before.density > 0.16 && after.overlapCount >= before.overlapCount + 2
        && (before.primaryArea === 0 || after.primaryArea <= before.primaryArea * 1.05)) {
        findings.push(finding('layout.crowding-trend', 'warning', 'Density and overlaps accumulate without strengthening the primary visual.', shot.shotId, primaryElements.map((element) => element.id), [before.frame, after.frame]));
        break;
      }
    }
    for (const collision of pairWorst.values()) {
      findings.push(finding('layout.unplanned-overlap', 'warning', `Elements from different focus groups overlap ${Math.round(collision.ratio * 100)}%.`, shot.shotId, collision.ids, [collision.frame]));
    }
  }

  findings.sort((left, right) => (left.frames?.[0] ?? 0) - (right.frames?.[0] ?? 0)
    || left.code.localeCompare(right.code) || (left.elementIds?.[0] ?? '').localeCompare(right.elementIds?.[0] ?? ''));
  return {
    schemaVersion: '1.0.0', status: findings.length === 0 ? 'pass' : 'attention',
    runtime: trace.runtime, compositionId: trace.compositionId, compositionIdentity: trace.compositionIdentity,
    findingCount: findings.length, findings,
    diagnosticWindows: diagnosticWindows(findings, fps, trace.startFrame, trace.endFrame),
    limitations: [
      recipes instanceof Map
        ? `Beat delivery checks prove bounded non-decorative rendered state development. For non-still beats at least ${LONG_BEAT_RISK_SECONDS} seconds long, they also flag any leading, internal, or trailing interval of at least ${Math.round(LONG_BEAT_MAX_UNDECLARED_IDLE_FRACTION * 100)}% with no new bound subject state; this does not require motion at fixed intervals or judge rhythm quality.`
        : 'No Recipes were supplied, so planned beat delivery was not evaluated.',
      trace.frameStep === 1
        ? 'Dense runtime geometry covers every frame in the declared trace window.'
        : 'The normal trace is sampled at Recipe boundaries, readable holds, cuts, and necessary mechanism points; only reported diagnostic windows require dense recapture.',
      'Selected diagram craft additionally requires runtime-captured readable-hold topology; checks cover missing evidence, label/path collisions, connectors crossing unrelated nodes, shared connector paths, and canvas escape without prescribing a diagram style.',
      'Geometry can detect discontinuity, instability, crowding, clipping, and staging risk; it cannot prove story meaning, weight, arcs, exaggeration, or appeal.',
      'Representative moving scenes provide the early visual-lock decision; the complete identity-bound moving preview provides the final human aesthetic decision.',
    ],
  };
}

async function loadRecipes(directory) {
  const recipes = new Map();
  for (const entry of (await readdir(directory, { withFileTypes: true }))
    .filter((item) => item.isFile() && path.extname(item.name).toLowerCase() === '.json')
    .toSorted((left, right) => left.name.localeCompare(right.name))) {
    const recipe = JSON.parse(await readFile(path.join(directory, entry.name), 'utf8'));
    if (typeof recipe.shotId !== 'string' || recipe.shotId.length === 0) {
      throw new Error(`${entry.name} has no shotId`);
    }
    if (recipes.has(recipe.shotId)) throw new Error(`duplicate recipe shotId: ${recipe.shotId}`);
    recipes.set(recipe.shotId, recipe);
  }
  if (recipes.size === 0) throw new Error('recipe directory contains no JSON recipes');
  return recipes;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage()}\n`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  let trace;
  try {
    trace = JSON.parse(await readFile(path.resolve(options.trace), 'utf8'));
  } catch (error) {
    process.stderr.write(`Trace cannot be read: ${error.message}\n`);
    process.exitCode = 2;
    return;
  }
  let recipes = null;
  if (options.recipes) {
    try {
      recipes = await loadRecipes(path.resolve(options.recipes));
    } catch (error) {
      process.stderr.write(`Recipes cannot be read: ${error.message}\n`);
      process.exitCode = 2;
      return;
    }
  }
  const result = analyzeMotionLayoutTrace(trace, recipes);
  process.stdout.write(`${JSON.stringify(result, null, options.pretty ? 2 : 0)}\n`);
  if (result.status !== 'pass') process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
