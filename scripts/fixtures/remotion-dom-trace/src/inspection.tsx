import type React from 'react';
import {CompareShot, ProcessShot, StateChangeShot} from './root';

export const erduoInspectionCompositions: Record<string, React.ComponentType> = {
  S01: CompareShot,
  S02: ProcessShot,
  S03: StateChangeShot,
};
