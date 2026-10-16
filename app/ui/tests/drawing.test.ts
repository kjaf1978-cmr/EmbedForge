// Readable drawings (D28, and the owner's note of 16 October on the printed schematics): no text
// of a part (reference, value) or net label lies on another part, on other text or on a wire.
import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../src/eda/examples';
import { textCollisions } from './drawing.helpers';

describe('readable drawings', () => {
  for (const ex of EXAMPLES) it(`${ex.id}: no text on a part, on other text or on a wire`, () => expect(textCollisions(ex.build())).toEqual([]));
});
