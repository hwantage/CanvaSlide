#[path = "build/cloud_share.rs"]
mod cloud_share;

fn main() {
    // Tauri embeds icons at compile time; replacing them must invalidate cached builds.
    println!("cargo:rerun-if-changed=icons");
    println!("cargo:rerun-if-env-changed=VITE_CLOUD_SHARE_URL");
    let overrides = std::env::var("TAURI_CONFIG").unwrap_or_else(|_| "{}".into());
    let overrides = serde_json::from_str(&overrides).expect("invalid TAURI_CONFIG JSON");
    let origin = std::env::var("VITE_CLOUD_SHARE_URL").ok();
    let config = cloud_share::configure(overrides, origin.as_deref(), tauri_build::is_dev())
        .expect("invalid cloud share security configuration")
        .to_string();
    // Both tauri-build and generate_context! must receive the same origin-specific policy.
    std::env::set_var("TAURI_CONFIG", &config);
    println!("cargo:rustc-env=TAURI_CONFIG={config}");
    tauri_build::build()
}
