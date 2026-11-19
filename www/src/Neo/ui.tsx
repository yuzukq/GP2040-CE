// gp2040-neo: small terminal-style building blocks shared by the tabs.
import { ReactNode, SelectHTMLAttributes } from 'react';

import { DIRECTION_ARROWS, NUMPAD_LAYOUT, Step } from '../Data/ModShortcut.ts';
import {
	KICK_ROW,
	NeoButton,
	OTHER_BUTTONS,
	PUNCH_ROW,
	buttonNamesOf,
	keysToMask,
} from './neoModel.ts';

export const FRAME_MS = 1000 / 60;

export const Panel = ({
	title,
	right,
	focus,
	children,
	className = '',
	id,
}: {
	title: ReactNode;
	right?: ReactNode;
	focus?: boolean;
	children: ReactNode;
	className?: string;
	id?: string;
}) => (
	<section box-="square" className={`panel ${focus ? 'is-focus' : ''} ${className}`} id={id}>
		<div className="panel-title">
			<h2>{title}</h2>
			{right && <div className="panel-right">{right}</div>}
		</div>
		<div className="panel-body">{children}</div>
	</section>
);

export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => (
	<span className="select-wrap">
		<select {...props} />
	</span>
);

export const Msg = ({
	kind,
	children,
}: {
	kind: 'warn' | 'err' | 'info';
	children: ReactNode;
}) => <span className={`msg is-${kind}`}>{children}</span>;

// 3x3 lever in numpad layout (7 8 9 / 4 5 6 / 1 2 3)
export const Lever = ({
	isOn,
	isWarn,
	onPress,
	label,
}: {
	isOn: (n: number) => boolean;
	isWarn?: (n: number) => boolean;
	onPress: (n: number) => void;
	label: string;
}) => (
	<div className="lever" role="group" aria-label={label}>
		{NUMPAD_LAYOUT.map((n) => (
			<button
				key={n}
				type="button"
				aria-pressed={isOn(n)}
				className={isWarn?.(n) ? 'is-warn' : ''}
				onClick={() => onPress(n)}
			>
				<span>{n === 5 ? 'N' : DIRECTION_ARROWS[n]}</span>
				<small>{n}</small>
			</button>
		))}
	</div>
);

// Option list drawn as ( ) / (*) radio items
export const Segment = <T extends string | number>({
	value,
	options,
	onChange,
	label,
}: {
	value: T;
	options: { value: T; label: ReactNode }[];
	onChange: (value: T) => void;
	label: string;
}) => (
	<div className="segment" role="radiogroup" aria-label={label}>
		{options.map((o) => (
			<button
				key={String(o.value)}
				type="button"
				role="radio"
				aria-checked={o.value === value}
				aria-pressed={o.value === value}
				onClick={() => onChange(o.value)}
			>
				{o.label}
			</button>
		))}
	</div>
);

// Arcade buttons as toggles: punches on top, kicks below (staggered)
export const ButtonPad = ({
	mask,
	onChange,
	label,
	showOthers,
}: {
	mask: number;
	onChange: (mask: number) => void;
	label: string;
	showOthers?: boolean;
}) => {
	const others =
		showOthers || (mask & keysToMask(OTHER_BUTTONS.map((b) => b.key))) !== 0;
	const row = (buttons: NeoButton[], kind: string) => (
		<div className={`pad-row ${kind}`}>
			{buttons.map((b) => (
				<button
					key={b.key}
					type="button"
					aria-pressed={(mask & b.mask) !== 0}
					onClick={() => onChange(mask ^ b.mask)}
				>
					{b.name}
					<small>{b.pad}</small>
				</button>
			))}
		</div>
	);
	return (
		<div className="pad" role="group" aria-label={label}>
			{row(PUNCH_ROW, 'is-punch')}
			{row(KICK_ROW, 'is-kick')}
			{others && row(OTHER_BUTTONS, 'is-other')}
		</div>
	);
};

export const stepText = (step: Step) => {
	const names = buttonNamesOf(step.buttons);
	const dir = step.direction === 5 && names.length ? '' : DIRECTION_ARROWS[step.direction];
	return { dir, buttons: names.join('+') };
};

export const CommandText = ({ steps }: { steps: Step[] }) => (
	<div className="command" aria-label="入力">
		{steps.map((step, i) => {
			const { dir, buttons } = stepText(step);
			return (
				<span key={i}>
					{i > 0 && ' '}
					{dir}
					{buttons && <span className="btn">{dir ? '+' : ''}{buttons}</span>}
				</span>
			);
		})}
	</div>
);

// One cell per frame, so timing is visible at a glance
export const FrameStrip = ({ steps }: { steps: Step[] }) => (
	<div className="frames" aria-hidden="true">
		{steps.flatMap((step, i) =>
			Array.from({ length: Math.min(step.frames, 60) }, (_, f) => (
				<span
					key={`${i}-${f}`}
					className={`${step.buttons ? 'is-press' : ''} ${f === 0 && i > 0 ? 'is-first' : ''}`}
				>
					{f === 0 ? (step.direction === 5 ? '·' : DIRECTION_ARROWS[step.direction]) : ''}
				</span>
			)),
		)}
	</div>
);
