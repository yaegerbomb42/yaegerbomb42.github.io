import pulse from './pulse.js';
import digits from './digits.js';
import matrix from './matrix.js';
import stroop from './stroop.js';
import rotate from './rotate.js';
import nback from './nback.js';
import series from './series.js';
import cipher from './cipher.js';
import chimp from './chimp.js';
import logic from './logic.js';

// Assessment order alternates domains to limit fatigue.
export const GAMES = [pulse, matrix, stroop, digits, rotate, series, cipher, chimp, logic, nback];
