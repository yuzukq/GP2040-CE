// gp2040-neo: settings tab (input mode, SOCD, boot buttons) plus how-tos.
import { Msg, Panel, Select } from './ui';

export type GamepadOptions = Record<string, unknown> & {
	inputMode?: number;
	socdMode?: number;
};

type Option = { value: number; name: string; note?: string };

// Values from proto/enums.proto (InputMode)
const INPUT_MODES: Option[] = [
	{ value: 0, name: 'XInput', note: 'PC・Xbox 360 互換。PC版の格ゲーはこれ' },
	{ value: 1, name: 'Nintendo Switch', note: 'Switch 用の有線コントローラー' },
	{ value: 15, name: 'Switch Pro', note: 'Pro コントローラーとして動く' },
	{ value: 4, name: 'PS4', note: '認証の準備が必要（詳細設定）' },
	{ value: 13, name: 'PS5', note: '認証の準備が必要（詳細設定）' },
	{ value: 2, name: 'PS3 / DirectInput', note: '古いPCゲームや PS3' },
	{ value: 3, name: 'キーボード', note: 'ボタンをキー入力として送る' },
	{ value: 14, name: '汎用 HID', note: 'その他のゲーム機・ソフト' },
];

const SOCD_MODES: Option[] = [
	{ value: 0, name: '上優先', note: '左+右=N、上+下=上（ヒットボックスで一般的）' },
	{ value: 1, name: 'ニュートラル', note: '左+右=N、上+下=N' },
	{ value: 2, name: '後入力優先', note: '後から押した方向が勝つ' },
	{ value: 3, name: '先入力優先', note: '先に押した方向が勝つ' },
	{ value: 4, name: 'なし', note: '両方そのまま送る（大会では不可のことが多い）' },
];

// Hold one of these while plugging in to start in another input mode
const BOOT_KEYS: { key: string; name: string }[] = [
	{ key: 'inputModeB3', name: '弱P (X)' },
	{ key: 'inputModeB4', name: '中P (Y)' },
	{ key: 'inputModeR1', name: '強P (RB)' },
	{ key: 'inputModeL1', name: 'P4 (LB)' },
	{ key: 'inputModeB1', name: '弱K (A)' },
	{ key: 'inputModeB2', name: '中K (B)' },
	{ key: 'inputModeR2', name: '強K (RT)' },
	{ key: 'inputModeL2', name: 'K4 (LT)' },
];

const modeName = (value: number) =>
	INPUT_MODES.find((m) => m.value === value)?.name ?? `モード ${value}`;

const Choices = ({
	value,
	options,
	onChange,
	label,
}: {
	value: number | undefined;
	options: Option[];
	onChange: (value: number) => void;
	label: string;
}) => (
	<div className="choices" role="radiogroup" aria-label={label}>
		{options.map((o) => (
			<button
				key={o.value}
				type="button"
				role="radio"
				aria-checked={o.value === value}
				aria-pressed={o.value === value}
				onClick={() => onChange(o.value)}
			>
				<span>
					{o.name}
					{o.note && <small>{o.note}</small>}
				</span>
			</button>
		))}
	</div>
);

export default function SettingsTab({
	options,
	onChange,
	firmware,
}: {
	options: GamepadOptions;
	onChange: (next: GamepadOptions) => void;
	firmware: Record<string, string | undefined>;
}) {
	const set = (key: string, value: number) => onChange({ ...options, [key]: value });
	const inputMode = options.inputMode as number | undefined;
	const unknownMode =
		inputMode !== undefined && !INPUT_MODES.some((m) => m.value === inputMode);

	return (
		<>
			<Panel title="入力モード">
				<p className="lead">コントローラーとして何に見せるかです。保存して再起動すると切り替わります。</p>
				<Choices
					label="入力モード"
					value={inputMode}
					options={INPUT_MODES}
					onChange={(v) => set('inputMode', v)}
				/>
				{unknownMode && (
					<Msg kind="info">今は「{modeName(inputMode!)}」です。このモードは詳細設定で変更できます。</Msg>
				)}
				{(inputMode === 4 || inputMode === 13) && (
					<Msg kind="warn">PS4/PS5 モードは認証の設定がないと数分で切断されます。設定は詳細設定で行います。</Msg>
				)}
			</Panel>

			<Panel title="同時押し（SOCD）">
				<p className="lead">左右や上下を同時に押したときの扱いです。</p>
				<Choices
					label="SOCD"
					value={options.socdMode as number | undefined}
					options={SOCD_MODES}
					onChange={(v) => set('socdMode', v)}
				/>
			</Panel>

			<Panel title="起動時のモード切り替え">
				<p className="lead">
					ボタンを押しながら USB を挿すと、その回だけ別の入力モードで起動します。
				</p>
				<div className="table-wrap">
					<table className="pins">
						<thead>
							<tr>
								<th>押しながら挿す</th>
								<th>起動するモード</th>
							</tr>
						</thead>
						<tbody>
							{BOOT_KEYS.map((b) => {
								const value = (options[b.key] as number | undefined) ?? -1;
								return (
									<tr key={b.key}>
										<td>{b.name}</td>
										<td>
											<Select
												aria-label={`${b.name} を押しながら挿したときのモード`}
												value={value}
												onChange={(e) => set(b.key, Number(e.target.value))}
											>
												<option value={-1}>なし</option>
												{INPUT_MODES.map((m) => (
													<option key={m.value} value={m.value}>
														{m.name}
													</option>
												))}
												{value !== -1 && !INPUT_MODES.some((m) => m.value === value) && (
													<option value={value}>{modeName(value)}</option>
												)}
											</Select>
										</td>
									</tr>
								);
							})}
							<tr>
								<td>Start</td>
								<td className="dim">この設定画面（変更不可）</td>
							</tr>
						</tbody>
					</table>
				</div>
			</Panel>

			<Panel title="ヘルプ" className="help">
				<span className="section-label">この画面を開く</span>
				<ol>
					<li>USB を抜く</li>
					<li>Start を押しながら USB を挿す（未配線なら端子台の START と GND を繋いだまま挿す）</li>
					<li>
						ブラウザで <code>http://192.168.7.1</code> を開く
					</li>
				</ol>
				<span className="section-label">ボタン名</span>
				<p>
					弱P などの名前は、ゲーム側が初期設定（X=弱P Y=中P RB=強P A=弱K B=中K RT=強K）のときの意味です。
					ゲーム側で配置を変えている場合は、横に出ている X や RB を見てください。
				</p>
				<span className="section-label">キー操作</span>
				<dl className="kv">
					<dt>
						<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>
					</dt>
					<dd>タブを切り替える</dd>
					<dt>
						<kbd>^S</kbd>
					</dt>
					<dd>保存する</dd>
					<dt>
						<kbd>U</kbd>
					</dt>
					<dd>保存した状態に戻す</dd>
					<dt>
						<kbd>Q</kbd>
					</dt>
					<dd>コントローラーに戻る（再起動）</dd>
					<dt>
						<kbd>Esc</kbd>
					</dt>
					<dd>ボタン待ちをやめる</dd>
				</dl>
			</Panel>

			<Panel title="このコントローラー">
				<dl className="kv">
					<dt>基板</dt>
					<dd>{firmware.boardConfigLabel ?? '-'}</dd>
					<dt>ファームウェア</dt>
					<dd>{firmware.version ?? '-'}</dd>
					<dt>詳細設定</dt>
					<dd>
						<a href="/home">GP2040-CE の標準画面を開く</a>
						<span className="dim">（LED・ディスプレイ・アドオンなど）</span>
					</dd>
				</dl>
			</Panel>
		</>
	);
}
