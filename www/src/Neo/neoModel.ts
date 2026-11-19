// gp2040-neo: logic for the dedicated (Japanese) Mod Shortcut GUI.
// Pure functions only, so they can be tested with `node --test`.
import {
	MODE_HOLD,
	MOD_SHORTCUT_MAX_STEPS,
	SHORTCUT_BUTTONS,
	mirrorDirection,
	type ButtonNames,
	type Rule,
	type Step,
} from '../Data/ModShortcut.ts';

// Buttons ------------------------------------------------------------------
// `name` assumes the game uses its default button layout on an XInput pad
// (SF6: X = LP, Y = MP, RB = HP, A = LK, B = MK, RT = HK). `pad` is what the
// PC actually receives, shown as a smaller sub label.

export type NeoButton = {
	key: string;
	mask: number;
	name: string;
	pad: string;
	aliases: string[];
};

const maskOf = (key: string) =>
	SHORTCUT_BUTTONS.find((button) => button.key === key)?.mask ?? 0;

const button = (
	key: string,
	name: string,
	pad: string,
	aliases: string[] = [],
): NeoButton => ({ key, mask: maskOf(key), name, pad, aliases });

// Arcade layout: punches on the top row, kicks on the bottom row.
export const PUNCH_ROW: NeoButton[] = [
	button('B3', '弱P', 'X', ['LP']),
	button('B4', '中P', 'Y', ['MP']),
	button('R1', '強P', 'RB', ['HP']),
	button('L1', 'P4', 'LB'),
];
export const KICK_ROW: NeoButton[] = [
	button('B1', '弱K', 'A', ['LK']),
	button('B2', '中K', 'B', ['MK']),
	button('R2', '強K', 'RT', ['HK']),
	button('L2', 'K4', 'LT'),
];
export const OTHER_BUTTONS: NeoButton[] = [
	button('L3', 'L3', 'LS'),
	button('R3', 'R3', 'RS'),
	button('S1', 'Select', 'Back'),
	button('S2', 'Start', 'Start'),
	button('A1', 'Home', 'Guide'),
	button('A2', 'A2', 'Capture'),
];
export const NEO_BUTTONS = [...PUNCH_ROW, ...KICK_ROW, ...OTHER_BUTTONS];

// Display names, for formatSteps()
export const NEO_NAMES: ButtonNames = Object.fromEntries(
	NEO_BUTTONS.map((b) => [b.key, b.name]),
);
// Every name a user may type: 弱P, X, LP, B3 ...
export const NEO_ALIASES: ButtonNames[] = [
	NEO_NAMES,
	Object.fromEntries(NEO_BUTTONS.map((b) => [b.key, b.pad])),
	...[0, 1].map((i) =>
		Object.fromEntries(
			NEO_BUTTONS.filter((b) => b.aliases[i]).map((b) => [b.key, b.aliases[i]]),
		),
	),
];

export const buttonNamesOf = (mask: number): string[] =>
	NEO_BUTTONS.filter((b) => mask & b.mask).map((b) => b.name);

// Facing ---------------------------------------------------------------------
// Commands are written for the 1P side (facing right). A rule that fires on
// "forward" directions (6/3/9) is the 2P side, where the player holds back
// toward the right, so the command is mirrored.

export type Side = '1P' | '2P';

const LEFT_DIRECTIONS = (1 << 1) | (1 << 4) | (1 << 7);
const RIGHT_DIRECTIONS = (1 << 3) | (1 << 6) | (1 << 9);

export const sideForDirections = (directionMask: number): Side | null => {
	const left = (directionMask & LEFT_DIRECTIONS) !== 0;
	const right = (directionMask & RIGHT_DIRECTIONS) !== 0;
	if (left === right) return null;
	return left ? '1P' : '2P';
};

// Templates ------------------------------------------------------------------

export type MoveTemplate = {
	id: string;
	name: string;
	motion: number[]; // 1P side, numpad
	hint: string; // what the motion is, e.g. "623"
};

export const MOVE_TEMPLATES: MoveTemplate[] = [
	{ id: 'dp', name: '昇龍', motion: [6, 2, 3], hint: '623' },
	{ id: 'qcf', name: '波動', motion: [2, 3, 6], hint: '236' },
	{ id: 'qcb', name: '竜巻', motion: [2, 1, 4], hint: '214' },
	{ id: 'rdp', name: '逆昇龍', motion: [4, 2, 1], hint: '421' },
	{ id: 'hcf', name: '半回転', motion: [4, 1, 2, 3, 6], hint: '41236' },
	{ id: 'qcf2', name: '真空', motion: [2, 3, 6, 2, 3, 6], hint: '236236' },
	{ id: 'qcb2', name: '竜巻×2', motion: [2, 1, 4, 2, 1, 4], hint: '214214' },
	{ id: 'button', name: 'ボタンだけ', motion: [], hint: '5' },
];

export type ButtonTemplate = { id: string; name: string; keys: string[] };

// SF6 universal mechanics on the default layout
export const SYSTEM_TEMPLATES: ButtonTemplate[] = [
	{ id: 'throw', name: '投げ', keys: ['B3', 'B1'] },
	{ id: 'parry', name: 'パリィ', keys: ['B4', 'B2'] },
	{ id: 'impact', name: 'インパクト', keys: ['R1', 'R2'] },
];

export const keysToMask = (keys: string[]) =>
	keys.reduce((mask, key) => mask | maskOf(key), 0);

const DEFAULT_FRAMES = 2;
const FINISH_FRAMES = 3;

// Steps for a move. The button is pressed on the last direction of the motion
// and held a little longer so the game cannot miss it.
export const buildMoveSteps = (
	motion: number[],
	buttons: number,
	side: Side,
): Step[] => {
	const directions = side === '2P' ? motion.map(mirrorDirection) : motion;
	if (directions.length === 0) {
		return [{ direction: 5, buttons, frames: FINISH_FRAMES }];
	}
	return directions
		.slice(0, MOD_SHORTCUT_MAX_STEPS)
		.map((direction, i, list) =>
			i === list.length - 1
				? { direction, buttons, frames: FINISH_FRAMES }
				: { direction, buttons: 0, frames: DEFAULT_FRAMES },
		);
};

// The buttons a sequence "fires": those of its last step.
export const finishButtons = (rule: Rule) =>
	rule.steps.length ? rule.steps[rule.steps.length - 1].buttons : 0;

export const setFinishButtons = (rule: Rule, buttons: number): Rule => {
	if (rule.steps.length === 0) {
		return { ...rule, steps: [{ direction: 5, buttons, frames: FINISH_FRAMES }] };
	}
	const last = rule.steps.length - 1;
	return {
		...rule,
		steps: rule.steps.map((s, i) => (i === last ? { ...s, buttons } : s)),
	};
};

// The template a sequence matches, if any (either side).
export const matchTemplate = (rule: Rule): MoveTemplate | undefined => {
	if (rule.mode === MODE_HOLD) return undefined;
	const directions = rule.steps.map((s) => s.direction);
	const onlyLastHasButtons = rule.steps.every(
		(s, i) => i === rule.steps.length - 1 || s.buttons === 0,
	);
	if (!onlyLastHasButtons) return undefined;
	const same = (a: number[], b: number[]) =>
		a.length === b.length && a.every((v, i) => v === b[i]);
	return MOVE_TEMPLATES.find((t) => {
		const motion = t.motion.length ? t.motion : [5];
		return same(directions, motion) || same(directions, motion.map(mirrorDirection));
	});
};

// Plain-language summary of a rule, e.g. "← ↙ で Mod → 623+弱P"
export const totalFrames = (rule: Rule) =>
	(rule.mode === MODE_HOLD ? rule.steps.slice(0, 1) : rule.steps).reduce(
		(sum, s) => sum + s.frames,
		0,
	);

// Pins -------------------------------------------------------------------------
// GpioAction values (proto/enums.proto), kept as numbers so this file has no
// generated imports.

export const GPIO_NONE = -10;
export const GPIO_RESERVED = -5;
export const GPIO_ASSIGNED_TO_ADDON = 0;
export const GPIO_MOD_SHORTCUT = 200;

// Controller functions a pin can have, in the order of an arcade panel.
export type ControllerFunction = {
	action: number;
	name: string;
	pad: string; // what the PC receives (XInput)
	group: 'lever' | 'punch' | 'kick' | 'system' | 'extra';
	required: boolean; // warn when no pin has it
};

const fn = (
	action: number,
	name: string,
	pad: string,
	group: ControllerFunction['group'],
	required = true,
): ControllerFunction => ({ action, name, pad, group, required });

export const FUNCTIONS: ControllerFunction[] = [
	fn(1, '上', 'Up', 'lever'),
	fn(2, '下', 'Down', 'lever'),
	fn(3, '左', 'Left', 'lever'),
	fn(4, '右', 'Right', 'lever'),
	fn(7, '弱P', 'X', 'punch'),
	fn(8, '中P', 'Y', 'punch'),
	fn(10, '強P', 'RB', 'punch'),
	fn(9, 'P4', 'LB', 'punch'),
	fn(5, '弱K', 'A', 'kick'),
	fn(6, '中K', 'B', 'kick'),
	fn(12, '強K', 'RT', 'kick'),
	fn(11, 'K4', 'LT', 'kick'),
	fn(13, 'Select', 'Back', 'system'),
	fn(14, 'Start', 'Start', 'system'),
	fn(15, 'Home', 'Guide', 'system', false),
	fn(16, 'A2', 'Capture', 'extra', false),
	fn(17, 'L3', 'LS', 'extra', false),
	fn(18, 'R3', 'RS', 'extra', false),
	fn(200, 'Mod', 'neo', 'extra', false),
	fn(19, 'Fn', 'Fn', 'extra', false),
];

export const functionOf = (action: number) =>
	FUNCTIONS.find((f) => f.action === action);

// Negative values other than RESERVED mean "not mapped" (NONE is -10, older
// configs may hold other negative values).
export const isUnused = (action: number) => action < 0 && action !== GPIO_RESERVED;
// Pins owned by add-ons (LEDs, display) or the board cannot be edited here.
export const isLocked = (action: number) =>
	action === GPIO_RESERVED || action === GPIO_ASSIGNED_TO_ADDON;

export const actionName = (action: number) => {
	const f = functionOf(action);
	if (f) return f.pad === f.name || f.group === 'lever' ? f.name : `${f.name} (${f.pad})`;
	if (isUnused(action)) return '未使用';
	if (isLocked(action)) return action === GPIO_RESERVED ? '予約済み' : 'アドオン';
	return `機能 ${action}`;
};

// On a Raspberry Pi Pico these pins are wired to the board itself
// (SMPS mode, VBUS sense, LED, VSYS); some Pico compatible boards break
// them out or put a button on them instead.
export const INTERNAL_PINS = [23, 24, 25, 29];
export const PIN_COUNT = 30;

export const pinKey = (pin: number) => `pin${String(pin).padStart(2, '0')}`;

type PinMap = Record<string, { action: number } | unknown>;

export const actionAt = (mappings: PinMap, pin: number): number | undefined => {
	const entry = mappings[pinKey(pin)] as { action?: number } | undefined;
	return typeof entry?.action === 'number' ? entry.action : undefined;
};

const ALL_PINS = Array.from({ length: PIN_COUNT }, (_, pin) => pin);

export const pinsWith = (mappings: PinMap, action: number): number[] =>
	ALL_PINS.filter((pin) => actionAt(mappings, pin) === action);

export const modPins = (mappings: PinMap): number[] =>
	pinsWith(mappings, GPIO_MOD_SHORTCUT);

// Pins that can be edited, with what they do now.
export type PinChoice = {
	pin: number;
	key: string; // "pin07"
	action: number;
	group: 'free' | 'button' | 'internal';
};

export const pinChoices = (mappings: PinMap): PinChoice[] => {
	const choices: PinChoice[] = [];
	for (const pin of ALL_PINS) {
		const action = actionAt(mappings, pin);
		if (action === undefined || isLocked(action)) continue;
		const group = INTERNAL_PINS.includes(pin)
			? 'internal'
			: isUnused(action)
				? 'free'
				: 'button';
		choices.push({ pin, key: pinKey(pin), action, group });
	}
	const order = { free: 0, button: 1, internal: 2 };
	return choices.sort((a, b) => order[a.group] - order[b.group] || a.pin - b.pin);
};

const withAction = (entry: unknown, action: number) => ({
	...(entry as object),
	action,
	customButtonMask: 0,
	customDpadMask: 0,
});

// One pin gets `action` (GPIO_NONE clears it). Locked pins never change.
export const setPinAction = <T extends PinMap>(mappings: T, pin: number, action: number): T => {
	const current = actionAt(mappings, pin);
	if (current === undefined || isLocked(current)) return mappings;
	return { ...mappings, [pinKey(pin)]: withAction(mappings[pinKey(pin)], action) };
};

// Give `action` to exactly one pin (or none with null). Pins that had the
// action become unused; the pin's previous function loses that pin.
export const assignFunction = <T extends PinMap>(
	mappings: T,
	action: number,
	pin: number | null,
): T => {
	let next = mappings;
	for (const old of pinsWith(mappings, action)) {
		if (old !== pin) next = setPinAction(next, old, GPIO_NONE);
	}
	return pin === null ? next : setPinAction(next, pin, action);
};

export const withModPin = <T extends PinMap>(mappings: T, pin: number | null): T =>
	assignFunction(mappings, GPIO_MOD_SHORTCUT, pin);

// Required functions that no pin has.
export const missingFunctions = (mappings: PinMap): ControllerFunction[] =>
	FUNCTIONS.filter((f) => f.required && pinsWith(mappings, f.action).length === 0);

// Pins whose mapping differs between two snapshots.
export const changedPins = (a: PinMap, b: PinMap): number[] =>
	ALL_PINS.filter((pin) => actionAt(a, pin) !== actionAt(b, pin));
