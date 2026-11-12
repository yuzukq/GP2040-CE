// gp2040-neo: data helpers for the Mod Shortcut add-on.
// Must stay in sync with headers/addons/mod_shortcut_engine.h and proto/config.proto.

export const MOD_SHORTCUT_MAX_PRESETS = 8;
export const MOD_SHORTCUT_MAX_RULES = 6;
export const MOD_SHORTCUT_MAX_STEPS = 10;
export const MOD_SHORTCUT_MAX_FRAMES = 255;
export const PRESET_LABEL_MAX_BYTES = 32;
export const RULE_LABEL_MAX_BYTES = 24;

export const MODE_SEQUENCE = 0;
export const MODE_HOLD = 1;

const STEP_INPUT_MASK = 0x000fffff;
const STEP_BUTTON_MASK = 0x0000ffff;
const STEP_FRAMES_SHIFT = 20;

// Step dpad bits (GAMEPAD_MASK_DU/DD/DL/DR)
const DU = 1 << 16;
const DD = 1 << 17;
const DL = 1 << 18;
const DR = 1 << 19;

// Buttons that make sense in a shortcut, in GP2040 naming (GAMEPAD_MASK_*).
export const SHORTCUT_BUTTONS = [
	{ key: 'B1', mask: 1 << 0 },
	{ key: 'B2', mask: 1 << 1 },
	{ key: 'B3', mask: 1 << 2 },
	{ key: 'B4', mask: 1 << 3 },
	{ key: 'L1', mask: 1 << 4 },
	{ key: 'R1', mask: 1 << 5 },
	{ key: 'L2', mask: 1 << 6 },
	{ key: 'R2', mask: 1 << 7 },
	{ key: 'L3', mask: 1 << 10 },
	{ key: 'R3', mask: 1 << 11 },
	{ key: 'S1', mask: 1 << 8 },
	{ key: 'S2', mask: 1 << 9 },
	{ key: 'A1', mask: 1 << 12 },
	{ key: 'A2', mask: 1 << 13 },
] as const;

export type Step = {
	direction: number; // numpad 1-9, 5 = neutral
	buttons: number; // GAMEPAD_MASK_* bits 0-15
	frames: number; // 1-255
};

export type Rule = {
	enabled: boolean;
	label: string;
	directionMask: number; // bit n = numpad direction n
	mode: number;
	steps: Step[];
};

export type Preset = {
	label: string;
	rules: Rule[];
};

export type ModShortcutOptions = {
	enabled: boolean;
	activePreset: number;
	presets: Preset[];
};

// Wire format used by /api/getModShortcutOptions and /api/setModShortcutOptions
type WireRule = Omit<Rule, 'steps'> & { steps: number[] };
type WirePreset = { label: string; rules: WireRule[] };
export type WireOptions = {
	enabled: boolean;
	activePreset: number;
	presets: WirePreset[];
};

// Numpad notation ----------------------------------------------------------

export const NUMPAD_LAYOUT = [7, 8, 9, 4, 5, 6, 1, 2, 3];

export const DIRECTION_ARROWS: Record<number, string> = {
	1: '↙',
	2: '↓',
	3: '↘',
	4: '←',
	5: 'N',
	6: '→',
	7: '↖',
	8: '↑',
	9: '↗',
};

export const directionToDpadBits = (numpad: number): number => {
	const h = ((numpad - 1) % 3) - 1; // -1 left, 0, 1 right
	const v = Math.floor((numpad - 1) / 3) - 1; // -1 down, 0, 1 up
	return (
		(h < 0 ? DL : 0) | (h > 0 ? DR : 0) | (v < 0 ? DD : 0) | (v > 0 ? DU : 0)
	);
};

export const dpadBitsToDirection = (bits: number): number => {
	const left = (bits & DL) !== 0;
	const right = (bits & DR) !== 0;
	const up = (bits & DU) !== 0;
	const down = (bits & DD) !== 0;
	const h = left === right ? 0 : left ? -1 : 1;
	const v = up === down ? 0 : up ? 1 : -1;
	return 5 + h + 3 * v;
};

export const mirrorDirection = (numpad: number): number => {
	const column = (numpad - 1) % 3;
	return numpad - column + (2 - column);
};

export const mirrorDirectionMask = (mask: number): number => {
	let mirrored = 0;
	for (let n = 1; n <= 9; n++) {
		if (mask & (1 << n)) mirrored |= 1 << mirrorDirection(n);
	}
	return mirrored;
};

// Packing ------------------------------------------------------------------

const clampFrames = (frames: number) =>
	Math.min(MOD_SHORTCUT_MAX_FRAMES, Math.max(1, Math.round(frames) || 1));

export const packStep = (step: Step): number =>
	((clampFrames(step.frames) << STEP_FRAMES_SHIFT) >>> 0) +
	((directionToDpadBits(step.direction) | (step.buttons & STEP_BUTTON_MASK)) &
		STEP_INPUT_MASK);

export const unpackStep = (packed: number): Step => ({
	direction: dpadBitsToDirection(packed),
	buttons: packed & STEP_BUTTON_MASK,
	frames: clampFrames((packed >>> STEP_FRAMES_SHIFT) & 0xff),
});

export const fromWire = (wire: WireOptions): ModShortcutOptions => ({
	enabled: wire.enabled !== false,
	activePreset: wire.activePreset ?? 0,
	presets: (wire.presets ?? []).map((preset) => ({
		label: preset.label ?? '',
		rules: (preset.rules ?? []).map((rule) => ({
			enabled: Boolean(rule.enabled),
			label: rule.label ?? '',
			directionMask: rule.directionMask ?? 0,
			mode: rule.mode === MODE_HOLD ? MODE_HOLD : MODE_SEQUENCE,
			steps: (rule.steps ?? []).map(unpackStep),
		})),
	})),
});

export const toWire = (options: ModShortcutOptions): WireOptions => ({
	enabled: options.enabled,
	activePreset: options.activePreset,
	presets: options.presets.slice(0, MOD_SHORTCUT_MAX_PRESETS).map((preset) => ({
		label: truncateUtf8(preset.label, PRESET_LABEL_MAX_BYTES),
		rules: preset.rules.slice(0, MOD_SHORTCUT_MAX_RULES).map((rule) => ({
			enabled: rule.enabled,
			label: truncateUtf8(rule.label, RULE_LABEL_MAX_BYTES),
			directionMask: rule.directionMask & 0x3fe,
			mode: rule.mode,
			// A hold rule only uses its first step
			steps: rule.steps
				.slice(0, rule.mode === MODE_HOLD ? 1 : MOD_SHORTCUT_MAX_STEPS)
				.map(packStep),
		})),
	})),
});

// Labels are stored in fixed-size buffers (bytes, not characters)
export const utf8Length = (text: string) =>
	new TextEncoder().encode(text).length;

export const truncateUtf8 = (text: string, maxBytes: number): string => {
	let result = '';
	let bytes = 0;
	for (const char of text) {
		const charBytes = utf8Length(char);
		if (bytes + charBytes > maxBytes) break;
		result += char;
		bytes += charBytes;
	}
	return result;
};

// Mirroring ----------------------------------------------------------------

export const mirrorRule = (rule: Rule): Rule => ({
	...rule,
	label: rule.label,
	directionMask: mirrorDirectionMask(rule.directionMask),
	steps: rule.steps.map((step) => ({
		...step,
		direction: mirrorDirection(step.direction),
	})),
});

// Text notation --------------------------------------------------------------
// "6 2 3 3+X:3" = 6 for the default length, ..., 3 with X for 3 frames.
// "623+X" is shorthand for "6 2 3+X".
// Buttons can be written with the current label set (X, LB, ...) or with
// GP2040 names (B3, L1, ...). A lone button ("X") keeps the previous direction
// neutral, i.e. direction 5.

export type ButtonNames = Partial<Record<string, string>>;

const normalise = (name: string) =>
	name.trim().toLowerCase().replace(/\s+/g, '');

const buttonLookup = (buttonNames: ButtonNames) => {
	const lookup = new Map<string, number>();
	for (const { key, mask } of SHORTCUT_BUTTONS) {
		lookup.set(normalise(key), mask);
	}
	// Label names win over GP2040 names (e.g. XInput "B" is B2)
	for (const { key, mask } of SHORTCUT_BUTTONS) {
		const label = buttonNames[key];
		if (label && label !== '-') lookup.set(normalise(label), mask);
	}
	return lookup;
};

export const buttonLabel = (key: string, buttonNames: ButtonNames) => {
	const label = buttonNames[key];
	return label && label !== '-' ? label : key;
};

export const formatSteps = (
	steps: Step[],
	buttonNames: ButtonNames,
	defaultFrames = 2,
) =>
	steps
		.map((step) => {
			const buttons = SHORTCUT_BUTTONS.filter(
				({ mask }) => step.buttons & mask,
			).map(({ key }) => buttonLabel(key, buttonNames));
			let token =
				step.direction === 5 && buttons.length ? '' : String(step.direction);
			if (buttons.length) token += (token ? '+' : '') + buttons.join('+');
			if (step.frames !== defaultFrames) token += `:${step.frames}`;
			return token;
		})
		.join(' ');

export type ParseResult = { steps: Step[]; error?: string };

export const parseSteps = (
	text: string,
	buttonNames: ButtonNames,
	defaultFrames = 2,
): ParseResult => {
	const lookup = buttonLookup(buttonNames);
	const tokens = text.split(/[\s,>→]+/).filter(Boolean);
	const steps: Step[] = [];
	for (const token of tokens) {
		const match = token.match(/^([^:]*)(?::(\d+)f?)?$/i);
		if (!match) return { steps, error: token };
		const [, body, framesText] = match;
		const parts = body.split('+').filter(Boolean);
		let direction = 5;
		let buttons = 0;
		parts.forEach((part, index) => {
			if (index === 0 && /^[1-9]+$/.test(part)) {
				// "623" is shorthand for "6 2 3"
				const digits = part.split('').map(Number);
				direction = digits.pop() as number;
				for (const digit of digits) {
					steps.push({ direction: digit, buttons: 0, frames: defaultFrames });
				}
				return;
			}
			const mask = lookup.get(normalise(part));
			if (mask === undefined) throw new Error(part);
			buttons |= mask;
		});
		if (!parts.length) return { steps, error: token };
		steps.push({
			direction,
			buttons,
			frames: framesText ? clampFrames(Number(framesText)) : defaultFrames,
		});
	}
	return { steps };
};

export const tryParseSteps = (
	text: string,
	buttonNames: ButtonNames,
	defaultFrames = 2,
): ParseResult => {
	try {
		return parseSteps(text, buttonNames, defaultFrames);
	} catch (e) {
		return { steps: [], error: (e as Error).message };
	}
};

// Rules that can never fire because an earlier rule already uses every
// one of their directions.
export const shadowedDirections = (rules: Rule[]): number[] => {
	let taken = 0;
	return rules.map((rule) => {
		if (!rule.enabled || rule.steps.length === 0) return 0;
		const shadowed = rule.directionMask & taken;
		taken |= rule.directionMask;
		return shadowed;
	});
};

export const newRule = (): Rule => ({
	enabled: true,
	label: '',
	directionMask: 0,
	mode: MODE_SEQUENCE,
	steps: [{ direction: 5, buttons: 0, frames: 2 }],
});

export const newPreset = (label: string): Preset => ({
	label,
	rules: [newRule()],
});
