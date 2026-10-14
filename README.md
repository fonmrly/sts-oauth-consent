# STS OAuth consent

STS専用MCPの公開静的OAuth同意UI。外部ライブラリ・CDN・トラッカー・有料サービス・独自ドメインは使用しません。

- 公開サイト: https://fonmrly.github.io/sts-oauth-consent/
- 同意画面: https://fonmrly.github.io/sts-oauth-consent/oauth/consent.html
- Supabase project: `https://bvmumhpylsllbvhvymns.supabase.co`

製品の接続は **ChatGPT → Supabase Edge `sts-mcp` → 既存STS DB**。このサイトはSupabase Authにだけfetchするログイン・同意画面です。Taskデータ、DBアクセス、MCP実装は含みません。Sol OL Gateway、OL、Local Solとは接続しません。既存private `sol-task-store` repositoryの公開は不要です。

## 本人が行う最小セットアップ

1. `config.js`のブラウザー向け **Publishable key**は設定済みです。このprojectの公開Auth APIが受理することを確認しました。キーを変更する場合だけ、Supabase Dashboardの **Settings → API Keys** にある **Publishable key**（`sb_publishable_…`）を`publishableKey`へ入れて、このrepositoryの`main`へpushします。公開可能なこのキーだけを入れます。secret key、service_role key、JWT、パスワードは入れません。
2. Supabaseの設定を、以下の正確な2値にします。

   | 設定場所 | 設定 | 値 |
   | --- | --- | --- |
   | Authentication → URL Configuration | Site URL | `https://fonmrly.github.io/sts-oauth-consent` |
   | Authentication → OAuth Server | Authorization Path | `/oauth/consent.html` |

3. 本人が初回Supabase Auth userを作成し、STS ownerを設定し、OAuth Serverを有効化します。このrepositoryはこれらの設定を変更しません。
4. ChatGPTのSTS MCP接続からOAuthを開始します。Supabaseがこの画面へ `?authorization_id=…` を付けて転送します。本人がメール・パスワードでログインし、クライアント名・ID・リダイレクト先・要求scopeを確認して **許可する** または **拒否する** を選びます。Authの返却`redirect_url`へ戻ります。

GitHub Pagesの公開元は **Deploy from a branch → main → / (root)**。ビルドツールや独自のCIは不要です。`.nojekyll`により静的ファイルをそのまま配信します。

## APIと認証情報の扱い

公式GoTrue [OpenAPI](https://github.com/supabase/auth/blob/master/openapi.yaml)および[Auth SDK実装](https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/src/GoTrueClient.ts)を確認した直接REST実装です。基点は `https://bvmumhpylsllbvhvymns.supabase.co/auth/v1`。

| 操作 | HTTP API | 認証 |
| --- | --- | --- |
| 本人のログイン | `POST /token?grant_type=password`、JSON `{ email, password }` | `apikey`: Publishable key |
| 接続内容の取得 | `GET /oauth/authorizations/{authorization_id}` | `apikey` + 本人のBearer JWT |
| 本人の意思決定 | `POST /oauth/authorizations/{authorization_id}/consent`、JSON `{ action: "approve" }` または `{ action: "deny" }` | `apikey` + 本人のBearer JWT |

メール・パスワード・access token・refresh token・返却プロフィールをlocalStorage、sessionStorage、Cookie、ログへ保存しません。フォームは送信時に消し、access tokenだけをページ内JSメモリで一時保持します。refresh tokenは取得応答から直ちに捨て、自動更新はしません。ページ離脱時に情報を消し、進行中のリクエストを中断します。ブラウザー自身のパスワード保存機能はブラウザー側の設定です（フォームは`autocomplete="off"`）。

許可・拒否POSTは対応するボタンを押した時だけ送信します。クライアント名、ID、戻り先、scopeは`textContent`で表示し、外部のクライアントロゴは読み込みません。HTMLのCSP metaはfetchをこのprojectの`/auth/v1/`だけに制限します。fetchはCookie送受信・キャッシュ・Referer・HTTPリダイレクトを無効化します。Authの返却戻り先はHTTPS（開発用loopback HTTPも可）かつ確認画面と同じorigin/pathであることを確認します。

以前の同意が適用され、詳細GETが`redirect_url`だけを返す場合は、確認情報が不足するため画面から自動転送しません。OAuthリクエスト側で`prompt=consent`を指定した新しい認証を開始してください。メール・パスワード認証用の画面です。追加のMFAやCAPTCHAが必要なproject設定では、それらに対応したログイン実装が別途必要です。

## 検証範囲

2026-10-14にJavaScript構文、HTMLのローカル参照とCSP、15件のブラウザー不在VMテストを確認済み（15秒以内）。ログイン後の詳細表示、ボタンクリックまで同意POSTを送らないこと、approve/deny、XSS文字列のテキスト表示、異常な戻り先の拒否、ページ離脱時の消去、設定不足・認証エラーを検証しました。stagingの秘密値・個人メールアドレスscanもPASSです。

2026-10-14 13:42:39 UTC、公開同意画面の実HTTP GETは **200 / `text/html; charset=utf-8`**。JS・CSS・configもGET 200で、配信内容はcommit済みsourceと一致しました。

Publishable key設定後、このprojectの`GET /auth/v1/settings`は200で、GitHub PagesのOriginに対するCORS応答も確認済みです（キー値は診断出力に表示していません）。本人設定と実際のブラウザー・ChatGPT OAuth認証は未検証であり、公開配信・公開Auth APIの成功を実機認証のPASSとはしません。

公式資料: [OAuth Serverセットアップ](https://supabase.com/docs/guides/auth/oauth-server/getting-started)、[OAuthフロー](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows)、[Edge FunctionsのHTML配信制限](https://supabase.com/docs/guides/functions/http-methods)。
