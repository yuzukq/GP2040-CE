// gp2040-neo: Mod Shortcut configuration page
import { useContext, useEffect, useMemo, useState } from 'react';
import {
	Alert,
	Badge,
	Button,
	ButtonGroup,
	Card,
	Col,
	Form,
	InputGroup,
	ListGroup,
	Row,
	Table,
} from 'react-bootstrap';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { GpioAction } from '@proto/enums';

import { AppContext } from '../Contexts/AppContext';
import Section from '../Components/Section';
import WebApi from '../Services/WebApi';
import { getButtonLabels } from '../Data/Buttons';
import useProfilesStore, { getProfilePins } from '../Store/useProfilesStore';
import {
	ButtonNames,
	DIRECTION_ARROWS,
	MODE_HOLD,
	MODE_SEQUENCE,
	MOD_SHORTCUT_MAX_FRAMES,
	MOD_SHORTCUT_MAX_PRESETS,
	MOD_SHORTCUT_MAX_RULES,
	MOD_SHORTCUT_MAX_STEPS,
	ModShortcutOptions,
	NUMPAD_LAYOUT,
	PRESET_LABEL_MAX_BYTES,
	Preset,
	RULE_LABEL_MAX_BYTES,
	Rule,
	SHORTCUT_BUTTONS,
	Step,
	buttonLabel,
	formatSteps,
	fromWire,
	mirrorRule,
	newPreset,
	newRule,
	shadowedDirections,
	toWire,
	truncateUtf8,
	tryParseSteps,
} from '../Data/ModShortcut';

const FRAME_MS = 1000 / 60;

const directionList = (mask: number) =>
	[1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => mask & (1 << n));

const move = <T,>(list: T[], from: number, to: number): T[] => {
	if (to < 0 || to >= list.length) return list;
	const copy = [...list];
	const [item] = copy.splice(from, 1);
	copy.splice(to, 0, item);
	return copy;
};

// 3x3 numpad grid ------------------------------------------------------------

type NumpadProps = {
	selected: (numpad: number) => boolean;
	onToggle: (numpad: number) => void;
	size?: 'sm' | 'lg';
	idPrefix: string;
	invalid?: (numpad: number) => boolean;
};

const NumpadGrid = ({
	selected,
	onToggle,
	size,
	idPrefix,
	invalid,
}: NumpadProps) => (
	<div
		className="d-inline-grid gap-1"
		style={{ display: 'inline-grid', gridTemplateColumns: 'repeat(3, 2.4rem)' }}
	>
		{NUMPAD_LAYOUT.map((n) => (
			<Button
				key={`${idPrefix}-${n}`}
				size={size}
				variant={
					selected(n)
						? invalid?.(n)
							? 'warning'
							: 'primary'
						: 'outline-secondary'
				}
				className="p-0"
				style={{ height: '2.4rem' }}
				title={String(n)}
				onClick={() => onToggle(n)}
			>
				<div style={{ lineHeight: 1 }}>{DIRECTION_ARROWS[n]}</div>
				<small style={{ fontSize: '0.6rem', opacity: 0.7 }}>{n}</small>
			</Button>
		))}
	</div>
);

// Steps --------------------------------------------------------------------

type StepRowProps = {
	step: Step;
	index: number;
	hold: boolean;
	buttonNames: ButtonNames;
	onChange: (step: Step) => void;
	onDelete?: () => void;
	onMove: (offset: number) => void;
	idPrefix: string;
};

const StepRow = ({
	step,
	index,
	hold,
	buttonNames,
	onChange,
	onDelete,
	onMove,
	idPrefix,
}: StepRowProps) => {
	const { t } = useTranslation('');
	return (
		<tr>
			<td className="align-middle text-center">{index + 1}</td>
			<td className="align-middle">
				<Form.Select
					size="sm"
					style={{ minWidth: '5.5rem' }}
					value={step.direction}
					aria-label={t('ModShortcut:step-direction')}
					onChange={(e) =>
						onChange({ ...step, direction: Number(e.target.value) })
					}
				>
					{[5, 6, 3, 2, 1, 4, 7, 8, 9].map((n) => (
						<option key={n} value={n}>
							{n} {DIRECTION_ARROWS[n]}
						</option>
					))}
				</Form.Select>
			</td>
			<td className="align-middle">
				<div className="d-flex flex-wrap gap-1">
					{SHORTCUT_BUTTONS.filter(
						({ key, mask }) =>
							buttonNames[key] !== '-' || (step.buttons & mask) !== 0,
					).map(({ key, mask }) => (
						<Button
							key={`${idPrefix}-${key}`}
							size="sm"
							variant={step.buttons & mask ? 'primary' : 'outline-secondary'}
							className="py-0 px-2"
							title={key}
							onClick={() =>
								onChange({ ...step, buttons: step.buttons ^ mask })
							}
						>
							{buttonLabel(key, buttonNames)}
						</Button>
					))}
				</div>
			</td>
			{!hold && (
				<td className="align-middle" style={{ width: '9rem' }}>
					<InputGroup size="sm">
						<Form.Control
							type="number"
							min={1}
							max={MOD_SHORTCUT_MAX_FRAMES}
							value={step.frames}
							aria-label={t('ModShortcut:step-frames')}
							onChange={(e) =>
								onChange({
									...step,
									frames: Math.min(
										MOD_SHORTCUT_MAX_FRAMES,
										Math.max(1, Number(e.target.value) || 1),
									),
								})
							}
						/>
						<InputGroup.Text>F</InputGroup.Text>
					</InputGroup>
				</td>
			)}
			{!hold && (
				<td className="align-middle text-nowrap">
					<ButtonGroup size="sm">
						<Button variant="outline-secondary" onClick={() => onMove(-1)}>
							↑
						</Button>
						<Button variant="outline-secondary" onClick={() => onMove(1)}>
							↓
						</Button>
						<Button
							variant="outline-danger"
							disabled={!onDelete}
							title={t('ModShortcut:delete')}
							onClick={onDelete}
						>
							{'\u2715'}
						</Button>
					</ButtonGroup>
				</td>
			)}
		</tr>
	);
};

// Rule ---------------------------------------------------------------------

type RuleCardProps = {
	rule: Rule;
	index: number;
	count: number;
	shadowed: number;
	buttonNames: ButtonNames;
	canAdd: boolean;
	onChange: (rule: Rule) => void;
	onDelete: () => void;
	onMove: (offset: number) => void;
	onMirror: () => void;
	idPrefix: string;
};

const RuleCard = ({
	rule,
	index,
	count,
	shadowed,
	buttonNames,
	canAdd,
	onChange,
	onDelete,
	onMove,
	onMirror,
	idPrefix,
}: RuleCardProps) => {
	const { t } = useTranslation('');
	const hold = rule.mode === MODE_HOLD;
	const steps = hold ? rule.steps.slice(0, 1) : rule.steps;
	// Frames do not matter for a hold rule, so leave them out of the notation
	const notation = hold
		? formatSteps(
				steps.map((s) => ({ ...s, frames: 2 })),
				buttonNames,
			)
		: formatSteps(steps, buttonNames);
	// The text box shows the current steps unless the user is typing in it
	const [draft, setDraft] = useState<string | null>(null);
	const [notationError, setNotationError] = useState('');
	const notationText = draft ?? notation;

	const applyNotation = () => {
		if (draft === null) return;
		const result = tryParseSteps(draft, buttonNames);
		if (result.error !== undefined || result.steps.length === 0) {
			setNotationError(result.error || draft);
			return;
		}
		if (result.steps.length > MOD_SHORTCUT_MAX_STEPS) {
			setNotationError(
				t('ModShortcut:too-many-steps', { max: MOD_SHORTCUT_MAX_STEPS }),
			);
			return;
		}
		setNotationError('');
		setDraft(null);
		onChange({
			...rule,
			steps: hold ? result.steps.slice(0, 1) : result.steps,
		});
	};

	const setStep = (stepIndex: number, step: Step) => {
		setDraft(null);
		setNotationError('');
		onChange({
			...rule,
			steps: rule.steps.map((s, i) => (i === stepIndex ? step : s)),
		});
	};

	const totalFrames = steps.reduce((sum, s) => sum + s.frames, 0);
	const unusedRule = rule.enabled && rule.directionMask === 0;
	const fullyShadowed =
		rule.enabled && rule.directionMask !== 0 && shadowed === rule.directionMask;

	return (
		<Card className={`mb-3 ${rule.enabled ? '' : 'opacity-75'}`}>
			<Card.Header>
				<Row className="g-2 align-items-center">
					<Col xs="auto">
						<Badge bg="secondary">#{index + 1}</Badge>
					</Col>
					<Col xs="auto">
						<Form.Check
							type="switch"
							id={`${idPrefix}-enabled`}
							label={t('ModShortcut:rule-enabled')}
							checked={rule.enabled}
							onChange={() => onChange({ ...rule, enabled: !rule.enabled })}
						/>
					</Col>
					<Col xs={12} sm style={{ minWidth: '10rem' }}>
						<Form.Control
							size="sm"
							value={rule.label}
							placeholder={t('ModShortcut:rule-label-placeholder')}
							onChange={(e) =>
								onChange({
									...rule,
									label: truncateUtf8(e.target.value, RULE_LABEL_MAX_BYTES),
								})
							}
						/>
					</Col>
					<Col xs="auto">
						<Form.Select
							size="sm"
							value={rule.mode}
							onChange={(e) =>
								onChange({ ...rule, mode: Number(e.target.value) })
							}
						>
							<option value={MODE_SEQUENCE}>
								{t('ModShortcut:mode-sequence')}
							</option>
							<option value={MODE_HOLD}>{t('ModShortcut:mode-hold')}</option>
						</Form.Select>
					</Col>
					<Col xs="auto">
						<ButtonGroup size="sm">
							<Button
								variant="outline-secondary"
								disabled={index === 0}
								title={t('ModShortcut:move-up')}
								onClick={() => onMove(-1)}
							>
								↑
							</Button>
							<Button
								variant="outline-secondary"
								disabled={index === count - 1}
								title={t('ModShortcut:move-down')}
								onClick={() => onMove(1)}
							>
								↓
							</Button>
							<Button
								variant="outline-secondary"
								disabled={!canAdd}
								title={t('ModShortcut:mirror-help')}
								onClick={onMirror}
							>
								{t('ModShortcut:mirror')}
							</Button>
							<Button variant="outline-danger" onClick={onDelete}>
								{t('ModShortcut:delete')}
							</Button>
						</ButtonGroup>
					</Col>
				</Row>
			</Card.Header>
			<Card.Body>
				<Row className="g-4">
					<Col md="auto">
						<Form.Label className="d-block small fw-bold">
							{t('ModShortcut:trigger-label')}
						</Form.Label>
						<NumpadGrid
							idPrefix={`${idPrefix}-trigger`}
							selected={(n) => (rule.directionMask & (1 << n)) !== 0}
							invalid={(n) => (shadowed & (1 << n)) !== 0}
							onToggle={(n) =>
								onChange({
									...rule,
									directionMask: rule.directionMask ^ (1 << n),
								})
							}
						/>
						<div className="small text-body-secondary mt-1">
							{directionList(rule.directionMask).join(', ') || '-'}
						</div>
					</Col>
					<Col>
						<Form.Label className="small fw-bold">
							{hold
								? t('ModShortcut:hold-output-label')
								: t('ModShortcut:steps-label')}
						</Form.Label>
						<InputGroup size="sm" className="mb-2">
							<InputGroup.Text>{t('ModShortcut:notation')}</InputGroup.Text>
							<Form.Control
								value={notationText}
								isInvalid={notationError !== ''}
								onChange={(e) => setDraft(e.target.value)}
								onBlur={applyNotation}
								onKeyDown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										applyNotation();
									}
								}}
							/>
							<Form.Control.Feedback type="invalid">
								{t('ModShortcut:notation-error', { token: notationError })}
							</Form.Control.Feedback>
						</InputGroup>
						<Table size="sm" bordered className="mb-2">
							<thead>
								<tr className="small">
									<th className="text-center">#</th>
									<th>{t('ModShortcut:step-direction')}</th>
									<th>{t('ModShortcut:step-buttons')}</th>
									{!hold && <th>{t('ModShortcut:step-frames')}</th>}
									{!hold && <th />}
								</tr>
							</thead>
							<tbody>
								{steps.map((step, i) => (
									<StepRow
										key={`${idPrefix}-step-${i}`}
										idPrefix={`${idPrefix}-step-${i}`}
										step={step}
										index={i}
										hold={hold}
										buttonNames={buttonNames}
										onChange={(s) => setStep(i, s)}
										onMove={(offset) =>
											onChange({
												...rule,
												steps: move(rule.steps, i, i + offset),
											})
										}
										onDelete={
											steps.length > 1
												? () =>
														onChange({
															...rule,
															steps: rule.steps.filter((_, j) => j !== i),
														})
												: undefined
										}
									/>
								))}
							</tbody>
						</Table>
						<div className="d-flex align-items-center gap-3">
							{!hold && (
								<Button
									size="sm"
									variant="outline-primary"
									disabled={rule.steps.length >= MOD_SHORTCUT_MAX_STEPS}
									onClick={() =>
										onChange({
											...rule,
											steps: [
												...rule.steps,
												{ ...rule.steps[rule.steps.length - 1], buttons: 0 },
											],
										})
									}
								>
									{t('ModShortcut:add-step')}
								</Button>
							)}
							<small className="text-body-secondary">
								{hold
									? t('ModShortcut:hold-help')
									: t('ModShortcut:total', {
											frames: totalFrames,
											ms: Math.round(totalFrames * FRAME_MS),
										})}
							</small>
						</div>
					</Col>
				</Row>
				{unusedRule && (
					<Alert variant="warning" className="mt-3 mb-0 py-2 small">
						{t('ModShortcut:warning-no-direction')}
					</Alert>
				)}
				{shadowed !== 0 && (
					<Alert variant="warning" className="mt-3 mb-0 py-2 small">
						{fullyShadowed
							? t('ModShortcut:warning-fully-shadowed')
							: t('ModShortcut:warning-shadowed', {
									directions: directionList(shadowed).join(', '),
								})}
					</Alert>
				)}
			</Card.Body>
		</Card>
	);
};

// Page -----------------------------------------------------------------------

export default function ModShortcutPage() {
	const { t } = useTranslation('');
	// AppContext is untyped upstream
	const { buttonLabels, setLoading } = useContext(AppContext) as unknown as {
		buttonLabels: { buttonLabelType: string; swapTpShareLabels: boolean };
		setLoading: (loading: boolean) => void;
	};
	const { buttonLabelType, swapTpShareLabels } = buttonLabels;
	const buttonNames: ButtonNames = getButtonLabels(
		buttonLabelType,
		swapTpShareLabels,
	);

	const profiles = useProfilesStore((state) => state.profiles);
	const fetchProfiles = useProfilesStore((state) => state.fetchProfiles);

	const [options, setOptions] = useState<ModShortcutOptions | null>(null);
	const [editing, setEditing] = useState(0);
	const [saveMessage, setSaveMessage] = useState<{
		ok: boolean;
		text: string;
	} | null>(null);
	const [dirty, setDirty] = useState(false);

	useEffect(() => {
		WebApi.getModShortcutOptions(setLoading).then((wire) => {
			if (wire) {
				const loaded = fromWire(wire);
				setOptions(loaded);
				setEditing(
					Math.min(loaded.activePreset, Math.max(0, loaded.presets.length - 1)),
				);
			}
		});
		fetchProfiles();
	}, []);

	const modAssigned = useMemo(
		() =>
			profiles.some((profile) =>
				Object.values(getProfilePins(profile)).some(
					(pin) => pin?.action === GpioAction.BUTTON_PRESS_MOD_SHORTCUT,
				),
			),
		[profiles],
	);

	if (!options) {
		return (
			<Section title={t('ModShortcut:header-text')}>
				<div />
			</Section>
		);
	}

	// Updates are functional so that two events in a row (e.g. the notation box
	// losing focus and a button click) always build on the latest state.
	const update = (
		next:
			| ModShortcutOptions
			| ((prev: ModShortcutOptions) => ModShortcutOptions),
	) => {
		setOptions((prev) =>
			prev === null ? prev : typeof next === 'function' ? next(prev) : next,
		);
		setDirty(true);
		setSaveMessage(null);
	};

	const preset: Preset | undefined = options.presets[editing];
	const setPreset = (fn: (prev: Preset) => Preset) =>
		update((prev) => ({
			...prev,
			presets: prev.presets.map((p, i) => (i === editing ? fn(p) : p)),
		}));
	const setRule = (ruleIndex: number, rule: Rule) =>
		setPreset((p) => ({
			...p,
			rules: p.rules.map((r, i) => (i === ruleIndex ? rule : r)),
		}));

	const addPreset = (source?: Preset) => {
		if (options.presets.length >= MOD_SHORTCUT_MAX_PRESETS) return;
		const created: Preset = source
			? JSON.parse(JSON.stringify(source))
			: newPreset(
					t('ModShortcut:new-preset-label', {
						number: options.presets.length + 1,
					}),
				);
		if (source) {
			created.label = truncateUtf8(
				t('ModShortcut:copy-of', {
					label: source.label,
					interpolation: { escapeValue: false },
				}),
				PRESET_LABEL_MAX_BYTES,
			);
		}
		update({ ...options, presets: [...options.presets, created] });
		setEditing(options.presets.length);
	};

	const deletePreset = () => {
		if (options.presets.length <= 1 || !preset) return;
		if (
			!window.confirm(
				t('ModShortcut:delete-preset-confirm', {
					label: preset.label,
					interpolation: { escapeValue: false },
				}),
			)
		)
			return;
		const presets = options.presets.filter((_, i) => i !== editing);
		let activePreset = options.activePreset;
		if (activePreset === editing) activePreset = 0;
		else if (activePreset > editing) activePreset--;
		update({ ...options, presets, activePreset });
		setEditing(Math.max(0, editing - 1));
	};

	const save = async () => {
		const result = await WebApi.setModShortcutOptions(toWire(options));
		setSaveMessage(
			result
				? { ok: true, text: t('ModShortcut:saved') }
				: { ok: false, text: t('Common:saved-error-message') },
		);
		if (result) setDirty(false);
	};

	const shadowed = preset ? shadowedDirections(preset.rules) : [];

	const saveBar = (
		<div className="d-flex align-items-center gap-3">
			<Button onClick={save} variant={dirty ? 'primary' : 'outline-primary'}>
				{t('Common:button-save-label')}
			</Button>
			{dirty && (
				<small className="text-warning">{t('ModShortcut:unsaved')}</small>
			)}
			{saveMessage && (
				<small className={saveMessage.ok ? 'text-success' : 'text-danger'}>
					{saveMessage.text}
				</small>
			)}
		</div>
	);

	return (
		<>
			<Section title={t('ModShortcut:header-text')}>
				<p>{t('ModShortcut:description')}</p>
				{!modAssigned && profiles.length > 0 && (
					<Alert variant="warning">
						<Trans
							ns="ModShortcut"
							i18nKey="warning-not-assigned"
							components={{ pinLink: <Link to="/pin-mapping" /> }}
						/>
					</Alert>
				)}
				<Row className="align-items-center g-3">
					<Col xs="auto">
						<Form.Check
							type="switch"
							id="mod-shortcut-enabled"
							label={t('ModShortcut:enabled')}
							checked={options.enabled}
							onChange={() => update({ ...options, enabled: !options.enabled })}
						/>
					</Col>
					<Col xs="auto">
						<InputGroup>
							<InputGroup.Text>
								{t('ModShortcut:active-preset')}
							</InputGroup.Text>
							<Form.Select
								value={options.activePreset}
								onChange={(e) =>
									update({ ...options, activePreset: Number(e.target.value) })
								}
							>
								{options.presets.map((p, i) => (
									<option key={`active-${i}`} value={i}>
										{i + 1}. {p.label || t('ModShortcut:untitled')}
									</option>
								))}
							</Form.Select>
						</InputGroup>
					</Col>
					<Col>{saveBar}</Col>
				</Row>
			</Section>

			<Row className="mt-3 g-3">
				<Col md={3}>
					<Card>
						<Card.Header>
							<strong>{t('ModShortcut:presets')}</strong>
						</Card.Header>
						<ListGroup variant="flush">
							{options.presets.map((p, i) => (
								<ListGroup.Item
									key={`preset-${i}`}
									action
									active={i === editing}
									onClick={() => setEditing(i)}
									className="d-flex justify-content-between align-items-center"
								>
									<span className="text-truncate">
										{i + 1}. {p.label || t('ModShortcut:untitled')}
									</span>
									{i === options.activePreset && (
										<Badge bg="success">{t('ModShortcut:in-use')}</Badge>
									)}
								</ListGroup.Item>
							))}
						</ListGroup>
						<Card.Footer className="d-flex flex-wrap gap-2">
							<Button
								size="sm"
								variant="outline-primary"
								disabled={options.presets.length >= MOD_SHORTCUT_MAX_PRESETS}
								onClick={() => addPreset()}
							>
								{t('ModShortcut:add-preset')}
							</Button>
							<Button
								size="sm"
								variant="outline-secondary"
								disabled={
									!preset || options.presets.length >= MOD_SHORTCUT_MAX_PRESETS
								}
								onClick={() => preset && addPreset(preset)}
							>
								{t('ModShortcut:duplicate-preset')}
							</Button>
						</Card.Footer>
					</Card>
					<Card className="mt-3">
						<Card.Body className="small">
							<Trans
								ns="ModShortcut"
								i18nKey="notation-help"
								components={{ code: <code />, br: <br /> }}
							/>
						</Card.Body>
					</Card>
				</Col>

				<Col md={9}>
					{preset && (
						<>
							<Card className="mb-3">
								<Card.Body>
									<Row className="g-2 align-items-center">
										<Col>
											<InputGroup>
												<InputGroup.Text>
													{t('ModShortcut:preset-label')}
												</InputGroup.Text>
												<Form.Control
													value={preset.label}
													onChange={(e) =>
														setPreset((p) => ({
															...p,
															label: truncateUtf8(
																e.target.value,
																PRESET_LABEL_MAX_BYTES,
															),
														}))
													}
												/>
											</InputGroup>
										</Col>
										<Col xs="auto">
											<Button
												variant="outline-success"
												disabled={options.activePreset === editing}
												onClick={() =>
													update({ ...options, activePreset: editing })
												}
											>
												{t('ModShortcut:use-this-preset')}
											</Button>
										</Col>
										<Col xs="auto">
											<Button
												variant="outline-danger"
												disabled={options.presets.length <= 1}
												onClick={deletePreset}
											>
												{t('ModShortcut:delete-preset')}
											</Button>
										</Col>
									</Row>
								</Card.Body>
							</Card>

							{preset.rules.map((rule, i) => (
								<RuleCard
									key={`preset-${editing}-rule-${i}`}
									idPrefix={`preset-${editing}-rule-${i}`}
									rule={rule}
									index={i}
									count={preset.rules.length}
									shadowed={shadowed[i]}
									buttonNames={buttonNames}
									canAdd={preset.rules.length < MOD_SHORTCUT_MAX_RULES}
									onChange={(r) => setRule(i, r)}
									onDelete={() =>
										setPreset((p) => ({
											...p,
											rules: p.rules.filter((_, j) => j !== i),
										}))
									}
									onMove={(offset) =>
										setPreset((p) => ({
											...p,
											rules: move(p.rules, i, i + offset),
										}))
									}
									onMirror={() =>
										setPreset((p) => ({
											...p,
											rules: [
												...p.rules.slice(0, i + 1),
												mirrorRule(p.rules[i]),
												...p.rules.slice(i + 1),
											],
										}))
									}
								/>
							))}

							<div className="d-flex justify-content-between align-items-center mb-4">
								<Button
									variant="outline-primary"
									disabled={preset.rules.length >= MOD_SHORTCUT_MAX_RULES}
									onClick={() =>
										setPreset((p) => ({
											...p,
											rules: [...p.rules, newRule()],
										}))
									}
								>
									{t('ModShortcut:add-rule', {
										count: preset.rules.length,
										max: MOD_SHORTCUT_MAX_RULES,
									})}
								</Button>
								{saveBar}
							</div>
						</>
					)}
				</Col>
			</Row>
		</>
	);
}
