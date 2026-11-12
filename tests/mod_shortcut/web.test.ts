// Tests for www/src/Data/ModShortcut.ts. Run: node --test tests/mod_shortcut/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	packStep,
	unpackStep,
	parseSteps,
	tryParseSteps,
	formatSteps,
	mirrorRule,
	mirrorDirection,
	directionToDpadBits,
	dpadBitsToDirection,
	toWire,
	fromWire,
	truncateUtf8,
	shadowedDirections,
	MODE_HOLD,
	MODE_SEQUENCE,
} from '../../www/src/Data/ModShortcut.ts';

const xinput = { B1: 'A', B2: 'B', B3: 'X', B4: 'Y', L1: 'LB', R1: 'RB', L2: 'LT', R2: 'RT', S1: 'Back', S2: 'Start', L3: 'LS', R3: 'RS', A1: 'Guide', A2: '-' };
const X = 1 << 2;
const L3 = 1 << 10;
const bit = (...dirs: number[]) => dirs.reduce((m, d) => m | (1 << d), 0);

test('packing matches the firmware layout', () => {
	// Values produced by modshortcut::packStep in config_utils.cpp defaults
	assert.equal(packStep({ direction: 6, buttons: 0, frames: 2 }), (2 << 20) | (1 << 19));
	assert.equal(packStep({ direction: 3, buttons: X, frames: 3 }), (3 << 20) | (1 << 17) | (1 << 19) | X);
	assert.equal(packStep({ direction: 5, buttons: L3, frames: 1 }), (1 << 20) | L3);
	assert.equal(packStep({ direction: 6, buttons: 0, frames: 999 }) >>> 20, 255);
	assert.equal(packStep({ direction: 6, buttons: 0, frames: 0 }) >>> 20, 1);
	for (let d = 1; d <= 9; d++) {
		assert.equal(dpadBitsToDirection(directionToDpadBits(d)), d);
		const step = { direction: d, buttons: X | L3, frames: 7 };
		assert.deepEqual(unpackStep(packStep(step)), step);
	}
});

test('mirroring swaps left and right only', () => {
	assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map(mirrorDirection), [3, 2, 1, 6, 5, 4, 9, 8, 7]);
	const rule = {
		enabled: true,
		label: 'DP',
		directionMask: bit(1, 4),
		mode: MODE_SEQUENCE,
		steps: [
			{ direction: 6, buttons: 0, frames: 2 },
			{ direction: 2, buttons: 0, frames: 2 },
			{ direction: 3, buttons: X, frames: 3 },
		],
	};
	const mirrored = mirrorRule(rule);
	assert.equal(mirrored.directionMask, bit(3, 6));
	assert.deepEqual(mirrored.steps.map((s) => s.direction), [4, 2, 1]);
	assert.equal(rule.directionMask, bit(1, 4)); // original untouched
});

test('notation parsing', () => {
	assert.deepEqual(parseSteps('6 2 3 3+X:3', xinput).steps, [
		{ direction: 6, buttons: 0, frames: 2 },
		{ direction: 2, buttons: 0, frames: 2 },
		{ direction: 3, buttons: 0, frames: 2 },
		{ direction: 3, buttons: X, frames: 3 },
	]);
	assert.deepEqual(parseSteps('623+x', xinput).steps, [
		{ direction: 6, buttons: 0, frames: 2 },
		{ direction: 2, buttons: 0, frames: 2 },
		{ direction: 3, buttons: X, frames: 2 },
	]);
	assert.deepEqual(parseSteps('LS', xinput).steps, [{ direction: 5, buttons: L3, frames: 2 }]);
	assert.deepEqual(parseSteps('l3:1', xinput).steps, [{ direction: 5, buttons: L3, frames: 1 }]);
	// XInput "B" is B2, GP2040 "B3" is X
	assert.equal(parseSteps('B', xinput).steps[0].buttons, 1 << 1);
	assert.equal(parseSteps('B3', xinput).steps[0].buttons, X);
	assert.deepEqual(parseSteps('6, 2 → 3', xinput).steps.map((s) => s.direction), [6, 2, 3]);
	assert.equal(tryParseSteps('6 2 3+Z', xinput).error, 'Z');
	assert.equal(tryParseSteps('6 :3', xinput).error, ':3');
});

test('notation round trip', () => {
	for (const text of ['6 2 3 3+X:3', 'LS:1', '4 1 2 3 6+X+Y', '5:10 6']) {
		const { steps } = parseSteps(text, xinput);
		assert.equal(formatSteps(steps, xinput), text);
	}
});

test('wire conversion', () => {
	const options = {
		enabled: true,
		activePreset: 0,
		presets: [
			{
				label: 'リュウ',
				rules: [
					{ enabled: true, label: 'Parry', directionMask: bit(5), mode: MODE_HOLD, steps: [{ direction: 5, buttons: L3, frames: 1 }, { direction: 6, buttons: 0, frames: 2 }] },
				],
			},
		],
	};
	const wire = toWire(options);
	assert.equal(wire.presets[0].rules[0].steps.length, 1); // hold keeps only the first step
	assert.deepEqual(fromWire(wire).presets[0].rules[0].steps, [{ direction: 5, buttons: L3, frames: 1 }]);
	assert.equal(JSON.stringify(fromWire(JSON.parse(JSON.stringify(wire)))), JSON.stringify(fromWire(wire)));
});

test('utf-8 truncation never splits a character', () => {
	assert.equal(truncateUtf8('ケン・マスターズ', 10), 'ケン・'); // 3 bytes per char
	assert.equal(truncateUtf8('Ryu', 32), 'Ryu');
});

test('shadowed directions', () => {
	const r = (mask: number, enabled = true) => ({ enabled, label: '', directionMask: mask, mode: 0, steps: [{ direction: 5, buttons: X, frames: 1 }] });
	assert.deepEqual(shadowedDirections([r(bit(1, 4)), r(bit(4, 7)), r(bit(4), false)]), [0, bit(4), 0]);
});
