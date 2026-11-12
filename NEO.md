# gp2040-neo

[GP2040-CE](https://github.com/OpenStickCommunity/GP2040-CE) のフォークです。**Modショートカット**（レバー方向で出し分けるModボタン）を追加しています。

## Modショートカット

Modボタンを押した瞬間のレバー方向（テンキー表記）でルールを選び、入力を出力します。

| Mod押下時のレバー | 初期設定（プリセット「Default」） |
| --- | --- |
| 5（ニュートラル） | Modを押している間 L3（XInputのLS）＝パリィ |
| 4 / 1（左・左下） | 6 → 2 → 3 → 3+X（1P側の弱昇龍） |
| 6 / 3（右・右下） | 4 → 2 → 1 → 1+X（2P側の弱昇龍） |
| それ以外 | 何もしない（レバーはそのまま） |

- **シーケンス**: 押すたびに1回再生します。再生中は物理レバーと他のボタンを無視します（ガード中の4が混ざらないようにするため）。再生が終わると物理入力に戻ります。Modをすぐ離しても最後まで再生します。
- **ホールド**: Modを押している間、指定した入力を足し込みます。レバーと他のボタンはそのまま効きます。
- 方向はModを押した瞬間に1回だけ判定します。ルールは上から順に判定し、最初に一致したものが使われます。
- 1F = 1/60秒。各ステップの初期値は2F（ゲーム側の60Hz読み取りで取りこぼさないため）。

### キャラごとの設定（ブラウザ）

1. コントローラのUSBを抜き、**Start（S2）を押しながら**PCに挿す → Web設定モードで起動
2. ブラウザで http://192.168.7.1 を開く
3. 初回のみ: 「構成設定 → ピン割り当て」で、Modボタンを繋いだピン（例: GP22）を **Modショートカット** にして保存
4. 「構成設定 → Modショートカット設定」でプリセット（最大8）を編集し、「使用するプリセット」を選んで保存
5. 右上の「再起動」でコントローラモードに戻る

設定はPicoのフラッシュに保存されるので、ファームウェアの書き直しは不要です。

コマンド欄には `6 2 3 3+X:3` や `623+X`、`236236+X` のように入力できます（`:N` はフレーム数）。「左右反転コピー」で2P側のルールを作れます。

制限: プリセット8個、1プリセットにつきルール6個、1ルールにつきステップ10個、ステップ1つあたり最大255F、ショートカットで出せるボタンはB1〜A2（拡張ボタンE1〜E12は不可）。

## 配線（Raspberry Pi Pico、初期ピン配置）

各スイッチの片側をGPIOに、もう片側をGNDに繋ぎます（内部プルアップを使うので抵抗は不要）。

| 入力 | GPIO | XInput |
| --- | --- | --- |
| 上 / 下 / 右 / 左 | GP2 / GP3 / GP4 / GP5 | 十字キー |
| B1 / B2 / R2 / L2 | GP6 / GP7 / GP8 / GP9 | A / B / RT / LT |
| B3 / B4 / R1 / L1 | GP10 / GP11 / GP12 / GP13 | X / Y / RB / LB |
| S1 / S2 | GP16 / GP17 | Back / Start |
| L3 / R3 / A1 | GP18 / GP19 / GP20 | LS / RS / Guide |
| **Mod** | 空きピン（例: **GP22**）→ Webでピン割り当て | – |

三和レバー（JLF）の5ピンハーネスは「GND＋4方向」です。レバー内部のマイクロスイッチの位置は実際の倒す方向と**逆**になるので、倒した方向とピンの対応はテスターかWeb設定の「端子確認」で確かめてください。違っていてもピン割り当てで入れ替えられます。

## ビルドと書き込み

```sh
scripts/build-neo.sh            # 初回は pico-sdk と ARM GCC を .deps/ にダウンロード
# → build-Pico/GP2040-CE_0.7.12_Pico.uf2
```

書き込み: PicoのBOOTSELボタンを押しながらUSBを挿す（またはWeb設定の再起動メニューからBOOTSELを選ぶ）→ `RPI-RP2` ドライブに `.uf2` をコピーする。

テストだけを実行する場合:

```sh
tests/mod_shortcut/run.sh          # 判定ロジック（C++、PC上で実行）
node --test tests/mod_shortcut/    # Web UIのデータ変換・コマンド表記
```

## upstreamからの変更点

- `headers/addons/mod_shortcut_engine.h`: 判定ロジック（ハードウェア非依存）
- `src/addons/mod_shortcut.cpp`, `headers/addons/mod_shortcut.h`: アドオン本体
- `proto/`: `GpioAction.BUTTON_PRESS_MOD_SHORTCUT = 200`, `AddonOptions.modShortcutOptions = 100`（upstreamの番号追加と衝突しないよう大きな番号を使用）
- `src/webconfig.cpp`: `/api/getModShortcutOptions`, `/api/setModShortcutOptions`
- `lib/FlashPROM`: 設定領域を32KB→40KBに拡張。設定はフラッシュ末尾から格納されるため、upstreamのファームとの間で書き換えても既存設定はそのまま読めます
- `www/`: 設定ページ `/mod-shortcut`（英語・日本語）

upstreamを取り込む場合: `git fetch upstream && git merge upstream/main`
