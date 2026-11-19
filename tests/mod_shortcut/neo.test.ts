// Tests for www/src/Neo/neoModel.ts. Run: node --test 'tests/mod_shortcut/*.test.ts'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	tryParseSteps,
	formatSteps,
	MODE_HOLD,
	MODE_SEQUENCE,
	type Rule,
} from '../../www/src/Data/ModShortcut.ts';
import {
	NEO_ALIASES,
	NEO_NAMES,
	buildMoveSteps,
	keysToMask,
	matchTemplate,
	sideForDirections,
	setFinishButtons,
	finishButtons,
	pinChoices,
	withModPin,
	modPins,
	GPIO_NONE,
	GPIO_MOD_SHORTCUT,
	assignFunction,
	setPinAction,
	pinsWith,
	actionAt,
	missingFunctions,
	changedPins,
} from '../../www/src/Neo/neoModel.ts';

const X = keysToMask(['B3']);

const rule = (over: Partial<Rule>): Rule => ({
	enabled: true,
	label: '',
	directionMask: 0,
	mode: MODE_SEQUENCE,
	steps: [],
	...over,
});

test('move steps press the button on the last direction', () => {
	assert.deepEqual(buildMoveSteps([6, 2, 3], X, '1P'), [
		{ direction: 6, buttons: 0, frames: 2 },
		{ direction: 2, buttons: 0, frames: 2 },
		{ direction: 3, buttons: X, frames: 3 },
	]);
});

test('2P side mirrors the motion', () => {
	assert.deepEqual(
		buildMoveSteps([6, 2, 3], X, '2P').map((s) => s.direction),
		[4, 2, 1],
	);
});

test('a button-only template is a single neutral step', () => {
	assert.deepEqual(buildMoveSteps([], X, '1P'), [
		{ direction: 5, buttons: X, frames: 3 },
	]);
});

test('side follows the lever directions', () => {
	assert.equal(sideForDirections((1 << 4) | (1 << 1)), '1P');
	assert.equal(sideForDirections((1 << 6) | (1 << 3)), '2P');
	assert.equal(sideForDirections(1 << 5), null);
	assert.equal(sideForDirections((1 << 4) | (1 << 6)), null);
});

test('templates are recognised on either side', () => {
	assert.equal(matchTemplate(rule({ steps: buildMoveSteps([2, 3, 6], X, '1P') }))?.id, 'qcf');
	assert.equal(matchTemplate(rule({ steps: buildMoveSteps([6, 2, 3], X, '2P') }))?.id, 'dp');
	// a button in the middle of the motion is not a template any more
	const steps = buildMoveSteps([6, 2, 3], X, '1P');
	steps[0].buttons = X;
	assert.equal(matchTemplate(rule({ steps })), undefined);
	assert.equal(matchTemplate(rule({ mode: MODE_HOLD, steps })), undefined);
});

test('finish buttons are the last step', () => {
	const r = rule({ steps: buildMoveSteps([6, 2, 3], X, '1P') });
	const LK = keysToMask(['B1']);
	const changed = setFinishButtons(r, X | LK);
	assert.equal(finishButtons(changed), X | LK);
	assert.equal(changed.steps[0].buttons, 0);
	assert.equal(finishButtons(setFinishButtons(rule({}), LK)), LK);
});

test('Japanese, pad and English names all parse', () => {
	for (const text of ['623+弱P', '623+X', '623+LP', '623+B3']) {
		const { steps, error } = tryParseSteps(text, NEO_ALIASES);
		assert.equal(error, undefined, text);
		assert.deepEqual(steps.map((s) => s.direction), [6, 2, 3]);
		assert.equal(steps[2].buttons, X);
	}
	// "B" is XInput B (= 中K, GP2040 B2), not GP2040 B1
	assert.equal(tryParseSteps('B', NEO_ALIASES).steps[0].buttons, keysToMask(['B2']));
	assert.equal(formatSteps(buildMoveSteps([6, 2, 3], X, '1P'), NEO_NAMES), '6 2 3+弱P:3');
});

const pins = (actions: Record<number, number>) =>
	Object.fromEntries(
		Array.from({ length: 30 }, (_, pin) => [
			`pin${String(pin).padStart(2, '0')}`,
			{ action: actions[pin] ?? GPIO_NONE, customButtonMask: 0, customDpadMask: 0 },
		]),
	);

test('pin choices skip add-on and reserved pins', () => {
	const choices = pinChoices(pins({ 0: 3, 6: 14, 15: 0, 16: -5, 22: 18, 28: GPIO_NONE }));
	const listed = choices.map((c) => c.pin);
	for (const pin of [15, 16]) assert.ok(!listed.includes(pin), `GP${pin}`);
	assert.equal(choices.find((c) => c.pin === 0)?.group, 'button');
	assert.equal(choices.find((c) => c.pin === 22)?.group, 'button');
	assert.equal(choices.find((c) => c.pin === 28)?.group, 'free');
	assert.equal(choices.find((c) => c.pin === 24)?.group, 'internal');
	// free pins first
	assert.equal(choices[0].group, 'free');
});

test('assigning a function moves it and frees the old pin', () => {
	const LP = 7;
	const MP = 8;
	const start = pins({ 10: LP, 11: MP, 15: 0 });
	const next = assignFunction(start, LP, 11);
	assert.deepEqual(pinsWith(next, LP), [11]);
	assert.equal(actionAt(next, 10), GPIO_NONE);
	// 中P lost its only pin
	assert.deepEqual(pinsWith(next, MP), []);
	assert.ok(missingFunctions(next).some((f) => f.action === MP));
	assert.deepEqual(changedPins(start, next), [10, 11]);
	// add-on pins never change
	assert.equal(actionAt(assignFunction(start, LP, 15), 15), 0);
	assert.equal(actionAt(setPinAction(start, 15, LP), 15), 0);
	// clearing
	assert.deepEqual(pinsWith(assignFunction(start, LP, null), LP), []);
});

test('moving the Mod pin frees the old one', () => {
	const start = { ...pins({ 22: 18 }), profileLabel: 'Base', enabled: true };
	const first = withModPin(start, 22);
	assert.deepEqual(modPins(first), [22]);
	const second = withModPin(first, 28);
	assert.deepEqual(modPins(second), [28]);
	assert.equal((second.pin22 as { action: number }).action, GPIO_NONE);
	assert.equal((second.pin28 as { action: number }).action, GPIO_MOD_SHORTCUT);
	assert.equal(second.profileLabel, 'Base');
	assert.deepEqual(modPins(withModPin(second, null)), []);
});
