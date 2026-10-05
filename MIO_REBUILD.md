# MioをローカルPCで再構築する

GitHubにはリグ・数値設定・スクリプトとこの手順だけを保存しています。
キャラクター画像、`source.png`、切り抜きレイヤー、表情画像、確認画像、ZIPは公開していません。
画像の入出力先 `projects/` は引き続きGit対象外です。

## 初回だけ：ブランチとツールを準備する

PCにこのリポジトリがある場合、そのフォルダで次を実行します。

```sh
git fetch origin
git switch --track origin/mio/rebuild-local
```

すでにローカルに同名ブランチがある場合は `git switch mio/rebuild-local` で切り替えます。
この変更は新しいブランチに保存しているため、`main` で `git pull` しただけでは取り込まれません。

Node.js 22.17以降（npmを含む）、Python 3.10以降、[uv](https://docs.astral.sh/uv/getting-started/installation/) が必要です。
WindowsではPowerShell、macOS/Linuxではターミナルで実行できます。
初回の再構築コマンドがPython依存パッケージを準備し、`node_modules` がなければ `npm ci` も実行します。
初回の依存パッケージ取得にはネットワークが必要ですが、キャラクター画像を送信する処理はありません。

## 以後：git pull → 3枚のPNG → 1コマンド

リポジトリのフォルダで更新します。

```sh
git pull
```

次のフォルダを作り、元の3枚をこの名前で置いてください。フォルダはエクスプローラーやFinderから作って構いません。

```text
mesh-avatar-studio/
  projects/
    mio/
      inputs/
        originals/
          mio_front_hair.png
          mio_back_hair.png
          mio_body.png
```

3枚とも透明背景の1086×1448 PNGです。元のキャンバス位置のまま置き、切り詰め・拡大縮小・背景の塗りつぶしをしないでください。
`mio_parts.zip` をPCで展開して、この3枚だけをコピーできます。ZIPをGitに追加する必要はありません。

再構築はこの1コマンドです。

```sh
uv run tools/rebuild-mio.py
```

元画像の合成、リグ検証、目レイヤーの切り出し、衣装を除外した髪マスク作成を行い、次を復元します。

```text
projects/mio/
  source.png
  rig.json
  rig.draft.json
  inputs/originals/             # 元の3枚もローカルに保持
  built/
    base.png
    hairmask.png
    eye0_ball.png / eye1_ball.png
    eye0_lash.png / eye1_lash.png
    eye0_low.png / eye1_low.png
    eye0_crease.png / eye1_crease.png
    layers.json
  variant-requests/            # 将来の表情差分用マスクと手順。画像生成は実行しない
```

編集画面は `npm run dev` で起動し、「プロジェクトを開く」→ **mio** を選びます。
目の開閉、顔・体の小さな変形、呼吸、髪11束の揺れ、簡易の口の動きを確認できます。

## 保存している設定と合成方法

| ファイル | 内容 |
| --- | --- |
| `configs/mio/rig.json` | 検証済みの完全なリグ。目の計算済み曲線を含む。 |
| `configs/mio/rig.draft.json` | 読み取った座標・輪郭・髪束・変形範囲の初期設定。 |
| `configs/mio/rebuild.json` | PNG名、キャンバスサイズ、合成順、髪マスクのアルファ閾値、飾りの除外ポリゴン。 |
| `tools/rebuild-mio.py` | 元PNGだけからローカルで再構築するスクリプト。 |

合成順は **後ろ髪 → 体 → 前髪** です。
髪と衣装がともに白いため、髪の判定に色は使いません。
後ろ髪は体のアルファで隠し、前髪は元パーツのアルファを使います。
体に重なる薄い前髪の抽出残りと、頭に付いた花・星・青いリボンを髪の揺れから除外します。

頭の中心は(543,125)、首の支点は(542,221)。目、唇、肩、髪束の詳細座標はJSONに保存しています。
手足の独立した動作や歩行、飾りの独立した振り子運動は設定していません。

## 7種類の描画差分について

クラウドで追加生成した閉じ目・半目・笑った目と、口の「あ・半開きのあ・い・お」は、元の3枚には含まれない別の画像です。
**元PNG3枚と数値設定だけから、同じ7枚を完全には復元できません。**
新しいPCでは、最初はローカルの目レイヤーと簡易描画の口を使うアバターを再構築します。
口の最大開きの見た目も、描画差分を組み込んだクラウド版とは異なります。

検証済みの全サイズ差分をPCに別途保管している場合は、次へ置き、同じ再構築コマンドを実行してください。

```text
projects/mio/variants/
  eyes_closed.png
  eyes_half.png
  eyes_smile.png
  mouth_a.png
  mouth_a_half.png
  mouth_i.png
  mouth_o.png
```

差分のサイズとマスク外の画素を検証してから、`built/sprites/` を再生成します。
既存のローカル差分がある場合も同じ処理を行います。これらの画像もGitには追加しません。
外部の画像生成サービスを呼ぶ処理や、公開画像URLからダウンロードする処理はありません。

## 再実行・編集後の扱い

- 通常の再実行では、PCで編集・保存した `projects/mio/rig.json` と既存の私用ファイルを保持します。
- ブランチに保存した初期設定へ戻す場合は `uv run tools/rebuild-mio.py --reset-rig` を実行します。
- 別の入力フォルダを指定する場合は `uv run tools/rebuild-mio.py --input-dir projects/mio-inputs` を使えます。
- 動作確認用に別フォルダを作る場合は `--project projects/mio-check --input-dir projects/mio/inputs/originals` を指定できます。
- 依存パッケージの自動インストールを省く場合は `--skip-install` を指定します。

画像・サイズ・リグ・表情差分の検証とビルドがすべて完了してから、プロジェクトを入れ替えます。
入力が不足・不正な場合、既存プロジェクトは置き換えません。
既存の `source.png` が3枚の合成と異なる場合も、手編集した画像を守るため停止します。別の `--project` フォルダで再構築してください。
Windowsでフォルダ入れ替えのアクセスエラーが出る場合は、編集サーバーや画像を開いているアプリを閉じて再実行します。

目の輪郭などを編集した後も、この専用コマンドで再構築してください。編集画面の標準再生成は、このパーツのアルファから作る髪マスクを使用しません。
大きな目の輪郭変更後は、閉じ目と描画差分の境界を優先して確認します。

## 確認コマンド

```sh
npm run validate-rig -- projects/mio/rig.json
npm run render-poses -- projects/mio
```

ポーズ確認にはPlaywright Chromiumが必要です。初回は `npx playwright install chromium` で準備します。
確認画像はローカルの `projects/mio/review/` に出力されます。

画像がGit対象外であることは次で確認できます。

```sh
git check-ignore projects/mio/source.png projects/mio/inputs/originals/mio_body.png projects/mio/built/base.png
git status --short
```

`configs/mio/` も、指定した3個のJSON以外はGit対象外です。画像をコミットするための `git add -f` は使わないでください。
