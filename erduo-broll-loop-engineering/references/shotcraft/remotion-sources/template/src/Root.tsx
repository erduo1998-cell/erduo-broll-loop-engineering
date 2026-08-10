import { Composition } from 'remotion';
import { AiflMain, AIFL_TOTAL } from './aifl/Main';

export const Root: React.FC = () => {
  return (
    <Composition
      id="AiflPromo"
      component={AiflMain}
      durationInFrames={AIFL_TOTAL}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
