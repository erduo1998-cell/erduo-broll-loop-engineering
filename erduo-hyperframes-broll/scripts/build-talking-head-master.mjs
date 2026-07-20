import { promises as fs } from 'node:fs';
import { defaultExecFileAsync } from './doctor.mjs';
import { probeMedia } from './probe-media.mjs';

export class TalkingHeadMasterError extends Error { constructor(code,message){super(message);this.name='TalkingHeadMasterError';this.code=code;} }
const fail=(code,message)=>{throw new TalkingHeadMasterError(code,message)};
export function validateTalkingHeadMasterInputs(source, visual, timelineDurationMs) {
  if (!source?.video?.primary || !source?.audio?.primary || !visual?.video?.primary || visual?.audio?.count !== 0 || !Number.isSafeInteger(timelineDurationMs) || timelineDurationMs <= 0) fail('invalid_media_contract','Talking-head master inputs are invalid.');
  if (source.duration_ms !== timelineDurationMs || visual.duration_ms !== timelineDurationMs) fail('duration_mismatch','Source, visual master, and SRT timeline must have identical duration.');
  return { duration_ms: timelineDurationMs, source_audio_stream_index: source.audio.primary.stream_index, visual_video_stream_index: visual.video.primary.stream_index };
}
export async function muxTalkingHeadMaster(sourcePath, visualPath, outputPath, timelineDurationMs, { probe=probeMedia, execFile=defaultExecFileAsync, platform=process.platform }={}) {
  const [source,visual]=await Promise.all([probe(sourcePath,{platform}),probe(visualPath,{platform})]);const contract=validateTalkingHeadMasterInputs(source,visual,timelineDurationMs);const ffmpeg=platform==='win32'?'ffmpeg.exe':'ffmpeg';
  try { await execFile(ffmpeg,['-y','-i',visualPath,'-i',sourcePath,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','copy','-shortest',outputPath],{maxBuffer:1024*1024}); } catch { fail('mux_failed','Talking-head master audio could not be muxed.'); }
  const output=await probe(outputPath,{platform});
  if (output.duration_ms!==timelineDurationMs || output.video.count!==1 || output.audio.count!==1) fail('mux_verification_failed','Talking-head master did not preserve exactly one source audio track.');
  return { schema_version:1,mode:'talking-head',duration_ms:timelineDurationMs,video_codec:output.video.primary.codec,audio_codec:output.audio.primary.codec,source_audio_stream_index:contract.source_audio_stream_index };
}
