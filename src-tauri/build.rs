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
    let attributes = tauri_build::Attributes::new().windows_attributes(windows_attributes());
    if let Err(error) = tauri_build::try_build(attributes) {
        panic!("{error:#}");
    }
}

// Why: tauri-build embeds the manifest only in binaries, so without this the test executables lack
// Common Controls v6, which the dialog plugin imports, and fail to start on Windows.
fn windows_attributes() -> tauri_build::WindowsAttributes {
    let target = |key| std::env::var(key).unwrap_or_default();
    if target("CARGO_CFG_TARGET_OS") != "windows" || target("CARGO_CFG_TARGET_ENV") != "msvc" {
        return tauri_build::WindowsAttributes::new();
    }
    let manifest =
        std::path::Path::new(&target("CARGO_MANIFEST_DIR")).join("windows-app-manifest.xml");
    println!("cargo:rerun-if-changed={}", manifest.display());
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    // Keep the app's manifest as tauri-build wrote it, without a linker-added UAC section.
    println!("cargo:rustc-link-arg=/MANIFESTUAC:NO");
    tauri_build::WindowsAttributes::new_without_app_manifest()
}
