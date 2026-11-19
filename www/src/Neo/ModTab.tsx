// gp2040-neo: Mod Shortcut tab (presets per character, rules per lever direction).
import { useState } from 'react';

import {
	DIRECTION_ARROWS,
	MODE_HOLD,
	MODE_SEQUENCE,
	MOD_SHORTCUT_MAX_FRAMES,
	MOD_SHORTCUT_MAX_PRESETS,
	MOD_SHORTCUT_MAX_RULES,
	MOD_SHORTCUT_MAX_STEPS,
	ModShortcutOptions,
	PRESET_LABEL_MAX_BYTES,
	Preset,
	RULE_LABEL_MAX_BYTES,
	Rule,
	Step,
	formatSteps,
	mirrorDirection,
	mirrorRule,
	newPreset,
	shadowedDirections,
	truncateUtf8,
	tryParseSteps,
	utf8Length,
} from '../Data/ModShortcut.ts';
import {
	MOVE_TEMPLATES,
	NEO_ALIASES,
	NEO_NAMES,
	SYSTEM_TEMPLATES,
	Side,
	buildMoveSteps,
	buttonNamesOf,
	finishButtons,
	keysToMask,
	matchTemplate,
	modPins,
	setFinishButtons,
	sideForDirections,
	totalFrames,
} from './neoModel.ts';
import {
	ButtonPad,
	CommandText,
	FRAME_MS,
	FrameStrip,
	Lever,
	Msg,
	Panel,
	Segment,
	Select,
} from './ui';

const directionList = (mask: number) =>
	[1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => mask & (1 << n));
const arrowsOf = (mask: number) =>
	directionList(mask)
		.map((n) => (n === 5 ? 'N' : DIRECTION_ARROWS[n]))
		.join(' ');

const move = <T,>(list: T[], from: number, to: number): T[] => {
	if (to < 0 || to >= list.length) return list;
	const copy = [...list];
	const [item] = copy.splice(from, 1);
	copy.splice(to, 0, item);
	return copy;
};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const sideOfRule = (rule: Rule): Side => {
	const template = matchTemplate(rule);
	if (template && template.motion.length && rule.steps.length) {
		return rule.steps[0].direction === template.motion[0] ? '1P' : '2P';
	}
	return sideForDirections(rule.directionMask) ?? '1P';
};

// Step editor -------------------------------------------------------------------

const StepEditor = ({ rule, onChange }: { rule: Rule; onChange: (rule: Rule) => void }) => {
	const setStep = (i: number, step: Step) =>
		onChange({ ...rule, steps: rule.steps.map((s, j) => (j === i ? step : s)) });
	return (
		<div className="steps">
			{rule.steps.map((step, i) => (
				<div className="step" key={i}>
					<div className="line">
						<span className="dim">{String(i + 1).padStart(2, '0')}</span>
						<Select
							aria-label={`${i + 1}番目のレバー`}
							value={step.direction}
							onChange={(e) => setStep(i, { ...step, direction: Number(e.target.value) })}
						>
							{[5, 6, 3, 2, 1, 4, 7, 8, 9].map((n) => (
								<option key={n} value={n}>
									{n} {n === 5 ? 'N（離す）' : DIRECTION_ARROWS[n]}
								</option>
							))}
						</Select>
						<span className="stepper">
							<button
								type="button"
								aria-label="1フレーム短く"
								disabled={step.frames <= 1}
								onClick={() => setStep(i, { ...step, frames: step.frames - 1 })}
							>
								-
							</button>
							<output>
								{step.frames}F <span className="dim">{Math.round(step.frames * FRAME_MS)}ms</span>
							</output>
							<button
								type="button"
								aria-label="1フレーム長く"
								disabled={step.frames >= MOD_SHORTCUT_MAX_FRAMES}
								onClick={() => setStep(i, { ...step, frames: step.frames + 1 })}
							>
								+
							</button>
						</span>
						<button
							type="button"
							size-="small"
							variant-="ghost"
							disabled={i === 0}
							onClick={() => onChange({ ...rule, steps: move(rule.steps, i, i - 1) })}
						>
							↑
						</button>
						<button
							type="button"
							size-="small"
							variant-="ghost"
							disabled={i === rule.steps.length - 1}
							onClick={() => onChange({ ...rule, steps: move(rule.steps, i, i + 1) })}
						>
							↓
						</button>
						<button
							type="button"
							size-="small"
							variant-="ghost"
							aria-label="このステップを消す"
							disabled={rule.steps.length <= 1}
							onClick={() => onChange({ ...rule, steps: rule.steps.filter((_, j) => j !== i) })}
						>
							消す
						</button>
					</div>
					<ButtonPad
						label={`${i + 1}番目のボタン`}
						mask={step.buttons}
						onChange={(buttons) => setStep(i, { ...step, buttons })}
					/>
				</div>
			))}
			<div className="line">
				<button
					type="button"
					size-="small"
					disabled={rule.steps.length >= MOD_SHORTCUT_MAX_STEPS}
					onClick={() =>
						onChange({
							...rule,
							steps: [
								...rule.steps,
								{
									direction: rule.steps[rule.steps.length - 1]?.direction ?? 5,
									buttons: 0,
									frames: 2,
								},
							],
						})
					}
				>
					+ ステップ
				</button>
				<span className="dim">
					{rule.steps.length}/{MOD_SHORTCUT_MAX_STEPS}
				</span>
			</div>
		</div>
	);
};

const NotationInput = ({ rule, onChange }: { rule: Rule; onChange: (rule: Rule) => void }) => {
	const hold = rule.mode === MODE_HOLD;
	const steps = hold ? rule.steps.slice(0, 1) : rule.steps;
	const current = formatSteps(hold ? steps.map((s) => ({ ...s, frames: 2 })) : steps, NEO_NAMES);
	const [draft, setDraft] = useState<string | null>(null);
	const [error, setError] = useState('');

	const apply = () => {
		if (draft === null) return;
		const result = tryParseSteps(draft, NEO_ALIASES);
		if (result.error !== undefined || result.steps.length === 0) {
			setError(`「${result.error || draft}」が読めません。例: 623+弱P`);
			return;
		}
		if (result.steps.length > MOD_SHORTCUT_MAX_STEPS) {
			setError(`ステップは ${MOD_SHORTCUT_MAX_STEPS} 個までです。`);
			return;
		}
		setError('');
		setDraft(null);
		onChange({ ...rule, steps: hold ? result.steps.slice(0, 1) : result.steps });
	};

	return (
		<div className="panel-body">
			<div className="line">
				<span className="dim">$</span>
				<input
					type="text"
					style={{ flex: '1 1 24ch' }}
					className={error ? 'is-invalid' : ''}
					value={draft ?? current}
					placeholder="623+弱P"
					aria-label="テキストで入力"
					onChange={(e) => {
						setDraft(e.target.value);
						setError('');
					}}
					onBlur={apply}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							apply();
						}
						if (e.key === 'Escape') {
							setDraft(null);
							setError('');
						}
					}}
				/>
			</div>
			{error && <Msg kind="err">{error}</Msg>}
			<span className="dim">
				テンキー表記（6=前 2=下 3=右下）。623+弱P、2 3 6+X:4（:4 は4フレーム）。ボタンは 弱P / X / LP どれでも。
			</span>
		</div>
	);
};

// Rule ---------------------------------------------------------------------------

const RuleBlock = ({
	rule,
	index,
	count,
	shadowed,
	canAdd,
	onChange,
	onDelete,
	onMove,
	onMirror,
}: {
	rule: Rule;
	index: number;
	count: number;
	shadowed: number;
	canAdd: boolean;
	onChange: (rule: Rule) => void;
	onDelete: () => void;
	onMove: (offset: number) => void;
	onMirror: () => void;
}) => {
	const hold = rule.mode === MODE_HOLD;
	const [side, setSide] = useState<Side>(() => sideOfRule(rule));
	const [detail, setDetail] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const template = matchTemplate(rule);
	const autoSide = sideForDirections(rule.directionMask);
	const steps = hold ? rule.steps.slice(0, 1) : rule.steps;
	const frames = totalFrames(rule);
	const noDirection = rule.enabled && rule.directionMask === 0;
	const fullyShadowed = rule.enabled && rule.directionMask !== 0 && shadowed === rule.directionMask;

	const changeSide = (next: Side) => {
		if (next === side) return;
		setSide(next);
		onChange({
			...rule,
			steps: rule.steps.map((s) => ({ ...s, direction: mirrorDirection(s.direction) })),
		});
	};

	return (
		<Panel
			title={`ルール ${index + 1}${rule.label ? `: ${rule.label}` : ''}`}
			right={
				<label>
					<input
						type="checkbox"
						is-="switch"
						checked={rule.enabled}
						onChange={() => onChange({ ...rule, enabled: !rule.enabled })}
					/>
					{rule.enabled ? 'ON' : 'OFF'}
				</label>
			}
		>
			<div className={`rule ${rule.enabled ? '' : 'is-off'}`}>
				<div className="rule-head line">
					<span className="label">名前</span>
					<input
						type="text"
						value={rule.label}
						placeholder="例: 弱昇龍"
						aria-label="ルールの名前"
						onChange={(e) =>
							onChange({ ...rule, label: truncateUtf8(e.target.value, RULE_LABEL_MAX_BYTES) })
						}
					/>
				</div>

				<div className="rule-when">
					<span className="section-label">
						<b>1</b> Mod を押したときのレバー
					</span>
					<Lever
						label="Mod を押したときのレバー"
						isOn={(n) => (rule.directionMask & (1 << n)) !== 0}
						isWarn={(n) => (shadowed & (1 << n)) !== 0}
						onPress={(n) => onChange({ ...rule, directionMask: rule.directionMask ^ (1 << n) })}
					/>
					<span className="dim">
						{rule.directionMask ? `${arrowsOf(rule.directionMask)} のとき` : '方向を選ぶ（複数可）'}
					</span>
				</div>

				<div className="rule-main">
					<span className="section-label">
						<b>2</b> 出す入力
					</span>
					<Segment
						label="動き方"
						value={rule.mode}
						options={[
							{ value: MODE_SEQUENCE, label: 'コマンドを1回' },
							{ value: MODE_HOLD, label: '押している間ボタン' },
						]}
						onChange={(mode) =>
							onChange(
								mode === MODE_HOLD
									? { ...rule, mode, steps: rule.steps.slice(-1) }
									: { ...rule, mode },
							)
						}
					/>

					{!hold && (
						<>
							<div className="line spread">
								<span className="dim">技</span>
								<Segment
									label="向き"
									value={side}
									options={[
										{ value: '1P', label: '1P側(右向き)' },
										{ value: '2P', label: '2P側(左向き)' },
									]}
									onChange={changeSide}
								/>
							</div>
							<div className="templates">
								{MOVE_TEMPLATES.map((t) => (
									<button
										key={t.id}
										type="button"
										aria-pressed={template?.id === t.id}
										onClick={() =>
											onChange({
												...rule,
												steps: buildMoveSteps(
													t.motion,
													finishButtons(rule) || keysToMask(['B3']),
													side,
												),
											})
										}
									>
										{t.name}
										<small>
											{side === '2P' ? t.motion.map(mirrorDirection).join('') || '5' : t.hint}
										</small>
									</button>
								))}
							</div>
							{autoSide && autoSide !== side && (
								<div className="line">
									<Msg kind="warn">
										レバーが{autoSide === '1P' ? '左' : '右'}側なので、普通は{autoSide}側向きの入力です。
									</Msg>
									<button type="button" size-="small" onClick={() => changeSide(autoSide)}>
										{autoSide}側に反転
									</button>
								</div>
							)}
							<span className="dim">最後に押すボタン</span>
							<ButtonPad
								label="最後に押すボタン"
								mask={finishButtons(rule)}
								onChange={(mask) => onChange(setFinishButtons(rule, mask))}
							/>
						</>
					)}

					{hold && (
						<>
							<span className="dim">押しっぱなしにするボタン（レバーと他のボタンはそのまま使えます）</span>
							<ButtonPad
								label="押しっぱなしにするボタン"
								showOthers
								mask={rule.steps[0]?.buttons ?? 0}
								onChange={(buttons) =>
									onChange({
										...rule,
										steps: [{ ...(rule.steps[0] ?? { direction: 5, frames: 2 }), buttons }],
									})
								}
							/>
						</>
					)}

					<div className="line">
						<span className="dim">ワンタッチ</span>
						<div className="templates">
							{SYSTEM_TEMPLATES.map((t) => (
								<button
									key={t.id}
									type="button"
									onClick={() =>
										onChange({
											...rule,
											steps: hold
												? [{ direction: 5, buttons: keysToMask(t.keys), frames: 2 }]
												: buildMoveSteps([], keysToMask(t.keys), side),
										})
									}
								>
									{t.name}
									<small>{buttonNamesOf(keysToMask(t.keys)).join('+')}</small>
								</button>
							))}
						</div>
					</div>

					<div className="preview">
						<CommandText steps={steps} />
						{!hold && (
							<>
								<FrameStrip steps={steps} />
								<span className="dim">
									{frames}F = {Math.round(frames * FRAME_MS)}ms（1マス=1F）。再生中はレバーと他のボタンを無視します。
								</span>
							</>
						)}
					</div>

					<div className="line">
						<button
							type="button"
							size-="small"
							variant-="ghost"
							aria-expanded={detail}
							onClick={() => setDetail(!detail)}
						>
							{detail ? '[-]' : '[+]'} 細かく調整（フレーム数・テキスト入力）
						</button>
					</div>
					{detail && (
						<>
							<NotationInput rule={rule} onChange={onChange} />
							{!hold && <StepEditor rule={rule} onChange={onChange} />}
						</>
					)}
				</div>

				{(noDirection || shadowed !== 0) && (
					<div className="rule-head">
						<Msg kind="warn">
							{noDirection
								? 'レバーの方向が選ばれていないので、このルールは発動しません。'
								: fullyShadowed
									? '上のルールが同じ方向を使っているので、このルールは発動しません。'
									: `${arrowsOf(shadowed)} は上のルールが優先されます。`}
						</Msg>
					</div>
				)}

				<div className="rule-foot line">
					<button type="button" size-="small" variant-="ghost" disabled={index === 0} onClick={() => onMove(-1)}>
						↑ 上へ
					</button>
					<button
						type="button"
						size-="small"
						variant-="ghost"
						disabled={index === count - 1}
						onClick={() => onMove(1)}
					>
						↓ 下へ
					</button>
					<button
						type="button"
						size-="small"
						variant-="ghost"
						disabled={!canAdd}
						title="レバーと入力を左右反転したルールをすぐ下に作ります"
						onClick={onMirror}
					>
						⇆ 反対側用を作る
					</button>
					<span style={{ flex: 1 }} />
					{confirmDelete ? (
						<>
							<span className="warn">消しますか？</span>
							<button type="button" size-="small" variant-="danger" onClick={onDelete}>
								消す
							</button>
							<button type="button" size-="small" variant-="ghost" onClick={() => setConfirmDelete(false)}>
								やめる
							</button>
						</>
					) : (
						<button type="button" size-="small" variant-="ghost" onClick={() => setConfirmDelete(true)}>
							ルールを消す
						</button>
					)}
				</div>
			</div>
		</Panel>
	);
};

// Tab ---------------------------------------------------------------------------------

export default function ModTab({
	options,
	update,
	mappings,
	editing,
	setEditing,
	rulesVersion,
	bumpRules,
	goToPins,
}: {
	options: ModShortcutOptions;
	update: (fn: (prev: ModShortcutOptions) => ModShortcutOptions) => void;
	mappings: Record<string, unknown>;
	editing: number;
	setEditing: (i: number) => void;
	rulesVersion: number;
	bumpRules: () => void;
	goToPins: () => void;
}) {
	const [renaming, setRenaming] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const preset: Preset | undefined = options.presets[editing];
	const mod = modPins(mappings);

	const setPreset = (fn: (prev: Preset) => Preset) =>
		update((prev) => ({
			...prev,
			presets: prev.presets.map((p, i) => (i === editing ? fn(p) : p)),
		}));
	const setRules = (fn: (rules: Rule[]) => Rule[]) => setPreset((p) => ({ ...p, rules: fn(p.rules) }));
	const reshapeRules = (fn: (rules: Rule[]) => Rule[]) => {
		setRules(fn);
		bumpRules();
	};

	const addPreset = (source?: Preset) => {
		if (options.presets.length >= MOD_SHORTCUT_MAX_PRESETS) return;
		const created = source
			? { ...clone(source), label: truncateUtf8(`${source.label}のコピー`, PRESET_LABEL_MAX_BYTES) }
			: newPreset(`キャラ${options.presets.length + 1}`);
		update((prev) => ({ ...prev, presets: [...prev.presets, created] }));
		setEditing(options.presets.length);
		setRenaming(!source);
		bumpRules();
	};

	const deletePreset = () => {
		if (options.presets.length <= 1) return;
		update((prev) => {
			const presets = prev.presets.filter((_, i) => i !== editing);
			let activePreset = prev.activePreset;
			if (activePreset === editing) activePreset = 0;
			else if (activePreset > editing) activePreset--;
			return { ...prev, presets, activePreset };
		});
		setEditing(Math.max(0, editing - 1));
		setConfirmDelete(false);
		bumpRules();
	};

	const shadowed = preset ? shadowedDirections(preset.rules) : [];

	return (
		<>
			<Panel title="Mod ショートカット">
				<div className="line">
					<label>
						<input
							type="checkbox"
							is-="switch"
							checked={options.enabled}
							onChange={() => update((prev) => ({ ...prev, enabled: !prev.enabled }))}
						/>
						Mod ショートカットを{options.enabled ? '使う' : '使わない'}
					</label>
				</div>
				<div className="line">
					<span className="label">Mod ボタン</span>
					{mod.length ? (
						<span>{mod.map((p) => `GP${p}`).join(', ')}</span>
					) : (
						<span className="err">未設定</span>
					)}
					<button type="button" size-="small" variant-="ghost" onClick={goToPins}>
						配置タブで{mod.length ? '変更' : '設定'}する
					</button>
				</div>
				<p className="lead">
					Mod を押した瞬間のレバー方向でルールを選びます。ルールは上から順に判定し、最初に一致したものを使います。
				</p>
			</Panel>

			<Panel
				title="キャラ"
				right={
					<span className="dim">
						{options.presets.length}/{MOD_SHORTCUT_MAX_PRESETS}
					</span>
				}
			>
				<div className="presets" role="tablist" aria-label="キャラ">
					{options.presets.map((p, i) => (
						<button
							key={i}
							type="button"
							role="tab"
							aria-selected={i === editing}
							onClick={() => {
								setEditing(i);
								setRenaming(false);
								setConfirmDelete(false);
								bumpRules();
							}}
						>
							{i === options.activePreset && <span className="star">*</span>}
							{p.label || '名前なし'}
						</button>
					))}
					{options.presets.length < MOD_SHORTCUT_MAX_PRESETS && (
						<button type="button" onClick={() => addPreset()}>
							+ 追加
						</button>
					)}
				</div>
				{preset && (
					<>
						<div className="line">
							<span className="label">名前</span>
							{renaming ? (
								<>
									<input
										type="text"
										autoFocus
										value={preset.label}
										aria-label="キャラの名前"
										onChange={(e) =>
											setPreset((p) => ({
												...p,
												label: truncateUtf8(e.target.value, PRESET_LABEL_MAX_BYTES),
											}))
										}
										onKeyDown={(e) => e.key === 'Enter' && setRenaming(false)}
									/>
									<span className="dim">
										あと約{Math.floor((PRESET_LABEL_MAX_BYTES - utf8Length(preset.label)) / 3)}文字
									</span>
									<button type="button" size-="small" onClick={() => setRenaming(false)}>
										OK
									</button>
								</>
							) : (
								<>
									<strong>{preset.label || '名前なし'}</strong>
									<button type="button" size-="small" variant-="ghost" onClick={() => setRenaming(true)}>
										名前を変える
									</button>
								</>
							)}
						</div>
						<div className="line">
							<span className="label">状態</span>
							{options.activePreset === editing ? (
								<span className="amber">* 使用中（コントローラーはこのキャラで動きます）</span>
							) : (
								<button
									type="button"
									size-="small"
									variant-="primary"
									onClick={() => update((prev) => ({ ...prev, activePreset: editing }))}
								>
									このキャラを使う
								</button>
							)}
						</div>
						<div className="line">
							<button
								type="button"
								size-="small"
								variant-="ghost"
								disabled={options.presets.length >= MOD_SHORTCUT_MAX_PRESETS}
								onClick={() => addPreset(preset)}
							>
								複製
							</button>
							{confirmDelete ? (
								<>
									<span className="warn">「{preset.label}」を消しますか？</span>
									<button type="button" size-="small" variant-="danger" onClick={deletePreset}>
										消す
									</button>
									<button type="button" size-="small" variant-="ghost" onClick={() => setConfirmDelete(false)}>
										やめる
									</button>
								</>
							) : (
								<button
									type="button"
									size-="small"
									variant-="ghost"
									disabled={options.presets.length <= 1}
									onClick={() => setConfirmDelete(true)}
								>
									キャラを消す
								</button>
							)}
						</div>
					</>
				)}
			</Panel>

			{preset?.rules.map((rule, i) => (
				<RuleBlock
					key={`${editing}-${rulesVersion}-${i}`}
					rule={rule}
					index={i}
					count={preset.rules.length}
					shadowed={shadowed[i]}
					canAdd={preset.rules.length < MOD_SHORTCUT_MAX_RULES}
					onChange={(r) => setRules((rules) => rules.map((x, j) => (j === i ? r : x)))}
					onDelete={() => reshapeRules((rules) => rules.filter((_, j) => j !== i))}
					onMove={(offset) => reshapeRules((rules) => move(rules, i, i + offset))}
					onMirror={() =>
						reshapeRules((rules) => [
							...rules.slice(0, i + 1),
							{
								...mirrorRule(rules[i]),
								label: truncateUtf8(
									rules[i].label ? `${rules[i].label}(反対側)` : '',
									RULE_LABEL_MAX_BYTES,
								),
							},
							...rules.slice(i + 1),
						])
					}
				/>
			))}

			{preset && (
				<div className="line">
					<button
						type="button"
						size-="small"
						disabled={preset.rules.length >= MOD_SHORTCUT_MAX_RULES}
						onClick={() =>
							reshapeRules((rules) => [
								...rules,
								{
									enabled: true,
									label: '',
									directionMask: 0,
									mode: MODE_SEQUENCE,
									steps: buildMoveSteps([6, 2, 3], keysToMask(['B3']), '1P'),
								},
							])
						}
					>
						+ ルールを追加
					</button>
					<span className="dim">
						{preset.rules.length}/{MOD_SHORTCUT_MAX_RULES}
					</span>
				</div>
			)}
		</>
	);
}
