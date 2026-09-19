use serde_json::{Map, Value};
use url::Url;

fn share_origin(configured: &str, development: bool) -> Result<String, &'static str> {
    let url = Url::parse(configured).map_err(|_| "VITE_CLOUD_SHARE_URL must be an origin")?;
    let host = url.host_str().ok_or("share origin must have a host")?;
    let local = matches!(host, "localhost" | "127.0.0.1" | "[::1]");
    if (url.scheme() != "https" && !(development && local && url.scheme() == "http"))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
        || !host
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b':' | b'[' | b']'))
        || configured.chars().any(char::is_whitespace)
    {
        return Err("share origin must be HTTPS without credentials, path, query, or wildcards; local HTTP is development-only");
    }
    Ok(url.origin().ascii_serialization())
}

fn object<'a>(value: &'a mut Value, key: &str) -> Result<&'a mut Value, &'static str> {
    let entry = value
        .as_object_mut()
        .ok_or("security configuration must use directive objects")?
        .entry(key)
        .or_insert_with(|| Value::Object(Map::new()));
    if !entry.is_object() {
        return Err("security configuration must use directive objects");
    }
    Ok(entry)
}

pub fn configure(
    mut overrides: Value,
    configured: Option<&str>,
    development: bool,
) -> Result<Value, &'static str> {
    let base: Value = serde_json::from_str(include_str!("../tauri.conf.json"))
        .map_err(|_| "invalid base Tauri configuration")?;
    let mut sources = base
        .pointer("/app/security/csp/connect-src")
        .and_then(Value::as_str)
        .ok_or("base CSP must declare connect-src")?
        .to_owned();
    if let Some(configured) = configured.filter(|s| !s.is_empty()) {
        sources.push(' ');
        sources.push_str(&share_origin(configured, development)?);
    }
    let security = object(object(&mut overrides, "app")?, "security")?;
    object(security, "csp")?["connect-src"] = Value::String(sources.clone());
    if security.get("devCsp").is_some() {
        object(security, "devCsp")?["connect-src"] = Value::String(sources);
    }
    Ok(overrides)
}
