// gp2040-neo: button layout tab. Which board pin does which controller function,
// shown as an arcade panel.
import { useEffect, useRef, useState } from 'react';

import WebApi from '../Services/WebApi';
import {
	ControllerFunction,
	FUNCTIONS,
	GPIO_NONE,
	INTERNAL_PINS,
	PIN_COUNT,
	actionAt,
	actionName,
	assignFunction,
	changedPins,
	functionOf,
	isLocked,
	isUnused,
	missingFunctions,
	pinChoices,
	pinsWith,
	setPinAction,
} from './neoModel.ts';
import { Msg, Panel, Select } from './ui';

export type PinMappings = Record<string, unknown>;

const CAPTURE_LIMIT_S = 30;

type Capture =
	| { kind: 'idle' }
	| { kind: 'assign'; action: number; started: number }
	| { kind: 'identify'; started: number };

const pinsLabel = (pins: number[]) =>
	pins.length ? pins.map((p) => `GP${p}`).join(',') : '--';

const sameList = (a: number[], b: number[]) =>
	a.length === b.length && a.every((v, i) => v === b[i]);

export default function PinsTab({
	mappings,
	saved,
	onChange,
}: {
	mappings: PinMappings;
	saved: PinMappings;
	onChange: (next: PinMappings) => void;
}) {
	const [selected, setSelected] = useState<number | null>(null);
	const [capture, setCapture] = useState<Capture>({ kind: 'idle' });
	const [elapsed, setElapsed] = useState(0);
	const [flash, setFlash] = useState<number | null>(null);
	const [note, setNote] = useState<{ kind: 'info' | 'warn' | 'err'; text: string } | null>(
		null,
	);
	const controller = useRef<AbortController | null>(null);
	const latest = useRef(mappings);
	latest.current = mappings;

	const missing = missingFunctions(mappings);
	const changed = new Set(changedPins(saved, mappings));
	const choices = pinChoices(mappings);
	const selectedFn = selected === null ? undefined : functionOf(selected);

	// Countdown while waiting for a button press
	useEffect(() => {
		if (capture.kind === 'idle') return;
		const timer = window.setInterval(
			() => setElapsed(Math.floor((Date.now() - capture.started) / 1000)),
			250,
		);
		return () => window.clearInterval(timer);
	}, [capture]);

	useEffect(() => () => controller.current?.abort(), []);

	const stopCapture = async () => {
		controller.current?.abort();
	};

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && capture.kind !== 'idle') stopCapture();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [capture]);

	// Ask the controller for the next pressed pin. Each request waits up to
	// 5 s on the controller, so keep asking until the user gives up.
	const waitForPin = async (): Promise<number | null> => {
		controller.current = new AbortController();
		const { signal } = controller.current;
		const started = Date.now();
		try {
			while (!signal.aborted && Date.now() - started < CAPTURE_LIMIT_S * 1000) {
				const data = await WebApi.getHeldPins(signal);
				if (!data || data.canceled) break;
				const pin = data.heldPins?.[0];
				if (typeof pin === 'number') return pin;
			}
			return null;
		} finally {
			if (signal.aborted) {
				await new Promise((r) => setTimeout(r, 50));
				await WebApi.abortGetHeldPins();
			}
		}
	};

	const assign = (action: number, pin: number) => {
		const current = latest.current;
		const before = actionAt(current, pin);
		if (before === undefined) return;
		if (isLocked(before)) {
			setNote({
				kind: 'err',
				text: `GP${pin} はLEDやディスプレイ用に使われているので割り当てられません。`,
			});
			return;
		}
		const next = assignFunction(current, action, pin);
		onChange(next);
		const lost = !isUnused(before) && before !== action ? functionOf(before) : undefined;
		const stillHas = lost ? pinsWith(next, lost.action).length > 0 : true;
		setNote(
			lost && !stillHas
				? {
						kind: 'warn',
						text: `GP${pin} を ${actionName(action)} にしました。前の ${actionName(before)} はピンがなくなりました。`,
					}
				: { kind: 'info', text: `GP${pin} を ${actionName(action)} にしました。` },
		);
		setFlash(action);
	};

	const startAssign = async (action: number) => {
		setNote(null);
		setElapsed(0);
		setCapture({ kind: 'assign', action, started: Date.now() });
		const pin = await waitForPin();
		setCapture({ kind: 'idle' });
		if (pin !== null) assign(action, pin);
	};

	const startIdentify = async () => {
		setNote(null);
		setElapsed(0);
		setCapture({ kind: 'identify', started: Date.now() });
		const pin = await waitForPin();
		setCapture({ kind: 'idle' });
		if (pin === null) return;
		const action = actionAt(latest.current, pin);
		if (action === undefined || isUnused(action)) {
			setNote({ kind: 'info', text: `押されたのは GP${pin} です。まだ何も割り当てられていません。` });
			return;
		}
		setNote({ kind: 'info', text: `押されたのは GP${pin}（${actionName(action)}）です。` });
		setSelected(functionOf(action) ? action : null);
		setFlash(action);
	};

	useEffect(() => {
		if (flash === null) return;
		const t = window.setTimeout(() => setFlash(null), 1900);
		return () => window.clearTimeout(t);
	}, [flash]);

	const cap = (f: ControllerFunction, wide = false) => {
		const pins = pinsWith(mappings, f.action);
		const wasPins = pinsWith(saved, f.action);
		const kind = f.group === 'punch' ? 'is-punch' : f.group === 'kick' ? 'is-kick' : '';
		return (
			<button
				key={f.action}
				type="button"
				box-="round"
				className={[
					'cap',
					kind,
					wide ? 'is-wide' : '',
					f.required && pins.length === 0 ? 'is-missing' : '',
					sameList(pins, wasPins) ? '' : 'is-changed',
					flash === f.action ? 'is-flash' : '',
				].join(' ')}
				aria-pressed={selected === f.action}
				title={`${f.name}（PCには ${f.pad}）`}
				onClick={() => {
					setSelected(selected === f.action ? null : f.action);
					setNote(null);
				}}
			>
				<span className="cap-name">{f.name}</span>
				<span className="cap-pin">{pinsLabel(pins)}</span>
			</button>
		);
	};
	const byAction = (action: number) => FUNCTIONS.find((f) => f.action === action)!;

	const capturing = capture.kind !== 'idle';

	return (
		<>
			<div className="panel-layout">
				<Panel
					title="パネル"
					right={
						<button
							type="button"
							size-="small"
							disabled={capturing}
							onClick={startIdentify}
						>
							押して確認
						</button>
					}
				>
					<p className="lead">
						ボタンを選んで、右側で繋がっているピンを決めます。「押して確認」を押してから実機のボタンを押すと、どのピンか分かります。
					</p>
					<div className="stick">
						<div className="stick-inner">
							<div className="stick-system">
								{[13, 14, 15].map((a) => cap(byAction(a), true))}
							</div>
							<div className="stick-lever" aria-label="レバー">
								<span />
								{cap(byAction(1))}
								<span />
								{cap(byAction(3))}
								<span className="ball" aria-hidden="true">
									●
								</span>
								{cap(byAction(4))}
								<span />
								{cap(byAction(2))}
								<span />
							</div>
							<div className="stick-buttons">
								{[7, 8, 10, 9, 5, 6, 12, 11].map((a) => cap(byAction(a)))}
							</div>
							<div className="stick-extra">
								{[17, 18, 16, 200, 19].map((a) => cap(byAction(a), true))}
							</div>
						</div>
					</div>
					{missing.map((f) => (
						<Msg key={f.action} kind="warn">
							{f.name} にピンがありません。
							{f.action === 14 && ' Start がないと設定画面を開けなくなります。'}
						</Msg>
					))}
				</Panel>

				<Panel title={selectedFn ? `選択中: ${selectedFn.name}` : '選択中'} focus={!!selectedFn}>
					{capture.kind !== 'idle' && (
						<div className="capture" role="status">
							<span is-="spinner" variant-="dots" />
							<span>
								{capture.kind === 'assign'
									? `${actionName(capture.action)} にするボタンを押してください`
									: '確認したいボタンを押してください'}
								<span className="dim">
									{' '}
									{Math.max(0, CAPTURE_LIMIT_S - elapsed)}s
								</span>
							</span>
							<button type="button" size-="small" variant-="ghost" onClick={stopCapture}>
								やめる <kbd>Esc</kbd>
							</button>
						</div>
					)}
					{note && <Msg kind={note.kind}>{note.text}</Msg>}

					{selectedFn ? (
						<div className="inspector panel-body">
							<div className="big">
								<span
									className={
										selectedFn.group === 'punch'
											? 'amber'
											: selectedFn.group === 'kick'
												? 'teal'
												: ''
									}
								>
									{selectedFn.name}
								</span>{' '}
								<span className="dim">→ PCには {selectedFn.pad}</span>
							</div>
							<div className="line">
								<span className="label">今のピン</span>
								<span>{pinsLabel(pinsWith(mappings, selectedFn.action))}</span>
							</div>
							<div className="line">
								<button
									type="button"
									size-="small"
									variant-="primary"
									disabled={capturing}
									onClick={() => startAssign(selectedFn.action)}
								>
									実機のボタンを押して決める
								</button>
							</div>
							<div className="line">
								<span className="label">ピンを選ぶ</span>
								<Select
									aria-label={`${selectedFn.name} のピン`}
									value=""
									disabled={capturing}
									onChange={(e) => {
										if (e.target.value === '') return;
										assign(selectedFn.action, Number(e.target.value));
									}}
								>
									<option value="">GP を選ぶ…</option>
									{choices.map((c) => (
										<option key={c.pin} value={c.pin}>
											GP{c.pin}　{actionName(c.action)}
											{INTERNAL_PINS.includes(c.pin) ? '（基板による）' : ''}
										</option>
									))}
								</Select>
							</div>
							{pinsWith(mappings, selectedFn.action).length > 0 && (
								<div className="line">
									<button
										type="button"
										size-="small"
										variant-="danger"
										onClick={() => {
											onChange(assignFunction(mappings, selectedFn.action, null));
											setNote({ kind: 'info', text: `${selectedFn.name} のピンを外しました。` });
										}}
									>
										ピンを外す
									</button>
								</div>
							)}
							{selectedFn.action === 200 && (
								<Msg kind="info">
									Mod ボタンの動きは「2 Mod」タブで決めます。USRボタン付きの Pico 互換ボードでは
									GP24 が USR ボタンのことがあります。
								</Msg>
							)}
						</div>
					) : (
						!capturing && (
							<p className="lead">
								左のパネルでボタンを選んでください。割り当てを変えたら、最後に <kbd>^S</kbd> で保存します。
							</p>
						)
					)}
				</Panel>
			</div>

			<Panel title="ピン一覧" right={<span className="dim">* は未保存</span>}>
				<p className="lead">
					基板のピンごとの機能です。1つの機能を複数のピンに割り当てることもできます。
				</p>
				<div className="table-wrap">
					<table className="pins">
						<thead>
							<tr>
								<th>ピン</th>
								<th>機能</th>
								<th>メモ</th>
							</tr>
						</thead>
						<tbody>
							{Array.from({ length: PIN_COUNT }, (_, pin) => pin).map((pin) => {
								const action = actionAt(mappings, pin);
								if (action === undefined) return null;
								const locked = isLocked(action);
								return (
									<tr
										key={pin}
										className={[
											locked ? 'is-locked' : '',
											changed.has(pin) ? 'is-changed' : '',
											selected !== null && action === selected ? 'is-selected' : '',
										].join(' ')}
									>
										<td className="gp">GP{pin}</td>
										<td>
											{locked ? (
												actionName(action)
											) : (
												<Select
													aria-label={`GP${pin} の機能`}
													value={isUnused(action) ? GPIO_NONE : action}
													onChange={(e) =>
														onChange(setPinAction(mappings, pin, Number(e.target.value)))
													}
												>
													<option value={GPIO_NONE}>未使用</option>
													{FUNCTIONS.map((f) => (
														<option key={f.action} value={f.action}>
															{actionName(f.action)}
														</option>
													))}
													{!isUnused(action) && !functionOf(action) && (
														<option value={action}>{actionName(action)}</option>
													)}
												</Select>
											)}
										</td>
										<td className="dim">
											{locked
												? 'LED・ディスプレイなど（詳細設定で変更）'
												: INTERNAL_PINS.includes(pin)
													? 'Pico では基板内部で使用'
													: ''}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</Panel>
		</>
	);
}
