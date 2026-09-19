#[path = "../build/cloud_share.rs"]
mod cloud_share;

use cloud_share::configure;
use serde_json::json;

#[test]
fn production_adds_only_the_configured_origin_and_preserves_other_overrides() {
    let config = configure(
        json!({
            "bundle": { "createUpdaterArtifacts": false },
            "app": { "security": { "csp": { "connect-src": "https:", "img-src": "data:" } } }
        }),
        Some("https://share.example:8443/"),
        false,
    )
    .unwrap();
    assert_eq!(config["bundle"]["createUpdaterArtifacts"], false);
    assert_eq!(config["app"]["security"]["csp"]["img-src"], "data:");
    assert_eq!(
        config["app"]["security"]["csp"]["connect-src"],
        "'self' ipc: http://ipc.localhost https://www.youtube.com https://vimeo.com https://share.example:8443"
    );
}

#[test]
fn unconfigured_builds_preserve_only_the_base_video_connections() {
    let config = configure(json!({}), None, false).unwrap();
    assert_eq!(
        config["app"]["security"]["csp"]["connect-src"],
        "'self' ipc: http://ipc.localhost https://www.youtube.com https://vimeo.com"
    );
}

#[test]
fn local_http_is_limited_to_the_exact_development_origin() {
    for origin in [
        "http://localhost:8788",
        "http://127.0.0.1:8788",
        "http://[::1]:8788",
    ] {
        assert!(configure(json!({}), Some(origin), false).is_err());
        let config = configure(json!({}), Some(origin), true).unwrap();
        assert_eq!(
            config["app"]["security"]["csp"]["connect-src"],
            format!("'self' ipc: http://ipc.localhost https://www.youtube.com https://vimeo.com {origin}")
        );
    }
}

#[test]
fn rejects_untrusted_or_ambiguous_configuration() {
    for origin in [
        "http://share.example",
        "https://*.example",
        "https://share.example/path",
        "https://user:password@share.example",
        "https://share.example?query=1",
        "https://share.example/#fragment",
        "https://share.example;script-src",
        "https://share.example\n",
        "file:///tmp",
    ] {
        assert!(
            configure(json!({}), Some(origin), true).is_err(),
            "{origin}"
        );
    }
}

#[test]
fn restricts_an_explicit_development_policy_too() {
    let config = configure(
        json!({ "app": { "security": { "devCsp": { "connect-src": "*" } } } }),
        Some("http://localhost:8788"),
        true,
    )
    .unwrap();
    assert_eq!(
        config["app"]["security"]["devCsp"]["connect-src"],
        "'self' ipc: http://ipc.localhost https://www.youtube.com https://vimeo.com http://localhost:8788"
    );
}
