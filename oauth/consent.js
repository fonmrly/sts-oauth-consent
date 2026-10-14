"use strict";

(() => {
  const AUTH_BASE = "https://bvmumhpylsllbvhvymns.supabase.co/auth/v1";
  const config = window.STS_AUTH_CONFIG;
  const byId = (id) => document.getElementById(id);
  const form = byId("login-form");
  const consent = byId("consent");
  const status = byId("status");
  const buttons = [byId("login-button"), byId("approve"), byId("deny"), byId("forget")];
  const ids = new URLSearchParams(window.location.search).getAll("authorization_id");
  const authorizationId = ids.length === 1 && /^[A-Za-z0-9_-]{1,256}$/.test(ids[0]) ? ids[0] : null;
  let accessToken = null;
  let expiresAt = 0;
  let details = null;
  let busy = false;
  let active = true;
  let pending = null;
  let ready = false;

  const scopeDescriptions = {
    openid: "本人識別（OpenID Connect）",
    email: "メールアドレス情報",
    profile: "プロフィール情報",
    phone: "電話番号情報",
  };

  class AuthError extends Error {
    constructor(httpStatus) {
      super("Auth request failed");
      this.httpStatus = httpStatus;
    }
  }

  function message(text, error = false) {
    status.textContent = text;
    status.dataset.error = String(error);
  }

  function setBusy(value) {
    busy = value;
    for (const button of buttons) button.disabled = value;
    form.setAttribute("aria-busy", String(value));
    consent.setAttribute("aria-busy", String(value));
  }

  function forget() {
    accessToken = null;
    expiresAt = 0;
    details = null;
    form.reset();
    byId("client-name").textContent = "";
    byId("client-id").textContent = "";
    byId("redirect-uri").textContent = "";
    byId("scopes").replaceChildren();
    consent.hidden = true;
    form.hidden = !ready;
  }

  // Send credentials only to this project's documented Auth routes. No cookies,
  // storage, refresh requests, telemetry, or logging are used.
  async function authRequest(path, method = "GET", body = undefined) {
    const controller = new AbortController();
    pending = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    const headers = { apikey: config.publishableKey, Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    try {
      const response = await fetch(`${AUTH_BASE}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) throw new AuthError(response.status);
      return await response.json();
    } finally {
      clearTimeout(timeout);
      if (pending === controller) pending = null;
    }
  }

  function safeRedirect(raw) {
    if (typeof raw !== "string" || !raw) throw new Error("Missing redirect");
    const url = new URL(raw);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || !(url.protocol === "https:" || (url.protocol === "http:" && loopback))) {
      throw new Error("Unsafe redirect");
    }
    return url;
  }

  function showDetails(data) {
    // A redirect-only response may represent a previously granted consent.
    // Without reviewable details, never navigate or silently approve.
    if (!data || data.authorization_id !== authorizationId || typeof data.client?.id !== "string" || !data.client.id ||
        (data.scope !== undefined && typeof data.scope !== "string")) {
      throw new Error("Missing authorization details");
    }
    safeRedirect(data.redirect_uri);
    details = { redirectUri: data.redirect_uri };
    byId("client-name").textContent = typeof data.client.name === "string" && data.client.name ? data.client.name : "名前未設定のクライアント";
    byId("client-id").textContent = data.client.id;
    byId("redirect-uri").textContent = data.redirect_uri;
    const scopes = (data.scope || "").split(/\s+/).filter(Boolean);
    byId("scopes").replaceChildren();
    for (const scope of scopes) {
      const item = document.createElement("li");
      const code = document.createElement("code");
      code.textContent = scope;
      item.append(code, document.createTextNode(` — ${scopeDescriptions[scope] || "クライアントが要求するscope"}`));
      byId("scopes").append(item);
    }
    if (!scopes.length) {
      const item = document.createElement("li");
      item.textContent = "要求scopeなし";
      byId("scopes").append(item);
    }
    form.hidden = true;
    consent.hidden = false;
    message("接続内容を確認し、許可または拒否を選んでください。");
    byId("consent-heading").focus();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!ready || busy || !active) return;
    let credentials = { email: byId("email").value.trim(), password: byId("password").value };
    form.reset();
    setBusy(true);
    message("ログインして接続内容を取得しています。");
    try {
      const session = await authRequest("/token?grant_type=password", "POST", credentials);
      credentials = null;
      // Never keep the refresh token or the returned user profile.
      delete session.refresh_token;
      if (!active) return;
      if (typeof session.access_token !== "string" || !session.access_token ||
          typeof session.expires_in !== "number" || session.expires_in <= 0) throw new Error("Invalid session");
      accessToken = session.access_token;
      expiresAt = Date.now() + session.expires_in * 1000;
      delete session.access_token;
      delete session.user;
      const data = await authRequest(`/oauth/authorizations/${encodeURIComponent(authorizationId)}`);
      if (active) showDetails(data);
    } catch (error) {
      if (!active) return;
      forget();
      message(error instanceof AuthError && error.httpStatus === 400
        ? "ログインできませんでした。入力内容とアカウントの確認状態を確かめてください。"
        : "ログインまたは接続内容の取得に失敗しました。設定・通信を確認し、ChatGPTから認証をやり直してください。", true);
    } finally {
      credentials = null;
      setBusy(false);
    }
  });

  async function decide(action) {
    if (busy || !active || !details || !accessToken) return;
    if (Date.now() >= expiresAt) {
      forget();
      message("ログインの有効期限が切れました。もう一度ログインしてください。", true);
      return;
    }
    setBusy(true);
    message(action === "approve" ? "許可を送信しています。" : "拒否を送信しています。");
    try {
      const result = await authRequest(`/oauth/authorizations/${encodeURIComponent(authorizationId)}/consent`, "POST", { action });
      if (!active) return;
      const target = safeRedirect(result.redirect_url);
      const expected = safeRedirect(details.redirectUri);
      if (target.origin !== expected.origin || target.pathname !== expected.pathname) throw new Error("Unexpected redirect");
      forget();
      form.hidden = true;
      message("接続元へ戻ります。");
      window.location.assign(target.href);
    } catch (error) {
      if (!active) return;
      if (error instanceof AuthError && [401, 403].includes(error.httpStatus)) forget();
      message("同意処理を完了できませんでした。通信・ログインの有効期限を確認し、必要ならChatGPTから認証をやり直してください。", true);
    } finally {
      setBusy(false);
    }
  }

  byId("approve").addEventListener("click", () => decide("approve"));
  byId("deny").addEventListener("click", () => decide("deny"));
  byId("forget").addEventListener("click", () => {
    if (!busy) {
      forget();
      message("このページのログイン情報を消しました。再度ログインできます。");
    }
  });
  window.addEventListener("pagehide", () => {
    active = false;
    pending?.abort();
    forget();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      active = true;
      setBusy(false);
      forget();
      message("もう一度ログインして、接続内容を確認してください。");
    }
  });

  if (!authorizationId) {
    message("有効な認証リクエストがありません。ChatGPTのSTS接続から認証を開始してください。", true);
  } else if (config?.supabaseUrl !== "https://bvmumhpylsllbvhvymns.supabase.co" ||
             typeof config.publishableKey !== "string" || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey)) {
    message("この同意画面はまだ設定中です。公開用Publishable API keyの設定後、認証をやり直してください。", true);
  } else {
    ready = true;
    form.hidden = false;
    message("ログイン後にクライアント名・戻り先・要求scopeを確認できます。");
  }
})();
