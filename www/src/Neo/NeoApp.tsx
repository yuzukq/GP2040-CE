// gp2040-neo: the controller's main configuration screen (served at "/").
// Tabs: 1 button layout, 2 Mod Shortcut, 3 settings. One save writes every
// tab that changed; the stock GP2040-CE configurator stays at /home.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import WebApi, { baseUrl } from '../Services/WebApi';
import Http from '../Services/Http';
import {
	ModShortcutOptions,
	fromWire,
	newPreset,
	toWire,
	type WireOptions,
} from '../Data/ModShortcut.ts';
import { changedPins } from './neoModel.ts';
import PinsTab, { PinMappings } from './PinsTab';
import ModTab from './ModTab';
import SettingsTab, { GamepadOptions } from './SettingsTab';
import './neo.css';

type Tab = 'pins' | 'mod' | 'settings';
const TABS: { id: Tab; key: string; name: string }[] = [
	{ id: 'pins', key: '1', name: '配置' },
	{ id: 'mod', key: '2', name: 'Mod' },
	{ id: 'settings', key: '3', name: '設定' },
];
const BOOT_MODE_GAMEPAD = 0;
const TAB_STORAGE = 'neo.tab';

type FirmwareInfo = Record<string, string | undefined>;
type Loaded = {
	pins: PinMappings;
	mod: ModShortcutOptions;
	gamepad: GamepadOptions;
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const readTab = (): Tab => {
	const fromHash = location.hash.replace('#', '');
	if (TABS.some((t) => t.id === fromHash)) return fromHash as Tab;
	try {
		const stored = localStorage.getItem(TAB_STORAGE);
		if (TABS.some((t) => t.id === stored)) return stored as Tab;
	} catch {
		// storage may be blocked; fall back to the first tab
	}
	return 'pins';
};

export default function NeoApp() {
	const [saved, setSaved] = useState<Loaded | null>(null);
	const [pins, setPins] = useState<PinMappings | null>(null);
	const [mod, setMod] = useState<ModShortcutOptions | null>(null);
	const [gamepad, setGamepad] = useState<GamepadOptions | null>(null);
	const [firmware, setFirmware] = useState<FirmwareInfo>({});
	const [loadError, setLoadError] = useState(false);
	const [tab, setTabState] = useState<Tab>(readTab);
	const [editingPreset, setEditingPreset] = useState(0);
	const [rulesVersion, setRulesVersion] = useState(0);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
	const [leaving, setLeaving] = useState<'ask' | 'rebooting' | 'done' | null>(null);
	const messageTimer = useRef<number>();

	const setTab = useCallback((next: Tab) => {
		setTabState(next);
		history.replaceState(null, '', `#${next}`);
		try {
			localStorage.setItem(TAB_STORAGE, next);
		} catch {
			// ignore
		}
		window.scrollTo(0, 0);
	}, []);

	const load = async () => {
		setLoadError(false);
		const [wire, pinData, gamepadData, fw] = await Promise.all([
			WebApi.getModShortcutOptions(() => {}),
			WebApi.getPinMappings(),
			WebApi.getGamepadOptions(() => {}),
			Http.get(`${baseUrl}/api/getFirmwareVersion`)
				.then((r: { data: FirmwareInfo }) => r.data)
				.catch(() => ({})),
		]);
		if (!wire || !pinData || !gamepadData) {
			setLoadError(true);
			return;
		}
		const modOptions = fromWire(wire as WireOptions);
		if (modOptions.presets.length === 0) modOptions.presets.push(newPreset('キャラ1'));
		const loaded: Loaded = {
			pins: pinData as PinMappings,
			mod: modOptions,
			gamepad: gamepadData as GamepadOptions,
		};
		setSaved(clone(loaded));
		setPins(loaded.pins);
		setMod(loaded.mod);
		setGamepad(loaded.gamepad);
		setEditingPreset(Math.min(modOptions.activePreset, modOptions.presets.length - 1));
		setFirmware(fw as FirmwareInfo);
	};

	useEffect(() => {
		document.title = 'GP2040 neo';
		load();
	}, []);

	const dirty = useMemo(() => {
		if (!saved || !pins || !mod || !gamepad) return { pins: 0, mod: false, settings: false };
		return {
			pins: changedPins(saved.pins, pins).length,
			mod: JSON.stringify(toWire(mod)) !== JSON.stringify(toWire(saved.mod)),
			settings: JSON.stringify(gamepad) !== JSON.stringify(saved.gamepad),
		};
	}, [saved, pins, mod, gamepad]);
	const isDirty = dirty.pins > 0 || dirty.mod || dirty.settings;

	const flashMessage = (kind: 'ok' | 'err', text: string) => {
		setMessage({ kind, text });
		window.clearTimeout(messageTimer.current);
		messageTimer.current = window.setTimeout(() => setMessage(null), 6000);
	};

	const save = async (): Promise<boolean> => {
		if (!saved || !pins || !mod || !gamepad || saving) return false;
		setSaving(true);
		const failed: string[] = [];
		const next = clone(saved);
		try {
			if (dirty.pins) {
				await WebApi.setPinMappings(pins);
				next.pins = clone(pins);
			}
		} catch {
			failed.push('配置');
		}
		if (dirty.mod) {
			if (await WebApi.setModShortcutOptions(toWire(mod))) next.mod = clone(mod);
			else failed.push('Mod');
		}
		if (dirty.settings) {
			if (await WebApi.setGamepadOptions(gamepad)) next.gamepad = clone(gamepad);
			else failed.push('設定');
		}
		setSaved(next);
		setSaving(false);
		if (failed.length) {
			flashMessage('err', `${failed.join('・')} を保存できませんでした。USB の接続を確認してください。`);
			return false;
		}
		flashMessage('ok', '保存しました。使うときは「コントローラーに戻る」。');
		return true;
	};

	const revert = () => {
		if (!saved) return;
		setPins(clone(saved.pins));
		setMod(clone(saved.mod));
		setGamepad(clone(saved.gamepad));
		setEditingPreset((i) => Math.min(i, saved.mod.presets.length - 1));
		setRulesVersion((v) => v + 1);
		flashMessage('ok', '保存した状態に戻しました。');
	};

	const reboot = async () => {
		setLeaving('rebooting');
		await WebApi.reboot(BOOT_MODE_GAMEPAD);
		setLeaving('done');
	};

	const leave = () => (isDirty ? setLeaving('ask') : reboot());

	// Keyboard (htop style): 1-3 tabs, Ctrl/Cmd+S save, U revert, Q leave
	const saveRef = useRef(save);
	saveRef.current = save;
	const keysRef = useRef({ revert, leave, isDirty });
	keysRef.current = { revert, leave, isDirty };
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
				e.preventDefault();
				saveRef.current();
				return;
			}
			const target = e.target as HTMLElement;
			if (e.ctrlKey || e.metaKey || e.altKey) return;
			if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
			const t = TABS.find((x) => x.key === e.key);
			if (t) setTab(t.id);
			const k = e.key.toLowerCase();
			if (k === 'u' && keysRef.current.isDirty) keysRef.current.revert();
			if (k === 'q') keysRef.current.leave();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [setTab]);

	useEffect(() => {
		const warn = (e: BeforeUnloadEvent) => {
			if (isDirty) e.preventDefault();
		};
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	}, [isDirty]);

	if (loadError) {
		return (
			<div className="neo">
				<div className="fullscreen">
					<h1>コントローラーに繋がりません</h1>
					<p className="lead">
						USB ケーブルを確認してください。Start を押しながら挿すと設定モードで起動します。
					</p>
					<button type="button" size-="small" variant-="primary" onClick={load}>
						もう一度読み込む
					</button>
				</div>
			</div>
		);
	}

	if (leaving === 'done') {
		return (
			<div className="neo">
				<div className="fullscreen">
					<h1>コントローラーとして再起動しました</h1>
					<p className="lead">
						このページは閉じて大丈夫です。また設定するときは、Start を押しながら USB を挿してください。
					</p>
				</div>
			</div>
		);
	}

	if (!saved || !pins || !mod || !gamepad) {
		return (
			<div className="neo">
				<div className="fullscreen">
					<p>
						<span is-="spinner" variant-="dots" /> 読み込み中…
					</p>
				</div>
			</div>
		);
	}

	const tabCount = (id: Tab) =>
		id === 'pins' ? dirty.pins || 0 : id === 'mod' ? (dirty.mod ? '*' : 0) : dirty.settings ? '*' : 0;

	return (
		<div className="neo">
			<header className="statusline">
				<span className="brand">neo</span>
				<span className="board">
					{firmware.boardConfigLabel ?? 'GP2040-CE'}
					{firmware.version ? ` ${firmware.version}` : ''}
				</span>
				<span className={`state ${isDirty ? 'is-dirty' : ''}`}>
					{saving ? '保存中…' : isDirty ? '未保存の変更あり' : '保存済み'}
				</span>
			</header>

			<nav className="tabs" role="tablist" aria-label="画面">
				{TABS.map((t) => {
					const count = tabCount(t.id);
					return (
						<button
							key={t.id}
							type="button"
							role="tab"
							aria-selected={tab === t.id}
							onClick={() => setTab(t.id)}
						>
							<span className="num">{t.key}</span>
							{t.name}
							{count ? <span className="count">{count}</span> : null}
						</button>
					);
				})}
			</nav>

			{leaving === 'ask' && (
				<div className="confirm" role="alertdialog" aria-label="保存の確認">
					<span>保存していない変更があります。</span>
					<button
						type="button"
						size-="small"
						onClick={async () => {
							if (await save()) reboot();
							else setLeaving(null);
						}}
					>
						保存して戻る
					</button>
					<button type="button" size-="small" variant-="ghost" onClick={reboot}>
						保存せずに戻る
					</button>
					<button type="button" size-="small" variant-="ghost" onClick={() => setLeaving(null)}>
						やめる
					</button>
				</div>
			)}

			<main className="screen" role="tabpanel">
				{tab === 'pins' && <PinsTab mappings={pins} saved={saved.pins} onChange={setPins} />}
				{tab === 'mod' && (
					<ModTab
						options={mod}
						update={(fn) => setMod((prev) => (prev ? fn(prev) : prev))}
						mappings={pins}
						editing={editingPreset}
						setEditing={setEditingPreset}
						rulesVersion={rulesVersion}
						bumpRules={() => setRulesVersion((v) => v + 1)}
						goToPins={() => setTab('pins')}
					/>
				)}
				{tab === 'settings' && (
					<SettingsTab options={gamepad} onChange={setGamepad} firmware={firmware} />
				)}
			</main>

			<footer className="keybar">
				<button
					type="button"
					className={isDirty ? 'is-hot' : ''}
					disabled={!isDirty || saving}
					onClick={save}
				>
					<kbd>^S</kbd>
					{saving ? '保存中…' : '保存'}
				</button>
				<button type="button" disabled={!isDirty || saving} onClick={revert}>
					<kbd>U</kbd>元に戻す
				</button>
				<button
					type="button"
					disabled={leaving === 'rebooting'}
					onClick={leave}
				>
					<kbd>Q</kbd>
					{leaving === 'rebooting' ? '再起動中…' : 'コントローラーに戻る'}
				</button>
				{message && (
					<span className={`keybar-msg ${message.kind === 'ok' ? 'ok' : 'err'}`} role="status">
						{message.text}
					</span>
				)}
			</footer>
		</div>
	);
}
