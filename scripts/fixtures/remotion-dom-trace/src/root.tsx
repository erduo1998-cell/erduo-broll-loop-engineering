import React from 'react';
import {AbsoluteFill, Composition, Easing, interpolate, useCurrentFrame} from 'remotion';

const field = '#0b1020';
const paper = '#f6f1e8';
const signal = '#ff7a45';

const Canvas: React.FC<React.PropsWithChildren<{label: string}>> = ({label, children}) => (
  <AbsoluteFill style={{backgroundColor: field, color: paper, fontFamily: 'Arial, sans-serif', padding: 28, boxSizing: 'border-box', display: 'flex', flexDirection: 'column'}}>
    <div style={{fontSize: 14, letterSpacing: 2, opacity: 0.65}}>{label}</div>
    {children}
  </AbsoluteFill>
);

export const CompareShot: React.FC = () => {
  const frame = useCurrentFrame();
  const gap = interpolate(frame, [2, 11], [0, 18], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  return <Canvas label="COMPARE">
    <div style={{display: 'flex', gap, alignItems: 'stretch', flex: 1, paddingTop: 24}}>
      <div style={{flex: 1, border: `2px solid ${paper}`, padding: 18, opacity: 0.65}}>OLD<br/>manual</div>
      <div data-erduo-trace-id="compare-hero" data-erduo-role="primary" data-erduo-focus-group="hero" data-erduo-layer="2" data-erduo-visual-weight="1" data-erduo-motions='[{"startFrame":0,"endFrame":18,"kind":"transition","expectsSettle":true,"beatIds":["b1"]}]' style={{flex: 1, background: paper, color: field, padding: 18, transform: `translateY(${interpolate(frame, [2, 11], [18, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)})}px)`}}>NEW<br/><b>direct shot</b></div>
    </div>
  </Canvas>;
};

export const ProcessShot: React.FC = () => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [4, 12], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  return <Canvas label="PROCESS">
    <div data-erduo-trace-id="process-hero" data-erduo-role="primary" data-erduo-focus-group="hero" data-erduo-layer="2" data-erduo-visual-weight="1" data-erduo-motions='[{"startFrame":2,"endFrame":18,"kind":"transition","expectsSettle":true,"beatIds":["b1"]}]' style={{display: 'flex', alignItems: 'center', gap: 12, flex: 1, transform: `translateX(${progress * 10}px)`}}>
      {['Recipe', 'Source', 'Shot'].map((item, index) => <React.Fragment key={item}>
        {index > 0 && <div style={{height: 3, width: 42, background: signal, transformOrigin: 'left', transform: `scaleX(${Math.max(0, Math.min(1, progress * 3 - index + 1))})`}}/>}
        <div style={{padding: '18px 14px', border: `2px solid ${index === 2 ? signal : paper}`, borderRadius: 8}}>{item}</div>
      </React.Fragment>)}
    </div>
  </Canvas>;
};

export const StateChangeShot: React.FC = () => {
  const frame = useCurrentFrame();
  const settle = interpolate(frame, [2, 11], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic)});
  return <Canvas label="STATE CHANGE">
    <div style={{display: 'grid', placeItems: 'center', flex: 1}}>
      <div data-erduo-trace-id="state-hero" data-erduo-role="primary" data-erduo-focus-group="hero" data-erduo-layer="2" data-erduo-visual-weight="1" data-erduo-motions='[{"startFrame":0,"endFrame":18,"kind":"transition","expectsSettle":true,"beatIds":["b1"]}]' style={{width: 100, height: 100, borderRadius: 50, display: 'grid', placeItems: 'center', background: signal, color: field, transform: `scale(${0.72 + settle * 0.28})`}}>
        <b>{frame < 10 ? 'BUILD' : 'READY'}</b>
      </div>
    </div>
  </Canvas>;
};

export const CanaryRoot: React.FC = () => <>
  <Composition id="S01" component={CompareShot} durationInFrames={30} fps={30} width={320} height={180}/>
  <Composition id="S02" component={ProcessShot} durationInFrames={30} fps={30} width={320} height={180}/>
  <Composition id="S03" component={StateChangeShot} durationInFrames={30} fps={30} width={320} height={180}/>
</>;
