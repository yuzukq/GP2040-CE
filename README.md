# GP2040 neo

<p>
  <a href="https://github.com/yuzukq/GP2040-CE/actions/workflows/neo.yml"><img alt="neo firmware" src="https://img.shields.io/github/actions/workflow/status/yuzukq/GP2040-CE/neo.yml?branch=neo&label=build" /></a>
  <a href="https://github.com/yuzukq/GP2040-CE/releases/tag/neo-latest"><img alt="release" src="https://img.shields.io/badge/release-neo--latest-orange" /></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-blue" /></a>
</p>

[GP2040-CE](https://github.com/OpenStickCommunity/GP2040-CE) をもとにした、アケコン用の個人向けファームウェアです。レバーの方向で出す入力を切り替える **Mod ボタン**と、**日本語の設定画面**を追加しています。

> [!NOTE]
> これは GP2040-CE の**非公式フォーク**で、OpenStickCommunity とは関係ありません。neo で起きた不具合や neo の機能についての質問を、GP2040-CE 本家の Issues や Discord に送らないでください。

## 本家との違い

- **Mod ショートカット**: Mod ボタンを押した瞬間のレバー方向（テンキー表記）で、出す入力を切り替えます。
  - シーケンス: 押すたびにコマンドを 1 回再生します（例: ガード中に Mod で 623+弱P）。
  - ホールド: Mod を押している間だけ入力を足します（例: L3 でドライブパリィ）。
  - キャラごとのプリセットを 8 個まで持てます。1P 側と 2P 側のルールは反転して作れます。
- **neo 設定画面**: コントローラー本体が配信する、ターミナル風の日本語設定画面です。
  - 1 配置: 実機のボタンを押してピンを割り当てる / どのピンか確かめる
  - 2 Mod: 技テンプレート（昇龍・波動・竜巻・真空…）からルールを作る
  - 3 設定: 入力モード、SOCD、起動時のモード切り替え、書き込みモードで再起動
- **`http://neo.local`** で設定画面が開きます（`http://192.168.7.1` も使えます）。本家の設定画面は `http://neo.local/home` に残しているので、LED・ディスプレイなどの設定はそちらで行います。
- `neo` ブランチに push すると、GitHub Actions がビルドしてリリース [`neo-latest`](https://github.com/yuzukq/GP2040-CE/releases/tag/neo-latest) を差し替えます。

入力モード（XInput / Switch / PS4 / PS5 など）、SOCD、低遅延といった基本機能は GP2040-CE と同じです。

## はじめかた

ダウンロード、設定画面へのリンク、書き込み手順は **https://yuzukq.github.io/GP2040-CE/** にまとめています。

1. 基板に合う `.uf2` をダウンロードします。
   | ファイル | 基板 |
   | --- | --- |
   | `neo_PicoFightingBoard.uf2` | Pico Fighting Board（たこた工房 typeC など） |
   | `neo_Pico.uf2` | Raspberry Pi Pico に手で配線した場合 |
2. 書き込みモードにします。基板の BOOT ボタンを押しながら USB を挿すか、neo の設定画面で「3 設定 → 書き込みモードで再起動」を選びます。
3. PC に出てくる `RPI-RP2` ドライブに `.uf2` をコピーします。コピーが終わると自動で再起動します。
4. 設定するときは、**Start を押しながら** USB を挿してから `http://neo.local` を開きます。

保存した設定（ボタン配置や Mod のキャラ設定）は、ファームウェアを書き直しても残ります。

Mod ショートカットの詳しい使い方、Raspberry Pi Pico の配線表、制限事項は [NEO.md](NEO.md) にあります。

## ビルド

```sh
scripts/build-neo.sh [BOARD]    # 省略時は Pico。初回は pico-sdk と ARM GCC を .deps/ にダウンロード
```

テストだけを実行する場合:

```sh
tests/mod_shortcut/run.sh                      # 判定ロジック（C++、PC 上で実行）
node --test 'tests/mod_shortcut/*.test.ts'     # Web UI のデータ変換・コマンド表記
```

本家の更新を取り込むときは `git fetch upstream && git merge upstream/main` を使います。neo の設定は本家と衝突しない番号で保存しているので、本家のファームとの間で書き換えても設定は読めます。変更したファイルの一覧は [NEO.md](NEO.md#upstreamからの変更点) にあります。

## ライセンスとクレジット

[MIT License](LICENSE) です。元になった GP2040-CE の著作権表示（OpenStickCommunity、Jason Skuby）は LICENSE にそのまま残しています。

neo は [GP2040-CE](https://github.com/OpenStickCommunity/GP2040-CE)（[gp2040-ce.info](https://gp2040-ce.info)）の上に作られています。GP2040-CE の開発者とコミュニティに感謝します。設定画面の見た目には [WebTUI](https://github.com/webtui/webtui)（MIT）を使っています。

<details>
<summary>GP2040-CE の謝辞（本家 README より）</summary>

- [FeralAI](https://github.com/FeralAI) for building [GP2040](https://github.com/FeralAI/GP2040) and laying the foundation for this community project
- Ha Thach's excellent [TinyUSB library](https://github.com/hathach/tinyusb) examples
- fluffymadness's [tinyusb-xinput](https://github.com/fluffymadness/tinyusb-xinput) sample
- Kevin Boone's [blog post on using RP2040 flash memory as emulated EEPROM](https://kevinboone.me/picoflash.html)
- [bitbank2](https://github.com/bitbank2) for the [OneBitDisplay](https://github.com/bitbank2/OneBitDisplay) and [BitBang_I2C](https://github.com/bitbank2/BitBang_I2C) libraries, which were ported for use with the Pico SDK
- [arntsonl](https://github.com/arntsonl) for the amazing cleanup and feature additions that brought us to v0.5.0
- [alirin222](https://github.com/alirin222) for the awesome turbo code ([@alirin222](https://twitter.com/alirin222) on Twitter)
- [deeebug](https://github.com/deeebug) for improvements to the web-UI and fixing the PS3 home button issue
- [TheTrain](https://github.com/TheTrainGoes/GP2040-Projects) and [Fortinbra](https://github.com/Fortinbra) for helping keep our community chugging along
- [PassingLink](https://github.com/passinglink/passinglink) for the technical details and code for PS4 implementation
- [Youssef Habchi](https://youssef-habchi.com/) for allowing us to purchase a license to use Road Rage font for the project
- [tamanegitaro](https://github.com/tamanegitaro/) and [alirin222](https://github.com/alirin222) for the basis of the mini/classic controller work
- [Ryzee119](https://github.com/Ryzee119) for the wonderful [ogx360_t4](https://github.com/Ryzee119/ogx360_t4/) and xid_driver library for Original Xbox support
- [Santroller](https://github.com/Santroller/Santroller) and [GIMX](https://github.com/matlo/GIMX) for technical examples of Xbox One authentication using pass-through
- [Santroller](https://github.com/Santroller/Santroller) for the code necessary to have Xbox 360 run without a dongle
- [Dycool](https://github.com/Dycool)'s [NS-PC-Control](https://github.com/Dycool/NS-PC-Control) for the technical details on wired Joy-Con, NES and Famicom controller identities
- [PVS-Studio](https://pvs-studio.com/en/pvs-studio/?utm_source=website&utm_medium=github&utm_campaign=open_source) for static code analysis

</details>
